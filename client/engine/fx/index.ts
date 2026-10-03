// One-shot visual effects. Each effect lives in its own file and builds its objects plus
// a tick function; this manager adds them to the scene, runs them, and removes them.

import * as THREE from "three";
import { noInk } from "../toon.ts";
import { explode } from "./explode.ts";
import { sparkle } from "./sparkle.ts";
import { tracer } from "./tracer.ts";

/** Called every frame with k = 0→1 over the effect's life. */
export type FxTick = (k: number, dt: number) => void;
/** How an effect hands its objects to the manager. */
export type AddFx = (obj: THREE.Object3D, life: number, tick: FxTick) => void;

interface Live {
  obj: THREE.Object3D;
  t: number;
  life: number;
  tick: FxTick;
}

export class Fx {
  private live: Live[] = [];
  private add: AddFx = (obj, life, tick) => {
    this.scene.add(noInk(obj));
    this.live.push({ obj, t: 0, life, tick });
  };

  constructor(private scene: THREE.Scene) {}

  /** A robot blowing apart; color -1 = anonymous grey debris. */
  explode(x: number, z: number, color: number) {
    explode(this.add, x, z, color);
  }

  /** A sniper round from a tower window to its target. */
  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    tracer(this.add, from, to);
  }

  /** A little spiral of glints: a finished task, or a robot powering down. */
  sparkle(x: number, z: number, color: string) {
    sparkle(this.add, x, z, color);
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
