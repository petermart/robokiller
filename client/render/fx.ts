import * as THREE from "three";
import { COLORS } from "../../shared/constants.ts";
import { glow, noInk } from "./toon.ts";

interface Live {
  obj: THREE.Object3D;
  t: number;
  life: number;
  tick: (k: number, dt: number) => void;
}

export class Fx {
  private live: Live[] = [];
  constructor(private scene: THREE.Scene) {}

  private add(obj: THREE.Object3D, life: number, tick: Live["tick"]) {
    this.scene.add(noInk(obj));
    this.live.push({ obj, t: 0, life, tick });
  }

  explode(x: number, z: number, color: number) {
    const hex = COLORS[color]?.hex ?? 0xffffff;
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
    this.add(g, 1.1, (k, dt) => {
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

  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, fog: false }));
    this.add(line, 0.45, (k) => {
      (line.material as THREE.LineBasicMaterial).opacity = 1 - k;
    });
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow(0xffffff, 0.8));
    puff.position.copy(to);
    this.add(puff, 0.4, (k) => {
      puff.scale.setScalar(1 + k * 3);
      (puff.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
    });
  }

  sparkle(x: number, z: number, color: string) {
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
    this.add(g, 0.9, (k) => {
      for (const m of parts) {
        const r = 0.3 + k * 0.8;
        m.position.set(Math.cos(m.userData.a + k * 3) * r, 0.5 + k * 1.6, Math.sin(m.userData.a + k * 3) * r);
        m.scale.setScalar(1 - k);
      }
    });
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i]!;
      l.t += dt;
      const k = Math.min(1, l.t / l.life);
      l.tick(k, dt);
      if (k >= 1) {
        this.scene.remove(l.obj);
        this.live.splice(i, 1);
      }
    }
  }
}
