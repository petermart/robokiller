import * as THREE from "three";

/** Layer for things that should not get ink outlines: glass, rain, particles, sprites. */
export const NO_INK = 1;

let ramp: THREE.DataTexture | null = null;

/** Three hard bands — the cel-shaded look comes mostly from this plus the ink pass. */
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: number, emissive = 0x000000, emissiveIntensity = 1): THREE.MeshToonMaterial {
  const key = `${color}:${emissive}:${emissiveIntensity}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), emissive, emissiveIntensity });
    cache.set(key, m);
  }
  return m;
}

/** A fresh (uncached) toon material, for things whose colour changes at runtime. */
export function toonUnique(color: number, emissive = 0x000000, emissiveIntensity = 1) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), emissive, emissiveIntensity });
}

export function glow(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    fog: true,
  });
}

export function noInk<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => c.layers.set(NO_INK));
  return o;
}

/** A canvas texture with text on it, for neon signs. */
export function textTexture(text: string, color: string, w = 512, h = 128, font = "bold 72px monospace") {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,0)";
  g.fillRect(0, 0, w, h);
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  g.shadowBlur = 0;
  g.fillStyle = "#fff";
  g.globalAlpha = 0.65;
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
