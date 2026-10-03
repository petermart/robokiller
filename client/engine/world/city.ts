// The smoggy skyline: procedural towers with lit windows, aviation beacons, a holo-ad,
// and the shell of our own tower above and below the playable floor.

import * as THREE from "three";
import { CEILING_H, FLOOR, NESTS } from "../../../shared/world/index.ts";
import { glow, noInk, textTexture, toon } from "../toon.ts";

/** A random grid of lit/dark office windows (mostly warm, a few neon). */
export function windowTexture(seed: number, lit = 0.28): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0c0d14";
  g.fillRect(0, 0, 128, 128);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const hues = ["#ffb35c", "#ffd88a", "#ffcf6e", "#ffa04a", "#ffe2b0", "#ffd88a", "#ffb35c", "#ffcf6e", "#7fe8ff", "#ff7ad9"];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) {
      const on = rnd() < lit;
      g.fillStyle = on ? hues[Math.floor(rnd() * hues.length)]! : "#1a1c28";
      g.globalAlpha = on ? 0.6 + rnd() * 0.4 : 1;
      g.fillRect(x * 16 + 3, y * 8 + 2, 10, 5);
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** A box whose UVs repeat the window texture at a fixed metre scale. */
export function towerGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  const n = geo.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const side = Math.abs(n.getX(i)) > 0.5 ? d : w;
    const vert = Math.abs(n.getY(i)) > 0.5 ? 0 : 1;
    uv.setXY(i, (uv.getX(i) * side) / 7, vert ? (uv.getY(i) * h) / 12 : uv.getY(i));
  }
  return geo;
}

/** A dark tower material whose windows glow. */
export function towerMaterial(seed: number, lit: number, color: number, intensity: number) {
  return new THREE.MeshToonMaterial({
    color,
    emissive: 0xffffff,
    emissiveMap: windowTexture(seed, lit),
    emissiveIntensity: intensity,
    gradientMap: toon(0).gradientMap,
  });
}

/** Our own skyscraper above and below the floor — what the title camera sees. */
export function buildOwnTower(scene: THREE.Scene) {
  const mat = towerMaterial(7, 0.14, 0x1a1c26, 0.55);
  const w = FLOOR.x2 - FLOOR.x1 + 1.2, d = FLOOR.z2 - FLOOR.z1 + 1.2;
  const above = new THREE.Mesh(towerGeometry(w, 60, d), mat);
  above.position.y = CEILING_H + 0.5 + 30;
  const below = new THREE.Mesh(towerGeometry(w, 160, d), mat);
  below.position.y = -0.6 - 80;
  scene.add(above, below);
}

/** ~90 towers on a ring 70–300 m out, keeping the sniper towers' sight lines clear. */
export function buildCity(scene: THREE.Scene) {
  const mats = [1, 2, 3, 4].map((seed) => towerMaterial(seed, 0.2 + seed * 0.05, 0x161822, 0.8));
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 70 + rnd() * 230;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (NESTS.some((n) => Math.hypot(n.bx - x, n.bz - z) < 30)) continue;
    const w = 12 + rnd() * 18, d = 12 + rnd() * 18, h = 120 + rnd() * 260;
    const m = new THREE.Mesh(towerGeometry(w, h, d), mats[i % mats.length]!);
    m.position.set(x, -180 + h / 2, z);
    scene.add(m);
    if (rnd() < 0.35) {
      // red aviation beacon
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 4), glow(0xff2020));
      b.position.set(x, -180 + h + 1, z);
      scene.add(noInk(b));
    }
  }
  // giant holo-ad in the smog
  const ad = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 10),
    new THREE.MeshBasicMaterial({
      map: textTexture("ROBOKILLER", "#ff4fd8", 1024, 256, "bold 180px monospace"),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ad.position.set(-70, 25, -40);
  ad.rotation.y = 0.9;
  scene.add(noInk(ad));
}
