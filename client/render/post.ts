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

const InkShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 600 },
    thickness: { value: 1.4 },
    flash: { value: 0 },
    time: { value: 0 },
    scope: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float cameraNear, cameraFar, thickness, flash, time, scope;
    varying vec2 vUv;

    float lin(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      return -perspectiveDepthToViewZ(z, cameraNear, cameraFar);
    }
    vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 px = thickness / resolution;
      float d = lin(vUv);
      float raw = texture2D(tDepth, vUv).x;

      float ink = 0.0;
      if (raw < 0.9999) {
        float d1 = lin(vUv + vec2(px.x, 0.0));
        float d2 = lin(vUv - vec2(px.x, 0.0));
        float d3 = lin(vUv + vec2(0.0, px.y));
        float d4 = lin(vUv - vec2(0.0, px.y));
        // Second-order difference ignores smooth slopes (floors at grazing angles).
        float dd = abs(d1 + d2 - 2.0 * d) + abs(d3 + d4 - 2.0 * d);
        float depthEdge = smoothstep(0.04, 0.12, dd / max(d, 0.5));

        vec3 n = nrm(vUv);
        float nd = 0.0;
        nd += 1.0 - dot(n, nrm(vUv + vec2(px.x, 0.0)));
        nd += 1.0 - dot(n, nrm(vUv - vec2(px.x, 0.0)));
        nd += 1.0 - dot(n, nrm(vUv + vec2(0.0, px.y)));
        nd += 1.0 - dot(n, nrm(vUv - vec2(0.0, px.y)));
        float normalEdge = smoothstep(0.35, 0.8, nd);

        ink = max(depthEdge, normalEdge);
        // Lines thin out into the smog so the far city stays painterly.
        ink *= 1.0 - smoothstep(30.0, 140.0, d);
      }
      col.rgb = mix(col.rgb, vec3(0.02, 0.015, 0.03), ink * 0.92);

      // lightning
      col.rgb += flash * vec3(0.55, 0.62, 0.8) * (0.35 + 0.65 * col.rgb);

      // grain + vignette
      float g = hash(vUv * resolution + fract(time) * 100.0) - 0.5;
      col.rgb += g * 0.035;
      vec2 c = vUv - 0.5;
      float vig = smoothstep(0.85, 0.25, length(c * vec2(resolution.x / resolution.y, 1.0)));
      col.rgb *= mix(0.55, 1.0, vig);

      // sniper scope: black outside a circle
      if (scope > 0.0) {
        vec2 s = c * vec2(resolution.x / resolution.y, 1.0);
        float r = length(s);
        col.rgb *= 1.0 - smoothstep(0.40, 0.415, r) * scope;
        float cross = (step(abs(s.x), 0.0015) + step(abs(s.y), 0.0015)) * step(r, 0.4) * step(0.02, r);
        col.rgb = mix(col.rgb, vec3(1.0, 0.15, 0.1), clamp(cross, 0.0, 1.0) * scope);
      }
      gl_FragColor = col;
    }
  `,
};

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
