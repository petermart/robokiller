// Headless checks for the admin twists: assigned kills, anonymous deaths, disguise carry.
// Runs the real Lobby with fake sockets — `bun scripts/test-twists.ts`.

import { Lobby, type Player } from "../server/game.ts";
import type { ServerMsg, Snapshot } from "../shared/protocol.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function setup(settings: Record<string, unknown>) {
  const lobby = new Lobby("TEST");
  const inbox = new Map<string, ServerMsg[]>();
  const players: Player[] = [];
  for (const name of ["Ivy", "Juno", "Kip", "Lux"]) {
    const box: ServerMsg[] = [];
    const ws = { send: (s: string) => box.push(JSON.parse(s)), close() {} } as any;
    const p = lobby.join(ws, name, `tok-${name}`) as Player;
    inbox.set(p.id, box);
    players.push(p);
  }
  lobby.handle(players[0]!, { t: "settings", settings: { killCooldown: 5, ...settings } as any });
  lobby.handle(players[0]!, { t: "start" });
  // skip the reveal and every cooldown
  lobby.phase = "playing";
  const imp = players.find((p) => p.role === "impostor")!;
  imp.killReadyAt = imp.disguiseReadyAt = imp.snipeReadyAt = 0;
  const last = <T extends ServerMsg["t"]>(p: Player, t: T) =>
    [...inbox.get(p.id)!].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  const snap = (p: Player) => {
    lobby.tick(0.05);
    return last(p, "snap") as Snapshot;
  };
  return { lobby, players, imp, crew: players.filter((p) => p !== imp), last, snap };
}

// ---- 1. assigned target always wins, even when another robot is closer -----------------
{
  const { lobby, imp, snap } = setup({ assignedKills: true });
  const target = snap(imp).me!.target!;
  const t1 = lobby.players.get(target.id)!;
  const other = [...lobby.players.values()].find((p) => p !== imp && p !== t1)!;
  imp.x = 0; imp.z = 6;
  t1.x = 1.6; t1.z = 6;     // in reach, further
  other.x = 0.5; other.z = 6; // in reach, closer — and the one the client asks for
  lobby.handle(imp, { t: "kill", target: other.id });
  check("explode picks the assigned target over a closer robot", !t1.alive && other.alive);
  check("game continues after a correct kill", lobby.phase === "playing", lobby.phase);
  const next = snap(imp).me!.target;
  check("target advances to the next robot in the order", !!next && next.id !== t1.id, next?.name);
}

// ---- 2. a wrong-order kill loses the game ----------------------------------------------------
{
  const { lobby, imp, snap, last } = setup({ assignedKills: true });
  const target = lobby.players.get(snap(imp).me!.target!.id)!;
  const wrong = [...lobby.players.values()].find((p) => p !== imp && p !== target)!;
  imp.x = 0; imp.z = 6;
  wrong.x = 1; wrong.z = 6;
  target.x = 12; target.z = 12; // out of reach
  lobby.handle(imp, { t: "kill", target: wrong.id });
  const over = last(imp, "over");
  check("wrong-order kill ends the game for the crew", lobby.phase === "over" && over?.winner === "crew", over?.reason);
}

// ---- 3. without assigned kills nothing changes ----------------------------------------------
{
  const { lobby, imp, crew, snap } = setup({ assignedKills: false });
  check("no target shown when the setting is off", snap(imp).me!.target === null);
  imp.x = 0; imp.z = 6;
  crew[0]!.x = 1; crew[0]!.z = 6;
  lobby.handle(imp, { t: "kill", target: crew[0]!.id });
  check("free kills still work", !crew[0]!.alive && lobby.phase === "playing");
}

// ---- 4. anonymous deaths + disguise carried into the meeting ---------------------------------
{
  const { lobby, imp, crew, snap, last } = setup({ assignedKills: true, anonymousDeaths: true, disguiseCarry: true });
  const victim = lobby.players.get(snap(imp).me!.target!.id)!;
  // the AI dresses as its victim, then kills it
  lobby.handle(imp, { t: "disguise", color: victim.color });
  imp.x = 0; imp.z = 6;
  victim.x = 1; victim.z = 6;
  for (const c of crew) if (c !== victim) { c.x = 10; c.z = -10; }
  lobby.handle(imp, { t: "kill", target: victim.id });
  const body = snap(crew.find((c) => c !== victim)!).bodies[0];
  check("anonymous ashes carry no colour", body?.c === -1, `c=${body?.c}`);

  const reporter = crew.find((c) => c !== victim)!;
  reporter.x = body!.x + 0.5; reporter.z = body!.z;
  lobby.handle(reporter, { t: "report", body: body!.id });
  const m = snap(reporter).meeting!;
  check("report gives no colour", m.bodyColor === null);
  const asVictim = m.cards.filter((c) => c.color === victim.color);
  const asImp = m.cards.filter((c) => c.color === imp.color);
  check(
    "roster: victim's colour shows alive (worn by the AI)",
    asVictim.length === 1 && asVictim[0]!.alive && asVictim[0]!.id === imp.id && asVictim[0]!.name === victim.name,
  );
  check("roster: the AI's real colour shows gone", asImp.length === 1 && !asImp[0]!.alive && asImp[0]!.id === null);
  check("roster never shows the AI's real name on a living card", !m.cards.some((c) => c.alive && c.name === imp.name));

  lobby.handle(imp, { t: "chat", text: "it was Kip" });
  const chat = last(reporter, "chat")!;
  check("typed chat is labelled with the disguise", chat.name === victim.name && chat.c === victim.color);

  // everyone votes the "victim" card — i.e. the disguised AI
  lobby.meeting!.discussionEnds = 0;
  for (const p of lobby.players.values()) if (p.alive) lobby.handle(p, { t: "vote", target: imp.id });
  const ej = last(reporter, "ejected")!;
  check("ejection is announced under the disguise", ej.name === victim.name && ej.color === victim.color);
  check("ejected message carries no voter→target map", !("votes" in ej));
}

// ---- 5. disguise drops at meetings when not carried ---------------------------------------
{
  const { lobby, imp, crew, snap } = setup({ disguiseCarry: false });
  lobby.handle(imp, { t: "disguise", color: crew[0]!.color });
  crew[1]!.x = 0; crew[1]!.z = 0;
  lobby.handle(crew[1]!, { t: "button" });
  const m = snap(crew[1]!).meeting!;
  check("disguise dropped for the meeting", imp.displayColor === imp.color);
  check("roster shows everyone as themselves", m.cards.every((c) => c.alive) && m.cards.length === 4);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
