// Headless check that the server keeps up with a phone whose position updates arrive in
// bunches (mobile data), and still refuses teleports. `bun scripts/test-movement.ts`

import { Lobby, type Player } from "../server/game.ts";
import { MOVE_SPEED } from "../shared/constants.ts";
import { ELEVATORS } from "../shared/world/index.ts";
import type { ServerMsg } from "../shared/protocol.ts";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const lobby = new Lobby("MOVE");
const inboxes = new Map<string, ServerMsg[]>();
const players: Player[] = [];
for (const name of ["Phone", "Other"]) {
  const box: ServerMsg[] = [];
  const ws = { send: (s: string) => box.push(JSON.parse(s)), close() {} } as any;
  const p = lobby.join(ws, name, `tok-${name}`) as Player;
  inboxes.set(p.id, box);
  players.push(p);
}
lobby.handle(players[0]!, { t: "start" });
lobby.phase = "playing";
const phone = players.find((p) => p.role === "impostor") ?? players[0]!;
if (phone.role !== "impostor") {
  // make the walker the AI so it may use the elevator
  for (const p of players) p.role = p === phone ? "impostor" : "crew";
}

// Walk from the east corridor toward the east elevator at full speed for 2.4 s,
// sending every 50 ms — but delivered six at a time every 300 ms.
const el = ELEVATORS[1]!;
phone.teleport(8, 0);
let cx = 8;
const msgs: number[] = [];
for (let i = 0; i < 48; i++) {
  cx = Math.min(el.x - 0.6, cx + MOVE_SPEED * 0.05);
  msgs.push(cx);
}
for (let i = 0; i < msgs.length; i += 6) {
  await sleep(300);
  for (const x of msgs.slice(i, i + 6)) lobby.handle(phone, { t: "pos", x, z: 0, ry: 0, moving: true });
}
lobby.handle(phone, { t: "pos", x: cx, z: 0, ry: 0, moving: false });
check("server keeps up with bunched updates", Math.abs(phone.x - cx) < 0.05, `server ${phone.x.toFixed(2)} vs phone ${cx.toFixed(2)}`);

lobby.handle(phone, { t: "nest", nest: 2 });
check("elevator accepts the tower choice", phone.nest === 2, `nest=${phone.nest}`);
lobby.handle(phone, { t: "nestExit" });

// A cheater trying to jump 20 m in one go is still held to walking speed.
await sleep(100);
const before = phone.x;
lobby.handle(phone, { t: "pos", x: before - 20, z: 0, ry: 0, moving: true });
check("teleports are still refused", Math.abs(phone.x - before) < MOVE_SPEED * 1.4, `moved ${Math.abs(phone.x - before).toFixed(2)} m`);

// A refused action says why.
phone.teleport(0, 6);
lobby.handle(phone, { t: "nest", nest: 0 });
const toast = [...inboxes.get(phone.id)!].reverse().find((m) => m.t === "toast") as { text: string } | undefined;
check("a refused elevator explains itself", toast?.text === "Get closer to the elevator.", toast?.text);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
