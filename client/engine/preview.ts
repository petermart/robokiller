// The lobby's sniper preview: the view from one tower, with the sniper's fog, drawn into a
// small canvas in the settings panel. There's one WebGL context, so it renders into a
// corner of the main canvas, copies that out, and the main frame then paints over it.

import * as THREE from "three";
import type { World } from "./world/index.ts";

export class SniperPreview {
  private cam = new THREE.PerspectiveCamera(14, 16 / 9, 0.1, 600);
  private saved = new THREE.Vector4();
  private full = new THREE.Vector2();

  constructor(
    private renderer: THREE.WebGLRenderer,
    private world: World,
  ) {
    this.cam.layers.enableAll();
  }

  /** Draw the view from `nest` into `out`. Call before the main frame is rendered. */
  render(out: HTMLCanvasElement, nest: number) {
    const n = this.world.map.nests[nest];
    const ctx = out.getContext("2d");
    if (!n || !ctx) return;
    const r = this.renderer;
    const pr = r.getPixelRatio();
    r.getSize(this.full);
    // CSS size of the preview, capped by the main canvas
    const w = Math.min(out.clientWidth || 320, this.full.x);
    const h = Math.min(Math.round((w * 9) / 16), this.full.y);
    if (w < 8 || h < 8) return;
    const bw = Math.round(w * pr), bh = Math.round(h * pr);
    if (out.width !== bw || out.height !== bh) {
      out.width = bw;
      out.height = bh;
    }

    const cam = this.cam;
    cam.aspect = w / h;
    cam.position.set(n.x, n.y, n.z);
    cam.lookAt(0, 1.2, 0);
    cam.updateProjectionMatrix();

    const view = this.world.currentFogView;
    this.world.setFogView("sniper");
    r.getViewport(this.saved);
    r.setRenderTarget(null);
    r.setViewport(0, 0, w, h);
    r.setScissor(0, 0, w, h);
    r.setScissorTest(true);
    r.render(this.world.scene, cam);
    r.setScissorTest(false);
    r.setViewport(this.saved);
    this.world.setFogView(view);

    // viewport (0,0) is the bottom-left of the drawing buffer
    const src = r.domElement;
    ctx.drawImage(src, 0, src.height - bh, bw, bh, 0, 0, bw, bh);
  }
}
