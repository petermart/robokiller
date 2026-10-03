// The thunderstorm: rain falling everywhere outside the glass, and lightning bolts with
// a screen flash and thunder (the sound arrives later the further away the strike is).

import * as THREE from "three";
import { FLOOR } from "../../../shared/world/index.ts";
import { noInk } from "../toon.ts";

export class Weather {
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private bolt: THREE.Line | null = null;
  private nextStrike = 4;
  private strike: { t: number; pulses: number[] } | null = null;
  onThunder: (delay: number, power: number) => void = () => {};

  constructor(private scene: THREE.Scene) {
    const N = 2600;
    this.rainPos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) this.respawnDrop(i, Math.random() * 60 - 30);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c8e0, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false;
    scene.add(noInk(this.rain));
  }

  /** Drops spawn anywhere around the tower except over the (roofed) playable floor. */
  private respawnDrop(i: number, y: number) {
    let x = 0, z = 0;
    do {
      x = (Math.random() - 0.5) * 140;
      z = (Math.random() - 0.5) * 140;
    } while (x > FLOOR.x1 - 1 && x < FLOOR.x2 + 1 && z > FLOOR.z1 - 1 && z < FLOOR.z2 + 1);
    const p = this.rainPos;
    p[i * 6] = x;
    p[i * 6 + 1] = y;
    p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.12;
    p[i * 6 + 4] = y - 1.1;
    p[i * 6 + 5] = z + 0.05;
  }

  private spawnBolt() {
    if (this.bolt) this.scene.remove(this.bolt);
    const a = Math.random() * Math.PI * 2;
    const r = 90 + Math.random() * 120;
    let x = Math.cos(a) * r, z = Math.sin(a) * r, y = 120;
    const pts = [new THREE.Vector3(x, y, z)];
    while (y > -60) {
      y -= 8 + Math.random() * 12;
      x += (Math.random() - 0.5) * 14;
      z += (Math.random() - 0.5) * 14;
      pts.push(new THREE.Vector3(x, y, z));
    }
    this.bolt = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xe8f0ff, fog: false }),
    );
    this.scene.add(noInk(this.bolt));
    return r;
  }

  /** Advances rain and lightning; returns the flash level (0–1) for lights and post. */
  update(dt: number): number {
    const p = this.rainPos;
    const fall = dt * 26;
    for (let i = 0; i < p.length / 6; i++) {
      p[i * 6 + 1]! -= fall;
      p[i * 6 + 4]! -= fall;
      if (p[i * 6 + 4]! < -30) this.respawnDrop(i, 30);
    }
    (this.rain.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

    // lightning: a few quick pulses, thunder after a distance-based delay
    this.nextStrike -= dt;
    if (this.nextStrike < 0) {
      this.nextStrike = 7 + Math.random() * 14;
      const r = this.spawnBolt();
      this.strike = { t: 0, pulses: [0, 0.09, 0.22].slice(0, 2 + Math.floor(Math.random() * 2)) };
      this.onThunder(r / 160 + Math.random() * 0.6, 0.6 + Math.random() * 0.4);
    }
    let flash = 0;
    if (this.strike) {
      this.strike.t += dt;
      for (const at of this.strike.pulses) {
        const d = this.strike.t - at;
        if (d >= 0 && d < 0.12) flash = Math.max(flash, 1 - d / 0.12);
      }
      if (this.strike.t > 0.5) {
        this.strike = null;
        if (this.bolt) {
          this.scene.remove(this.bolt);
          this.bolt = null;
        }
      }
    }
    return flash;
  }
}
