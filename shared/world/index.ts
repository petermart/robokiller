// The tower floor as plain 2D data — read by the server (rules, collision, sniper
// line-of-sight) and by the client (which builds the 3D scene from it).
//
// Each lobby generates its own WorldMap from the host's map options (generate.ts):
// rooms/ (one file per room, plus corner closets), open-plan.ts (offices along the
// windows), places.ts (vents, elevators, sniper towers, spawns).

import { DEFAULT_MAP_OPTIONS, generateMap } from "./generate.ts";

export * from "./types.ts";
export { BASE_FLOOR, CEILING_H } from "./build.ts";
export { BUTTON, TABLE } from "./rooms/boardroom.ts";
export { MAX_TOWERS, spawnPoint } from "./places.ts";
export { DEFAULT_MAP_OPTIONS, MAP_LIMITS, PROP_LEVELS, generateMap } from "./generate.ts";
export { WorldMap, dist } from "./worldmap.ts";

/** The original map — what the title screen shows before you're in a lobby. */
export const DEFAULT_MAP = generateMap(DEFAULT_MAP_OPTIONS);
