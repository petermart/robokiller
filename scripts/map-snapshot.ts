// Prints the server-side map as canonical JSON, so a refactor can prove the geometry
// didn't change: `bun scripts/map-snapshot.ts > before.json`, refactor, diff.

const path = process.argv[2] ?? "../shared/world/index.ts";
const M = await import(path);
const sorted = (a: unknown[]) => [...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
const out = {
  RECTS: sorted(M.RECTS),
  ROOMS: M.ROOMS.map((r: Record<string, unknown>) => ({ id: r.id, name: r.name, x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2, safe: r.safe, light: r.light })),
  STATIONS: M.STATIONS,
  VENTS: M.VENTS,
  ELEVATORS: M.ELEVATORS,
  NESTS: M.NESTS,
  TABLE: M.TABLE,
  BUTTON: M.BUTTON,
  FLOOR: M.FLOOR,
  CEILING_H: M.CEILING_H,
  spawn: [0, 1, 2, 3, 9].map((i) => M.spawnPoint(i, 10)),
  collide: [[0, 0], [-5, -6.8], [19.5, 0.1], [9, 6]].map(([x, z]) => M.collide(x, z, 0.42)),
  blocked: [[-4, -55.8, 3, 12], [58, 5, 8, 0], [0, 0, 0, 12]].map(([a, b, c, d]) => M.blocked(a, b, c, d)),
};
console.log(JSON.stringify(out, null, 1));
