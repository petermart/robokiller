// Meshes for everything that stands on the floor: walls, glass, furniture (one look per
// PropStyle), need stations, vent hatches and the service elevators.

import * as THREE from "three";
import { NEED_COLOR, type NeedKind } from "../../../shared/constants.ts";
import { CEILING_H, FLOOR, type Rect, type Station } from "../../../shared/world/index.ts";
import { glow, noInk, textTexture, toon } from "../toon.ts";

const WALL = 0x8d93a6;

/** The 3D look of one collision rectangle, or null for things built elsewhere. */
export function propMesh(r: Rect): THREE.Object3D | null {
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
      return null; // built by stationMesh / the boardroom / elevatorMesh
  }
  return g;
}

export interface StationVisual {
  group: THREE.Group;
  marker: THREE.Mesh;
  kind: NeedKind;
}

/** A need station (charger, oil tap, terminal, gear bench) with a floating need marker. */
export function stationMesh(st: Station): StationVisual {
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
  return { group: g, marker, kind: st.kind };
}

/** A floor vent with a hinged hatch (named "hatch" so it can pop open). */
export function ventMesh(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0.01, z);
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
  return g;
}

/** A service elevator door in the east or west wall, with its lit ELEVATOR sign. */
export function elevatorMesh(e: { x: number; z: number }): THREE.Group {
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
  return g;
}
