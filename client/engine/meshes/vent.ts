import * as THREE from "three";
import { toon } from "../toon.ts";

/** A floor vent with a hinged hatch (named "hatch" so it can pop open). */
export function ventMesh(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0.01, z);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), toon(0x30333e));
  frame.position.y = 0.025;
  g.add(frame);
  const hatch = new THREE.Group();
  hatch.position.set(0, 0.06, -0.38);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.03, 0.76), toon(0x6c7183));
  plate.position.z = 0.38;
  hatch.add(plate);
  for (let i = 0; i < 4; i++) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.032, 0.06), toon(0x14161e));
    slot.position.set(0, 0.002, 0.12 + i * 0.16);
    hatch.add(slot);
  }
  hatch.name = "hatch";
  g.add(hatch);
  return g;
}
