import * as THREE from "three";
import { COLORS } from "../../shared/constants.ts";
import { glow, noInk, toon, toonUnique } from "./toon.ts";

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const DARK = 0x1b1c26;
const METAL = 0x6c7183;

/** A small boxy robot with big glowing eyes. Front is local +z. */
export class Robot {
  root = new THREE.Group();
  /** Everything that bobs (excludes the ground shadow). */
  rig = new THREE.Group();
  private bodyMat: THREE.MeshToonMaterial;
  private headMat: THREE.MeshToonMaterial;
  private antennaBall: THREE.Mesh;
  private antenna: THREE.Group;
  private head: THREE.Group;
  private eyes: THREE.Mesh[] = [];
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private shadow: THREE.Mesh;
  private sparks: THREE.Points;
  private t = Math.random() * 10;
  private blinkAt = 1 + Math.random() * 3;
  private walk = 0;
  color = -1;
  ghost = false;
  /** Smoothed render position. */
  pos = new THREE.Vector3();
  target = new THREE.Vector3();
  targetRy = 0;
  ry = 0;
  moving = false;
  using = false;
  /** Picking proxy for the sniper's raycast. */
  hitbox: THREE.Mesh;

  constructor(color: number, readonly id = "") {
    this.bodyMat = toonUnique(0xffffff);
    this.headMat = toonUnique(0xffffff);

    // torso
    const torso = new THREE.Mesh(box(0.72, 0.58, 0.52), this.bodyMat);
    torso.position.y = 0.72;
    this.rig.add(torso);
    const chest = new THREE.Mesh(box(0.34, 0.2, 0.04), toon(DARK));
    chest.position.set(0, 0.76, 0.27);
    this.rig.add(chest);
    const light = new THREE.Mesh(box(0.08, 0.08, 0.03), glow(0x7dffb0));
    light.position.set(0.09, 0.76, 0.295);
    this.rig.add(light);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 6), toon(METAL));
    neck.position.y = 1.06;
    this.rig.add(neck);

    // head with a face screen and two big round eyes
    this.head = new THREE.Group();
    this.head.position.y = 1.32;
    const skull = new THREE.Mesh(box(0.7, 0.5, 0.56), this.headMat);
    this.head.add(skull);
    const screen = new THREE.Mesh(box(0.56, 0.34, 0.04), toon(DARK));
    screen.position.set(0, -0.01, 0.27);
    this.head.add(screen);
    const eyeGeo = new THREE.SphereGeometry(0.075, 10, 8);
    for (const sx of [-0.13, 0.13]) {
      const eye = new THREE.Mesh(eyeGeo, glow(0xd8fbff));
      eye.scale.set(1, 1.25, 0.35);
      eye.position.set(sx, 0.01, 0.295);
      noInk(eye);
      this.head.add(eye);
      this.eyes.push(eye);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), glow(0xff7aa8, 0.55));
      blush.position.set(sx * 1.55, -0.1, 0.292);
      noInk(blush);
      this.head.add(blush);
    }
    // ear bolts
    for (const sx of [-0.37, 0.37]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 6), toon(METAL));
      bolt.rotation.z = Math.PI / 2;
      bolt.position.x = sx;
      this.head.add(bolt);
    }
    this.antenna = new THREE.Group();
    this.antenna.position.y = 0.25;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 4), toon(METAL));
    stalk.position.y = 0.13;
    this.antenna.add(stalk);
    this.antennaBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), glow(0xffffff));
    this.antennaBall.position.y = 0.28;
    this.antenna.add(this.antennaBall);
    this.head.add(this.antenna);
    this.rig.add(this.head);

    // arms pivot at the shoulder
    const mkArm = (sx: number) => {
      const g = new THREE.Group();
      g.position.set(sx * 0.44, 0.92, 0);
      const a = new THREE.Mesh(box(0.14, 0.42, 0.14), toon(METAL));
      a.position.y = -0.2;
      g.add(a);
      const hand = new THREE.Mesh(box(0.18, 0.12, 0.18), this.bodyMat);
      hand.position.y = -0.44;
      g.add(hand);
      this.rig.add(g);
      return g;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    const mkLeg = (sx: number) => {
      const g = new THREE.Group();
      g.position.set(sx * 0.18, 0.44, 0);
      const l = new THREE.Mesh(box(0.16, 0.34, 0.16), toon(METAL));
      l.position.y = -0.17;
      g.add(l);
      const foot = new THREE.Mesh(box(0.22, 0.1, 0.3), toon(DARK));
      foot.position.set(0, -0.36, 0.04);
      g.add(foot);
      this.rig.add(g);
      return g;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    noInk(this.shadow);
    this.root.add(this.shadow);

    // task sparks
    const sp = new Float32Array(24 * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.sparks = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0xffe9a0, size: 0.06, transparent: true, depthWrite: false }),
    );
    this.sparks.visible = false;
    noInk(this.sparks);
    this.root.add(this.sparks);

    this.hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.7, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.hitbox.position.y = 0.85;
    this.hitbox.userData.robotId = id;
    this.root.add(this.hitbox);

    this.root.add(this.rig);
    this.setColor(color);
  }

  setColor(c: number) {
    if (c === this.color) return;
    this.color = c;
    const hex = COLORS[c]?.hex ?? 0x8a8c94; // -1 = anonymous: grey
    this.bodyMat.color.setHex(hex);
    this.headMat.color.setHex(hex);
    (this.antennaBall.material as THREE.MeshBasicMaterial).color.setHex(hex).multiplyScalar(1.6);
  }

  setGhost(g: boolean) {
    if (g === this.ghost) return;
    this.ghost = g;
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m || o === this.hitbox) return;
      if (o === this.shadow) {
        o.visible = !g;
        return;
      }
      // Cached materials are shared between robots, so ghosts get their own copies.
      if (g && !o.userData.ghostMat) {
        o.userData.solidMat = m;
        const gm = m.clone();
        gm.transparent = true;
        gm.opacity = 0.35;
        gm.depthWrite = false;
        o.userData.ghostMat = gm;
      }
      (o as THREE.Mesh).material = g ? o.userData.ghostMat : o.userData.solidMat ?? m;
    });
    this.legL.visible = this.legR.visible = !g;
  }

  snap(x: number, z: number, ry: number) {
    this.pos.set(x, 0, z);
    this.target.set(x, 0, z);
    this.ry = this.targetRy = ry;
  }

  update(dt: number, smooth: boolean) {
    this.t += dt;
    if (smooth) {
      const k = 1 - Math.exp(-dt * 14);
      this.pos.lerp(this.target, k);
      let dr = this.targetRy - this.ry;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      this.ry += dr * Math.min(1, dt * 12);
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.ry;

    const walking = this.moving && !this.using;
    this.walk += dt * (walking ? 11 : 0);
    const sw = walking ? Math.sin(this.walk) : 0;
    const settle = 1 - Math.exp(-dt * 10);
    const lerp = (o: THREE.Object3D, v: number) => (o.rotation.x += (v - o.rotation.x) * settle);

    lerp(this.legL, sw * 0.6);
    lerp(this.legR, -sw * 0.6);
    if (this.using) {
      // working: both hands forward, pumping
      const pump = Math.sin(this.t * 14) * 0.25;
      lerp(this.armL, -1.3 + pump);
      lerp(this.armR, -1.3 - pump);
    } else {
      lerp(this.armL, -sw * 0.7);
      lerp(this.armR, sw * 0.7);
    }

    const bob = this.ghost
      ? 0.25 + Math.sin(this.t * 2) * 0.08
      : walking
        ? Math.abs(Math.sin(this.walk)) * 0.06
        : Math.sin(this.t * 2.2) * 0.015;
    this.rig.position.y = bob;
    this.head.rotation.z = Math.sin(this.t * 1.3) * (walking ? 0.03 : 0.06);
    this.head.rotation.x = this.using ? 0.25 : 0;
    this.antenna.rotation.z = Math.sin(this.t * 6) * (walking ? 0.25 : 0.08);

    // blink
    this.blinkAt -= dt;
    let eyeY = 1.25;
    if (this.blinkAt < 0) {
      eyeY = 0.12;
      if (this.blinkAt < -0.11) this.blinkAt = 2 + Math.random() * 4;
    }
    for (const e of this.eyes) e.scale.y += (eyeY - e.scale.y) * Math.min(1, dt * 30);

    this.sparks.visible = this.using;
    if (this.using) {
      const a = this.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        const ph = (this.t * 3 + i / a.count) % 1;
        const ang = i * 2.4;
        a.setXYZ(
          i,
          Math.cos(ang) * ph * 0.5,
          0.6 + ph * 0.6 - ph * ph * 0.8,
          0.6 + Math.sin(ang) * ph * 0.3,
        );
      }
      a.needsUpdate = true;
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}

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
      if ((o as THREE.Mesh).geometry instanceof THREE.SphereGeometry) o.visible = false;
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
