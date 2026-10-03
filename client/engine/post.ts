// Borderlands-style post: thick ink lines from depth + normal discontinuities, then
// bloom for the neon, then a little grain and vignette.
//
// Outlines come from a separate normal pass that only renders layer 0, so glass, rain
// and particles (layer NO_INK) never get inked.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { NO_INK } from "./toon.ts";
import { InkShader } from "./shaders/ink.ts";


export class Post {
  composer: EffectComposer;
  normalRT: THREE.WebGLRenderTarget;
  ink: ShaderPass;
  bloom: UnrealBloomPass;
  private normalMat = new THREE.MeshNormalMaterial();
  private renderPass: RenderPass;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    public camera: THREE.PerspectiveCamera,
  ) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    this.normalRT = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      depthTexture: new THREE.DepthTexture(size.x * pr, size.y * pr),
    });
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.ink = new ShaderPass(InkShader);
    this.ink.uniforms.tNormal!.value = this.normalRT.texture;
    this.ink.uniforms.tDepth!.value = this.normalRT.depthTexture;
    this.composer.addPass(this.ink);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  setCamera(cam: THREE.PerspectiveCamera) {
    this.camera = cam;
    this.renderPass.camera = cam;
  }

  setSize(w: number, h: number) {
    const pr = this.renderer.getPixelRatio();
    // the composer caches the ratio it was built with; keep it in step with quality changes
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.normalRT.setSize(w * pr, h * pr);
    this.ink.uniforms.resolution!.value.set(w * pr, h * pr);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  render(time: number, flash: number, scope: number) {
    const { renderer, scene, camera } = this;
    // normal + depth of inkable geometry only
    const mask = camera.layers.mask;
    camera.layers.set(0);
    const bg = scene.background;
    const fog = scene.fog;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.normalMat;
    renderer.setRenderTarget(this.normalRT);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg;
    scene.fog = fog;
    renderer.setRenderTarget(null);
    camera.layers.mask = mask;
    camera.layers.enable(NO_INK);

    const u = this.ink.uniforms;
    u.cameraNear!.value = camera.near;
    u.cameraFar!.value = camera.far;
    u.flash!.value = flash;
    u.time!.value = time;
    u.scope!.value = scope;
    this.composer.render();
  }
}
