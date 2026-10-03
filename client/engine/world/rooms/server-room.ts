// Server Room — cyan, racks blinking; software updates.
// Walls, doors, stations and furniture are in shared/world/rooms/server-room.ts (the server needs
// them); this file is the room's look.

import type * as THREE from "three";
import type { Room } from "../../../../shared/world/index.ts";
import { buildTaskRoom } from "./task-room.ts";

export function buildServerRoom(scene: THREE.Object3D, room: Room) {
  buildTaskRoom(scene, room);
}
