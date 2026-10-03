// The 3D world. The sky, smog and global lights live on the scene; everything that depends
// on the map — floor, furniture, rooms, our tower, the city, the sniper towers and the
// storm — lives in one `level` group that setMap() throws away and rebuilds whenever the
// lobby's map changes. Robots and effects are added to the scene by the game and survive.

import * as THREE from "three";
import type { NeedKind } from "../../../shared/constants.ts";
import { CEILING_H, DEFAULT_MAP, type WorldMap } from "../../../shared/world/index.ts";
import { elevatorMesh } from "../meshes/elevator.ts";
import { stationMesh, type StationVisual } from "../meshes/station.ts";
import { ventMesh } from "../meshes/vent.ts";
import { glow, noInk, toon } from "../toon.ts";
import { buildCity, buildOwnTower } from "./city.ts";
import { SniperNests } from "./nests.ts";
import { propMesh } from "./props.ts";
import { Boardroom } from "./rooms/boardroom.ts";
import { buildChargingBay } from "./rooms/charging-bay.ts";
import { buildGarage } from "./rooms/garage.ts";
import { buildOilBar } from "./rooms/oil-bar.ts";
import { buildServerRoom } from "./rooms/server-room.ts";
import { buildTaskRoom } from "./rooms/task-room.ts";
import { Weather } from "./weather.ts";

const SMOG = 0x6a4630;

/** Each main room's look; corner closets (and anything new) use the shared task-room shell. */
const ROOM_LOOKS: Record<string, (scene: THREE.Object3D, room: WorldMap["rooms"][number]) => void> = {
  server: buildServerRoom,
  medbay: buildChargingBay,
  garage: buildGarage,
  bar: buildOilBar,
};

export type { StationVisual };

export class World {
  scene = new THREE.Scene();
  hemi: THREE.HemisphereLight;
  map: WorldMap = DEFAULT_MAP;
  stations: StationVisual[] = [];
  vents: THREE.Group[] = [];
  /** Things the camera/raycasts treat as solid. */
  solids: THREE.Object3D[] = [];
  /** Need kinds whose stations get a floating marker (the local player's active needs). */
  highlight = new Set<NeedKind>();
  private level = new THREE.Group();
  private nests!: SniperNests;
  private boardroom!: Boardroom;
  private weather!: Weather;
  private thunder: (delay: number, power: number) => void = () => {};
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

    this.buildLevel(DEFAULT_MAP);
  }

  /** Swap in a different map (no-op if it's the same layout). */
  setMap(map: WorldMap) {
    if (map.key === this.map.key) return;
    this.scene.remove(this.level);
    this.level.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.level = new THREE.Group();
    this.stations = [];
    this.vents = [];
    this.solids = [];
    this.buildLevel(map);
  }

  private buildLevel(map: WorldMap) {
    this.map = map;
    const L = this.level;
    this.scene.add(L);

    this.buildFloor(map);
    for (const r of map.rects) {
      const m = propMesh(r);
      if (!m) continue;
      L.add(m);
      if (r.h >= 1.4 && r.kind !== "glass") this.solids.push(m);
    }
    for (const st of map.stations) {
      const v = stationMesh(st);
      L.add(v.group);
      this.solids.push(v.group);
      this.stations.push(v);
    }
    for (const v of map.vents) {
      const g = ventMesh(v.x, v.z);
      L.add(g);
      this.vents.push(g);
    }
    for (const e of map.elevators) L.add(elevatorMesh(e, map.floor));

    for (const room of map.rooms) {
      if (room.id === "board") continue;
      (ROOM_LOOKS[room.id] ?? buildTaskRoom)(L, room);
    }
    this.boardroom = new Boardroom(L);
    this.solids.push(...this.boardroom.solids);

    buildOwnTower(L, map);
    buildCity(L, map);
    this.nests = new SniperNests(L, map.nests);
    this.weather = new Weather(L, map.floor);
    this.weather.onThunder = this.thunder;
  }

  /** Clickable spheres around each sniper window. */
  get nestHits() {
    return this.nests.hits;
  }

  set onThunder(fn: (delay: number, power: number) => void) {
    this.thunder = fn;
    this.weather.onThunder = fn;
  }

  private buildFloor(map: WorldMap) {
    const f = map.floor;
    const L = this.level;
    const w = f.x2 - f.x1, d = f.z2 - f.z1;
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
    floor.position.set((f.x1 + f.x2) / 2, 0, (f.z1 + f.z2) / 2);
    L.add(floor);
    this.solids.push(floor);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, d + 1), toon(0x22242e));
    slab.position.y = -0.31;
    L.add(slab);

    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.5, d + 1), toon(0x1c1e28));
    ceil.position.y = CEILING_H + 0.25;
    L.add(ceil);
    // strip lights in the ceiling
    for (let x = f.x1 + 4; x < f.x2; x += 6) {
      for (let z = f.z1 + 3; z < f.z2; z += 5) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.3), glow(0xfff1d6));
        p.position.set(x, CEILING_H - 0.02, z);
        L.add(noInk(p));
      }
    }
    // dim warm fill for the open-plan areas (placed as fractions of the floor)
    const sx = f.x2 / 20, sz = f.z2 / 14;
    for (const [x, z] of [[-16, -10], [16, -10], [-16, 10], [16, 10], [0, -11], [0, 11], [-16, 0], [16, 0]]) {
      const l = new THREE.PointLight(0xffd2a0, 6, 14, 1.4);
      l.position.set(x! * sx, 2.9, z! * sz);
      L.add(l);
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
