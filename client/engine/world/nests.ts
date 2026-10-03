// The three distant towers a sniper can shoot from. Each has a lit open window; while a
// sniper is in it, a dark silhouette and a blinking red scope glint give them away to
// anyone who looks closely.

import * as THREE from "three";
import { NESTS } from "../../../shared/world/index.ts";
import { Robot } from "../meshes/robot.ts";
import { glow, noInk } from "../toon.ts";
import { towerGeometry, towerMaterial } from "./city.ts";

export class SniperNests {
  /** Invisible, generous click targets for reporting a sniper. */
  hits: THREE.Mesh[] = [];
  private snipers: Robot[] = [];
  private glints: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    for (const n of NESTS) {
      const h = n.bh + 180;
      const tower = new THREE.Mesh(towerGeometry(n.bw, h, n.bd), towerMaterial(20 + n.id, 0.18, 0x14161e, 0.7));
      tower.position.set(n.bx, -180 + h / 2, n.bz);
      scene.add(tower);

      // The open window: a shallow lit box between the facade and the sniper's eye.
      // Outward facade normal (towards our floor) along the building's dominant axis.
      const dx = n.x - n.bx, dz = n.z - n.bz;
      const toFloor =
        Math.abs(dx) / n.bw > Math.abs(dz) / n.bd
          ? new THREE.Vector3(Math.sign(dx), 0, 0)
          : new THREE.Vector3(0, 0, Math.sign(dz));
      // eye sits 1.2m proud of the facade (see NESTS); the back wall stays 10cm in front
      // of the tower's solid face so it isn't z-fighting it
      const depth = 1.05;
      // BackSide box = an open window seen from outside: only the far walls render
      const recess = new THREE.Mesh(
        new THREE.BoxGeometry(toFloor.x ? depth : 3, 2.4, toFloor.z ? depth : 3),
        new THREE.MeshBasicMaterial({ color: 0xe0813a, side: THREE.BackSide }),
      );
      recess.position.set(n.x - toFloor.x * (0.05 + depth / 2), 1.25, n.z - toFloor.z * (0.05 + depth / 2));
      scene.add(noInk(recess));
      const lamp = new THREE.PointLight(0xffa860, 6, 6, 1.5);
      lamp.position.set(n.x - toFloor.x * 1.0, 2.2, n.z - toFloor.z * 1.0);
      scene.add(lamp);

      // silhouette — only visible while a sniper is in this nest
      const r = new Robot(6);
      r.snap(n.x - toFloor.x * 0.6, n.z - toFloor.z * 0.6, Math.atan2(toFloor.x, toFloor.z));
      r.root.position.y = 0.1;
      r.root.visible = false;
      r.update(0.016, false);
      scene.add(r.root);
      this.snipers.push(r);

      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow(0xff3020));
      glint.position.set(n.x + toFloor.x * 0.3, n.y, n.z + toFloor.z * 0.3);
      glint.visible = false;
      scene.add(noInk(glint));
      this.glints.push(glint);

      // generous click target so "looking closely" is about noticing, not pixel-hunting
      const hit = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(n.x, 1.2, n.z);
      hit.userData.nest = n.id;
      scene.add(hit);
      this.hits.push(hit);
    }
  }

  /** Show the silhouette in `nest` (-1 for none) — but never to the sniper themselves. */
  setSniper(nest: number, hideOwn: boolean) {
    this.snipers.forEach((r, i) => (r.root.visible = i === nest && !hideOwn));
    this.glints.forEach((g, i) => (g.visible = i === nest && !hideOwn));
  }

  update(time: number) {
    for (const g of this.glints) {
      if (g.visible) g.scale.setScalar(Math.sin(time * 9) > 0.6 ? 1.6 : 0.7);
    }
  }
}
