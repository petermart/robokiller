// The 3D world: lights and smog, the floor and ceiling, every prop and station from the
// shared map, the rooms, our tower and the city around it, the sniper nests, and the storm.
// Each piece lives in its own file; this one assembles them and runs their animation.

import * as THREE from "three";
import type { NeedKind } from "../../../shared/constants.ts";
import { CEILING_H, ELEVATORS, FLOOR, RECTS, STATIONS, VENTS } from "../../../shared/world/index.ts";
import { glow, noInk, toon } from "../toon.ts";
import { buildCity, buildOwnTower } from "./city.ts";
import { SniperNests } from "./nests.ts";
import { elevatorMesh, propMesh, stationMesh, ventMesh, type StationVisual } from "./props.ts";
import { Boardroom } from "./rooms/boardroom.ts";
import { buildChargingBay } from "./rooms/charging-bay.ts";
import { buildGarage } from "./rooms/garage.ts";
import { buildOilBar } from "./rooms/oil-bar.ts";
import { buildServerRoom } from "./rooms/server-room.ts";
import { Weather } from "./weather.ts";

const SMOG = 0x6a4630;

export type { StationVisual };

export class World {
  scene = new THREE.Scene();
  hemi: THREE.HemisphereLight;
  stations: StationVisual[] = [];
  vents: THREE.Group[] = [];
  /** Things the camera/raycasts treat as solid. */
  solids: THREE.Object3D[] = [];
  /** Need kinds whose stations get a floating marker (the local player's active needs). */
  highlight = new Set<NeedKind>();
  private nests: SniperNests;
  private boardroom: Boardroom;
  private weather: Weather;
  private time = 0;

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
    for (const r of RECTS) {
      const m = propMesh(r);
      if (!m) continue;
      s.add(m);
      if (r.h >= 1.4 && r.kind !== "glass") this.solids.push(m);
    }
    for (const st of STATIONS) {
      const v = stationMesh(st);
      s.add(v.group);
      this.solids.push(v.group);
      this.stations.push(v);
    }
    for (const v of VENTS) {
      const g = ventMesh(v.x, v.z);
      s.add(g);
      this.vents.push(g);
    }
    for (const e of ELEVATORS) s.add(elevatorMesh(e));

    buildServerRoom(s);
    buildChargingBay(s);
    buildGarage(s);
    buildOilBar(s);
    this.boardroom = new Boardroom(s);
    this.solids.push(...this.boardroom.solids);

    buildOwnTower(s);
    buildCity(s);
    this.nests = new SniperNests(s);
    this.weather = new Weather(s);
  }

  /** Clickable spheres around each sniper window. */
  get nestHits() {
    return this.nests.hits;
  }

  set onThunder(fn: (delay: number, power: number) => void) {
    this.weather.onThunder = fn;
  }

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

  /** Show which tower holds a sniper (-1 = none); the sniper never sees their own. */
  setSniper(nest: number, hideOwn: boolean) {
    this.nests.setSniper(nest, hideOwn);
  }

  /** Returns the lightning flash level for the post pass. */
  update(dt: number): number {
    this.time += dt;
    const flash = this.weather.update(dt);
    this.hemi.intensity = 1.2 + flash * 3;

    for (const s of this.stations) {
      const on = this.highlight.has(s.kind);
      s.marker.visible = on;
      if (on) {
        s.marker.position.y = 2.0 + Math.sin(this.time * 3) * 0.12;
        s.marker.rotation.y += dt * 2;
      }
      const gear = s.group.getObjectByName("gear");
      if (gear) gear.rotation.y += dt * 0.6;
    }
    this.boardroom.update(dt, this.time);
    this.nests.update(this.time);
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
