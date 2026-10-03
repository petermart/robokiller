import * as THREE from "three";
import { NEED_COLOR, type NeedKind } from "../../shared/constants.ts";
import {
  BUTTON,
  CEILING_H,
  ELEVATORS,
  FLOOR,
  NESTS,
  RECTS,
  ROOMS,
  STATIONS,
  TABLE,
  VENTS,
  type Rect,
} from "../../shared/map.ts";
import { Robot } from "./robot.ts";
import { glow, noInk, textTexture, toon } from "./toon.ts";

const SMOG = 0x6a4630;
const WALL = 0x8d93a6;
const FLOOR_COL = 0x3a3f52;

function windowTexture(seed: number, lit = 0.28): THREE.CanvasTexture {
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
function towerGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
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

export interface StationVisual {
  group: THREE.Group;
  marker: THREE.Mesh;
  kind: NeedKind;
}

export class World {
  scene = new THREE.Scene();
  hemi: THREE.HemisphereLight;
  stations: StationVisual[] = [];
  vents: THREE.Group[] = [];
  /** Things the camera/raycasts treat as solid. */
  solids: THREE.Object3D[] = [];
  nestHits: THREE.Mesh[] = [];
  private nestSnipers: Robot[] = [];
  private nestGlints: THREE.Mesh[] = [];
  private rain!: THREE.LineSegments;
  private rainPos!: Float32Array;
  private bolt: THREE.Line | null = null;
  private nextStrike = 4;
  private strike: { t: number; pulses: number[] } | null = null;
  private time = 0;
  button!: THREE.Mesh;
  /** Need kinds whose stations get a floating marker (the local player's active needs). */
  highlight = new Set<NeedKind>();
  onThunder: (delay: number, power: number) => void = () => {};

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color(SMOG);
    s.fog = new THREE.FogExp2(SMOG, 0.0115);

    this.hemi = new THREE.HemisphereLight(0xffc89a, 0x203048, 1.2);
    s.add(this.hemi);
    s.add(new THREE.AmbientLight(0x6a6f90, 0.55));
    const moon = new THREE.DirectionalLight(0xffb070, 0.9);
    moon.position.set(-30, 40, 20);
    s.add(moon);

    this.buildFloor();
    this.buildRects();
    this.buildRooms();
    this.buildStations();
    this.buildVents();
    this.buildBoardroom();
    this.buildElevators();
    this.buildTower();
    this.buildCity();
    this.buildNests();
    this.buildRain();
  }

  // ------------------------------------------------------------------ interior

  private buildFloor() {
    const w = FLOOR.x2 - FLOOR.x1, d = FLOOR.z2 - FLOOR.z1;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#4a5068";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#3d4258";
    g.fillRect(0, 0, 64, 2);
    g.fillRect(0, 0, 2, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 2, d / 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floorMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: toon(0).gradientMap });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.solids.push(floor);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, d + 1), toon(0x22242e));
    slab.position.y = -0.31;
    this.scene.add(slab);

    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.5, d + 1), toon(0x1c1e28));
    ceil.position.y = CEILING_H + 0.25;
    this.scene.add(ceil);
    // strip lights in the ceiling
    for (let x = FLOOR.x1 + 4; x < FLOOR.x2; x += 6) {
      for (let z = FLOOR.z1 + 3; z < FLOOR.z2; z += 5) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.3), glow(0xfff1d6));
        p.position.set(x, CEILING_H - 0.02, z);
        this.scene.add(noInk(p));
      }
    }
    // dim warm fill for the open-plan areas
    for (const [x, z] of [[-16, -10], [16, -10], [-16, 10], [16, 10], [0, -11], [0, 11], [-16, 0], [16, 0]]) {
      const l = new THREE.PointLight(0xffd2a0, 6, 14, 1.4);
      l.position.set(x!, 2.9, z!);
      this.scene.add(l);
    }
  }

  private propMesh(r: Rect): THREE.Object3D | null {
    const w = r.x2 - r.x1, d = r.z2 - r.z1, h = r.h;
    const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    switch (r.style) {
      case "wall":
        add(new THREE.BoxGeometry(w, h, d), toon(WALL), 0, h / 2);
        add(new THREE.BoxGeometry(w + 0.02, 0.18, d + 0.02), toon(0x2b2e3c), 0, 0.09);
        break;
      case "column":
        add(new THREE.BoxGeometry(w, h, d), toon(0x6e7488), 0, h / 2);
        break;
      case "glass": {
        const glass = add(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.1, depthWrite: false }),
          0,
          h / 2,
        );
        noInk(glass);
        // mullions every 2.5m
        const long = Math.max(w, d);
        const n = Math.max(1, Math.round(long / 2.5));
        for (let i = 0; i <= n; i++) {
          const o = -long / 2 + (i * long) / n;
          add(
            new THREE.BoxGeometry(w > d ? 0.12 : 0.2, h, w > d ? 0.2 : 0.12),
            toon(0x2a2c36),
            w > d ? o : 0,
            h / 2,
            w > d ? 0 : o,
          );
        }
        add(new THREE.BoxGeometry(w > d ? w : 0.3, 0.5, w > d ? 0.3 : d), toon(0x2a2c36), 0, 0.25);
        break;
      }
      case "partition":
        add(new THREE.BoxGeometry(w, h, d), toon(0x4f7d8c), 0, h / 2);
        add(new THREE.BoxGeometry(w + 0.04, 0.06, d + 0.04), toon(0x26323a), 0, h);
        break;
      case "rack": {
        add(new THREE.BoxGeometry(w, h, d), toon(0x1e2230), 0, h / 2);
        for (let i = 0; i < 9; i++) {
          const led = add(
            new THREE.BoxGeometry(w + 0.02, 0.03, 0.12),
            glow(i % 3 ? 0x34e8ff : 0x7dff6a),
            0,
            0.3 + i * 0.22,
            -d / 2 + 0.2 + ((i * 0.37) % (d - 0.4)),
          );
          noInk(led);
        }
        break;
      }
      case "vending":
        add(new THREE.BoxGeometry(w, h, d), toon(0xb3264a), 0, h / 2);
        noInk(add(new THREE.BoxGeometry(w * 0.7 + 0.02, h * 0.5, d * 0.7 + 0.02), glow(0xffd5f0), 0, h * 0.6));
        break;
      case "couch":
        add(new THREE.BoxGeometry(w, 0.42, d), toon(0x7b3a5a), 0, 0.21);
        add(new THREE.BoxGeometry(w, 0.45, 0.22), toon(0x6a2f4d), 0, 0.6, (d / 2 - 0.11) * (cz > 0 ? 1 : -1));
        break;
      case "plant":
        add(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 6), toon(0x5b4636), 0, 0.25);
        add(new THREE.IcosahedronGeometry(0.48, 0), toon(0x2f7d4a), 0, 1.05);
        add(new THREE.IcosahedronGeometry(0.32, 0), toon(0x3c9a5a), 0.08, 1.45);
        break;
      case "desk":
        add(new THREE.BoxGeometry(w, 0.06, d), toon(0x8a6a4a), 0, h);
        add(new THREE.BoxGeometry(0.06, h, d * 0.9), toon(0x3a3a46), -w / 2 + 0.05, h / 2);
        add(new THREE.BoxGeometry(0.06, h, d * 0.9), toon(0x3a3a46), w / 2 - 0.05, h / 2);
        noInk(add(new THREE.BoxGeometry(0.5, 0.32, 0.04), glow(0x7fe8ff), 0, h + 0.22));
        break;
      case "bed":
        add(new THREE.BoxGeometry(w, h, d), toon(0xd8dde8), 0, h / 2);
        add(new THREE.BoxGeometry(0.4, 0.12, d * 0.8), toon(0x9ad7c0), -w / 2 + 0.3, h + 0.06);
        break;
      case "counter":
        add(new THREE.BoxGeometry(w, h, d), toon(0x4a2a3a), 0, h / 2);
        add(new THREE.BoxGeometry(w + 0.12, 0.08, d + 0.1), toon(0xd0a060), 0, h);
        noInk(add(new THREE.BoxGeometry(w + 0.02, 0.05, d + 0.02), glow(0xff4fd8), 0, 0.2));
        break;
      case "lift":
        add(new THREE.BoxGeometry(w, 0.15, d), toon(0x555a66), 0, h);
        for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.18, h, 0.18), toon(0xffb13b), (sx * w) / 2, h / 2);
        add(new THREE.BoxGeometry(w * 0.6, 0.5, d * 0.7), toon(0x3a6ad0), 0, h + 0.33);
        break;
      case "crate":
        add(new THREE.BoxGeometry(w, h, d), toon(0x9a7040), 0, h / 2);
        add(new THREE.BoxGeometry(w + 0.02, 0.1, d + 0.02), toon(0x6a4a28), 0, h * 0.5);
        break;
      case "station":
      case "table":
      case "elevator":
        return null; // built separately
    }
    return g;
  }

  private buildRects() {
    for (const r of RECTS) {
      const m = this.propMesh(r);
      if (!m) continue;
      this.scene.add(m);
      if (r.h >= 2.6 && r.kind !== "glass") this.solids.push(m);
      else if (r.h >= 1.4 && r.kind !== "glass") this.solids.push(m);
    }
  }

  private buildRooms() {
    for (const room of ROOMS) {
      if (room.id === "board") {
        const l = new THREE.PointLight(room.light, 10, 12, 1.3);
        l.position.set(0, 2.9, 0);
        this.scene.add(l);
        continue;
      }
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
      this.scene.add(tint);
      const l = new THREE.PointLight(room.light, 14, 11, 1.2);
      l.position.set(cx, 2.8, cz);
      this.scene.add(l);
      // neon strip along the ceiling edge
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.05, 0.05), glow(room.light));
      strip.position.set(cx, CEILING_H - 0.1, room.z1 + 0.25);
      this.scene.add(noInk(strip));
      // sign on the corridor-facing side
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
      this.scene.add(noInk(sign));
      const sign2 = sign.clone();
      const faceZ = cz < 0 ? room.z2 + 0.15 : room.z1 - 0.15;
      sign2.position.set(cx, 2.75, faceZ);
      sign2.rotation.y = cz < 0 ? 0 : Math.PI;
      this.scene.add(sign2);
    }
  }

  private buildStations() {
    for (const st of STATIONS) {
      const g = new THREE.Group();
      g.position.set(st.x, 0, st.z);
      g.rotation.y = st.face;
      const col = new THREE.Color(NEED_COLOR[st.kind]).getHex();
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        g.add(m);
        return m;
      };
      switch (st.kind) {
        case "power":
          add(new THREE.BoxGeometry(0.8, 1.3, 0.6), toon(0x2c2f3a), 0, 0.65, 0);
          noInk(add(new THREE.BoxGeometry(0.12, 0.9, 0.02), glow(col), 0, 0.7, 0.31));
          add(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), toon(0x111111), 0.3, 0.5, 0.35).rotation.x = 1.2;
          break;
        case "oil":
          add(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 8), toon(0xb0582a), 0, 0.55, 0);
          add(new THREE.BoxGeometry(0.12, 0.12, 0.4), toon(0x30323c), 0, 0.85, 0.35);
          noInk(add(new THREE.BoxGeometry(0.5, 0.06, 0.02), glow(col), 0, 1.0, 0.4));
          break;
        case "software":
          add(new THREE.BoxGeometry(0.8, 0.9, 0.5), toon(0x20242e), 0, 0.45, 0);
          add(new THREE.BoxGeometry(0.75, 0.5, 0.06), toon(0x14161e), 0, 1.15, 0.05).rotation.x = -0.2;
          noInk(add(new THREE.PlaneGeometry(0.65, 0.4), glow(col), 0, 1.15, 0.09)).rotation.x = -0.2;
          break;
        case "gears": {
          add(new THREE.BoxGeometry(0.9, 0.8, 0.6), toon(0x4a3c5a), 0, 0.4, 0);
          const gear = add(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 8), toon(col), 0, 0.92, 0.05);
          gear.name = "gear";
          add(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 6), toon(0xd0d4e0), 0.3, 0.86, 0.1);
          break;
        }
      }
      // floating need marker, shown when you have that need
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glow(col));
      marker.position.y = 2.0;
      marker.visible = false;
      g.add(noInk(marker));
      this.scene.add(g);
      this.solids.push(g);
      this.stations.push({ group: g, marker, kind: st.kind });
    }
  }

  private buildVents() {
    for (const v of VENTS) {
      const g = new THREE.Group();
      g.position.set(v.x, 0.01, v.z);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), toon(0x30333e));
      frame.position.y = 0.025;
      g.add(frame);
      const hatch = new THREE.Group();
      hatch.position.set(0, 0.06, -0.38);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.03, 0.76), toon(0x6c7183));
      plate.position.z = 0.38;
      hatch.add(plate);
      for (let i = 0; i < 4; i++) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.032, 0.06), toon(0x14161e));
        slot.position.set(0, 0.002, 0.12 + i * 0.16);
        hatch.add(slot);
      }
      hatch.name = "hatch";
      g.add(hatch);
      this.scene.add(g);
      this.vents.push(g);
    }
  }

  private buildBoardroom() {
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 0.1, TABLE.d), toon(0x3a2a24));
    top.position.set(TABLE.x, 0.78, TABLE.z);
    this.scene.add(top);
    const base = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w * 0.7, 0.7, TABLE.d * 0.5), toon(0x24242c));
    base.position.set(TABLE.x, 0.38, TABLE.z);
    this.scene.add(base);
    this.solids.push(top, base);
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 12), toon(0x2a2c34));
    dome.position.set(BUTTON.x, 0.89, BUTTON.z);
    this.scene.add(dome);
    this.button = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glow(0xff2a3a));
    this.button.position.set(BUTTON.x, 0.94, BUTTON.z);
    this.scene.add(this.button);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 0.75),
      new THREE.MeshBasicMaterial({
        map: textTexture("EMERGENCY", "#ff3a4a"),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    sign.position.set(0, 2.9, 0);
    this.scene.add(noInk(sign));
    this.boardSign = sign;
  }
  private boardSign!: THREE.Mesh;

  private buildElevators() {
    for (const e of ELEVATORS) {
      const g = new THREE.Group();
      g.position.set(e.x < 0 ? FLOOR.x1 + 0.12 : FLOOR.x2 - 0.12, 0, e.z);
      g.rotation.y = e.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.0, CEILING_H, 0.1), toon(0x2a2c36));
      frame.position.y = CEILING_H / 2;
      g.add(frame);
      for (const sx of [-0.62, 0.62]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.5, 0.08), toon(0xa8b0c0));
        door.position.set(sx, 1.25, 0.06);
        g.add(door);
      }
      const ind = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.04), glow(0xff5a3a));
      ind.position.set(0, 2.75, 0.08);
      g.add(noInk(ind));
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.65),
        new THREE.MeshBasicMaterial({ map: textTexture("ELEVATOR", "#ff8a3d"), transparent: true, depthWrite: false }),
      );
      sign.position.set(0, 3.08, 0.1);
      g.add(noInk(sign));
      this.scene.add(g);
    }
  }

  // ------------------------------------------------------------------ exterior

  private buildTower() {
    const tex = windowTexture(7, 0.14);
    const mat = new THREE.MeshToonMaterial({
      color: 0x1a1c26,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.55,
      gradientMap: toon(0).gradientMap,
    });
    const w = FLOOR.x2 - FLOOR.x1 + 1.2, d = FLOOR.z2 - FLOOR.z1 + 1.2;
    const above = new THREE.Mesh(towerGeometry(w, 60, d), mat);
    above.position.y = CEILING_H + 0.5 + 30;
    const below = new THREE.Mesh(towerGeometry(w, 160, d), mat);
    below.position.y = -0.6 - 80;
    this.scene.add(above, below);
  }

  private buildCity() {
    const mats = [1, 2, 3, 4].map(
      (seed) =>
        new THREE.MeshToonMaterial({
          color: 0x161822,
          emissive: 0xffffff,
          emissiveMap: windowTexture(seed, 0.2 + seed * 0.05),
          emissiveIntensity: 0.8,
          gradientMap: toon(0).gradientMap,
        }),
    );
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 70 + rnd() * 230;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // keep the sniper towers' sight lines clear
      if (NESTS.some((n) => Math.hypot(n.bx - x, n.bz - z) < 30)) continue;
      const w = 12 + rnd() * 18, d = 12 + rnd() * 18, h = 120 + rnd() * 260;
      const m = new THREE.Mesh(towerGeometry(w, h, d), mats[i % mats.length]!);
      m.position.set(x, -180 + h / 2, z);
      this.scene.add(m);
      if (rnd() < 0.35) {
        // red aviation beacon
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 4), glow(0xff2020));
        b.position.set(x, -180 + h + 1, z);
        this.scene.add(noInk(b));
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
    this.scene.add(noInk(ad));
  }

  private buildNests() {
    for (const n of NESTS) {
      const tex = windowTexture(20 + n.id, 0.18);
      const mat = new THREE.MeshToonMaterial({
        color: 0x14161e,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.7,
        gradientMap: toon(0).gradientMap,
      });
      const h = n.bh + 180;
      const tower = new THREE.Mesh(towerGeometry(n.bw, h, n.bd), mat);
      tower.position.set(n.bx, -180 + h / 2, n.bz);
      this.scene.add(tower);

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
      this.scene.add(noInk(recess));
      const lamp = new THREE.PointLight(0xffa860, 6, 6, 1.5);
      lamp.position.set(n.x - toFloor.x * 1.0, 2.2, n.z - toFloor.z * 1.0);
      this.scene.add(lamp);

      // silhouette — only visible while a sniper is in this nest
      const r = new Robot(6);
      r.snap(n.x - toFloor.x * 0.6, n.z - toFloor.z * 0.6, Math.atan2(toFloor.x, toFloor.z));
      r.root.position.y = 0.1;
      r.root.visible = false;
      r.update(0.016, false);
      this.scene.add(r.root);
      this.nestSnipers.push(r);

      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow(0xff3020));
      glint.position.set(n.x + toFloor.x * 0.3, n.y, n.z + toFloor.z * 0.3);
      glint.visible = false;
      this.scene.add(noInk(glint));
      this.nestGlints.push(glint);

      // generous click target so "looking closely" is about noticing, not pixel-hunting
      const hit = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(n.x, 1.2, n.z);
      hit.userData.nest = n.id;
      this.scene.add(hit);
      this.nestHits.push(hit);
    }
  }

  setSniper(nest: number, hideOwn: boolean) {
    this.nestSnipers.forEach((r, i) => (r.root.visible = i === nest && !hideOwn));
    this.nestGlints.forEach((g, i) => (g.visible = i === nest && !hideOwn));
  }

  private buildRain() {
    const N = 2600;
    this.rainPos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) this.respawnDrop(i, Math.random() * 60 - 30);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0xb8c8e0, transparent: true, opacity: 0.35 }),
    );
    this.rain.frustumCulled = false;
    this.scene.add(noInk(this.rain));
  }

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

  /** Returns the lightning flash level for the post pass. */
  update(dt: number): number {
    const highlight = this.highlight;
    this.time += dt;
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
    this.hemi.intensity = 1.2 + flash * 3;

    for (const s of this.stations) {
      const on = highlight.has(s.kind);
      s.marker.visible = on;
      if (on) {
        s.marker.position.y = 2.0 + Math.sin(this.time * 3) * 0.12;
        s.marker.rotation.y += dt * 2;
      }
      const gear = s.group.getObjectByName("gear");
      if (gear) gear.rotation.y += dt * 0.6;
    }
    (this.button.material as THREE.MeshBasicMaterial).color.setHSL(0, 1, 0.45 + Math.sin(this.time * 4) * 0.1);
    this.boardSign.rotation.y += dt * 0.4;
    for (const g of this.nestGlints) {
      if (g.visible) g.scale.setScalar(Math.sin(this.time * 9) > 0.6 ? 1.6 : 0.7);
    }
    for (const v of this.vents) {
      const h = v.getObjectByName("hatch")!;
      h.rotation.x += (0 - h.rotation.x) * Math.min(1, dt * 4);
    }
    return flash;
  }

  popVent(i: number) {
    const h = this.vents[i]?.getObjectByName("hatch");
    if (h) h.rotation.x = -1.6;
  }
}
