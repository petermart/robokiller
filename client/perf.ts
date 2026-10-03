// Spots the two reasons the game crawls — the browser rendering without the GPU, or a GPU
// that just can't keep up — and tells the player how to fix it in *their* browser.

import type * as THREE from "three";
import type { Post } from "./render/post.ts";

type BrowserId = "chrome" | "edge" | "firefox" | "safari" | "other";

const SOFTWARE = /swiftshader|swangle|basic render|llvmpipe|softpipe|software|warp/i;
const LOW_Q_KEY = "rk.lowQuality";
const DISMISS_KEY = "rk.perfDismissed";

function browser(): BrowserId {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\/|Chromium\//.test(ua)) return "chrome"; // also Brave, Arc, Opera
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

function gpuName(renderer: THREE.WebGLRenderer): string {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
}

const HELP: Record<BrowserId, { steps: string; settings?: string; link?: [string, string] }> = {
  chrome: {
    steps:
      "Settings → System → turn on <b>Use graphics acceleration when available</b> → <b>Relaunch</b>. " +
      "If it was already on, fully quit Chrome (including the tray icon) and reopen it.",
    settings: "chrome://settings/system",
    link: ["How-to (Tom's Guide)", "https://www.tomsguide.com/how-to/how-to-enable-hardware-acceleration-in-chrome"],
  },
  edge: {
    steps:
      "Settings → System and performance → turn on <b>Use graphics acceleration when available</b> → <b>Restart</b>.",
    settings: "edge://settings/system",
    link: ["How-to (iTechGuides)", "https://www.itechguides.com/how-to-enable-gpu-hardware-acceleration-in-microsoft-edge/"],
  },
  firefox: {
    steps:
      "Settings → General → Performance → untick <b>Use recommended performance settings</b> → tick " +
      "<b>Use hardware acceleration when available</b> → restart Firefox.",
    settings: "about:preferences#general",
    link: ["Mozilla: performance settings", "https://support.mozilla.org/en-US/kb/performance-settings"],
  },
  safari: {
    steps:
      "Safari always uses the GPU, so the usual culprit is <b>Low Power Mode</b>: System Settings → Battery " +
      "→ Energy Mode → Automatic or High Power.",
    link: ["Apple: power modes on your Mac", "https://support.apple.com/en-us/101613"],
  },
  other: {
    steps: "Look in your browser's settings for <b>hardware / graphics acceleration</b>, turn it on and restart.",
  },
};

export class PerfWatch {
  private frames = 0;
  private elapsed = 0;
  private warmup = 4;
  private slowWindows = 0;
  private shown = false;
  readonly software: boolean;
  readonly gpu: string;
  lowQuality: boolean;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private post: Post,
  ) {
    this.gpu = gpuName(renderer);
    this.software = SOFTWARE.test(this.gpu);
    this.lowQuality = read(LOW_Q_KEY) === "1";
    this.applyQuality();
    // No point waiting for slow frames: software rendering is always slow.
    if (this.software && read(DISMISS_KEY) !== "1") this.show();
  }

  /** Call once per rendered frame. */
  tick(dt: number) {
    if (this.shown || document.hidden) return;
    this.warmup -= dt;
    if (this.warmup > 0) return;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 5) return;
    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    this.slowWindows = fps < 22 ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= 2 && read(DISMISS_KEY) !== "1") this.show(Math.round(fps));
  }

  private applyQuality() {
    const pr = this.lowQuality ? 0.75 : Math.min(devicePixelRatio, 1.75);
    this.renderer.setPixelRatio(pr);
    this.post.bloom.enabled = !this.lowQuality;
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.post.setSize(innerWidth, innerHeight);
  }

  setLowQuality(on: boolean) {
    this.lowQuality = on;
    write(LOW_Q_KEY, on ? "1" : "0");
    this.applyQuality();
  }

  show(fps?: number) {
    this.shown = true;
    const b = browser();
    const help = HELP[b];
    const el = document.createElement("div");
    el.id = "perf-banner";
    el.className = "panel";
    el.innerHTML = `
      <div class="perf-head">
        <b>${this.software ? "Your browser is drawing without the graphics card" : `Running slowly (${fps} fps)`}</b>
        <button class="perf-x" title="Dismiss">✕</button>
      </div>
      <p>${
        this.software
          ? `It's using a software renderer (<code>${escapeHtml(this.gpu.slice(0, 80))}</code>), so 3D will crawl. Turning on graphics acceleration usually fixes it instantly.`
          : "Turning on graphics acceleration, or switching the browser to your faster GPU, usually fixes this."
      }</p>
      <p>${help.steps}</p>
      <div class="perf-actions">
        ${help.settings ? `<button class="perf-copy">Copy ${help.settings}</button>` : ""}
        ${help.link ? `<a href="${help.link[1]}" target="_blank" rel="noopener">${help.link[0]} ↗</a>` : ""}
        <button class="perf-lowq">${this.lowQuality ? "Low quality: ON" : "Try low quality mode"}</button>
      </div>
      <p class="perf-note">${
        b === "safari"
          ? ""
          : "Windows laptop with two GPUs? Settings → System → Display → Graphics → add your browser → High performance."
      }${help.settings ? " Paste the copied address into a new tab — browsers don't let pages link to settings." : ""}</p>
      <label class="perf-note"><input type="checkbox" class="perf-never"> Don't show this again</label>`;
    document.getElementById("ui")!.appendChild(el);

    el.querySelector(".perf-x")!.addEventListener("click", () => {
      if ((el.querySelector(".perf-never") as HTMLInputElement).checked) write(DISMISS_KEY, "1");
      el.remove();
    });
    el.querySelector(".perf-copy")?.addEventListener("click", (e) => {
      void navigator.clipboard.writeText(help.settings!).then(() => {
        (e.target as HTMLElement).textContent = "Copied — paste in a new tab";
      });
    });
    el.querySelector(".perf-lowq")!.addEventListener("click", (e) => {
      this.setLowQuality(!this.lowQuality);
      (e.target as HTMLElement).textContent = this.lowQuality ? "Low quality: ON" : "Try low quality mode";
    });
  }
}

function read(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
