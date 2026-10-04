// The Borderlands-style ink pass: thick outlines where depth or surface normal jumps,
// faded into the smog, plus the lightning flash, film grain, vignette and the sniper
// scope mask. Used by ../post.ts.

import * as THREE from "three";

export const InkShader = {
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
    fogDensity: { value: 0 },
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
    uniform float cameraNear, cameraFar, thickness, flash, time, scope, fogDensity;
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
        // ...and into thick fog, same falloff as the scene's FogExp2
        float fd = fogDensity * d;
        ink *= exp(-fd * fd);
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
