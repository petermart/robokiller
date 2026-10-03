// A top-down picture of a generated map, as SVG — the lobby's map preview and the sniper
// tower picker. Towers are drawn around the building in their real directions; the picker
// lays HTML buttons over them (positions are percentages, so it scales to any screen).

import { NEED_COLOR } from "../../shared/constants.ts";
import { TABLE, type Nest, type WorldMap } from "../../shared/world/index.ts";

export interface MapViewOptions {
  /** Draw the sniper towers around the building. */
  towers?: boolean;
  /** A "you are here" dot. */
  you?: { x: number; z: number };
  /** Highlight this elevator (the one you're taking). */
  elevator?: number;
}

interface Layout {
  vx: number;
  vz: number;
  vw: number;
  vh: number;
  /** Where each tower marker sits, in SVG units. */
  towers: { nest: Nest; x: number; z: number }[];
}

/** Where things go: the floor in the middle, a ring of space round it for tower markers. */
function layout(map: WorldMap, towers: boolean): Layout {
  const f = map.floor;
  const w = f.x2 - f.x1, d = f.z2 - f.z1;
  const pad = towers ? Math.max(w, d) * 0.34 : 2;
  const vx = f.x1 - pad, vz = f.z1 - pad, vw = w + pad * 2, vh = d + pad * 2;
  const cx = (f.x1 + f.x2) / 2, cz = (f.z1 + f.z2) / 2;
  // each tower sits on the ray from the floor's centre through its real position,
  // part-way into the padding
  const ring = { x1: f.x1 - pad * 0.62, z1: f.z1 - pad * 0.62, x2: f.x2 + pad * 0.62, z2: f.z2 + pad * 0.62 };
  const placed = !towers
    ? []
    : map.nests.map((nest) => {
        const dx = nest.x - cx, dz = nest.z - cz;
        const tx = dx > 0 ? (ring.x2 - cx) / dx : dx < 0 ? (ring.x1 - cx) / dx : Infinity;
        const tz = dz > 0 ? (ring.z2 - cz) / dz : dz < 0 ? (ring.z1 - cz) / dz : Infinity;
        const t = Math.min(tx, tz);
        return { nest, x: cx + dx * t, z: cz + dz * t };
      });
  return { vx, vz, vw, vh, towers: placed };
}

export function mapSvg(map: WorldMap, o: MapViewOptions = {}): { svg: string; layout: Layout } {
  const L = layout(map, !!o.towers);
  const f = map.floor;
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  const parts: string[] = [];

  parts.push(`<rect x="${f.x1}" y="${f.z1}" width="${f.x2 - f.x1}" height="${f.z2 - f.z1}" class="mv-floor"/>`);
  for (const r of map.rooms) {
    const fill = r.id === "board" ? "#3a3040" : hex(r.light);
    parts.push(
      `<rect x="${r.x1}" y="${r.z1}" width="${r.x2 - r.x1}" height="${r.z2 - r.z1}" fill="${fill}" fill-opacity="${r.id === "board" ? 0.5 : 0.28}"/>`,
    );
  }
  for (const r of map.rects) {
    const cls = r.kind === "glass" ? "mv-glass" : r.h >= 2.6 ? "mv-wall" : r.h >= 1.4 ? "mv-cover" : "mv-low";
    parts.push(`<rect x="${r.x1}" y="${r.z1}" width="${r.x2 - r.x1}" height="${r.z2 - r.z1}" class="${cls}"/>`);
  }
  parts.push(
    `<rect x="${TABLE.x - TABLE.w / 2}" y="${TABLE.z - TABLE.d / 2}" width="${TABLE.w}" height="${TABLE.d}" class="mv-table"/>`,
  );
  for (const s of map.stations) parts.push(`<circle cx="${s.x}" cy="${s.z}" r="0.55" fill="${NEED_COLOR[s.kind]}"/>`);
  for (const v of map.vents) parts.push(`<rect x="${v.x - 0.45}" y="${v.z - 0.45}" width="0.9" height="0.9" class="mv-vent"/>`);
  for (const e of map.elevators) {
    parts.push(
      `<rect x="${e.x - 0.9}" y="${e.z - 1.6}" width="1.8" height="3.2" class="mv-elevator${e.id === o.elevator ? " on" : ""}"/>`,
    );
  }
  const cx = (f.x1 + f.x2) / 2, cz = (f.z1 + f.z2) / 2;
  for (const t of L.towers) {
    parts.push(`<line x1="${t.x}" y1="${t.z}" x2="${cx}" y2="${cz}" class="mv-sight"/>`);
    parts.push(`<rect x="${t.x - 1.6}" y="${t.z - 1.6}" width="3.2" height="3.2" class="mv-tower"/>`);
  }
  if (o.you) parts.push(`<circle cx="${o.you.x}" cy="${o.you.z}" r="0.9" class="mv-you"/>`);

  const svg = `<svg class="mapview" viewBox="${L.vx} ${L.vz} ${L.vw} ${L.vh}" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
  return { svg, layout: L };
}

/** Short label for a tower button: "North", "South-east"… */
export const towerLabel = (n: Nest) => n.name.replace(/ tower$/i, "");

/** Percent position of an SVG point within the view, for overlaying HTML buttons. */
export function toPercent(L: Layout, x: number, z: number) {
  return { left: ((x - L.vx) / L.vw) * 100, top: ((z - L.vz) / L.vh) * 100 };
}
