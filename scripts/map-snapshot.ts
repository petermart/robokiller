// Prints a generated map as canonical JSON, so a change can prove the geometry only moved
// where intended: `bun scripts/map-snapshot.ts > before.json`, change things, diff.
// Optional args: size rooms props towers seed roomSize (defaults = the original map).

import { generateMap, spawnPoint, TABLE, BUTTON, CEILING_H } from "../shared/world/index.ts";

const [size = 100, rooms = 4, props = 1, towers = 3, seed = 0, roomSize = 100] = process.argv.slice(2).map(Number);
const M = generateMap({ size, roomSize, rooms, props, towers, seed });
const sorted = (a: unknown[]) => [...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
const out = {
  RECTS: sorted(M.rects),
  ROOMS: M.rooms,
  STATIONS: M.stations,
  VENTS: M.vents,
  ELEVATORS: M.elevators,
  NESTS: M.nests,
  TABLE,
  BUTTON,
  FLOOR: M.floor,
  CEILING_H,
  spawn: [0, 1, 2, 3, 9].map((i) => spawnPoint(i, 10)),
  collide: [[0, 0], [-5, -6.8], [19.5, 0.1], [9, 6]].map(([x, z]) => M.collide(x!, z!, 0.42)),
  blocked: [[-4, -55.8, 3, 12], [58, 5, 8, 0], [0, 0, 0, 12]].map(([a, b, c, d]) => M.blocked(a!, b!, c!, d!)),
};
console.log(JSON.stringify(out, null, 1));
