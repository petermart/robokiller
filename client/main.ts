import * as THREE from "three";
import { Voice } from "./audio/voice.ts";
import { musicOn, setMusic, thunder, unlockAudio, audio } from "./audio/sound.ts";
import { Game } from "./game.ts";
import { Net, sessionToken } from "./net.ts";
import { Post } from "./render/post.ts";
import { VoxelTitle } from "./render/title.ts";
import { NO_INK } from "./render/toon.ts";
import { World } from "./render/world.ts";
import { PerfWatch } from "./perf.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ renderer

const canvas = $<HTMLCanvasElement>("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
// pixel ratio is set by PerfWatch (it owns the low-quality toggle)
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
camera.layers.enable(NO_INK);

const world = new World();
world.onThunder = (delay, power) => {
  if (audioReady) thunder(delay, power);
};
const post = new Post(renderer, world.scene, camera);

const perf = new PerfWatch(renderer, post);
const title = new VoxelTitle();
title.group.position.set(0, 6.2, 24);
world.scene.add(title.group);

window.addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------------ net + game

const net = new Net();
const voice = new Voice(net);
const game = new Game(world, camera, canvas, net, voice);
net.onMessage = (m) => {
  if (m.t === "error" && !game.active) {
    // a remembered seat in a lobby that no longer exists: forget it quietly
    net.rejoin = null;
    try {
      sessionStorage.removeItem("rk.code");
    } catch {}
    $("title-error").textContent = m.text;
    return;
  }
  if (m.t === "error" && m.text.startsWith("No lobby")) {
    // the server restarted under us — back to the title
    try {
      sessionStorage.removeItem("rk.code");
    } catch {}
    location.href = "/";
    return;
  }
  if (m.t === "lobby" && !game.active) enterGame(m.code);
  game.onMessage(m);
};
net.onStatus = (up) => $("net-status").classList.toggle("down", !up);

let audioReady = false;
window.addEventListener(
  "pointerdown",
  () => {
    unlockAudio();
    audio();
    audioReady = true;
  },
  { once: true },
);
window.addEventListener("keydown", () => {
  unlockAudio();
  audioReady = true;
}, { once: true });

// ------------------------------------------------------------------ title screen

const nameInput = $<HTMLInputElement>("name");
const codeInput = $<HTMLInputElement>("code");
try {
  // Per-tab name first, so several local tabs keep distinct names across reloads.
  nameInput.value = sessionStorage.getItem("rk.name") ?? localStorage.getItem("rk.name") ?? "";
} catch {}
const params = new URLSearchParams(location.search);
if (params.get("code")) codeInput.value = params.get("code")!.toUpperCase();

function playerName() {
  const n = nameInput.value.trim().slice(0, 16);
  try {
    localStorage.setItem("rk.name", n);
    sessionStorage.setItem("rk.name", n);
  } catch {}
  return n;
}

$("create").addEventListener("click", () => {
  const msg = { t: "create" as const, name: playerName(), token: sessionToken() };
  net.send(msg);
});
const join = () => {
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 4) {
    $("title-error").textContent = "Codes are 4 letters.";
    return;
  }
  const msg = { t: "join" as const, code, name: playerName(), token: sessionToken() };
  net.rejoin = msg;
  net.send(msg);
};
$("join").addEventListener("click", join);
codeInput.addEventListener("keydown", (e) => e.key === "Enter" && join());

// A reload mid-game drops you straight back into your seat.
const remembered = (() => {
  try {
    return sessionStorage.getItem("rk.code");
  } catch {
    return null;
  }
})();
if (remembered && (!params.get("code") || params.get("code")!.toUpperCase() === remembered)) {
  const msg = { t: "join" as const, code: remembered, name: playerName(), token: sessionToken() };
  net.rejoin = msg;
  net.send(msg);
}

function enterGame(code: string) {
  $("title-screen").hidden = true;
  $("leave-btn").hidden = false;
  title.group.visible = false;
  try {
    sessionStorage.setItem("rk.code", code);
  } catch {}
  history.replaceState(null, "", `/?code=${code}`);
  net.rejoin = { t: "join", code, name: playerName(), token: sessionToken() };
}

$("music-btn").addEventListener("click", () => {
  unlockAudio();
  setMusic(!musicOn);
  game.renderCorner();
});
$("mic-btn").addEventListener("click", () => void game.toggleMic());
const leave = () => {
  net.rejoin = null;
  net.send({ t: "leave" });
  try {
    sessionStorage.removeItem("rk.code");
  } catch {}
  // give the message a moment to flush before the page goes away
  setTimeout(() => (location.href = "/"), 150);
};
$("leave-btn").addEventListener("click", () => {
  if (game.snap?.phase === "lobby" || game.snap?.phase === "over" || confirm("Leave the game in progress?")) leave();
});
$("leave-lobby").addEventListener("click", leave);
game.renderCorner();

// ------------------------------------------------------------------ loop

const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  const flash = world.update(dt);
  if (game.active) {
    game.update(dt);
  } else {
    title.update(dt);
    // slow drift in front of the tower, rain between us and the glass
    camera.fov = 55;
    // back off on narrow screens so the whole word fits
    const back = 22 + Math.max(0, 1.9 - camera.aspect) * 14;
    camera.position.set(Math.sin(t * 0.15) * 3, 4.6 + Math.sin(t * 0.23) * 0.3, 24 + back);
    camera.lookAt(0, 3.2, 14);
    camera.updateProjectionMatrix();
  }
  post.render(t, flash, game.scope);
  perf.tick(dt);
  requestAnimationFrame(frame);
}
frame();

// for debugging from the console
(window as any).rk = { game, world, camera, renderer, perf };
