// Oil Bar — magenta, a bar counter and a vending machine; fluid / oil.
// Walls, doors, stations and furniture are in shared/world/rooms/oil-bar.ts (the server needs
// them); this file is the room's look.

import type * as THREE from "three";
import { OIL_BAR } from "../../../../shared/world/rooms/oil-bar.ts";
import { buildTaskRoom } from "./task-room.ts";

export function buildOilBar(scene: THREE.Scene) {
  buildTaskRoom(scene, OIL_BAR);
}
