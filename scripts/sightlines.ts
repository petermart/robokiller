// How much does furniture break up long views? For each density level, samples pairs of
// open-floor spots more than 15 m apart (outside rooms) and reports the share with a clear
// line of sight at robot height. `bun scripts/sightlines.ts [size] [rooms]`

import { PLAYER_RADIUS } from "../shared/constants.ts";
import { PROP_LEVELS, generateMap } from "../shared/world/index.ts";

const [size = 130, rooms = 8] = process.argv.slice(2).map(Number);
for (let props = 0; props < PROP_LEVELS.length; props++) {
  const m = generateMap({ size, roomSize: 100, rooms, props, towers: 3, seed: 7 });
  const f = m.floor;
  let s = 99;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const spot = () => {
    for (;;) {
      const x = f.x1 + 1 + rand() * (f.x2 - f.x1 - 2), z = f.z1 + 1 + rand() * (f.z2 - f.z1 - 2);
      const c = m.collide(x, z, PLAYER_RADIUS);
      if (Math.abs(c.x - x) < 1e-6 && Math.abs(c.z - z) < 1e-6 && !m.roomAt(x, z)) return { x, z };
    }
  };
  let clear = 0, n = 0;
  while (n < 600) {
    const a = spot(), b = spot();
    if (Math.hypot(a.x - b.x, a.z - b.z) < 15) continue;
    n++;
    if (!m.blocked(a.x, a.z, b.x, b.z)) clear++;
  }
  const label = PROP_LEVELS[props]!.padEnd(10);
  console.log(`${label} ${String(Math.round((clear / n) * 100)).padStart(3)}% of long views clear   (${m.rects.length} pieces)`);
}
