import * as THREE from "three";
import { COLORS } from "../../../shared/constants.ts";
import { glow } from "../toon.ts";
import type { AddFx } from "./index.ts";

/** Fireball, shockwave ring, a flash of light and bouncing scrap in the victim's colour. */
export function explode(add: AddFx, x: number, z: number, color: number) {
  const hex = COLORS[color]?.hex ?? 0x8a8c94; // -1 = anonymous: grey debris
  const g = new THREE.Group();
  g.position.set(x, 0.8, z);
  const bits: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      glow(i % 3 === 0 ? 0xffb040 : i % 3 === 1 ? hex : 0x3a3030),
    );
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(3 + Math.random() * 4);
    g.add(m);
    bits.push({ m, v });
  }
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), glow(0xffd070, 0.9));
  g.add(ball);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 24), glow(0xffa040, 0.8));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.75;
  g.add(ring);
  const light = new THREE.PointLight(0xffa040, 40, 12, 1.5);
  g.add(light);
  add(g, 1.1, (k, dt) => {
    for (const b of bits) {
      b.v.y -= 12 * dt;
      b.m.position.addScaledVector(b.v, dt);
      if (b.m.position.y < -0.75) {
        b.m.position.y = -0.75;
        b.v.multiplyScalar(0.4);
      }
      b.m.rotation.x += dt * 8;
    }
    ball.scale.setScalar(1 + k * 2.5);
    (ball.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - k * 2.2);
    ring.scale.setScalar(1 + k * 8);
    (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - k);
    light.intensity = 40 * Math.max(0, 1 - k * 3);
  });
}
