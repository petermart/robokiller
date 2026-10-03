// Boardroom — the open centre of the floor: the long table, the red emergency button that
// pulses on it, and a spinning EMERGENCY sign above. (Footprint: shared/world/rooms/boardroom.ts.)

import * as THREE from "three";
import { BOARDROOM, BUTTON, TABLE } from "../../../../shared/world/rooms/boardroom.ts";
import { glow, noInk, textTexture, toon } from "../../toon.ts";

export class Boardroom {
  /** Table parts the camera and raycasts treat as solid. */
  solids: THREE.Object3D[] = [];
  private button: THREE.Mesh;
  private sign: THREE.Mesh;

  constructor(scene: THREE.Object3D) {
    const l = new THREE.PointLight(BOARDROOM.light, 10, 12, 1.3);
    l.position.set(0, 2.9, 0);
    scene.add(l);

    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 0.1, TABLE.d), toon(0x3a2a24));
    top.position.set(TABLE.x, 0.78, TABLE.z);
    scene.add(top);
    const base = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w * 0.7, 0.7, TABLE.d * 0.5), toon(0x24242c));
    base.position.set(TABLE.x, 0.38, TABLE.z);
    scene.add(base);
    this.solids.push(top, base);

    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 12), toon(0x2a2c34));
    dome.position.set(BUTTON.x, 0.89, BUTTON.z);
    scene.add(dome);
    this.button = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glow(0xff2a3a));
    this.button.position.set(BUTTON.x, 0.94, BUTTON.z);
    scene.add(this.button);

    this.sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 0.75),
      new THREE.MeshBasicMaterial({
        map: textTexture("EMERGENCY", "#ff3a4a"),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.sign.position.set(0, 2.9, 0);
    scene.add(noInk(this.sign));
  }

  update(dt: number, time: number) {
    (this.button.material as THREE.MeshBasicMaterial).color.setHSL(0, 1, 0.45 + Math.sin(time * 4) * 0.1);
    this.sign.rotation.y += dt * 0.4;
  }
}
