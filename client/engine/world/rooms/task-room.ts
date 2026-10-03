// What every enclosed task room shares: a floor tinted in its neon colour, a ceiling
// light, a neon strip, and its name lit up over both corridor-facing walls.

import * as THREE from "three";
import { CEILING_H, type Room } from "../../../../shared/world/index.ts";
import { glow, noInk, textTexture, toon } from "../../toon.ts";

export function buildTaskRoom(scene: THREE.Scene, room: Room) {
  const w = room.x2 - room.x1, d = room.z2 - room.z1;
  const cx = (room.x1 + room.x2) / 2, cz = (room.z1 + room.z2) / 2;

  const tint = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshToonMaterial({
      color: new THREE.Color(room.light).lerp(new THREE.Color(0x2a2e3e), 0.82),
      gradientMap: toon(0).gradientMap,
    }),
  );
  tint.rotation.x = -Math.PI / 2;
  tint.position.set(cx, 0.005, cz);
  scene.add(tint);

  const l = new THREE.PointLight(room.light, 14, 11, 1.2);
  l.position.set(cx, 2.8, cz);
  scene.add(l);

  // neon strip along the ceiling edge
  const strip = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.05, 0.05), glow(room.light));
  strip.position.set(cx, CEILING_H - 0.1, room.z1 + 0.25);
  scene.add(noInk(strip));

  // the room's name on both corridor-facing sides
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.8),
    new THREE.MeshBasicMaterial({
      map: textTexture(room.name.toUpperCase(), "#" + room.light.toString(16).padStart(6, "0")),
      transparent: true,
      depthWrite: false,
    }),
  );
  const faceX = cx < 0 ? room.x2 + 0.15 : room.x1 - 0.15;
  sign.position.set(faceX, 2.75, cz);
  sign.rotation.y = cx < 0 ? Math.PI / 2 : -Math.PI / 2;
  scene.add(noInk(sign));
  const sign2 = sign.clone();
  const faceZ = cz < 0 ? room.z2 + 0.15 : room.z1 - 0.15;
  sign2.position.set(cx, 2.75, faceZ);
  sign2.rotation.y = cz < 0 ? 0 : Math.PI;
  scene.add(sign2);
}
