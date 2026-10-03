import type { ServerWebSocket } from "bun";
import {
  BUTTON_RANGE,
  COLORS,
  DEFAULT_SETTINGS,
  KILL_RANGE,
  MAX_PLAYERS,
  MOVE_SPEED,
  NEEDS,
  PLAYER_RADIUS,
  REPORT_RANGE,
  SETTING_LIMITS,
  USE_RANGE,
  type Phase,
  type Role,
  type Settings,
} from "../shared/constants.ts";
import {
  BUTTON,
  ELEVATORS,
  NESTS,
  STATIONS,
  VENTS,
  blocked,
  collide,
  dist,
  roomAt,
  spawnPoint,
  ventNeighbour,
} from "../shared/map.ts";
import type {
  BodyView,
  ClientMsg,
  Fx,
  LobbyPlayer,
  MeView,
  PlayerView,
  ServerMsg,
  Snapshot,
} from "../shared/protocol.ts";

export interface SocketData {
  lobby: Lobby | null;
  player: Player | null;
}
type Sock = ServerWebSocket<SocketData>;

const REVEAL_SECONDS = 4;
const EJECTION_SECONDS = 6;
const LOBBY_GRACE = 15;
const GAME_GRACE = 45;

const now = () => performance.now() / 1000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Player {
  ws: Sock | null = null;
  connected = true;
  mic = false;
  disconnectedAt = 0;

  x = 0;
  z = 0;
  ry = 0;
  moving = false;
  lastPosAt = now();
  tp = 0;

  alive = true;
  role: Role = "crew";
  displayColor: number;
  disguiseUntil = 0;
  disguiseReadyAt = 0;

  needs = NEEDS.map(() => 100);
  active = NEEDS.map(() => false);
  nextNeedAt = 0;
  lastNeed = -1;
  using: { station: number; start: number } | null = null;

  killReadyAt = 0;
  snipeReadyAt = 0;
  vent = -1;
  nest = -1;
  elevator = 0;
  meetingsLeft = 0;
  vote: string | null = null;
  /** Assigned kills: the secret order the AI must follow (crew ids). */
  killOrder: string[] = [];
  /** Random tiebreak so two robots wearing one colour sit in no telling order. */
  salt = 0;

  constructor(
    readonly id: string,
    readonly token: string,
    public name: string,
    public color: number,
  ) {
    this.displayColor = color;
  }

  get hidden() {
    return this.vent >= 0 || this.nest >= 0;
  }

  send(msg: ServerMsg) {
    if (this.ws && this.connected) this.ws.send(JSON.stringify(msg));
  }

  teleport(x: number, z: number) {
    this.x = x;
    this.z = z;
    this.tp++;
  }
}

export class Lobby {
  players = new Map<string, Player>();
  host = "";
  settings: Settings = { ...DEFAULT_SETTINGS };
  phase: Phase = "lobby";
  phaseEndsAt = 0;
  bodies: (BodyView & { at: number })[] = [];
  startedWith = 0;
  meeting: {
    reason: "button" | "body" | "sniper";
    caller: string;
    bodyColor: number | null;
    discussionEnds: number;
  } | null = null;
  emptySince = 0;
  lastOver: Extract<ServerMsg, { t: "over" }> | null = null;
  private seq = 0;

  constructor(readonly code: string) {}

  // ---------------------------------------------------------------- membership

  join(ws: Sock, name: string, token: string): Player | string {
    const existing = [...this.players.values()].find((p) => p.token === token);
    if (existing) {
      existing.ws?.close();
      existing.ws = ws;
      existing.connected = true;
      // Keep the seat's name: a reconnect is not a rename.
      if (!this.players.get(this.host)?.connected) this.host = existing.id;
      this.lobbyChanged();
      // A reload mid-game must not lose who you are or how it ended.
      if (this.phase !== "lobby") {
        existing.send({
          t: "role",
          role: existing.role,
          impostorColor: existing.role === "impostor" ? existing.color : null,
          quiet: true,
        });
      }
      if (this.phase === "over" && this.lastOver) existing.send(this.lastOver);
      return existing;
    }
    if (this.phase !== "lobby") return "That game is already running — wait for it to end.";
    if (this.players.size >= MAX_PLAYERS) return "Lobby is full.";
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = COLORS.findIndex((_, i) => !used.has(i));
    const p = new Player(`p${++this.seq}`, token, name || COLORS[color]!.name, color);
    p.ws = ws;
    const sp = spawnPoint(this.players.size, MAX_PLAYERS);
    p.teleport(sp.x, sp.z);
    this.players.set(p.id, p);
    if (!this.players.get(this.host)?.connected) this.host = p.id;
    this.lobbyChanged();
    return p;
  }

  /** Deliberate exit: free the seat now rather than waiting out the reconnect grace. */
  leave(p: Player) {
    p.ws = null;
    p.connected = false;
    p.using = null;
    if (this.phase === "lobby" || this.phase === "over") this.players.delete(p.id);
    else {
      p.disconnectedAt = 0; // reaped (and powered down) on the next tick
      if (p.alive) {
        p.alive = false;
        this.checkWin();
      }
    }
    if (this.host === p.id) this.pickHost();
    this.lobbyChanged();
  }

  disconnect(p: Player) {
    p.connected = false;
    p.ws = null;
    p.disconnectedAt = now();
    p.using = null;
    if (this.host === p.id) this.pickHost();
    this.lobbyChanged();
  }

  private pickHost() {
    const next = [...this.players.values()].find((q) => q.connected);
    this.host = next?.id ?? "";
  }

  private reap() {
    const t = now();
    for (const p of [...this.players.values()]) {
      if (p.connected) continue;
      const grace = this.phase === "lobby" || this.phase === "over" ? LOBBY_GRACE : GAME_GRACE;
      if (t - p.disconnectedAt < grace) continue;
      if (this.phase === "lobby" || this.phase === "over") {
        this.players.delete(p.id);
      } else if (p.alive) {
        // Gone for good mid-game: they power down where they stood, no body to report.
        p.alive = false;
        this.checkWin();
      }
      if (this.host === p.id) this.pickHost();
      this.lobbyChanged();
    }
  }

  get connectedCount() {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  // ---------------------------------------------------------------- broadcast

  broadcast(msg: ServerMsg, filter?: (p: Player) => boolean) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.ws && p.connected && (!filter || filter(p))) p.ws.send(s);
    }
  }

  fx(fx: Fx) {
    this.broadcast({ t: "fx", fx });
  }

  lobbyChanged() {
    const players: LobbyPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected,
      alive: p.alive,
      mic: p.mic && p.connected,
    }));
    for (const p of this.players.values()) {
      p.send({
        t: "lobby",
        code: this.code,
        you: p.id,
        host: this.host,
        phase: this.phase,
        players,
        settings: this.settings,
      });
    }
  }

  // ---------------------------------------------------------------- messages

  handle(p: Player, m: ClientMsg) {
    const t = now();
    const playing = this.phase === "playing";
    switch (m.t) {
      case "settings": {
        if (p.id !== this.host || this.phase !== "lobby") return;
        const next = { ...this.settings };
        for (const [k, v] of Object.entries(m.settings) as [keyof Settings, unknown][]) {
          if (!(k in next)) continue;
          if (typeof next[k] === "boolean") (next as any)[k] = Boolean(v);
          else if (typeof v === "number" && Number.isFinite(v)) {
            const [lo, hi] = SETTING_LIMITS[k] ?? [0, 999];
            (next as any)[k] = Math.max(lo, Math.min(hi, v));
          }
        }
        if (next.needIntervalMax < next.needIntervalMin) next.needIntervalMax = next.needIntervalMin;
        this.settings = next;
        this.lobbyChanged();
        return;
      }
      case "pickColor": {
        if (this.phase !== "lobby" || !COLORS[m.color]) return;
        if ([...this.players.values()].some((q) => q.color === m.color)) return;
        p.color = p.displayColor = m.color;
        this.lobbyChanged();
        return;
      }
      case "start":
        if (p.id === this.host && this.phase === "lobby") this.start();
        return;
      case "toLobby":
        if (p.id === this.host && this.phase === "over") this.toLobby();
        return;
      case "pos": {
        if (!(this.phase === "lobby" || playing || this.phase === "over")) return;
        if (p.hidden || p.using) return;
        if (!Number.isFinite(m.x) || !Number.isFinite(m.z)) return;
        // Trust the client's movement, but never further than it could have gone.
        const dt = Math.min(0.5, t - p.lastPosAt);
        p.lastPosAt = t;
        const maxStep = MOVE_SPEED * (p.alive ? 1 : 1.6) * dt * 1.5 + 0.35;
        let dx = m.x - p.x, dz = m.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > maxStep) {
          dx *= maxStep / d;
          dz *= maxStep / d;
        }
        let nx = p.x + dx, nz = p.z + dz;
        if (p.alive) ({ x: nx, z: nz } = collide(nx, nz, PLAYER_RADIUS * 0.85));
        if (d > maxStep + 2) p.tp++; // way off: make the client resync
        p.x = nx;
        p.z = nz;
        p.ry = m.ry;
        p.moving = m.moving;
        return;
      }
      case "use": {
        if (!playing || !p.alive || p.hidden) return;
        const s = STATIONS[m.station];
        if (!s || dist(p.x, p.z, s.x, s.z) > USE_RANGE + 0.4) return;
        p.using = { station: s.id, start: t };
        p.moving = false;
        return;
      }
      case "mic":
        if (p.mic !== !!m.on) {
          p.mic = !!m.on;
          this.lobbyChanged();
        }
        return;
      case "cancelUse":
        p.using = null;
        return;
      case "kill": {
        if (!playing || p.role !== "impostor" || !p.alive || p.hidden || t < p.killReadyAt) return;
        const inReach = [...this.players.values()].filter(
          (q) => q !== p && q.alive && !q.hidden && dist(p.x, p.z, q.x, q.z) <= KILL_RANGE + 0.4,
        );
        // The server chooses who explodes: with an assigned order, the right robot always
        // goes if it's in reach, so standing beside two robots can't be gamed either way.
        const target = this.settings.assignedKills ? this.currentTarget(p) : null;
        const v = inReach.find((q) => q === target) ?? inReach.find((q) => q.id === m.target) ?? null;
        if (!v) return;
        this.kill(v, "ash");
        this.fx({ kind: "explode", x: v.x, z: v.z, c: this.deathColor(v) });
        p.killReadyAt = t + this.settings.killCooldown;
        if (!this.checkOrder(p, v, target)) this.checkWin();
        return;
      }
      case "disguise": {
        if (!playing || p.role !== "impostor" || !p.alive || t < p.disguiseReadyAt) return;
        // Any robot in the game, alive or dead.
        if (![...this.players.values()].some((q) => q.color === m.color)) return;
        // Picking your own colour drops the disguise. Duration 0 = permanent until swapped.
        p.displayColor = m.color;
        const dur = m.color === p.color ? 0 : this.settings.disguiseDuration;
        p.disguiseUntil = dur > 0 ? t + dur : 0;
        p.disguiseReadyAt = t + dur + this.settings.disguiseCooldown;
        return;
      }
      case "vent": {
        if (!playing || p.role !== "impostor" || !p.alive || p.hidden) return;
        const v = VENTS[m.vent];
        if (!v || dist(p.x, p.z, v.x, v.z) > 1.6) return;
        p.vent = v.id;
        p.using = null;
        p.teleport(v.x, v.z);
        this.fx({ kind: "vent", vent: v.id });
        return;
      }
      case "ventMove": {
        if (p.vent < 0) return;
        p.vent = ventNeighbour(p.vent, m.dir);
        const v = VENTS[p.vent]!;
        p.teleport(v.x, v.z);
        return;
      }
      case "ventExit": {
        if (p.vent < 0) return;
        this.fx({ kind: "vent", vent: p.vent });
        p.vent = -1;
        return;
      }
      case "nest": {
        if (!playing || p.role !== "impostor" || !p.alive || p.hidden) return;
        const el = ELEVATORS.find((e) => dist(p.x, p.z, e.x, e.z) < 2.2);
        if (!el || !NESTS[m.nest]) return;
        p.elevator = el.id;
        p.nest = m.nest;
        p.using = null;
        this.fx({ kind: "elevator", x: el.x, z: el.z });
        return;
      }
      case "nestExit": {
        if (p.nest < 0) return;
        p.nest = -1;
        const el = ELEVATORS[p.elevator]!;
        p.teleport(el.x + (el.x < 0 ? 1.2 : -1.2), el.z);
        this.fx({ kind: "elevator", x: el.x, z: el.z });
        return;
      }
      case "shoot": {
        if (!playing || p.nest < 0 || !p.alive || t < p.snipeReadyAt) return;
        p.snipeReadyAt = t + this.settings.sniperCooldown;
        const nest = NESTS[p.nest]!;
        const v = m.target ? this.players.get(m.target) : undefined;
        const ok =
          v &&
          v !== p &&
          v.alive &&
          !v.hidden &&
          !roomAt(v.x, v.z)?.safe &&
          !blocked(nest.x, nest.z, v.x, v.z);
        if (ok && v) {
          const target = this.settings.assignedKills ? this.currentTarget(p) : null;
          this.kill(v, "ash");
          this.fx({ kind: "shot", nest: nest.id, x: v.x, z: v.z, hit: true });
          this.fx({ kind: "explode", x: v.x, z: v.z, c: this.deathColor(v) });
          if (!this.checkOrder(p, v, target)) this.checkWin();
        } else {
          this.fx({ kind: "shot", nest: nest.id, x: m.hx, z: m.hz, hit: false });
        }
        return;
      }
      case "report": {
        if (!playing || !p.alive || p.hidden) return;
        const b = this.bodies.find((b) => b.id === m.body);
        if (!b || dist(p.x, p.z, b.x, b.z) > REPORT_RANGE + 0.4) return;
        this.startMeeting("body", p, b.c >= 0 ? b.c : null);
        return;
      }
      case "reportSniper": {
        if (!playing || !p.alive || p.hidden) return;
        const sniper = [...this.players.values()].find((q) => q.nest === m.nest && q.alive);
        const nest = NESTS[m.nest];
        if (!sniper || !nest) return;
        if (roomAt(p.x, p.z)?.safe || blocked(p.x, p.z, nest.x, nest.z)) return;
        this.startMeeting("sniper", p, null);
        return;
      }
      case "button": {
        if (!playing || !p.alive || p.hidden || p.meetingsLeft <= 0) return;
        if (dist(p.x, p.z, BUTTON.x, BUTTON.z) > BUTTON_RANGE + 0.6) return;
        p.meetingsLeft--;
        this.startMeeting("button", p, null);
        return;
      }
      case "vote": {
        if (this.phase !== "meeting" || !this.meeting || !p.alive || p.vote) return;
        if (t < this.meeting.discussionEnds) return;
        if (m.target !== "skip" && !this.players.get(m.target)?.alive) return;
        p.vote = m.target;
        if (this.alive().every((q) => q.vote || !q.connected)) this.endMeeting();
        return;
      }
      case "chat": {
        if (this.phase !== "meeting" || !p.alive) return;
        const text = String(m.text).slice(0, 200).trim();
        const who = this.identity(p);
        if (text) this.broadcast({ t: "chat", from: p.id, text, name: who.name, c: who.color });
        return;
      }
      case "robo": {
        const text = String(m.text).slice(0, 240).trim();
        if (!text || !this.settings.roboSpeech) return;
        const global = this.phase === "meeting" || this.phase === "lobby" || this.phase === "over";
        if (this.phase === "meeting" && !p.alive) return;
        if (!global && p.hidden) return;
        const range = this.settings.voiceRange * 1.2;
        this.broadcast(
          { t: "robo", from: p.id, text, x: p.x, z: p.z, c: p.displayColor, global },
          (q) =>
            q !== p &&
            // the dead hear everyone; the living never hear the dead
            (!q.alive || p.alive) &&
            (global || dist(p.x, p.z, q.x, q.z) <= range || !q.alive),
        );
        return;
      }
      case "rtc": {
        const to = this.players.get(m.to);
        to?.send({ t: "rtc", from: p.id, data: m.data });
        return;
      }
    }
  }

  // ---------------------------------------------------------------- flow

  private alive() {
    return [...this.players.values()].filter((p) => p.alive);
  }

  private start() {
    const ps = [...this.players.values()].filter((p) => p.connected);
    if (ps.length < 2) {
      this.players.get(this.host)?.send({ t: "error", text: "Need at least 2 robots to start." });
      return;
    }
    // Drop anyone who left before the game began.
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);

    const t = now();
    const s = this.settings;
    const impostor = ps[Math.floor(Math.random() * ps.length)]!;
    this.startedWith = ps.length;
    this.bodies = [];
    ps.forEach((p, i) => {
      p.role = p === impostor ? "impostor" : "crew";
      p.alive = true;
      p.displayColor = p.color;
      p.disguiseUntil = 0;
      p.disguiseReadyAt = t + REVEAL_SECONDS + 10;
      p.needs = NEEDS.map(() => 100);
      p.active = NEEDS.map(() => false);
      p.lastNeed = -1;
      // First need arrives sooner than the steady rhythm so there is something to do.
      p.nextNeedAt = t + REVEAL_SECONDS + rand(12, Math.max(15, s.needIntervalMin * 0.6));
      p.using = null;
      p.vent = p.nest = -1;
      p.vote = null;
      p.killReadyAt = t + REVEAL_SECONDS + s.killCooldown;
      p.snipeReadyAt = t + REVEAL_SECONDS + s.sniperCooldown;
      p.meetingsLeft = s.emergencyMeetings;
      const sp = spawnPoint(i, ps.length);
      p.teleport(sp.x, sp.z);
    });
    const crew = ps.filter((p) => p !== impostor).map((p) => p.id);
    for (let i = crew.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [crew[i], crew[j]] = [crew[j]!, crew[i]!];
    }
    impostor.killOrder = crew;
    this.setPhase("reveal", REVEAL_SECONDS);
    for (const p of ps) {
      p.send({ t: "role", role: p.role, impostorColor: p.role === "impostor" ? p.color : null });
    }
    this.lobbyChanged();
  }

  private toLobby() {
    this.setPhase("lobby", 0);
    this.bodies = [];
    this.meeting = null;
    let i = 0;
    for (const p of this.players.values()) {
      p.alive = true;
      p.role = "crew";
      p.displayColor = p.color;
      p.vent = p.nest = -1;
      p.using = null;
      const sp = spawnPoint(i++, MAX_PLAYERS);
      p.teleport(sp.x, sp.z);
    }
    this.lobbyChanged();
  }

  private setPhase(phase: Phase, seconds: number) {
    this.phase = phase;
    this.phaseEndsAt = now() + seconds;
  }

  private kill(v: Player, kind: "ash" | "husk") {
    v.alive = false;
    v.using = null;
    v.vote = null;
    this.bodies.push({ id: `b${v.id}`, x: v.x, z: v.z, c: this.deathColor(v), kind, at: now() });
    this.lobbyChanged();
  }

  private startMeeting(reason: "button" | "body" | "sniper", caller: Player, bodyColor: number | null) {
    const t = now();
    this.meeting = {
      reason,
      caller: caller.id,
      bodyColor,
      discussionEnds: t + this.settings.discussionTime,
    };
    this.setPhase("meeting", this.settings.discussionTime + this.settings.votingTime);
    const everyone = [...this.players.values()];
    everyone.forEach((p, i) => {
      p.using = null;
      p.vote = null;
      p.vent = p.nest = -1;
      p.salt = Math.random();
      if (!this.settings.disguiseCarry) {
        p.displayColor = p.color; // disguises drop when the lights come up
        p.disguiseUntil = 0;
      }
      const sp = spawnPoint(i, everyone.length);
      p.teleport(sp.x, sp.z);
    });
  }

  private endMeeting() {
    if (!this.meeting) return;
    const tally = new Map<string, number>();
    for (const p of this.alive()) {
      const v = p.vote ?? "skip";
      tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    let top = "skip", topN = -1, tie = false;
    for (const [k, n] of tally) {
      if (n > topN) {
        top = k;
        topN = n;
        tie = false;
      } else if (n === topN) tie = true;
    }
    const ejected = !tie && top !== "skip" ? this.players.get(top) ?? null : null;
    // Results are told by the identity each robot was showing, never the real one.
    const who = ejected ? this.identity(ejected) : null;
    const tallyOut = [...tally].map(([k, n]) => {
      const q = k === "skip" ? null : this.players.get(k);
      const id = q ? this.identity(q) : null;
      return { name: id?.name ?? "Skip", color: id?.color ?? null, n };
    });
    if (ejected) ejected.alive = false;
    this.meeting = null;
    this.bodies = [];
    this.broadcast({
      t: "ejected",
      id: ejected?.id ?? null,
      name: who?.name ?? null,
      color: who?.color ?? null,
      tally: tallyOut,
      wasImpostor: ejected && this.settings.confirmEjects ? ejected.role === "impostor" : null,
      tie,
    });
    this.setPhase("ejection", EJECTION_SECONDS);
    this.lobbyChanged();
  }

  // ---------------------------------------------------------------- identity & kill order

  /** The colour a death shows: the victim's, or grey (-1) when deaths are anonymous. */
  private deathColor(v: Player) {
    return this.settings.anonymousDeaths ? -1 : v.color;
  }

  /** Who a robot appears to be: its displayed colour and that colour's owner's name. */
  private identity(p: Player): { name: string; color: number } {
    const owner = [...this.players.values()].find((q) => q.color === p.displayColor);
    return { name: owner?.name ?? p.name, color: p.displayColor };
  }

  /**
   * The voting roster. Living robots appear as whoever they're showing; any colour that
   * no living robot is wearing appears as gone — so a disguised AI's own colour looks dead.
   */
  private roster() {
    const all = [...this.players.values()];
    const living = all.filter((p) => p.alive);
    const cards = living.map((p) => ({ ...this.identity(p), id: p.id as string | null, alive: true, salt: p.salt }));
    for (const q of all) {
      if (living.some((p) => p.displayColor === q.color)) continue;
      cards.push({ id: null, color: q.color, name: q.name, alive: false, salt: 0 });
    }
    return cards.sort((a, b) => a.color - b.color || a.salt - b.salt).map(({ salt, ...c }) => c);
  }

  /** Next robot the AI must kill: the first in its order still standing. */
  private currentTarget(imp: Player): Player | null {
    for (const id of imp.killOrder) {
      const q = this.players.get(id);
      if (q?.alive) return q;
    }
    return null;
  }

  private targetView(viewer: Player) {
    if (!this.settings.assignedKills || viewer.role !== "impostor" || this.phase === "lobby") return null;
    const q = this.currentTarget(viewer);
    return q ? { id: q.id, name: q.name, color: q.color } : null;
  }

  /** Ends the game if an assigned-kills AI just killed out of order. Returns true if so. */
  private checkOrder(imp: Player, victim: Player, target: Player | null): boolean {
    if (!this.settings.assignedKills || !target || victim === target) return false;
    this.gameOver(
      "crew",
      `The AI broke its kill order: it destroyed ${victim.name} when its target was ${target.name}.`,
      imp,
    );
    return true;
  }

  private checkWin(): boolean {
    if (this.phase === "over" || this.phase === "lobby") return true;
    const imp = [...this.players.values()].find((p) => p.role === "impostor");
    const crewAlive = this.alive().filter((p) => p.role === "crew").length;
    if (!imp || !imp.alive) {
      this.gameOver("crew", "The mal-aligned AI was eliminated.", imp);
      return true;
    }
    if (crewAlive === 0 || (crewAlive <= 1 && this.startedWith >= 3)) {
      this.gameOver("impostor", "The mal-aligned AI terminated the crew.", imp);
      return true;
    }
    return false;
  }

  private gameOver(winner: Role, reason: string, imp: Player | undefined) {
    this.setPhase("over", 0);
    this.meeting = null;
    for (const p of this.players.values()) {
      p.vent = p.nest = -1;
      p.using = null;
      p.displayColor = p.color;
    }
    this.lastOver = { t: "over", winner, reason, impostor: imp?.id ?? "" };
    this.broadcast(this.lastOver);
    this.lobbyChanged();
  }

  // ---------------------------------------------------------------- tick

  tick(dt: number) {
    const t = now();
    this.reap();

    if (this.phase === "reveal" && t >= this.phaseEndsAt) this.setPhase("playing", 0);
    if (this.phase === "meeting" && t >= this.phaseEndsAt) this.endMeeting();
    if (this.phase === "ejection" && t >= this.phaseEndsAt) {
      if (!this.checkWin()) {
        this.setPhase("playing", 0);
        for (const p of this.players.values()) {
          p.killReadyAt = Math.max(p.killReadyAt, t + this.settings.killCooldown);
        }
      }
    }

    const s = this.settings;
    for (const p of this.players.values()) {
      if (this.phase !== "playing") {
        // Needs and cooldowns are frozen outside live play.
        p.nextNeedAt += dt;
        p.killReadyAt += dt;
        p.snipeReadyAt += dt;
        p.disguiseReadyAt += dt;
        continue;
      }
      if (!p.alive) continue;

      if (p.disguiseUntil && t >= p.disguiseUntil) {
        p.displayColor = p.color;
        p.disguiseUntil = 0;
      }

      if (t >= p.nextNeedAt) {
        const idle = NEEDS.map((_, i) => i).filter((i) => !p.active[i]);
        const pool = idle.length > 1 ? idle.filter((i) => i !== p.lastNeed) : idle;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick !== undefined) {
          p.active[pick] = true;
          p.needs[pick] = 100;
          p.lastNeed = pick;
        }
        p.nextNeedAt = t + rand(s.needIntervalMin, s.needIntervalMax);
      }

      for (let i = 0; i < NEEDS.length; i++) {
        if (!p.active[i]) continue;
        p.needs[i] = Math.max(0, p.needs[i]! - (100 / s.needDeadline) * dt);
        if (p.needs[i] === 0 && p.role === "crew") {
          this.kill(p, "husk");
          this.fx({ kind: "shutdown", x: p.x, z: p.z, c: this.deathColor(p) });
          if (this.checkWin()) return;
          break;
        }
      }

      if (p.using) {
        const st = STATIONS[p.using.station]!;
        if (dist(p.x, p.z, st.x, st.z) > USE_RANGE + 0.8) p.using = null;
        else if (t - p.using.start >= s.taskDuration) {
          const i = NEEDS.indexOf(st.kind);
          p.needs[i] = 100;
          p.active[i] = false;
          p.using = null;
          this.fx({ kind: "task", x: st.x, z: st.z, need: st.kind });
        }
      }
    }

    this.sendSnapshots();
  }

  private sendSnapshots() {
    const t = now();
    const all = [...this.players.values()];
    const sniper = all.find((p) => p.nest >= 0 && p.alive)?.nest ?? -1;
    const bodies = this.bodies.map(({ at, ...b }) => b);
    const callerP = this.meeting ? this.players.get(this.meeting.caller) : undefined;
    const callerId = callerP ? this.identity(callerP) : { name: "?", color: 0 };
    const meeting = this.meeting
      ? {
          reason: this.meeting.reason,
          caller: this.meeting.caller,
          callerName: callerId.name,
          callerColor: callerId.color,
          bodyColor: this.meeting.bodyColor,
          cards: this.roster(),
          voted: all.filter((p) => p.vote).map((p) => p.id),
          discussionLeft: Math.max(0, this.meeting.discussionEnds - t),
        }
      : null;
    const open = this.phase === "lobby" || this.phase === "over";
    const timer = Math.max(0, this.phaseEndsAt - t);

    for (const viewer of all) {
      if (!viewer.connected) continue;
      const players: PlayerView[] = [];
      for (const q of all) {
        if (q !== viewer) {
          if (!open && !q.alive && viewer.alive) continue;
          if (q.hidden) continue;
        }
        players.push({
          id: q.id,
          x: q.x,
          z: q.z,
          ry: q.ry,
          c: q.displayColor,
          moving: q.moving,
          using: !!q.using,
          ghost: !open && !q.alive,
        });
      }
      const me: MeView = {
        role: viewer.role,
        alive: viewer.alive,
        color: viewer.color,
        displayColor: viewer.displayColor,
        needs: viewer.needs.map((n) => Math.round(n * 10) / 10),
        active: viewer.active,
        using: viewer.using
          ? {
              station: viewer.using.station,
              progress: Math.min(1, (t - viewer.using.start) / this.settings.taskDuration),
            }
          : null,
        killCd: Math.max(0, viewer.killReadyAt - t),
        snipeCd: Math.max(0, viewer.snipeReadyAt - t),
        disguiseCd: Math.max(0, viewer.disguiseReadyAt - t),
        disguiseLeft: viewer.disguiseUntil ? Math.max(0, viewer.disguiseUntil - t) : 0,
        disguised: viewer.displayColor !== viewer.color,
        vent: viewer.vent,
        nest: viewer.nest,
        meetingsLeft: viewer.meetingsLeft,
        target: this.targetView(viewer),
        x: viewer.x,
        z: viewer.z,
        tp: viewer.tp,
      };
      const snap: Snapshot = {
        t: "snap",
        phase: this.phase,
        timer,
        players,
        bodies,
        sniper,
        me,
        meeting,
      };
      viewer.ws?.send(JSON.stringify(snap));
    }
  }
}
