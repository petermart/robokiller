import * as THREE from "three";
import { NEED_COLOR, type NeedKind } from "../../../shared/constants.ts";
import type { Station } from "../../../shared/world/index.ts";
import { glow, noInk, toon } from "../toon.ts";

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
