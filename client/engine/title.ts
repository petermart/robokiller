import * as THREE from "three";
import { toonRamp } from "./toon.ts";

// 5×7 glyphs, rows top to bottom.
const FONT: Record<string, string[]> = {
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
};

interface Voxel {
  x: number;
  y: number;
  z: number;
  letter: number;
  col: number;
}

export class VoxelTitle {
  group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private voxels: Voxel[] = [];
  private dummy = new THREE.Object3D();
  private t = 0;
  private glitch = { letter: -1, until: 0, next: 2 };

  constructor(text = "ROBOKILLER", size = 0.5) {
    const letters = text.split("");
    const width = letters.length * 6 - 1;
    letters.forEach((ch, li) => {
      const glyph = FONT[ch];
      if (!glyph) return;
      glyph.forEach((row, ry) => {
        [...row].forEach((bit, cx) => {
          if (bit !== "1") return;
          const col = li * 6 + cx;
          for (let z = 0; z < 2; z++) {
            this.voxels.push({
              x: (col - width / 2) * size,
              y: (6 - ry) * size,
              z: -z * size,
              letter: li,
              col,
            });
          }
        });
      });
    });

    const geo = new THREE.BoxGeometry(size * 0.94, size * 0.94, size * 0.94);
    const mat = new THREE.MeshToonMaterial({ gradientMap: toonRamp(), emissive: 0x3a2a2a });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.voxels.length);
    const c = new THREE.Color();
    this.voxels.forEach((v, i) => {
      // ROBO in chrome-cyan, KILLER in hot red → orange, front layer brighter
      const t = v.col / width;
      if (v.letter < 4) c.setHSL(0.53, 0.9, v.z < 0 ? 0.45 : 0.82);
      else c.setHSL(Math.max(0, (t - 0.4) * 0.14), 1, v.z < 0 ? 0.38 : 0.6);
      this.mesh.setColorAt(i, c);
    });
    this.group.add(this.mesh);
    this.update(0);
  }

  update(dt: number) {
    this.t += dt;
    const g = this.glitch;
    if (this.t > g.next) {
      g.letter = Math.floor(Math.random() * 10);
      g.until = this.t + 0.18;
      g.next = this.t + 2 + Math.random() * 4;
    }
    this.voxels.forEach((v, i) => {
      const wave = Math.sin(this.t * 2.2 - v.col * 0.25) * 0.12;
      let jx = 0, jy = 0;
      if (v.letter === g.letter && this.t < g.until) {
        jx = (Math.random() - 0.5) * 0.25;
        jy = (Math.random() - 0.5) * 0.25;
      }
      this.dummy.position.set(v.x + jx, v.y + wave + jy, v.z);
      const spin = Math.sin(this.t * 1.5 + v.col * 0.4) * 0.12;
      this.dummy.rotation.set(spin, 0, spin * 0.5);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.group.rotation.y = Math.sin(this.t * 0.4) * 0.08;
  }
}
