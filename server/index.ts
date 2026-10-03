import { join } from "node:path";
import index from "../client/frontend/index.html";
import { TICK_HZ } from "../shared/constants.ts";
import type { ClientMsg } from "../shared/protocol.ts";
import { Lobby, Player, type SocketData } from "./game.ts";

const PORT = Number(process.env.PORT ?? 3000);
const DEV = process.env.NODE_ENV !== "production";

// Kept on globalThis so `bun --hot` reloads don't wipe running lobbies during development.
const g = globalThis as unknown as { __rkLobbies?: Map<string, Lobby>; __rkTick?: ReturnType<typeof setInterval> };
const lobbies = (g.__rkLobbies ??= new Map<string, Lobby>());

/** Home-screen app files (manifest + icons) — served as-is, outside the HTML bundle. */
const PUBLIC = join(import.meta.dir, "../public");
const asset = (name: string, type: string) => () =>
  new Response(Bun.file(join(PUBLIC, name)), {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
  });
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
 * Voice is peer-to-peer. STUN alone works when both routers allow a direct path; across
 * many home networks it doesn't, and a TURN relay carries the audio instead. Two options:
 *  - Cloudflare Realtime TURN: CF_TURN_KEY_ID + CF_TURN_API_TOKEN (short-lived creds minted here)
 *  - any static TURN server:   TURN_URL (comma list) + TURN_USERNAME + TURN_CREDENTIAL
 */
const STUN: RTCIceServer = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] };
let cfCache: { servers: RTCIceServer[]; until: number } | null = null;

async function cloudflareTurn(): Promise<RTCIceServer[]> {
  const id = process.env.CF_TURN_KEY_ID, token = process.env.CF_TURN_API_TOKEN;
  if (!id || !token) return [];
  if (cfCache && Date.now() < cfCache.until) return cfCache.servers;
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 86400 }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = (await r.json()) as { iceServers: RTCIceServer | RTCIceServer[] };
    // Browsers refuse port 53, which Cloudflare also lists; drop those URLs.
    const servers = [body.iceServers].flat().map((s) => ({
      ...s,
      urls: [s.urls].flat().filter((u) => !/:53(\?|$)/.test(u)),
    }));
    cfCache = { servers, until: Date.now() + 12 * 3600_000 }; // creds live 24h; refresh at 12h
    return servers;
  } catch (e) {
    console.error("[ice] Cloudflare TURN failed:", (e as Error).message);
    return [];
  }
}

async function iceServers(): Promise<RTCIceServer[]> {
  const list: RTCIceServer[] = [STUN, ...(await cloudflareTurn())];
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
    "/api/ice": async () => Response.json(await iceServers()),
    "/health": () => Response.json({ ok: true, lobbies: lobbies.size }),
    "/manifest.webmanifest": asset("manifest.webmanifest", "application/manifest+json"),
    "/apple-touch-icon.png": asset("apple-touch-icon.png", "image/png"),
    "/icon-192.png": asset("icon-192.png", "image/png"),
    "/icon-512.png": asset("icon-512.png", "image/png"),
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

