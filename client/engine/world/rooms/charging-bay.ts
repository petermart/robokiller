// Charging Bay — green; the robots' med bay for electricity.
// Walls, doors, stations and furniture are in shared/world/rooms/charging-bay.ts (the server needs
// them); this file is the room's look.

import type * as THREE from "three";
import type { Room } from "../../../../shared/world/index.ts";
import { buildTaskRoom } from "./task-room.ts";

export function buildChargingBay(scene: THREE.Object3D, room: Room) {
  buildTaskRoom(scene, room);
}
