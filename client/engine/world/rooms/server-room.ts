// Server Room — cyan, racks blinking; software updates.
// Walls, doors, stations and furniture are in shared/world/rooms/server-room.ts (the server needs
// them); this file is the room's look.

import type * as THREE from "three";
import { SERVER_ROOM } from "../../../../shared/world/rooms/server-room.ts";
import { buildTaskRoom } from "./task-room.ts";

export function buildServerRoom(scene: THREE.Scene) {
  buildTaskRoom(scene, SERVER_ROOM);
}
