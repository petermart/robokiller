// Garage — amber, a hydraulic lift and crates; gears.
// Walls, doors, stations and furniture are in shared/world/rooms/garage.ts (the server needs
// them); this file is the room's look.

import type * as THREE from "three";
import { GARAGE } from "../../../../shared/world/rooms/garage.ts";
import { buildTaskRoom } from "./task-room.ts";

export function buildGarage(scene: THREE.Scene) {
  buildTaskRoom(scene, GARAGE);
}
