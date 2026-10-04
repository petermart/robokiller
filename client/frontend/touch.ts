// Phone / tablet controls. Twin-stick: a floating joystick on the left half, drag-to-look
// on the right half (a quick tap there = a desktop click), and buttons that change with
// what you can do right now. Multitouch, so you can walk and look at the same time.

import type { Game } from "../game.ts";
import { unlockAudio } from "../audio/context.ts";

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
  /** Fingers on the view in scope/vent mode, where both halves look and two fingers pinch. */
  private fingers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number } | null = null;
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

  /** In a sniper nest or a vent you can't walk: the whole screen looks, and pinch zooms. */
  private get lookOnly() {
    const s = this.game.touchState();
    return s.inNest || s.inVent;
  }

  private pinchDist() {
    const [a, b] = [...this.fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private down(e: PointerEvent) {
    unlockAudio();
    if (this.lookOnly) {
      this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.fingers.size === 2) this.pinch = { dist: this.pinchDist() || 1, zoom: this.game.scopeZoom };
      this.lookStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
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
    const f = this.fingers.get(e.pointerId);
    if (f) {
      if (this.pinch && this.fingers.size >= 2) {
        f.x = e.clientX;
        f.y = e.clientY;
        // spread fingers = zoom in, like photos
        if (this.lookOnly) this.game.setZoom(this.pinch.zoom * (this.pinchDist() / this.pinch.dist));
      } else {
        this.game.look(e.clientX - f.x, e.clientY - f.y, LOOK_SCALE);
        f.x = e.clientX;
        f.y = e.clientY;
      }
      return;
    }
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
    if (this.fingers.delete(e.pointerId)) {
      if (this.fingers.size < 2) this.pinch = null;
      // no tap-to-shoot in the scope: only the FIRE button fires, so aiming can't misfire
      return;
    }
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
    // Pickers fill the screen with their own buttons — keep the corner clear.
    if (s.overlay === "nest" || s.overlay === "disguise") return out;

    const talk: Btn | null = s.robo
      ? s.roboReady
        ? { id: "talk", label: s.talking ? "LISTEN…" : "HOLD TALK", key: "KeyT", hold: true, enabled: true, hot: s.talking }
        : { id: "talk", label: s.roboLabel, enabled: false }
      : s.voice
        ? { id: "mic", label: s.micOn ? "MIC ON" : "MIC OFF", key: "KeyT", enabled: true }
        : null;

    const pose: Btn[] = s.canPose
      ? [
          { id: "jump", label: "JUMP", run: () => this.game.jump(), enabled: true },
          { id: "crouch", label: s.crouching ? "STAND" : "CROUCH", run: () => this.game.toggleCrouch(), enabled: true, hot: s.crouching },
        ]
      : [];
    if (s.phase === "lobby") {
      out.push({ id: "panel", label: s.panelOpen ? "HIDE RULES" : "RULES", key: "Tab", enabled: true });
      out.push(...pose);
      if (talk) out.push(talk);
      return out;
    }
    // Other overlays (meeting, results) bring their own buttons; only talking stays.
    const overlayUp = s.overlay !== "none" && s.overlay !== "reveal";
    if (overlayUp || s.phase !== "playing" || !s.alive) {
      if (talk && (s.phase !== "meeting" || s.alive)) out.push(talk);
      return out;
    }

    if (s.inNest) {
      out.push({ id: "fire", label: "FIRE", run: () => this.game.fire(), enabled: s.snipeCd <= 0, cd: s.snipeCd, big: true, hot: true });
      out.push({ id: "zoom", label: `ZOOM ${+s.zoom.toFixed(2)}×`, run: () => this.game.cycleZoom(), enabled: true });
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
      out.push(...pose);
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

/**
 * iPhone Safari is unreliable about turning a tap into a `click` (taps around scrolling,
 * buttons redrawn mid-tap…). On touch screens, fire every ordinary button on finger-up
 * instead, and swallow the late native click so nothing runs twice.
 */
export function installFastTap() {
  let down: { el: HTMLElement; x: number; y: number; id: number } | null = null;
  let synthAt = 0;
  let synthEl: HTMLElement | null = null;
  // The round game buttons act on pointerdown already; leave them (and text fields) alone.
  const target = (e: Event) =>
    (e.target as HTMLElement | null)?.closest?.<HTMLElement>("button:not(.tb), a[href]") ?? null;

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "touch") return;
      const el = target(e);
      down = el ? { el, x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    },
    true,
  );
  document.addEventListener(
    "pointerup",
    (e) => {
      if (e.pointerType !== "touch" || !down || e.pointerId !== down.id) return;
      const { el, x, y } = down;
      down = null;
      if (Math.hypot(e.clientX - x, e.clientY - y) > 14) return; // that was a swipe
      if (!el.isConnected || (el as HTMLButtonElement).disabled) return;
      synthAt = performance.now();
      synthEl = el;
      el.click(); // untrusted click → runs the button's normal handler
    },
    true,
  );
  document.addEventListener("pointercancel", () => (down = null), true);
  // the browser's own click for the same tap, if it comes, is a duplicate
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted || performance.now() - synthAt > 700) return;
      const el = target(e);
      if (el && (el === synthEl || !synthEl?.isConnected)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}

/**
 * In a browser tab (not the home-screen app): keep the page from scrolling during play, so
 * Safari's bars stay tucked away, and offer a grip to re-hide them if they come back.
 */
export function installBarGuard(isPlaying: () => boolean) {
  // Places that legitimately scroll their own content.
  const SCROLLERS = "#lobby-panel, .cards, .log, .meeting, #perf-banner, #bar-grip, input, textarea";
  document.addEventListener(
    "touchmove",
    (e) => {
      if (!isPlaying()) return;
      if ((e.target as Element | null)?.closest?.(SCROLLERS)) return;
      if (e.cancelable) e.preventDefault();
    },
    { passive: false },
  );

  const grip = document.createElement("div");
  grip.id = "bar-grip";
  grip.textContent = "⇡ swipe up here to hide the browser bars";
  grip.hidden = true;
  document.getElementById("ui")!.appendChild(grip);
  // Starting near the top gives the swipe room to scroll the page down, which is what
  // makes the browser collapse its toolbars again.
  grip.addEventListener("touchstart", () => {
    if (window.scrollY > 40) window.scrollTo(0, 0);
  });

  let tallest = window.innerHeight;
  const check = () => {
    tallest = Math.max(tallest, window.innerHeight);
    const barsShowing = window.innerHeight < tallest - 24;
    grip.hidden = !(isPlaying() && barsShowing && matchMedia("(orientation: landscape)").matches);
  };
  window.addEventListener("resize", check);
  window.visualViewport?.addEventListener("resize", check);
  setInterval(check, 1000);
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
