// Oil Bar — magenta, a bar counter and a vending machine; fluid / oil.
// Walls, doors, stations and furniture are in shared/world/rooms/oil-bar.ts (the server needs
// them); this file is the room's look.

import type * as THREE from "three";
import type { Room } from "../../../../shared/world/index.ts";
import { buildTaskRoom } from "./task-room.ts";

export function buildOilBar(scene: THREE.Object3D, room: Room) {
  buildTaskRoom(scene, room);
}
