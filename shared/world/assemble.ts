// Puts the floor together from its pieces: every room's walls, stations and furniture,
// plus the open-plan offices. Station ids follow room order, so keep ROOMS stable.

import { box, roomWalls } from "./build.ts";
import { OPEN_PLAN } from "./open-plan.ts";
import { BOARDROOM } from "./rooms/boardroom.ts";
import { CHARGING_BAY } from "./rooms/charging-bay.ts";
import { GARAGE } from "./rooms/garage.ts";
import { OIL_BAR } from "./rooms/oil-bar.ts";
import { SERVER_ROOM } from "./rooms/server-room.ts";
import type { Rect, Room, RoomDef, Station } from "./types.ts";

const DEFS: RoomDef[] = [SERVER_ROOM, CHARGING_BAY, GARAGE, OIL_BAR, BOARDROOM];

export const ROOMS: Room[] = DEFS.map(({ id, name, x1, z1, x2, z2, safe, light }) => ({
  id,
  name,
  x1,
  z1,
  x2,
  z2,
  safe,
  light,
}));

export const STATIONS: Station[] = [];
const rects: Rect[] = [...OPEN_PLAN];

for (const room of DEFS) {
  rects.push(...roomWalls(room));
  for (const s of room.stations) {
    STATIONS.push({ id: STATIONS.length, ...s });
    rects.push(box(s.x, s.z, 0.9, 0.9, 1.3, "prop", "station"));
  }
  for (const p of room.props) rects.push(box(p.x, p.z, p.w, p.d, p.h, p.kind, p.style));
}

export const RECTS: Rect[] = rects;
