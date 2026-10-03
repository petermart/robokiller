import * as THREE from "three";
import { COLORS } from "../../../shared/constants.ts";
import { glow, noInk, toon } from "../toon.ts";
import { Robot } from "./robot.ts";

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** A heap of ash and colored scrap where a robot exploded. */
export function makeAsh(color: number, kind: "ash" | "husk"): THREE.Group {
  const g = new THREE.Group();
  // color -1 = anonymous death: grey scrap, nothing to identify
  const hex = COLORS[color]?.hex ?? 0x8a8c94;
  if (kind === "husk") {
    // powered-down: the robot slumped on its back, eyes dark
    const r = new Robot(color);
    r.update(0.016, false);
    r.rig.rotation.x = -Math.PI / 2;
    r.rig.position.y = 0.3;
    r.root.traverse((o) => {
      // eyes and mouth go dark on a powered-down shell
      if ((o as THREE.Mesh).geometry instanceof THREE.SphereGeometry || o.name === "mouth") o.visible = false;
    });
    g.add(r.root);
    return g;
  }
  const pile = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.32, 7), toon(0x2a2626));
  pile.position.y = 0.16;
  g.add(pile);
  const rng = (n: number) => (Math.sin(n * 91.7 + color * 13.1) * 0.5 + 0.5);
  for (let i = 0; i < 7; i++) {
    const s = 0.08 + rng(i) * 0.12;
    const m = new THREE.Mesh(box(s, s * 0.6, s), toon(i % 3 === 0 ? 0x555a66 : hex));
    const a = i * 0.9 + rng(i + 3) * 2;
    const r = 0.35 + rng(i + 7) * 0.45;
    m.position.set(Math.cos(a) * r, s * 0.3, Math.sin(a) * r);
    m.rotation.set(rng(i + 1) * 3, rng(i + 2) * 3, 0);
    g.add(m);
  }
  // a lone eye, still glowing
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0xd8fbff));
  eye.scale.set(1, 1.2, 0.4);
  eye.position.set(0.1, 0.3, 0.12);
  eye.rotation.x = -0.9;
  g.add(noInk(eye));
  return g;
}
