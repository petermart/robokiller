import * as THREE from "three";
import { glow } from "../toon.ts";
import type { AddFx } from "./index.ts";

/** A bright streak from the tower window to the impact, and a puff where it lands. */
export function tracer(add: AddFx, from: THREE.Vector3, to: THREE.Vector3) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, fog: false }));
  add(line, 0.45, (k) => {
    (line.material as THREE.LineBasicMaterial).opacity = 1 - k;
  });
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow(0xffffff, 0.8));
  puff.position.copy(to);
  add(puff, 0.4, (k) => {
    puff.scale.setScalar(1 + k * 3);
    (puff.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
  });
}
