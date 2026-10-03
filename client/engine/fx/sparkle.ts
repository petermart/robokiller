import * as THREE from "three";
import { glow } from "../toon.ts";
import type { AddFx } from "./index.ts";

/** Twelve glints spiralling up and shrinking away. */
export function sparkle(add: AddFx, x: number, z: number, color: string) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const c = new THREE.Color(color).getHex();
  const parts: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), glow(c));
    m.userData.a = (i / 12) * Math.PI * 2;
    g.add(m);
    parts.push(m);
  }
  add(g, 0.9, (k) => {
    for (const m of parts) {
      const r = 0.3 + k * 0.8;
      m.position.set(Math.cos(m.userData.a + k * 3) * r, 0.5 + k * 1.6, Math.sin(m.userData.a + k * 3) * r);
      m.scale.setScalar(1 - k);
    }
  });
}
