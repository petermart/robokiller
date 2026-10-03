// Values both the server and the client must agree on.

export const TICK_HZ = 20;
export const MAX_PLAYERS = 10;

export const PLAYER_RADIUS = 0.42;
export const MOVE_SPEED = 4.2; // m/s
export const KILL_RANGE = 1.9;
export const USE_RANGE = 1.7;
export const REPORT_RANGE = 2.6;
export const BUTTON_RANGE = 3.0;

export type NeedKind = "power" | "oil" | "software" | "gears";
export const NEEDS: NeedKind[] = ["power", "oil", "software", "gears"];
export const NEED_LABEL: Record<NeedKind, string> = {
  power: "Electricity",
  oil: "Fluid / Oil",
  software: "Software Update",
  gears: "Gears",
};
export const NEED_ICON: Record<NeedKind, string> = {
  power: "⚡",
  oil: "🛢",
  software: "💾",
  gears: "⚙",
};
export const NEED_COLOR: Record<NeedKind, string> = {
  power: "#ffd84a",
  oil: "#ff8a3d",
  software: "#4af0ff",
  gears: "#c8a2ff",
};

export interface RobotColor {
  name: string;
  hex: number;
  css: string;
}
export const COLORS: RobotColor[] = [
  { name: "Red", hex: 0xe8363b, css: "#e8363b" },
  { name: "Blue", hex: 0x2f6bff, css: "#2f6bff" },
  { name: "Green", hex: 0x2fbf4a, css: "#2fbf4a" },
  { name: "Pink", hex: 0xff6fc8, css: "#ff6fc8" },
  { name: "Orange", hex: 0xff8a1f, css: "#ff8a1f" },
  { name: "Yellow", hex: 0xf5e03a, css: "#f5e03a" },
  { name: "Black", hex: 0x3a3a46, css: "#3a3a46" },
  { name: "White", hex: 0xe8ecf2, css: "#e8ecf2" },
  { name: "Purple", hex: 0x8a3cff, css: "#8a3cff" },
  { name: "Cyan", hex: 0x2fe6e0, css: "#2fe6e0" },
];

export interface Settings {
  /** Seconds to fulfil a need at a station. */
  taskDuration: number;
  /** A new need arrives every [needIntervalMin, needIntervalMax] seconds. */
  needIntervalMin: number;
  needIntervalMax: number;
  /** Seconds a need's bar takes to drain from full to empty; empty = shutdown. */
  needDeadline: number;
  killCooldown: number;
  sniperCooldown: number;
  disguiseDuration: number;
  disguiseCooldown: number;
  discussionTime: number;
  votingTime: number;
  emergencyMeetings: number;
  confirmEjects: boolean;
  proximityVoice: boolean;
  /** Admin toggle: mic → text → robot TTS, instead of raw voice. */
  roboSpeech: boolean;
  voiceRange: number;
}

export const DEFAULT_SETTINGS: Settings = {
  taskDuration: 5,
  needIntervalMin: 60,
  needIntervalMax: 120,
  needDeadline: 60,
  killCooldown: 10,
  sniperCooldown: 60,
  disguiseDuration: 0,
  disguiseCooldown: 30,
  discussionTime: 30,
  votingTime: 45,
  emergencyMeetings: 1,
  confirmEjects: true,
  proximityVoice: true,
  roboSpeech: false,
  voiceRange: 11,
};

/** Clamp ranges for host-editable numeric settings — the server enforces these. */
export const SETTING_LIMITS: Partial<Record<keyof Settings, [number, number, number]>> = {
  taskDuration: [1, 20, 1],
  needIntervalMin: [10, 300, 5],
  needIntervalMax: [10, 400, 5],
  needDeadline: [15, 240, 5],
  killCooldown: [5, 120, 5],
  sniperCooldown: [10, 180, 5],
  disguiseDuration: [0, 300, 5],
  disguiseCooldown: [5, 120, 5],
  discussionTime: [0, 180, 5],
  votingTime: [10, 300, 5],
  emergencyMeetings: [0, 9, 1],
  voiceRange: [4, 30, 1],
};

export const SETTING_LABEL: Record<keyof Settings, string> = {
  taskDuration: "Task duration (s)",
  needIntervalMin: "Need interval — low (s)",
  needIntervalMax: "Need interval — high (s)",
  needDeadline: "Need drain time (s)",
  killCooldown: "Explode cooldown (s)",
  sniperCooldown: "Sniper reload (s)",
  disguiseDuration: "Disguise duration (s, 0 = permanent)",
  disguiseCooldown: "Disguise cooldown (s)",
  discussionTime: "Discussion time (s)",
  votingTime: "Voting time (s)",
  emergencyMeetings: "Emergency meetings each",
  confirmEjects: "Confirm ejects",
  proximityVoice: "Proximity voice chat",
  roboSpeech: "Robo speech (anonymised TTS)",
  voiceRange: "Voice range (m)",
};

export type Phase = "lobby" | "reveal" | "playing" | "meeting" | "ejection" | "over";
export type Role = "crew" | "impostor";
