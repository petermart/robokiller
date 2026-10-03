// Garage — amber, a hydraulic lift and crates; gears.
// Walls, doors, stations and furniture are in shared/world/rooms/garage.ts (the server needs
// them); this file is the room's look.

import type * as THREE from "three";
import type { Room } from "../../../../shared/world/index.ts";
import { buildTaskRoom } from "./task-room.ts";

export function buildGarage(scene: THREE.Object3D, room: Room) {
  buildTaskRoom(scene, room);
}
