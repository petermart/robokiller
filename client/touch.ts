// Phone / tablet controls. Twin-stick: a floating joystick on the left half, drag-to-look
// on the right half (a quick tap there = a desktop click), and buttons that change with
// what you can do right now. Multitouch, so you can walk and look at the same time.

import type { Game } from "./game.ts";
import { unlockAudio } from "./audio/sound.ts";

const STICK_RADIUS = 56; // px of thumb travel for full speed
const DEADZONE = 0.12;
const LOOK_SCALE = 1.9; // fingers move less than mice; turn a bit faster per pixel
const TAP_MS = 260;
const TAP_PX = 12;

interface Btn {
  id: string;
  label: string;
  key?: string;
  /** Keyboard-style hold (robo talk) vs a single press. */
  hold?: boolean;
  run?: () => void;
  enabled: boolean;
  cd?: number;
  big?: boolean;
  hot?: boolean;
}

export function isTouchDevice() {
  return matchMedia("(pointer: coarse)").matches;
}

export class TouchControls {
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private lookStart = { x: 0, y: 0, t: 0 };
  private signature = "";
  private stickEl: HTMLElement;
  private knobEl: HTMLElement;
  private buttonsEl: HTMLElement;

  constructor(
    private game: Game,
    private layer: HTMLElement,
  ) {
    this.stickEl = document.getElementById("stick")!;
    this.knobEl = document.getElementById("stick-knob")!;
    this.buttonsEl = document.getElementById("touch-buttons")!;

    layer.addEventListener("pointerdown", (e) => this.down(e));
    layer.addEventListener("pointermove", (e) => this.move(e));
    layer.addEventListener("pointerup", (e) => this.up(e));
    layer.addEventListener("pointercancel", (e) => this.up(e, true));

    // Buttons: act on pointerdown (instant, and survives the button being re-rendered).
    this.buttonsEl.addEventListener("pointerdown", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("button[data-id]");
      if (!el || el.hasAttribute("disabled")) return;
      e.preventDefault();
      unlockAudio();
      const b = this.current.find((x) => x.id === el.dataset.id);
      if (!b) return;
      if (b.key) this.game.pressKey(b.key);
      b.run?.();
      if (b.hold && b.key) {
        const key = b.key;
        const release = (ev: PointerEvent) => {
          if (ev.pointerId !== e.pointerId) return;
          this.game.releaseKey(key);
          window.removeEventListener("pointerup", release);
          window.removeEventListener("pointercancel", release);
        };
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
      }
    });
  }

  // ------------------------------------------------------------------ sticks

  private down(e: PointerEvent) {
    unlockAudio();
    if (e.clientX < innerWidth * 0.45 && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.stickEl.hidden = false;
      this.knobEl.style.transform = "translate(-50%, -50%)";
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.lookStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
  }

  private move(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS) {
        dx *= STICK_RADIUS / d;
        dy *= STICK_RADIUS / d;
      }
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // rescale past the deadzone so speed ramps smoothly from 0 at its edge to 1 at full tilt
      const mag = Math.min(1, d / STICK_RADIUS);
      const k = mag < DEADZONE ? 0 : (mag - DEADZONE) / (1 - DEADZONE) / (mag || 1);
      this.game.stick = { x: (dx / STICK_RADIUS) * k, y: (-dy / STICK_RADIUS) * k };
    } else if (e.pointerId === this.lookId) {
      this.game.look(e.clientX - this.lookLast.x, e.clientY - this.lookLast.y, LOOK_SCALE);
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private up(e: PointerEvent, cancelled = false) {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.game.stick = { x: 0, y: 0 };
      this.stickEl.hidden = true;
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
      const quick = performance.now() - this.lookStart.t < TAP_MS;
      const still = Math.hypot(e.clientX - this.lookStart.x, e.clientY - this.lookStart.y) < TAP_PX;
      if (!cancelled && quick && still) this.game.tap();
    }
  }

  // ------------------------------------------------------------------ buttons

  private current: Btn[] = [];

  private buttons(): Btn[] {
    const s = this.game.touchState();
    const out: Btn[] = [];
    if (!s.active) return out;

    const talk: Btn | null = s.robo
      ? s.roboReady
        ? { id: "talk", label: s.talking ? "LISTEN…" : "HOLD TALK", key: "KeyT", hold: true, enabled: true, hot: s.talking }
        : { id: "talk", label: s.roboLabel, enabled: false }
      : s.voice
        ? { id: "mic", label: s.micOn ? "MIC ON" : "MIC OFF", key: "KeyT", enabled: true }
        : null;

    if (s.phase === "lobby") {
      out.push({ id: "panel", label: s.panelOpen ? "HIDE RULES" : "RULES", key: "Tab", enabled: true });
      if (talk) out.push(talk);
      return out;
    }
    // Overlays (meeting, pickers, results) bring their own buttons; only talking stays.
    const overlayUp = s.overlay !== "none" && s.overlay !== "reveal";
    if (overlayUp || s.phase !== "playing" || !s.alive) {
      if (talk && (s.phase !== "meeting" || s.alive)) out.push(talk);
      return out;
    }

    if (s.inNest) {
      out.push({ id: "fire", label: "FIRE", run: () => this.game.fire(), enabled: s.snipeCd <= 0, cd: s.snipeCd, big: true, hot: true });
      out.push({ id: "zoom", label: `ZOOM ${s.zoom}×`, run: () => this.game.cycleZoom(), enabled: true });
      out.push({ id: "exit", label: "EXIT", key: "KeyX", enabled: true });
    } else if (s.inVent) {
      out.push({ id: "vexit", label: "CLIMB OUT", key: "KeyV", enabled: true, big: true });
      out.push({ id: "vprev", label: "◀ VENT", key: "KeyA", enabled: true });
      out.push({ id: "vnext", label: "VENT ▶", key: "KeyD", enabled: true });
    } else {
      out.push({ id: "act", label: s.using ? "WORKING…" : (s.action ?? "USE"), key: "KeyE", enabled: !!s.action && !s.using, big: true });
      if (s.role === "impostor") {
        out.push({
          id: "kill",
          label: s.wrongOrder ? "WRONG ORDER" : "EXPLODE",
          key: "KeyQ",
          enabled: s.canKill && s.killCd <= 0,
          cd: s.killCd,
          hot: true,
        });
        out.push({ id: "disguise", label: "DISGUISE", key: "KeyF", enabled: s.disguiseCd <= 0, cd: s.disguiseCd });
        out.push({ id: "vent", label: "VENT", key: "KeyV", enabled: s.nearVent });
      }
    }
    if (talk) out.push(talk);
    return out;
  }

  /** Call every frame; only touches the DOM when the set of buttons changes. */
  update() {
    const list = this.buttons();
    this.current = list;
    const sig = list.map((b) => `${b.id}:${b.label}:${b.enabled}:${b.big}:${b.hot}`).join("|");
    if (sig !== this.signature) {
      this.signature = sig;
      this.buttonsEl.innerHTML = list
        .map(
          (b) => `<button data-id="${b.id}" class="tb ${b.big ? "big" : ""} ${b.hot ? "hot" : ""}" ${b.enabled ? "" : "disabled"}>
            <span>${b.label}</span><i class="cd"></i></button>`,
        )
        .join("");
    }
    // cooldown numbers tick without rebuilding the buttons
    for (const b of list) {
      const el = this.buttonsEl.querySelector<HTMLElement>(`button[data-id="${b.id}"] .cd`);
      if (el) el.textContent = b.cd && b.cd > 0 ? String(Math.ceil(b.cd)) : "";
    }
    // a stick or look finger lifted outside the layer (e.g. onto a button) must not stick
    this.layer.hidden = !this.game.active;
  }
}

/** Running as an installed home-screen app (no browser bars at all)? */
export function isInstalledApp() {
  return (
    matchMedia("(display-mode: fullscreen)").matches ||
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Fullscreen + landscape lock where the browser allows it (Android); iOS ignores both. */
export function goLandscape() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement) return;
  const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!req) return;
  Promise.resolve(req())
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape"))
    .catch(() => {});
}
