// Charging Bay — green; the robots' med bay for electricity.
// Walls, doors, stations and furniture are in shared/world/rooms/charging-bay.ts (the server needs
// them); this file is the room's look.

import type * as THREE from "three";
import { CHARGING_BAY } from "../../../../shared/world/rooms/charging-bay.ts";
import { buildTaskRoom } from "./task-room.ts";

export function buildChargingBay(scene: THREE.Scene) {
  buildTaskRoom(scene, CHARGING_BAY);
}
