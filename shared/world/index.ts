// The one floor of the tower, as plain 2D data — read by the server (rules, collision,
// sniper line-of-sight) and by the client (which builds the 3D scene from it).
//
// Authored in pieces: rooms/ (one file each), open-plan.ts (offices along the windows),
// places.ts (vents, elevators, towers, spawns). assemble.ts joins them.

export * from "./types.ts";
export { CEILING_H, FLOOR } from "./build.ts";
export { RECTS, ROOMS, STATIONS } from "./assemble.ts";
export { BUTTON, TABLE } from "./rooms/boardroom.ts";
export { ELEVATORS, NESTS, VENTS, spawnPoint, ventNeighbour } from "./places.ts";
export { blocked, collide, dist, firstWallHit, roomAt } from "./geometry.ts";
