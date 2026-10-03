import * as THREE from "three";
import { CEILING_H, FLOOR } from "../../../shared/world/index.ts";
import { glow, noInk, textTexture, toon } from "../toon.ts";

/** A service elevator door in the east or west wall, with its lit ELEVATOR sign. */
export function elevatorMesh(e: { x: number; z: number }): THREE.Group {
  const g = new THREE.Group();
  g.position.set(e.x < 0 ? FLOOR.x1 + 0.12 : FLOOR.x2 - 0.12, 0, e.z);
  g.rotation.y = e.x < 0 ? Math.PI / 2 : -Math.PI / 2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.0, CEILING_H, 0.1), toon(0x2a2c36));
  frame.position.y = CEILING_H / 2;
  g.add(frame);
  for (const sx of [-0.62, 0.62]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.5, 0.08), toon(0xa8b0c0));
    door.position.set(sx, 1.25, 0.06);
    g.add(door);
  }
  const ind = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.04), glow(0xff5a3a));
  ind.position.set(0, 2.75, 0.08);
  g.add(noInk(ind));
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.65),
    new THREE.MeshBasicMaterial({ map: textTexture("ELEVATOR", "#ff8a3d"), transparent: true, depthWrite: false }),
  );
  sign.position.set(0, 3.08, 0.1);
  g.add(noInk(sign));
  return g;
}
