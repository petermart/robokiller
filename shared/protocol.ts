import type { Phase, Role, Settings } from "./constants.ts";

// ---- client → server ------------------------------------------------------------------

export type ClientMsg =
  | { t: "create"; name: string; token: string }
  | { t: "join"; code: string; name: string; token: string }
  | { t: "settings"; settings: Partial<Settings> }
  | { t: "pickColor"; color: number }
  | { t: "start" }
  | { t: "toLobby" }
  | { t: "leave" }
  | { t: "mic"; on: boolean }
  | { t: "pos"; x: number; z: number; ry: number; moving: boolean }
  | { t: "use"; station: number }
  | { t: "cancelUse" }
  | { t: "kill"; target: string }
  | { t: "disguise"; color: number }
  | { t: "vent"; vent: number }
  | { t: "ventMove"; dir: 1 | -1 }
  | { t: "ventExit" }
  | { t: "nest"; nest: number }
  | { t: "nestExit" }
  | { t: "shoot"; target: string | null; hx: number; hz: number }
  | { t: "report"; body: string }
  | { t: "reportSniper"; nest: number }
  | { t: "button" }
  | { t: "vote"; target: string | "skip" }
  | { t: "chat"; text: string }
  | { t: "robo"; text: string }
  | { t: "rtc"; to: string; data: unknown };

// ---- server → client ------------------------------------------------------------------

export interface LobbyPlayer {
  id: string;
  name: string;
  color: number;
  connected: boolean;
  alive: boolean;
  /** Is this robot actually sending microphone audio? */
  mic: boolean;
}

export interface PlayerView {
  id: string;
  x: number;
  z: number;
  ry: number;
  /** The colour others see — a disguise changes this. */
  c: number;
  moving: boolean;
  using: boolean;
  /** Only ever true in the snapshot of dead players (ghosts see ghosts). */
  ghost: boolean;
}

export interface BodyView {
  id: string;
  x: number;
  z: number;
  c: number;
  kind: "ash" | "husk";
}

export interface MeView {
  role: Role;
  alive: boolean;
  color: number;
  displayColor: number;
  needs: number[];
  active: boolean[];
  using: { station: number; progress: number } | null;
  killCd: number;
  snipeCd: number;
  disguiseCd: number;
  /** Seconds left on a timed disguise; 0 when permanent or none. */
  disguiseLeft: number;
  disguised: boolean;
  vent: number;
  nest: number;
  meetingsLeft: number;
  /** Assigned kills: who the AI must explode next (real identity). */
  target: { id: string; name: string; color: number } | null;
  /** Server-side position; the client snaps to it whenever `tp` changes. */
  x: number;
  z: number;
  tp: number;
}

/** One row of the voting roster, by the identity robots are *showing*. */
export interface MeetingCard {
  /** Player id to vote for; null for a colour nobody alive is wearing. */
  id: string | null;
  color: number;
  name: string;
  alive: boolean;
}

export interface MeetingView {
  reason: "button" | "body" | "sniper";
  caller: string;
  callerName: string;
  callerColor: number;
  /** null when deaths are anonymous or nobody was reported. */
  bodyColor: number | null;
  cards: MeetingCard[];
  voted: string[];
  discussionLeft: number;
}

export interface Snapshot {
  t: "snap";
  phase: Phase;
  timer: number;
  players: PlayerView[];
  bodies: BodyView[];
  /** Which nest is occupied right now (-1 for none). Everyone can see the silhouette. */
  sniper: number;
  me: MeView | null;
  meeting: MeetingView | null;
}

export type Fx =
  | { kind: "explode"; x: number; z: number; c: number }
  | { kind: "shot"; nest: number; x: number; z: number; hit: boolean }
  | { kind: "vent"; vent: number }
  | { kind: "task"; x: number; z: number; need: string }
  | { kind: "shutdown"; x: number; z: number; c: number }
  | { kind: "elevator"; x: number; z: number };

export type ServerMsg =
  | {
      t: "lobby";
      code: string;
      you: string;
      host: string;
      phase: Phase;
      players: LobbyPlayer[];
      settings: Settings;
    }
  | Snapshot
  | { t: "role"; role: Role; impostorColor: number | null; quiet?: boolean }
  | { t: "fx"; fx: Fx }
  | {
      t: "ejected";
      id: string | null;
      name: string | null;
      color: number | null;
      tally: { name: string; color: number | null; n: number }[];
      wasImpostor: boolean | null;
      tie: boolean;
    }
  | { t: "over"; winner: Role; reason: string; impostor: string }
  | { t: "chat"; from: string; text: string; name: string; c: number }
  | { t: "robo"; from: string; text: string; x: number; z: number; c: number; global: boolean }
  | { t: "rtc"; from: string; data: unknown }
  | { t: "toast"; text: string }
  | { t: "error"; text: string };
