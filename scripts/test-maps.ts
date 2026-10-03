// Every generated map must be playable: from the spawn ring a robot can walk to every
// station, vent and elevator. Flood-fills a 0.25 m grid with the robot's real collision
// radius across many option combinations. `bun scripts/test-maps.ts`

import { PLAYER_RADIUS } from "../shared/constants.ts";
import { generateMap, spawnPoint, type MapOptions } from "../shared/world/index.ts";

const STEP = 0.25;
let failures = 0;

function check(o: MapOptions) {
  const m = generateMap(o);
  const f = m.floor;
  const nx = Math.round((f.x2 - f.x1) / STEP), nz = Math.round((f.z2 - f.z1) / STEP);
  const free = (x: number, z: number) => {
    const c = m.collide(x, z, PLAYER_RADIUS);
    return Math.abs(c.x - x) < 1e-6 && Math.abs(c.z - z) < 1e-6;
  };
  const cell = (x: number, z: number) => [Math.round((x - f.x1) / STEP), Math.round((z - f.z1) / STEP)] as const;
  const seen = new Uint8Array((nx + 1) * (nz + 1));
  const idx = (i: number, j: number) => j * (nx + 1) + i;

  const s0 = spawnPoint(0, 10);
  const [si, sj] = cell(s0.x, s0.z);
  const queue = [[si, sj]];
  seen[idx(si, sj)] = 1;
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i! + di!, b = j! + dj!;
      if (a < 0 || b < 0 || a > nx || b > nz || seen[idx(a, b)]) continue;
      if (!free(f.x1 + a * STEP, f.z1 + b * STEP)) {
        seen[idx(a, b)] = 2;
        continue;
      }
      seen[idx(a, b)] = 1;
      queue.push([a, b]);
    }
  }
  // reachable if any walkable cell within `r` of the spot was reached
  const reached = (x: number, z: number, r: number) => {
    const [ci, cj] = cell(x, z);
    const k = Math.ceil(r / STEP);
    for (let a = ci - k; a <= ci + k; a++)
      for (let b = cj - k; b <= cj + k; b++)
        if (a >= 0 && b >= 0 && a <= nx && b <= nz && seen[idx(a, b)] === 1 && Math.hypot((a - ci) * STEP, (b - cj) * STEP) <= r) return true;
    return false;
  };

  const problems: string[] = [];
  for (const s of m.stations) if (!reached(s.x, s.z, 1.6)) problems.push(`station ${s.id} (${s.kind})`);
  for (const v of m.vents) if (!reached(v.x, v.z, 1.3)) problems.push(`vent ${v.id}`);
  for (const e of m.elevators) if (!reached(e.x, e.z, 2.0)) problems.push(`elevator ${e.id}`);
  for (let i = 0; i < 10; i++) {
    const p = spawnPoint(i, 10);
    if (!free(p.x, p.z)) problems.push(`spawn ${i} blocked`);
  }
  if (m.nests.length !== o.towers) problems.push(`towers ${m.nests.length} ≠ ${o.towers}`);
  const label = `size ${o.size}% roomSize ${o.roomSize}% rooms ${o.rooms} props ${o.props} towers ${o.towers} seed ${o.seed}`;
  const extra = m.rects.length;
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${label} — ${m.stations.length} stations, ${m.vents.length} vents, ${extra} rects${problems.length ? ` — unreachable: ${problems.join(", ")}` : ""}`);
  if (problems.length) failures++;
}

for (const size of [100, 130, 160, 200]) {
  for (const rooms of [4, 8, 12, 16]) {
    for (const props of [0, 3, 5]) {
      check({ size, roomSize: 100, rooms, props, towers: 1 + ((size + rooms + props) % 8), seed: size * 13 + rooms * 7 + props });
    }
  }
}
// room size across its whole range, at small and large floors, sparse and dense
for (const roomSize of [70, 80, 90, 110, 120, 130, 140, 150]) {
  for (const [size, rooms, props] of [[100, 4, 1], [100, 10, 5], [150, 16, 3], [200, 16, 5]] as const) {
    check({ size, roomSize, rooms, props, towers: 3, seed: roomSize + size });
  }
}
for (let seed = 1; seed <= 8; seed++) check({ size: 100 + seed * 10, roomSize: 70 + seed * 10, rooms: 4 + seed, props: 2 + (seed % 4), towers: 8, seed });

console.log(failures ? `\n${failures} map(s) not fully reachable` : "\nall maps playable");
process.exit(failures ? 1 : 0);
