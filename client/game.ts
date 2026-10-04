import * as THREE from "three";
import {
  BUTTON_RANGE,
  COLORS,
  KILL_RANGE,
  MOVE_SPEED,
  NEEDS,
  NEED_COLOR,
  NEED_ICON,
  NEED_LABEL,
  PLAYER_RADIUS,
  REPORT_RANGE,
  MAP_SETTING_LABEL,
  FOG_LEVELS,
  FOG_SETTING_LABEL,
  type FogSettingKey,
  SETTING_LABEL,
  type MapSettingKey,
  SETTING_LIMITS,
  USE_RANGE,
  type Phase,
  type Role,
  type Settings,
} from "../shared/constants.ts";
import { BUTTON, CEILING_H, MAP_LIMITS, PROP_LEVELS, dist, generateMap, type WorldMap } from "../shared/world/index.ts";
import type { Fx as FxMsg, ServerMsg, Snapshot } from "../shared/protocol.ts";
import { RoboSpeech } from "./audio/robospeech.ts";
import { RoboVoice } from "./audio/robovoice/index.ts";
import { musicOn, setMusic } from "./audio/background/music.ts";
import { unlockAudio } from "./audio/context.ts";
import { sfx } from "./audio/sfx/sfx.ts";
import type { Voice } from "./audio/voice.ts";
import type { Net } from "./frontend/net.ts";
import { Fx } from "./engine/fx/index.ts";
import { makeAsh } from "./engine/meshes/ash.ts";
import { Robot } from "./engine/meshes/robot.ts";
import type { World } from "./engine/world/index.ts";
import { mapSvg, toPercent, towerLabel } from "./frontend/mapview.ts";

type LobbyMsg = Extract<ServerMsg, { t: "lobby" }>;
type Overlay = "none" | "reveal" | "meeting" | "ejection" | "over" | "disguise" | "nest";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const colorName = (c: number) => COLORS[c]?.name ?? "?";
const colorCss = (c: number) => COLORS[c]?.css ?? "#8a8c94"; // -1 = grey (anonymous)
/** Coloured colour name, e.g. <span style="color:red">Red</span>. */
const colorTag = (c: number) => `<span style="color:${colorCss(c)}">${colorName(c)}</span>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
/** Keyboard wording on desktop, on-screen button wording on phones. */
const isTouchUI = matchMedia("(pointer: coarse)").matches;
const kb = (desktop: string, touch: string) => (isTouchUI ? touch : desktop);
/** Crouched robots walk at this fraction of full speed. */
const CROUCH_SPEED = 0.5;
/** Lines for the lobby's voice preview. */
const PREVIEW_LINES = [
  "Take me to your leader.",
  "I am not the mal-aligned AI.",
  "Beep boop. My oil is low.",
  "Exterminate the traitor.",
  "Red is acting sus.",
];
const swatch = (c: number) => `<span class="swatch" style="background:${colorCss(c)}"></span>`;

export class Game {
  active = false;
  me = "";
  lobby: LobbyMsg | null = null;
  snap: Snapshot | null = null;
  role: Role = "crew";

  x = 0;
  z = 0;
  ry = 0;
  yaw = Math.PI;
  pitch = 0.32;
  private keys = new Set<string>();
  private locked = false;
  private lastSend = 0;
  private lastTp = -1;
  private sentMoving = false;
  private zoom = 1;
  private scoping = false;

  private self: Robot;
  private robots = new Map<string, Robot>();
  private bodies = new Map<string, THREE.Group>();
  private fx: Fx;
  // The mic stream comes from the voice module; in robo mode it never sends raw audio.
  private robo = new RoboSpeech(() => this.voice.enableMic());
  /** Speaks robo-speech lines in a robot voice, mixed by proximity like voice chat. */
  readonly robovoice = new RoboVoice();
  /** Last proximity gain per robot (0–1): what this player can actually hear of them. */
  readonly heard = new Map<string, number>();
  private raycaster = new THREE.Raycaster();
  private overlay: Overlay = "none";
  /** This lobby's floor (the world holds it, rebuilt when the map settings change). */
  private get map(): WorldMap {
    return this.world.map;
  }
  /** For the ?debug panel. */
  get overlayName() {
    return this.overlay;
  }
  /** Analog stick from touch controls: x = strafe right, y = forward, each -1..1. */
  stick = { x: 0, y: 0 };
  /** Phones and tablets: no pointer lock, touch controls instead. */
  readonly isTouch = matchMedia("(pointer: coarse)").matches;
  private phase: Phase = "lobby";
  private action: { label: string; run: () => void } | null = null;
  private bubbles: { id: string; el: HTMLElement; until: number }[] = [];
  private chatLog: { from: string; text: string; robo?: number; name?: string; c?: number }[] = [];
  private lobbyPanelOpen = true;
  private time = 0;
  scope = 0;

  constructor(
    private world: World,
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    private net: Net,
    private voice: Voice,
  ) {
    this.fx = new Fx(world.scene);
    this.self = new Robot(0, "self");
    this.self.root.visible = false;
    world.scene.add(this.self.root);

    this.robo.onText = (text) => {
      this.net.send({ t: "robo", text });
      void this.robovoice.say(this.me, text, this.self.color, 0.5);
      this.say(this.me, text, this.self.color);
      if (this.phase === "meeting") {
        this.chatLog.push({ from: this.me, text, robo: this.self.color });
        this.renderChat();
      }
      this.showDictation("sent", text);
    };
    this.robo.onPartial = (text) => this.showDictation("listening", text);
    // model download progress / engine switch: only the bits that show it
    this.robovoice.onStatus = () => this.renderVoiceRow();
    this.robo.onStatus = () => {
      this.renderCorner();
      this.renderVoiceRow();
    };

    this.bindInput();
    this.buildNeeds();
    // Voice mixing runs on a timer, not the render loop: background tabs pause
    // requestAnimationFrame, and a tab that stops re-mixing keeps playing at its last volume.
    window.setInterval(() => this.active && this.updateVoiceMix(), 100);
    // tell everyone whether we're actually sending audio
    this.voice.onMicState = (on) => this.net.send({ t: "mic", on });
    const failed = new Set<string>();
    this.voice.onFailed = (id) => {
      if (failed.has(id)) return;
      failed.add(id);
      const who = this.lobby?.players.find((p) => p.id === id)?.name ?? "a player";
      this.toast(
        this.voice.hasRelay
          ? `Voice link to ${who} dropped — retrying…`
          : `Can't reach ${who} for voice — your networks need a TURN relay (see README).`,
      );
    };
    // connection states change on their own; keep the lobby list honest
    window.setInterval(() => this.renderLobbyPlayers(), 1000);
  }

  // ================================================================== input

  private bindInput() {
    const typing = (e: Event) => {
      const t = e.target as HTMLElement;
      return t.tagName === "INPUT" || t.tagName === "TEXTAREA";
    };
    window.addEventListener("keydown", (e) => {
      if (!this.active || typing(e)) return;
      if (e.code === "Tab") {
        e.preventDefault();
        this.toggleLobbyPanel();
        return;
      }
      // Space jumps — never let it also "click" whichever button last had focus
      if (e.code === "Space") e.preventDefault();
      if (e.repeat) {
        this.keys.add(e.code);
        return;
      }
      this.keys.add(e.code);
      this.onKey(e.code);
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.releaseKey(e.code);
    });
    window.addEventListener("blur", () => this.keys.clear());

    this.canvas.addEventListener("click", () => {
      unlockAudio();
      if (!this.active || this.isTouch) return;
      if (!this.locked && this.overlayAllowsLook()) {
        void this.canvas.requestPointerLock?.();
        return;
      }
      if (this.locked) this.onClick();
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2) this.scoping = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) this.scoping = false;
    });
    this.canvas.addEventListener("wheel", (e) => {
      if (this.snap?.me?.nest !== undefined && this.snap.me.nest >= 0) {
        this.zoom = Math.max(1, Math.min(8, this.zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    window.addEventListener("mousemove", (e) => {
      if (this.locked) this.look(e.movementX, e.movementY);
    });
  }

  /** Turn the view by a pointer delta in pixels (mouse, or a finger at `scale`). */
  look(dx: number, dy: number, scale = 1) {
    const s = (0.0024 * scale) / (this.inNest ? this.fovZoom() : 1);
    this.yaw -= dx * s;
    this.pitch += dy * s * (this.inNest || this.inVent ? -1 : 1);
  }

  /** Tell the server exactly where we are now — sent before any range-checked action. */
  private syncPos() {
    if (this.inVent || this.inNest || this.meView?.using) return;
    this.lastSend = performance.now();
    this.net.send({ t: "pos", x: this.x, z: this.z, ry: this.ry, moving: false, crouch: this.crouching, jumps: this.jumps });
  }

  // ---- entry points for touch controls (same actions as the keyboard) ----

  pressKey(code: string) {
    if (!this.active) return;
    if (code === "Tab") {
      this.toggleLobbyPanel();
      return;
    }
    this.onKey(code);
  }

  releaseKey(code: string) {
    if (code === "KeyT" && this.robo.active) {
      this.robo.stop();
      // if nothing was recognised, onText never fires — drop the bar after a beat
      this.dictationTimer = window.setTimeout(() => ($("dictation").hidden = true), 1500);
    }
  }

  /** A tap on the view: same as a desktop click (spot a sniper / fire). */
  tap() {
    if (this.active) this.onClick();
  }

  fire() {
    if (this.playing && this.alive && this.inNest) this.shoot();
  }

  cycleZoom() {
    this.zoom = this.zoom < 2 ? 3 : this.zoom < 5 ? 6 : 1;
  }

  get scopeZoom() {
    return this.zoom;
  }

  /** Pinch zoom on the sniper scope. */
  setZoom(z: number) {
    this.zoom = Math.max(1, Math.min(8, z));
  }

  toggleLobbyPanel() {
    if (this.phase !== "lobby") return;
    this.lobbyPanelOpen = !this.lobbyPanelOpen;
    this.renderLobby();
  }

  /** Everything the touch buttons need to decide what to show. */
  touchState() {
    const me = this.meView;
    const near = (pts: { x: number; z: number }[], r: number) => pts.some((p) => dist(this.x, this.z, p.x, p.z) < r);
    return {
      active: this.active,
      phase: this.phase,
      overlay: this.overlay,
      alive: this.alive,
      role: this.role,
      inVent: this.inVent,
      inNest: this.inNest,
      using: !!me?.using,
      action: this.action?.label.replace(/^[A-Z] — /, "") ?? null,
      killCd: me?.killCd ?? 0,
      canKill: !!this.killTarget(),
      wrongOrder: !!(me?.target && this.killTarget() && this.killTarget()!.id !== me.target.id),
      disguiseCd: me?.disguiseCd ?? 0,
      snipeCd: me?.snipeCd ?? 0,
      nearVent: near(this.map.vents, 1.4),
      zoom: this.zoom,
      robo: !!this.settings?.roboSpeech,
      voice: !!this.settings?.proximityVoice,
      micOn: this.voice.micReady && !this.voice.muted,
      talking: this.robo.active,
      roboReady: this.robo.ready,
      roboLabel: this.robo.shortStatus,
      panelOpen: this.lobbyPanelOpen,
      canPose: this.canPose(),
      crouching: this.crouching,
    };
  }

  private overlayAllowsLook() {
    return this.overlay === "none" || this.overlay === "reveal";
  }

  private get meView() {
    return this.snap?.me ?? null;
  }
  private get inNest() {
    return (this.meView?.nest ?? -1) >= 0;
  }
  private get inVent() {
    return (this.meView?.vent ?? -1) >= 0;
  }
  private get alive() {
    return this.meView?.alive ?? true;
  }
  private get playing() {
    return this.phase === "playing";
  }
  private get settings(): Settings | null {
    return this.lobby?.settings ?? null;
  }

  private onKey(code: string) {
    unlockAudio();
    if (code === "KeyM") {
      setMusic(!musicOn);
      this.renderCorner();
      return;
    }
    if (code === "KeyT") {
      if (this.settings?.roboSpeech) {
        if (this.alive || this.phase !== "meeting") {
          if (this.robo.start()) this.showDictation("listening");
          else this.toast(`Robo speech: ${this.robo.statusText} — talking unlocks when it's ready`);
        }
      } else {
        void this.toggleMic();
      }
      return;
    }
    if (code === "Escape") {
      if (this.overlay === "disguise" || this.overlay === "nest") this.closeOverlay();
      return;
    }
    if (this.overlay === "disguise" || this.overlay === "nest") return;
    if (code === "Space" || code === "KeyC") {
      if (this.canPose()) code === "Space" ? this.jump() : this.toggleCrouch();
      return;
    }
    if (!this.playing || !this.alive) return;

    if (this.inVent) {
      if (code === "KeyA" || code === "ArrowLeft") this.net.send({ t: "ventMove", dir: -1 });
      if (code === "KeyD" || code === "ArrowRight") this.net.send({ t: "ventMove", dir: 1 });
      if (code === "KeyV" || code === "KeyE") {
        this.net.send({ t: "ventExit" });
        sfx("vent");
      }
      return;
    }
    if (this.inNest) {
      if (code === "KeyX" || code === "KeyE") this.net.send({ t: "nestExit" });
      return;
    }
    if (code === "KeyE" || code === "KeyQ" || code === "KeyV") this.syncPos();
    if (code === "KeyE") {
      if (this.action) this.action.run();
      else if (this.role === "impostor") this.toast(`To snipe: walk to an ELEVATOR (middle of the east or west wall) and ${kb("press E", "tap USE")}.`);
    }
    if (this.role !== "impostor") return;
    if (code === "KeyQ") this.tryKill();
    if (code === "KeyF") this.openDisguise();
    if (code === "KeyV") {
      const v = this.map.vents.find((v) => dist(this.x, this.z, v.x, v.z) < 1.4);
      if (v) {
        this.net.send({ t: "vent", vent: v.id });
        sfx("vent");
      } else this.toast("No vent here.");
    }
  }

  // ---------------------------------------------------------------- jump & crouch

  private crouching = false;
  private jumps = 0;
  private lastJump = 0;
  private sentPose = "";

  /** Walking about as yourself — not in a vent, a tower, a meeting, or dead. */
  private canPose() {
    const live = this.phase === "lobby" || this.phase === "over" || (this.playing && this.alive);
    return live && !this.inVent && !this.inNest && !this.meView?.using;
  }

  jump() {
    if (!this.canPose() || this.time - this.lastJump < 0.6) return;
    this.lastJump = this.time;
    this.jumps++;
    this.self.jump();
  }

  toggleCrouch() {
    if (!this.canPose()) return;
    this.crouching = !this.crouching;
  }

  async toggleMic() {
    unlockAudio();
    if (!this.voice.micReady) {
      await this.voice.enableMic();
      if (this.voice.micError) this.toast(`Mic: ${this.voice.micError}`);
    } else this.voice.setMuted(!this.voice.muted);
    this.renderCorner();
    this.renderLobby();
  }

  private onClick() {
    if (!this.playing || !this.alive) return;
    if (this.inNest) {
      this.shoot();
      return;
    }
    if (this.inVent) return;
    // Clicking the distant window: is that a sniper?
    this.world.scene.updateMatrixWorld(); // robots move between renders
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 200;
    const hits = this.raycaster.intersectObjects([...this.world.nestHits, ...this.world.solids], true);
    const first = hits[0];
    if (!first || first.object.userData.nest === undefined) return;
    const nest = first.object.userData.nest as number;
    if (this.snap?.sniper === nest) {
      this.net.send({ t: "reportSniper", nest });
    } else {
      this.toast("Just a lit window in the rain…");
    }
  }

  private shoot() {
    const me = this.meView!;
    if (me.snipeCd > 0) {
      sfx("deny");
      return;
    }
    this.world.scene.updateMatrixWorld(); // robots move between renders
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 200;
    const hitboxes = [...this.robots.values()].map((r) => r.hitbox);
    const hits = this.raycaster.intersectObjects([...hitboxes, ...this.world.solids], true);
    const first = hits[0];
    const target = (first?.object.userData.robotId as string | undefined) ?? null;
    const p = first?.point ?? this.raycaster.ray.at(60, new THREE.Vector3());
    this.net.send({ t: "shoot", target, hx: p.x, hz: p.z });
  }

  private tryKill() {
    const me = this.meView;
    if (!me || me.killCd > 0) {
      sfx("deny");
      return;
    }
    const v = this.killTarget();
    if (v) this.net.send({ t: "kill", target: v.id });
    else this.toast("Nobody in reach.");
  }

  private killTarget(): Robot | null {
    // Mirrors the server: an assigned target in reach always wins over a closer robot.
    const assigned = this.meView?.target?.id;
    const t = assigned ? this.robots.get(assigned) : undefined;
    if (t && !t.ghost && dist(this.x, this.z, t.target.x, t.target.z) < KILL_RANGE) return t;
    let best: Robot | null = null;
    let bd = KILL_RANGE;
    for (const r of this.robots.values()) {
      if (r.ghost) continue;
      const d = dist(this.x, this.z, r.target.x, r.target.z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  // ================================================================== network

  onMessage(m: ServerMsg) {
    switch (m.t) {
      case "lobby":
        this.onLobby(m);
        break;
      case "snap":
        this.onSnap(m);
        break;
      case "role":
        this.role = m.role;
        this.myColor = m.color;
        if (!m.quiet) this.showReveal();
        break;
      case "fx":
        this.onFx(m.fx);
        break;
      case "ejected":
        this.showEjected(m);
        break;
      case "over":
        this.showOver(m);
        break;
      case "chat":
        this.chatLog.push({ from: m.from, text: m.text, name: m.name, c: m.c });
        this.renderChat();
        break;
      case "robo":
        this.onRobo(m);
        break;
      case "rtc":
        void this.voice.onSignal(m.from, m.data as any);
        break;
      case "toast":
        this.toast(m.text);
        break;
      case "error":
        this.toast(m.text);
        break;
    }
  }

  private onLobby(m: LobbyMsg) {
    const first = !this.lobby;
    this.lobby = m;
    this.me = m.you;
    if (first) {
      if (m.settings.proximityVoice && !m.settings.roboSpeech && !this.voice.micReady) {
        void this.voice.enableMic().then(() => {
          if (this.voice.micError) this.toast(`Mic: ${this.voice.micError} — click MIC to retry`);
          this.renderCorner();
          this.renderLobby();
        });
      }
      this.active = true;
      document.body.classList.add("in-game");
      this.self.root.visible = true;
    }
    this.voice.sync(
      m.you,
      m.players.filter((p) => p.connected).map((p) => p.id),
    );
    this.voice.setSending(m.settings.proximityVoice && !m.settings.roboSpeech);
    // same options + seed as the server → the same map; rebuild the level if it changed
    const s = m.settings;
    this.world.fog = { inside: s.fogInside ?? 0, sniper: s.fogSniper ?? 0 };
    const next = generateMap({
      size: s.mapSize,
      roomSize: s.mapRoomSize,
      rooms: s.mapRooms,
      props: s.mapProps,
      towers: s.mapTowers,
      seed: m.mapSeed,
    });
    if (next.key !== this.map.key) {
      this.world.setMap(next);
      this.robots.forEach((r) => this.world.scene.add(r.root)); // robots live on the scene, not the level
    }
    // Robo speech on and no browser speech engine: start the on-device model downloading
    // in the background now, so it's (usually) ready before anyone needs to talk.
    if (m.settings.roboSpeech) {
      this.robo.prepare();
      this.robovoice.load();
    }
    this.renderLobby();
    if (this.overlay === "meeting") this.renderMeeting();
    // host may have changed (or just become known after a rejoin) — redraw only then, so a
    // lobby update can't replace the "Back to lobby" button between finger-down and finger-up
    const host = m.host === this.me;
    if (this.overlay === "over" && this.lastOver && host !== this.overHost) this.showOver(this.lastOver, true);
  }

  private onSnap(s: Snapshot) {
    const prev = this.phase;
    this.snap = s;
    this.phase = s.phase;
    const me = s.me;
    if (me) {
      if (me.tp !== this.lastTp) {
        this.lastTp = me.tp;
        this.x = me.x;
        this.z = me.z;
        if (s.phase === "meeting" || prev !== s.phase || this.lastTp <= 1) {
          // face the table after a teleport to it
          this.yaw = Math.atan2(-this.x, -this.z);
          this.ry = this.yaw;
        }
        this.self.snap(this.x, this.z, this.ry);
      }
      this.role = me.role;
      this.self.setColor(me.displayColor);
      this.self.setGhost(!me.alive && s.phase !== "lobby" && s.phase !== "over");
      this.self.using = !!me.using;
    }

    // other robots
    const seen = new Set<string>();
    for (const p of s.players) {
      if (p.id === this.me) continue;
      seen.add(p.id);
      let r = this.robots.get(p.id);
      if (!r) {
        r = new Robot(p.c, p.id);
        r.snap(p.x, p.z, p.ry);
        this.robots.set(p.id, r);
        this.world.scene.add(r.root);
      }
      if (dist(r.target.x, r.target.z, p.x, p.z) > 4) r.snap(p.x, p.z, p.ry);
      r.target.set(p.x, 0, p.z);
      r.targetRy = p.ry;
      r.moving = p.moving;
      r.using = p.using;
      r.crouching = p.crouch;
      if (r.root.userData.jumps !== undefined && p.jumps !== r.root.userData.jumps) r.jump();
      r.root.userData.jumps = p.jumps;
      r.setColor(p.c);
      r.setGhost(p.ghost);
    }
    for (const [id, r] of this.robots) {
      if (!seen.has(id)) {
        r.dispose();
        this.robots.delete(id);
      }
    }

    // wreckage
    const bseen = new Set<string>();
    for (const b of s.bodies) {
      bseen.add(b.id);
      if (!this.bodies.has(b.id)) {
        const g = makeAsh(b.c, b.kind);
        g.position.set(b.x, 0, b.z);
        this.world.scene.add(g);
        this.bodies.set(b.id, g);
      }
    }
    for (const [id, g] of this.bodies) {
      if (!bseen.has(id)) {
        g.removeFromParent();
        this.bodies.delete(id);
      }
    }

    this.world.setSniper(s.sniper, me?.nest === s.sniper);

    if (prev !== s.phase) this.onPhase(prev, s.phase);
    if (s.phase === "meeting") this.updateMeeting();

  }

  private onPhase(prev: Phase, next: Phase) {
    if (next === "meeting") {
      document.exitPointerLock?.(); // absent on iPhone Safari — calling it threw
      sfx("alarm");
      this.chatLog = [];
      this.showMeeting();
    } else if (next === "playing" && (this.overlay === "reveal" || this.overlay === "ejection")) {
      this.closeOverlay();
    } else if (next === "lobby") {
      this.closeOverlay();
      this.lastOver = null;
      this.role = "crew";
      this.lobbyPanelOpen = true;
    }
    if (next !== "playing" && (this.overlay === "disguise" || this.overlay === "nest")) this.closeOverlay();
    this.renderLobby();
  }

  private onFx(f: FxMsg) {
    const near = (x: number, z: number) => Math.max(0.15, 1 - dist(this.x, this.z, x, z) / 30);
    switch (f.kind) {
      case "explode":
        this.fx.explode(f.x, f.z, f.c);
        sfx("boom", near(f.x, f.z));
        break;
      case "shot": {
        const n = this.map.nests[f.nest]!;
        this.fx.tracer(new THREE.Vector3(n.x, n.y, n.z), new THREE.Vector3(f.x, 0.9, f.z));
        sfx("shot", Math.max(0.5, near(f.x, f.z)));
        break;
      }
      case "vent":
        this.world.popVent(f.vent);
        sfx("vent", near(this.map.vents[f.vent]!.x, this.map.vents[f.vent]!.z));
        break;
      case "task":
        this.fx.sparkle(f.x, f.z, NEED_COLOR[f.need as keyof typeof NEED_COLOR] ?? "#fff");
        if (dist(this.x, this.z, f.x, f.z) < 3) sfx("task");
        break;
      case "shutdown":
        this.fx.sparkle(f.x, f.z, "#ff3a5a");
        break;
      case "elevator":
        sfx("elevator", near(f.x, f.z));
        break;
    }
  }

  private onRobo(m: Extract<ServerMsg, { t: "robo" }>) {
    // Volume and pan follow the speaker live via updateVoiceMix → robovoice.setMix.
    void this.robovoice.say(m.from, m.text, m.c, this.heard.get(m.from) ?? 0);
    this.say(m.from, m.text, m.c);
    if (this.phase === "meeting") {
      this.chatLog.push({ from: m.from, text: m.text, robo: m.c });
      this.renderChat();
    }
  }

  // ================================================================== frame

  update(dt: number) {
    this.time += dt;
    if (!this.active) return;
    const me = this.meView;
    const canMove =
      (this.phase === "lobby" || this.phase === "playing" || this.phase === "over") &&
      !this.inVent &&
      !this.inNest &&
      this.overlay !== "disguise" &&
      this.overlay !== "nest";

    // movement
    let mx = 0, mz = 0;
    if (canMove) {
      const f = this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0;
      const b = this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0;
      const l = this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0;
      const r = this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0;
      // keys and the touch stick add up; the stick is analog, so a light push walks slowly
      const fwd = f - b + this.stick.y, side = r - l + this.stick.x;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      mx = fx * fwd + -fz * side;
      mz = fz * fwd + fx * side;
    }
    const len = Math.hypot(mx, mz);
    const throttle = Math.min(1, len);
    const moving = len > 0.01;
    if (moving && me?.using) this.net.send({ t: "cancelUse" });
    if (moving && !me?.using) {
      const ghost = !this.alive && this.phase !== "lobby" && this.phase !== "over";
      const sp = MOVE_SPEED * (ghost ? 1.4 : this.crouching ? CROUCH_SPEED : 1) * throttle * dt;
      let nx = this.x + (mx / len) * sp, nz = this.z + (mz / len) * sp;
      if (!ghost) ({ x: nx, z: nz } = this.map.collide(nx, nz, PLAYER_RADIUS));
      else {
        nx = Math.max(this.map.floor.x1, Math.min(this.map.floor.x2, nx));
        nz = Math.max(this.map.floor.z1, Math.min(this.map.floor.z2, nz));
      }
      this.x = nx;
      this.z = nz;
      this.ry = Math.atan2(mx, mz);
    }
    this.self.target.set(this.x, 0, this.z);
    this.self.pos.set(this.x, 0, this.z);
    this.self.targetRy = this.ry;
    this.self.moving = moving;
    if (!this.canPose()) this.crouching = false;
    this.self.crouching = this.crouching;
    this.self.update(dt, true);
    this.self.root.visible = !this.inVent && !this.inNest;

    const t = performance.now();
    const pose = `${this.crouching}|${this.jumps}`;
    if (canMove && t - this.lastSend > 50 && (moving || this.sentMoving || pose !== this.sentPose)) {
      this.lastSend = t;
      this.sentMoving = moving;
      this.sentPose = pose;
      this.net.send({ t: "pos", x: this.x, z: this.z, ry: this.ry, moving, crouch: this.crouching, jumps: this.jumps });
    } else if (canMove && !moving && me && t - this.lastSend > 300 && dist(me.x, me.z, this.x, this.z) > 0.25) {
      // Standing still but the server's copy of us is elsewhere (a late or clipped update):
      // keep nudging until it agrees, or range checks on the server fail mysteriously.
      this.syncPos();
    }

    this.updateMouths();
    for (const r of this.robots.values()) r.update(dt, true);
    this.fx.update(dt);

    this.updateCamera(dt);
    this.updateAction();
    this.updateHud();
    this.updateBubbles();
  }

  private fovZoom() {
    return this.zoom * (this.scoping ? 3 : 1);
  }

  private updateCamera(dt: number) {
    const cam = this.camera;
    const me = this.meView;
    this.world.setFogView(me && me.nest >= 0 && this.phase === "playing" ? "sniper" : "inside");
    this.scope = 0;
    if (this.phase === "meeting" || this.phase === "ejection") {
      cam.fov = 55;
      // looking down the boardroom table, under the ceiling
      cam.position.lerp(new THREE.Vector3(0, 3.0, 6.4), Math.min(1, dt * 3));
      cam.lookAt(0, 0.6, 0);
    } else if (me && me.nest >= 0) {
      const n = this.map.nests[me.nest]!;
      this.pitch = Math.max(-0.5, Math.min(0.4, this.pitch));
      cam.fov = 50 / this.fovZoom();
      cam.position.set(n.x, n.y, n.z);
      const d = new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch),
      );
      cam.lookAt(cam.position.clone().add(d));
      this.scope = 1;
    } else if (me && me.vent >= 0) {
      const v = this.map.vents[me.vent]!;
      this.pitch = Math.max(-0.3, Math.min(0.5, this.pitch));
      cam.fov = 100;
      cam.position.set(v.x, 0.35, v.z);
      const d = new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch),
      );
      cam.lookAt(cam.position.clone().add(d));
    } else {
      this.pitch = Math.max(-0.25, Math.min(1.15, this.pitch));
      cam.fov = 62;
      const tx = this.self.pos.x, tz = this.self.pos.z, ty = 1.45 - 0.4 * this.self.crouchK + this.self.jumpH * 0.6;
      const boom = 4.2;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      // over the right shoulder, so the crosshair isn't hidden behind your own robot
      const sh = 0.75, rx = -fz * sh, rz = fx * sh;
      const hx = -fx * Math.cos(this.pitch) * boom + rx, hz = -fz * Math.cos(this.pitch) * boom + rz;
      // pull the camera in rather than letting a wall eat the view
      const hit = this.alive ? this.map.firstWallHit(tx, tz, tx + hx, tz + hz) : 1;
      const k = Math.max(0.12, hit - 0.08);
      const py = Math.min(CEILING_H - 0.2, ty + Math.sin(this.pitch) * boom * Math.max(k, 0.5));
      cam.position.set(tx + hx * k, py, tz + hz * k);
      cam.lookAt(tx + fx * 0.6 + rx * k, ty, tz + fz * 0.6 + rz * k);
    }
    cam.updateProjectionMatrix();
    // raycasts (shots, sniper reports) must use this frame's aim, not last render's
    cam.updateMatrixWorld();
  }

  private updateAction() {
    this.action = null;
    const me = this.meView;
    if (!me || !this.playing || !me.alive || this.inVent || this.inNest) return;
    if (me.using) return;

    const body = this.snap?.bodies.find((b) => dist(this.x, this.z, b.x, b.z) < REPORT_RANGE);
    if (body) {
      this.action = {
        label:
          body.c < 0
            ? `E — Report the wreckage`
            : `E — Report ${colorName(body.c)}'s ${body.kind === "ash" ? "ashes" : "shell"}`,
        run: () => this.net.send({ t: "report", body: body.id }),
      };
      return;
    }
    const st = this.map.stations.find((s) => dist(this.x, this.z, s.x, s.z) < USE_RANGE);
    if (st) {
      const i = NEEDS.indexOf(st.kind);
      const needed = me.active[i];
      this.action = {
        label: `E — ${NEED_LABEL[st.kind]} ${needed ? "" : "(not needed)"}`,
        run: () => this.net.send({ t: "use", station: st.id }),
      };
      return;
    }
    if (dist(this.x, this.z, BUTTON.x, BUTTON.z) < BUTTON_RANGE + 0.3) {
      this.action =
        me.meetingsLeft > 0
          ? {
              label: `E — Emergency meeting (${me.meetingsLeft} left)`,
              run: () => this.net.send({ t: "button" }),
            }
          : { label: "No emergency meetings left", run: () => sfx("deny") };
      return;
    }
    if (this.role === "impostor") {
      const el = this.map.elevators.find((e) => dist(this.x, this.z, e.x, e.z) < 2.2);
      if (el) {
        this.action = { label: "E — Take the elevator to a sniper nest", run: () => this.openNestPicker() };
        return;
      }
      const v = this.map.vents.find((v) => dist(this.x, this.z, v.x, v.z) < 1.4);
      if (v) this.action = { label: "V — Crawl into vent", run: () => this.onKey("KeyV") };
    }
  }

  /**
   * Mouths follow what *you* can hear: robot-voice lines, or raw voice chat gated by the
   * proximity mix — so a robot out of earshot never visibly gives itself away by talking.
   */
  private updateMouths() {
    const robo = !!this.settings?.roboSpeech;
    const mouthOf = (id: string) => {
      if ((this.heard.get(id) ?? 0) < 0.03) return null; // out of earshot: mouth stays shut
      return robo ? this.robovoice.mouth(id) : this.voice.peerMouth(id);
    };
    for (const [id, r] of this.robots) {
      const m = mouthOf(id);
      r.setTalk(m?.level ?? 0, m?.bright ?? 0.5);
    }
    const mine = robo ? this.robovoice.mouth(this.me) : this.voice.micMouth();
    this.self.setTalk(mine.level, mine.bright);
  }

  private updateVoiceMix() {
    const s = this.settings;
    if (!s || !this.lobby) return;
    const voiceOn = s.proximityVoice && !s.roboSpeech;
    const meAlive = this.alive;
    const visible = new Map(this.snap?.players.map((p) => [p.id, p]) ?? []);
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(right);
    right.cross(this.camera.up).normalize();
    for (const p of this.lobby.players) {
      if (p.id === this.me) continue;
      let g = 0, pan = 0;
      {
        // Only the role reveal and meetings are "everyone in one room"; the lobby and the
        // end screen use proximity just like live play.
        const freeRoam = this.phase === "lobby" || this.phase === "over";
        if (this.phase === "reveal") g = 1;
        else if (this.phase === "meeting" || this.phase === "ejection") g = p.alive || !meAlive ? 1 : 0;
        else if (!freeRoam && !p.alive) g = meAlive ? 0 : 0.9;
        else {
          const v = visible.get(p.id);
          if (v) {
            const d = dist(this.x, this.z, v.x, v.z);
            g = Math.pow(Math.max(0, 1 - d / s.voiceRange), 1.4);
            if (g > 0 && this.map.blocked(this.x, this.z, v.x, v.z, 2.6)) g *= 0.35;
            const dx = v.x - this.x, dz = v.z - this.z;
            const dl = Math.hypot(dx, dz) || 1;
            pan = ((dx / dl) * right.x + (dz / dl) * right.z) * 0.8;
          }
        }
      }
      this.heard.set(p.id, g);
      this.voice.setMix(p.id, voiceOn ? g : 0, pan);
      this.robovoice.setMix(p.id, s.roboSpeech ? g : 0, pan);
    }
    // your own robot voice: quiet, centred
    this.heard.set(this.me, 1);
    this.robovoice.setMix(this.me, s.roboSpeech ? 0.5 : 0, 0);
  }

  // ================================================================== HUD

  private buildNeeds() {
    $("needs").innerHTML = NEEDS.map(
      (n) => `
      <div class="need" id="need-${n}" style="--c:${NEED_COLOR[n]}">
        <div class="icon">${NEED_ICON[n]}</div>
        <div>
          <div class="label"><span>${NEED_LABEL[n]}</span><span class="state"></span></div>
          <div class="bar"><div class="fill" style="background:${NEED_COLOR[n]}"></div></div>
        </div>
      </div>`,
    ).join("");
  }

  private updateHud() {
    const me = this.meView;
    const inGame = this.phase !== "lobby" && !!me;
    $("hud").hidden = !this.active;
    $("needs").hidden = !inGame || this.phase === "over";
    $("lock-hint").hidden = this.isTouch || this.locked || this.overlay !== "none";

    const highlight = new Set<(typeof NEEDS)[number]>();
    if (me && inGame) {
      NEEDS.forEach((n, i) => {
        const el = $(`need-${n}`);
        const v = me.needs[i]!;
        const active = me.active[i]!;
        el.classList.toggle("active", active && v >= 30);
        el.classList.toggle("critical", active && v < 30);
        (el.querySelector(".fill") as HTMLElement).style.width = `${v}%`;
        (el.querySelector(".state") as HTMLElement).textContent = active
          ? this.role === "impostor"
            ? "fake it"
            : `${Math.ceil(v)}%`
          : "ok";
        if (active && me.alive) highlight.add(n);
      });
    }
    this.world.highlight = highlight;

    // role tag
    const tag = $("role-tag");
    if (inGame && me) {
      tag.hidden = false;
      tag.className = this.role === "impostor" ? "impostor" : "";
      tag.innerHTML =
        (this.role === "impostor" ? "MAL-ALIGNED AI" : "CREW") +
        (me.alive ? "" : "<br>OFFLINE (ghost)") +
        (me.disguised
          ? `<br>disguised as ${colorName(me.displayColor)}${me.disguiseLeft > 0 ? ` ${Math.ceil(me.disguiseLeft)}s` : ""}`
          : "") +
        (me.target ? `<br>your target, ${esc(me.target.name)} ${colorTag(me.target.color)}` : "");
    } else tag.hidden = true;

    // prompt
    let prompt = this.action?.label ?? "";
    if (me?.using) prompt = "Working… (move to cancel)";
    if (this.overlay !== "none" && this.overlay !== "reveal") prompt = "";
    $("prompt").textContent = this.playing && me?.alive ? prompt : "";

    // task progress ring
    const prog = $("progress");
    if (me?.using) {
      prog.hidden = false;
      const st = this.map.stations[me.using.station]!;
      $("progress-bar").style.strokeDashoffset = String(264 * (1 - me.using.progress));
      $("progress-bar").style.stroke = NEED_COLOR[st.kind];
      $("progress-label").textContent = `${Math.ceil((1 - me.using.progress) * (this.settings?.taskDuration ?? 5))}s`;
    } else prog.hidden = true;

    $("crosshair").hidden = this.inNest || this.phase === "meeting";

    // abilities
    const ab = $("abilities");
    if (this.playing && me?.alive && this.role === "impostor" && !this.inNest && !this.inVent) {
      const target = this.killTarget();
      ab.innerHTML = [
        this.abilityHtml(
          "Q",
          me.target && target && target.id !== me.target.id ? "WRONG ORDER" : "Explode",
          me.killCd,
          !!target,
          true,
        ),
        this.abilityHtml("F", me.disguised ? `As ${colorName(me.displayColor)}` : "Disguise", me.disguiseCd, true),
        this.abilityHtml("V", "Vent", 0, this.map.vents.some((v) => dist(this.x, this.z, v.x, v.z) < 1.4)),
        this.map.elevators.some((e) => dist(this.x, this.z, e.x, e.z) < 2.2)
          ? this.abilityHtml("E", "Snipe nest", me.snipeCd, true)
          : this.abilityHtml("E", "Snipe: go to elevator", 0, false),
      ].join("");
    } else if (this.playing && me?.alive && !this.inNest && !this.inVent) {
      ab.innerHTML = this.abilityHtml("E", this.action ? "Use" : "—", 0, !!this.action);
    } else ab.innerHTML = "";

    // mode hints
    let hint = "";
    if (me && me.nest >= 0) {
      hint = `${this.map.nests[me.nest]!.name.toUpperCase()} — ${
        me.snipeCd > 0 ? `RELOADING ${Math.ceil(me.snipeCd)}s` : "ROUND CHAMBERED"
      }<br><small>${kb("Click shoot · Right-drag / wheel zoom · X return to elevator", "FIRE to shoot · ZOOM to magnify · EXIT back to the elevator")}</small>`;
    } else if (me && me.vent >= 0) {
      hint = `IN THE this.map.vents<br><small>${kb("A / D crawl to next vent · V climb out", "◀ ▶ crawl to the next vent · CLIMB OUT")}</small>`;
    } else if (this.phase === "playing" && me && !me.alive) {
      hint = "YOU ARE OFFLINE — drift around as a ghost. The living can't hear you.";
    } else if (this.playing && this.alive && this.snap && this.snap.sniper >= 0 && this.role !== "impostor") {
      hint = "";
    }
    $("mode-hint").innerHTML = hint;
    this.renderTalk();
  }

  private abilityHtml(key: string, label: string, cd: number, ready: boolean, hot = false) {
    return `<div class="ability ${ready ? "" : "off"} ${hot && ready ? "hot" : ""}">
      <div class="key">${key}</div><div>${label}</div>
      ${cd > 0 ? `<div class="cd">${Math.ceil(cd)}</div>` : ""}
    </div>`;
  }

  private renderTalk() {
    const el = $("talk-indicator");
    if (this.robo.active) {
      el.hidden = false;
      el.textContent = "ROBO-TALK…";
    } else if (this.voice.micReady && !this.voice.muted && !this.settings?.roboSpeech) {
      const lvl = this.voice.micLevelNow();
      el.hidden = lvl < 0.02;
      el.textContent = "TALKING";
    } else el.hidden = true;
  }

  renderCorner() {
    const mic = $("mic-btn");
    const robo = this.settings?.roboSpeech;
    mic.textContent = robo
      ? this.robo.ready
        ? "HOLD T"
        : this.robo.shortStatus
      : this.voice.micReady
        ? this.voice.muted
          ? "MUTED"
          : "MIC ON"
        : "MIC";
    mic.classList.toggle("off", !robo && (!this.voice.micReady || this.voice.muted));
    mic.title = robo ? "Robo speech: hold T to talk" : "Toggle microphone (T)";
    $("music-btn").classList.toggle("off", !musicOn);
  }

  private dictationTimer = 0;
  /** Your own speech-to-text, live while you hold T, then briefly as sent. */
  private showDictation(state: "listening" | "sent" | "off", text = "") {
    const el = $("dictation");
    clearTimeout(this.dictationTimer);
    if (state === "off" || (state === "sent" && !text)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.className = state;
    (el.querySelector(".dict-label") as HTMLElement).textContent = state === "listening" ? "LISTENING" : "SENT";
    (el.querySelector(".dict-text") as HTMLElement).textContent = text || "…";
    if (state === "sent") this.dictationTimer = window.setTimeout(() => (el.hidden = true), 3500);
  }

  private say(id: string, text: string, color: number) {
    const el = document.createElement("div");
    el.className = "bubble";
    el.style.borderColor = colorCss(color);
    el.textContent = text;
    $("bubbles").appendChild(el);
    this.bubbles.push({ id, el, until: this.time + Math.min(9, 2.5 + text.length * 0.07) });
  }

  private updateBubbles() {
    const v = new THREE.Vector3();
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]!;
      const r = b.id === this.me ? this.self : this.robots.get(b.id);
      if (this.time > b.until || !r) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      v.set(r.pos.x, 2.1, r.pos.z).project(this.camera);
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      b.el.style.display = onScreen && this.phase !== "meeting" ? "" : "none";
      b.el.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      b.el.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    }
  }

  toast(text: string) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 3300);
  }

  // ================================================================== lobby panel

  renderLobby() {
    const l = this.lobby;
    const panel = $("lobby-panel");
    panel.hidden = !l || l.phase !== "lobby" || !this.lobbyPanelOpen;
    this.renderCorner();
    if (!l || panel.hidden) return;
    const host = l.host === this.me;
    $("lobby-code").textContent = l.code;
    this.renderLobbyPlayers();
    const mine = l.players.find((p) => p.id === this.me)?.color;
    const taken = new Set(l.players.map((p) => p.color));
    const picker = $("color-picker");
    if (l.settings.anonColors) {
      picker.innerHTML = `<div class="small">ANONYMOUS COLOURS — everyone's grey until the game starts, then colours are dealt at random.</div>`;
    } else picker.innerHTML = COLORS.map(
      (c, i) =>
        `<button data-c="${i}" title="${c.name}" style="background:${c.css}" class="${i === mine ? "mine" : ""}"
          ${taken.has(i) && i !== mine ? "disabled" : ""}></button>`,
    ).join("");
    picker.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        this.net.send({ t: "pickColor", color: Number(b.dataset.c) });
        sfx("blip");
      }),
    );

    // settings — rebuild only when not focused, so typing isn't interrupted
    const box = $("settings");
    if (!box.contains(document.activeElement)) {
      box.innerHTML = (Object.keys(SETTING_LABEL) as (keyof typeof SETTING_LABEL)[])
        .map((k) => {
          const v = l.settings[k];
          const lim = SETTING_LIMITS[k];
          const input =
            typeof v === "boolean"
              ? `<input type="checkbox" data-k="${k}" ${v ? "checked" : ""} ${host ? "" : "disabled"}>`
              : `<input type="number" data-k="${k}" value="${v}" min="${lim?.[0]}" max="${lim?.[1]}" step="${lim?.[2]}" ${host ? "" : "disabled"}>`;
          return `<label for="">${SETTING_LABEL[k]}</label>${input}`;
        })
        .join("");
      box.querySelectorAll("input").forEach((inp) =>
        inp.addEventListener("change", () => {
          const k = inp.dataset.k as keyof Settings;
          const val = inp.type === "checkbox" ? inp.checked : Number(inp.value);
          this.net.send({ t: "settings", settings: { [k]: val } });
        }),
      );
    }
    $("rules-owner").textContent = host ? "(you're host)" : "(host sets these)";
    this.renderMapOptions(host);

    this.renderVoiceRow();

    const start = $<HTMLButtonElement>("start");
    start.hidden = !host;
    start.disabled = l.players.filter((p) => p.connected).length < 2;
    start.onclick = () => this.net.send({ t: "start" });
    $("lobby-wait").hidden = host;
    $("copy-link").onclick = () => {
      const url = `${location.origin}/?code=${l.code}`;
      void navigator.clipboard.writeText(url).then(() => this.toast("Invite link copied"));
    };
  }

  /** The lobby's voice line: mic state, or robo speech engine + model download. */
  private renderVoiceRow() {
    const l = this.lobby;
    const vr = document.getElementById("voice-row");
    if (!l || !vr) return;
    if (l.settings.roboSpeech) {
      const r = this.robo;
      vr.innerHTML =
        r.engine === "web"
          ? `<div class="small">ROBO SPEECH ON — ${kb("hold <b>T</b>", "hold <b>TALK</b>")}, speak, release. Everyone hears a robot voice in your current colour.</div>`
          : r.local.status === "ready"
            ? `<div class="small">ROBO SPEECH ON (on-device model) — ${kb("hold <b>T</b>", "hold <b>TALK</b>")}, speak, release.</div>`
            : r.local.status === "error"
              ? `<div class="err">Voice model failed to load: ${esc(r.local.error)}</div>`
              : `<div class="small">ROBO SPEECH: this browser has no built-in speech engine, so a voice model is
                 downloading in the background (one time, ~28 MB). You can play now; talking unlocks at 100%.</div>
                 <div class="model-bar"><div style="width:${Math.round(r.local.progress * 100)}%"></div></div>`;
      // hear (and tune) your robot voice before playing
      const rv = this.robovoice;
      vr.insertAdjacentHTML(
        "beforeend",
        rv.status === "error"
          ? `<div class="err">Robot voice failed to load (${esc(rv.error)}) — using the browser's voice.</div>`
          : `<button id="voice-preview">▶ Hear my robot voice</button>`,
      );
      document.getElementById("voice-preview")?.addEventListener("click", () => {
        unlockAudio();
        const line = PREVIEW_LINES[Math.floor(Math.random() * PREVIEW_LINES.length)]!;
        void this.robovoice.say(this.me, line, this.self.color, 0.8);
      });
    } else if (l.settings.proximityVoice) {
      vr.innerHTML = this.voice.micReady
        ? `<div class="small">MIC ${this.voice.muted ? "MUTED" : "LIVE"} — ${kb("T", "the MIC button")} toggles. Voices fade with distance and walls.</div>`
        : `<button id="enable-mic">Enable microphone</button>`;
      document.getElementById("enable-mic")?.addEventListener("click", () => void this.toggleMic());
    } else vr.innerHTML = `<div class="small">Voice chat is off.</div>`;
  }

  /** Lobby roster with each robot's mic and our voice link to them. */
  private renderLobbyPlayers() {
    const l = this.lobby;
    if (!l || $("lobby-panel").hidden) return;
    const voiceOn = l.settings.proximityVoice && !l.settings.roboSpeech;
    const link = (id: string) => {
      const st = this.voice.peerState(id);
      if (st === "connected") return '<span class="link ok" title="voice connected">●</span>';
      if (st === "failed") return '<span class="link bad" title="voice could not connect">✕</span>';
      if (st === "none" || st === "closed") return '<span class="link" title="no voice link">○</span>';
      return '<span class="link wait" title="connecting">◌</span>';
    };
    const html = l.players
      .map(
        (p) =>
          `<li class="${p.connected ? "" : "off"}">${swatch(p.color)}<span>${esc(p.name)}</span>
          ${voiceOn ? `<span class="mic ${p.mic ? "" : "muted"}" title="${p.mic ? "mic on" : "no mic"}">${p.mic ? "🎙" : "🔇"}</span>` : ""}
          ${voiceOn && p.id !== this.me && p.connected ? link(p.id) : ""}
          ${p.id === l.host ? '<span class="small">HOST</span>' : ""}
          ${p.id === this.me ? '<span class="small">YOU</span>' : ""}</li>`,
      )
      .join("");
    const el = $("lobby-players");
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  // ================================================================== overlays

  private setOverlay(mode: Overlay, html: string, clear = false) {
    const o = $("overlay");
    this.overlay = mode;
    o.hidden = mode === "none";
    o.className = clear ? "clear" : "";
    o.innerHTML = html;
    if (mode !== "none" && mode !== "reveal") document.exitPointerLock?.(); // absent on iPhone Safari — calling it threw
  }

  closeOverlay() {
    this.setOverlay("none", "");
  }

  private myColor = -1;
  private showReveal() {
    const imp = this.role === "impostor";
    // with anonymous colours this is the first you learn of yours
    const yours = COLORS[this.myColor]
      ? `<p>${swatch(this.myColor)} You are <span style="color:${colorCss(this.myColor)}">${colorName(this.myColor).toUpperCase()}</span></p>`
      : "";
    this.setOverlay(
      "reveal",
      `<div class="splash">
        <h1 class="${imp ? "impostor" : "crew"}">${imp ? "YOU ARE THE<br>MAL-ALIGNED AI" : "YOU ARE CREW"}</h1>
        ${yours}
        ${
          imp
            ? `${
                this.settings?.assignedKills
                  ? `<p class="impostor">ASSIGNED KILLS: destroy the crew in your secret order. One wrong kill and you lose.</p>`
                  : ""
              }<p>${kb("Q explode a robot · F steal a colour · V crawl vents", "EXPLODE a robot · DISGUISE as any colour · VENT to crawl")}</p>
               <p>${kb("E at an elevator", "USE at an elevator")}: snipe from a distant tower</p>
               <p>Fake your needs at stations. Don't get voted out.</p>`
            : `<p>Keep your bars topped up at stations. Find the rogue AI.</p>
               <p>Report wreckage · press the boardroom button · click a sniper you spot in a window</p>`
        }
      </div>`,
      true,
    );
  }

  private openDisguise() {
    const me = this.meView;
    if (!me || !this.lobby) return;
    if (me.disguiseCd > 0) {
      this.toast(`Disguise recharging (${Math.ceil(me.disguiseCd)}s)`);
      return;
    }
    // every robot in the game, alive or dead — plus your own colour to drop the disguise
    const opts = this.lobby.players.filter((p) => p.color !== me.displayColor);
    this.setOverlay(
      "disguise",
      `<div class="pick panel"><h2>STEAL A COLOUR</h2>
        <div class="grid">${opts
          .map(
            (p) =>
              `<button data-c="${p.color}">${swatch(p.color)}${p.id === this.me ? "Back to my own" : colorName(p.color)}${p.alive ? "" : " ✝"}</button>`,
          )
          .join("")}</div>
        <div class="small">${this.settings?.disguiseDuration ? `Lasts ${this.settings.disguiseDuration}s` : "Permanent until you swap again"}${kb(" · Esc to cancel", "")}</div>
        <button class="pick-cancel">Cancel</button></div>`,
    );
    $("overlay").querySelector(".pick-cancel")!.addEventListener("click", () => this.closeOverlay());
    $("overlay").querySelectorAll("button[data-c]").forEach((b) =>
      b.addEventListener("click", () => {
        this.net.send({ t: "disguise", color: Number((b as HTMLElement).dataset.c) });
        this.closeOverlay();
      }),
    );
  }

  private openNestPicker() {
    const el = this.map.elevators.reduce((a, b) =>
      dist(this.x, this.z, a.x, a.z) < dist(this.x, this.z, b.x, b.z) ? a : b,
    );
    const { svg, layout } = mapSvg(this.map, { towers: true, you: { x: this.x, z: this.z }, elevator: el.id });
    const buttons = layout.towers
      .map(({ nest, x, z }) => {
        const p = toPercent(layout, x, z);
        return `<button class="tower-btn" data-n="${nest.id}" title="${nest.name}"
          style="left:${p.left.toFixed(1)}%;top:${p.top.toFixed(1)}%">${towerLabel(nest)}</button>`;
      })
      .join("");
    this.setOverlay(
      "nest",
      `<div class="pick panel tower-pick"><h2>WHICH TOWER?</h2>
        <div class="tower-map" style="aspect-ratio:${layout.vw} / ${layout.vh};width:min(100%, calc(var(--map-h) * ${(layout.vw / layout.vh).toFixed(4)}))">${svg}${buttons}</div>
        <div class="small">You vanish from the floor. Crew who spot you in a window can call a meeting.</div>
        <button class="pick-cancel">Cancel</button></div>`,
    );
    $("overlay").querySelector(".pick-cancel")!.addEventListener("click", () => this.closeOverlay());
    $("overlay").querySelectorAll("button[data-n]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = this.map.nests[Number((b as HTMLElement).dataset.n)]!;
        this.syncPos();
        this.net.send({ t: "nest", nest: n.id });
        // aim back at our floor
        this.yaw = Math.atan2(-n.x, -n.z);
        this.pitch = 0;
        this.zoom = 1;
        this.closeOverlay();
      }),
    );
  }

  private previewOn = false;
  private previewNest = 0;

  /** The lobby's sniper preview canvas and tower, while it's open and on screen. */
  get sniperPreview(): { canvas: HTMLCanvasElement; nest: number } | null {
    if (!this.previewOn || this.phase !== "lobby") return null;
    const canvas = document.getElementById("sniper-pip") as HTMLCanvasElement | null;
    if (!canvas || !canvas.offsetParent) return null;
    return { canvas, nest: this.previewNest };
  }

  /** The lobby's Map section: size, rooms, furniture, towers, reroll, and a live preview. */
  private renderMapOptions(host: boolean) {
    const l = this.lobby!;
    const box = $("map-settings");
    if (box.contains(document.activeElement)) return; // don't fight the host's typing
    const limits: Record<MapSettingKey, readonly [number, number, number]> = {
      mapSize: MAP_LIMITS.size,
      mapRoomSize: MAP_LIMITS.roomSize,
      mapRooms: MAP_LIMITS.rooms,
      mapProps: MAP_LIMITS.props,
      mapTowers: MAP_LIMITS.towers,
    };
    const dis = host ? "" : "disabled";
    const inputs = (Object.keys(MAP_SETTING_LABEL) as MapSettingKey[])
      .map((k) => {
        const v = l.settings[k];
        const [lo, hi, step] = limits[k];
        const input =
          k === "mapProps"
            ? `<select data-k="${k}" ${dis}>${PROP_LEVELS.map((name, i) => `<option value="${i}" ${i === v ? "selected" : ""}>${name}</option>`).join("")}</select>`
            : `<input type="number" data-k="${k}" value="${v}" min="${lo}" max="${hi}" step="${step}" ${dis}>`;
        const fit = this.map.rooms.filter((r) => r.id !== "board").length;
        const note = k === "mapRooms" && fit < v ? ` <span class="small fit-note">${fit} fit</span>` : "";
        return `<label>${MAP_SETTING_LABEL[k]}${note}</label>${input}`;
      })
      .join("");
    const fog = (Object.keys(FOG_SETTING_LABEL) as FogSettingKey[])
      .map((k) => {
        const v = l.settings[k] ?? 0;
        const opts = FOG_LEVELS.map((name, i) => `<option value="${i}" ${i === v ? "selected" : ""}>${name}</option>`).join("");
        return `<label>${FOG_SETTING_LABEL[k]}</label><select data-k="${k}" ${dis}>${opts}</select>`;
      })
      .join("");
    const { svg } = mapSvg(this.map, { towers: true });
    if (this.previewNest >= this.map.nests.length) this.previewNest = 0;
    const pn = this.map.nests[this.previewNest];
    box.innerHTML = `<div class="map-grid">${inputs}</div>
      <div class="map-preview">${svg}</div>
      ${host ? `<button id="new-map">🎲 New layout</button>` : ""}
      <div class="map-grid fog-grid">${fog}</div>
      <button id="sniper-preview">${this.previewOn ? "✕ Close sniper preview" : "🔭 Sniper preview"}</button>
      ${
        this.previewOn && pn
          ? `<canvas id="sniper-pip" title="Click for the next tower"></canvas>
             <div class="small pip-caption">${towerLabel(pn).toUpperCase()} TOWER — the sniper's fog${
               this.map.nests.length > 1 ? ` · ${kb("click", "tap")} for the next tower` : ""
             }</div>`
          : ""
      }`;
    $("sniper-preview").addEventListener("click", () => {
      this.previewOn = !this.previewOn;
      (document.activeElement as HTMLElement | null)?.blur(); // re-render skips a focused panel
      this.renderMapOptions(host);
    });
    document.getElementById("sniper-pip")?.addEventListener("click", () => {
      this.previewNest = (this.previewNest + 1) % this.map.nests.length;
      (document.activeElement as HTMLElement | null)?.blur();
      this.renderMapOptions(host);
    });
    box.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-k]").forEach((inp) =>
      inp.addEventListener("change", () => {
        this.net.send({ t: "settings", settings: { [inp.dataset.k!]: Number(inp.value) } });
      }),
    );
    document.getElementById("new-map")?.addEventListener("click", () => this.net.send({ t: "newMap" }));
    $("map-owner").textContent = host ? "(you're host)" : "(host sets these)";
  }

  private showMeeting() {
    const m = this.snap?.meeting;
    if (!m || !this.lobby) return;
    const title =
      m.reason === "body"
        ? `WRECKAGE REPORTED${m.bodyColor !== null ? ` — ${colorName(m.bodyColor).toUpperCase()}` : ""}`
        : m.reason === "sniper"
          ? "SNIPER SPOTTED!"
          : "EMERGENCY MEETING";
    this.setOverlay(
      "meeting",
      `<div class="meeting panel">
        <header><div><h2>${title}</h2><div class="small">called by ${esc(m.callerName)} ${colorTag(m.callerColor)}</div></div>
          <div class="timer" id="m-timer"></div></header>
        <div>
          <div class="cards" id="m-cards"></div>
          <div class="skip-row" style="margin-top:10px"><button id="m-skip">Skip vote</button><span id="m-status" class="small"></span></div>
        </div>
        <div class="chat"><div class="log" id="m-log"></div>
          <input id="m-input" maxlength="200" placeholder="${this.alive ? "Type + Enter" : "Ghosts can't talk"}" ${this.alive ? "" : "disabled"}></div>
      </div>`,
    );
    $("m-skip").onclick = () => this.vote("skip");
    $("m-input").addEventListener("keydown", (e) => {
      const inp = e.target as HTMLInputElement;
      if (e.key === "Enter" && inp.value.trim()) {
        this.net.send({ t: "chat", text: inp.value });
        inp.value = "";
      }
      e.stopPropagation();
    });
    this.renderMeeting();
    this.renderChat();
  }

  private myVote: string | null = null;
  private vote(target: string) {
    if (this.myVote || !this.alive) return;
    const m = this.snap?.meeting;
    if (!m || m.discussionLeft > 0) {
      this.toast("Voting opens after discussion");
      return;
    }
    this.myVote = target;
    this.net.send({ t: "vote", target });
    sfx("blip");
    this.renderMeeting();
  }

  private renderMeeting() {
    const m = this.snap?.meeting;
    if (this.overlay !== "meeting" || !m || !this.lobby) return;
    const cards = $("m-cards");
    if (!cards) return;
    // The server's roster is by *shown* identity: with disguises carried into the meeting a
    // colour can appear twice, and a disguised AI's own colour appears gone.
    cards.innerHTML = m.cards
      .map(
        (c) => `<button class="card ${c.alive ? "" : "dead"} ${c.id && m.voted.includes(c.id) ? "voted" : ""}
          ${c.id === this.me ? "mine" : ""}" ${c.id ? `data-id="${c.id}"` : ""} ${c.alive && c.id ? "" : "disabled"}>
          ${swatch(c.color)}<span class="who">${esc(c.name)}<span class="tag">${colorName(c.color).toUpperCase()}${c.alive ? "" : " · GONE"}</span></span>
        </button>`,
      )
      .join("");
    cards.querySelectorAll<HTMLElement>(".card[data-id]").forEach((c) =>
      c.addEventListener("click", () => this.vote(c.dataset.id!)),
    );
  }

  private votedKey = "";
  private updateMeeting() {
    const m = this.snap?.meeting;
    if (!m) {
      this.myVote = null;
      return;
    }
    if (this.overlay !== "meeting") this.showMeeting();
    const timer = $("m-timer");
    if (!timer) return;
    const s = this.snap!;
    timer.innerHTML =
      m.discussionLeft > 0
        ? `DISCUSS<br>${Math.ceil(m.discussionLeft)}s`
        : `VOTE NOW<br>${Math.ceil(s.timer)}s`;
    const key = m.voted.join(",") + "|" + m.cards.map((c) => `${c.id}:${c.color}:${c.alive}`).join(",");
    if (key !== this.votedKey) {
      this.votedKey = key;
      this.renderMeeting();
    }
    $("m-status").textContent = !this.alive
      ? "ghosts don't vote"
      : this.myVote
        ? `you voted ${this.myVote === "skip" ? "skip" : "✔"}`
        : m.discussionLeft > 0
          ? "voting opens soon"
          : kb("click a robot to vote", "tap a robot to vote");
    $<HTMLButtonElement>("m-skip").disabled = !!this.myVote || !this.alive || m.discussionLeft > 0;
    // talking rings from raw voice level
    if (this.settings?.proximityVoice && !this.settings.roboSpeech) {
      document.querySelectorAll<HTMLElement>("#m-cards .card[data-id]").forEach((c) => {
        const id = c.dataset.id!;
        const lvl = id === this.me ? this.voice.micLevelNow() : this.voice.peerLevel(id);
        c.classList.toggle("talking", lvl > 0.03);
      });
    }
  }

  private renderChat() {
    const log = document.getElementById("m-log");
    if (!log || !this.lobby) return;
    log.innerHTML = this.chatLog
      .map((c) => {
        if (c.robo !== undefined) {
          // Robo speech is anonymous: show only the colour the speaker is wearing.
          return `<div><b style="color:${colorCss(c.robo)}">🤖 ${colorName(c.robo)}:</b> ${esc(c.text)}</div>`;
        }
        // typed chat is labelled with the identity the speaker is showing
        return `<div><b style="color:${colorCss(c.c ?? -1)}">${esc(c.name ?? "?")}:</b> ${esc(c.text)}</div>`;
      })
      .join("");
    log.scrollTop = log.scrollHeight;
  }

  private showEjected(m: Extract<ServerMsg, { t: "ejected" }>) {
    this.myVote = null;
    const tallyHtml = m.tally
      .map((t) => `${t.color !== null ? `${swatch(t.color)} ${esc(t.name)}` : "Skip"}: ${t.n}`)
      .join(" &nbsp; ");
    let line1 = "", line2 = "";
    if (m.id && m.name !== null && m.color !== null) {
      const name = esc(m.name);
      line1 = `${name} (${colorName(m.color)}) was dismantled.`;
      line2 =
        m.wasImpostor === null
          ? ""
          : m.wasImpostor
            ? `<span class="crew">${name} WAS the mal-aligned AI.</span>`
            : `<span class="impostor">${name} was not the AI.</span>`;
      sfx("boom", 0.6);
    } else {
      line1 = m.tie ? "Tied vote — nobody was dismantled." : "Skipped — nobody was dismantled.";
    }
    this.setOverlay(
      "ejection",
      `<div class="splash"><h1>${line1}</h1><p>${line2}</p><p class="result-votes">${tallyHtml}</p></div>`,
    );
  }

  private lastOver: Extract<ServerMsg, { t: "over" }> | null = null;
  private overHost = false;
  private showOver(m: Extract<ServerMsg, { t: "over" }>, quiet = false) {
    this.lastOver = m;
    const imp = this.lobby?.players.find((p) => p.id === m.impostor);
    const host = this.lobby?.host === this.me;
    this.overHost = host;
    const crewWon = m.winner === "crew";
    const iWon = (this.role === "impostor") === !crewWon;
    this.setOverlay(
      "over",
      `<div class="splash panel">
        <h1 class="${crewWon ? "crew" : "impostor"}">${crewWon ? "CREW WINS" : "THE AI WINS"}</h1>
        <p>${esc(m.reason)}</p>
        <p>The mal-aligned AI was ${imp ? `${swatch(imp.color)} ${esc(imp.name)}` : "?"}</p>
        <p>${iWon ? "You won." : "You lost."}</p>
        ${host ? `<button class="big" id="to-lobby">Back to lobby</button>` : `<p class="small">Waiting for host…</p>`}
      </div>`,
    );
    $("to-lobby")?.addEventListener("click", () => this.net.send({ t: "toLobby" }));
    if (!quiet) sfx(crewWon ? "task" : "boom");
  }
}
