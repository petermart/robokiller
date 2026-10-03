import index from "../client/index.html";
import { TICK_HZ } from "../shared/constants.ts";
import type { ClientMsg } from "../shared/protocol.ts";
import { Lobby, Player, type SocketData } from "./game.ts";

const PORT = Number(process.env.PORT ?? 3000);
const DEV = process.env.NODE_ENV !== "production";

// Kept on globalThis so `bun --hot` reloads don't wipe running lobbies during development.
const g = globalThis as unknown as { __rkLobbies?: Map<string, Lobby>; __rkTick?: ReturnType<typeof setInterval> };
const lobbies = (g.__rkLobbies ??= new Map<string, Lobby>());
// After a hot reload, point surviving lobbies at the freshly loaded classes so edits apply.
for (const l of lobbies.values()) {
  Object.setPrototypeOf(l, Lobby.prototype);
  for (const p of l.players.values()) Object.setPrototypeOf(p, Player.prototype);
}
// No I, O, 0 or 1 — codes get read aloud over voice chat.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function newCode(): string {
  for (;;) {
    let c = "";
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!lobbies.has(c)) return c;
  }
}

/**
 * STUN is enough for most home networks. Friends behind strict NATs need a TURN relay —
 * set TURN_URL / TURN_USERNAME / TURN_CREDENTIAL and it is handed to every client.
 */
function iceServers() {
  const list: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  if (process.env.TURN_URL) {
    list.push({
      urls: process.env.TURN_URL.split(","),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return list;
}

const server = Bun.serve<SocketData>({
  port: PORT,
  development: DEV ? { hmr: true, console: true } : false,
  routes: {
    "/": index,
    "/api/ice": () => Response.json(iceServers()),
    "/health": () => Response.json({ ok: true, lobbies: lobbies.size }),
  },
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (srv.upgrade(req, { data: { lobby: null, player: null } })) return;
      return new Response("expected websocket", { status: 400 });
    }
    return new Response("not found", { status: 404 });
  },
  websocket: {
    idleTimeout: 60,
    message(ws, raw) {
      let m: ClientMsg;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      const d = ws.data;
      if (m.t === "create" || m.t === "join") {
        if (d.lobby && d.player) d.lobby.disconnect(d.player);
        const name = String(m.name ?? "").slice(0, 16).trim();
        const token = String(m.token ?? "").slice(0, 64);
        let lobby: Lobby | undefined;
        if (m.t === "create") {
          lobby = new Lobby(newCode());
          lobbies.set(lobby.code, lobby);
        } else {
          lobby = lobbies.get(String(m.code ?? "").toUpperCase().trim());
          if (!lobby) {
            ws.send(JSON.stringify({ t: "error", text: "No lobby with that code." }));
            return;
          }
        }
        const res = lobby.join(ws, name, token);
        if (typeof res === "string") {
          ws.send(JSON.stringify({ t: "error", text: res }));
          return;
        }
        d.lobby = lobby;
        d.player = res;
        return;
      }
      if (m.t === "leave") {
        if (d.lobby && d.player) d.lobby.leave(d.player);
        d.lobby = d.player = null;
        return;
      }
      if (d.lobby && d.player) d.lobby.handle(d.player, m);
    },
    close(ws) {
      const { lobby, player } = ws.data;
      // A reconnect may already have handed this player a new socket.
      if (lobby && player && player.ws === ws) lobby.disconnect(player);
    },
  },
});

let last = performance.now();
if (g.__rkTick) clearInterval(g.__rkTick);
g.__rkTick = setInterval(() => {
  const t = performance.now();
  const dt = Math.min(0.25, (t - last) / 1000);
  last = t;
  for (const [code, lobby] of lobbies) {
    if (lobby.players.size === 0 || lobby.connectedCount === 0) {
      lobby.emptySince ||= t;
      if (t - lobby.emptySince > 120_000) lobbies.delete(code);
    } else lobby.emptySince = 0;
    lobby.tick(dt);
  }
}, 1000 / TICK_HZ);

console.log(`Robokiller listening on http://localhost:${server.port}`);

