import type { ClientMsg, ServerMsg } from "../shared/protocol.ts";

/** One WebSocket to the game server, reconnecting into the same lobby seat on drop. */
export class Net {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private retry = 0;
  /** Re-sent after every reconnect so the server hands back the same player. */
  rejoin: ClientMsg | null = null;
  onMessage: (m: ServerMsg) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};

  constructor() {
    this.connect();
  }

  private connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus(true);
      if (this.rejoin) ws.send(JSON.stringify(this.rejoin));
      for (const q of this.queue) ws.send(q);
      this.queue = [];
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data));
      } catch (err) {
        console.error(err);
      }
    };
    ws.onclose = () => {
      this.onStatus(false);
      setTimeout(() => this.connect(), Math.min(4000, 300 * 2 ** this.retry++));
    };
  }

  send(m: ClientMsg) {
    const s = JSON.stringify(m);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(s);
    else if (m.t !== "pos") this.queue.push(s);
  }
}

/** Per-tab identity: separate tabs are separate players, a reload keeps your seat. */
export function sessionToken(): string {
  try {
    let t = sessionStorage.getItem("rk.token");
    if (!t) {
      t = crypto.randomUUID();
      sessionStorage.setItem("rk.token", t);
    }
    return t;
  } catch {
    return crypto.randomUUID();
  }
}
