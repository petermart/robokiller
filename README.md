# Robokiller

*Vote to eliminate the mal-aligned super AI before it terminates you!*

Live multiplayer social deduction in a single storm-lashed skyscraper floor — Among Us ×
The Ship × SpyParty, with cel-shaded low-poly robots. Three.js on the client, Bun on the
server, one authoritative WebSocket game loop per lobby.

## Run it

```bash
bun install
bun run dev        # http://localhost:3000  (PORT=… to change)
```

Open several tabs to play against yourself — each tab is its own player, and a reload keeps
your seat. (Background tabs pause rendering, so drive one tab at a time.)

## Controls

| Key | Crew | Impostor (mal-aligned AI) |
|---|---|---|
| WASD / mouse | move / look (click the view to capture the mouse) | same |
| E | refill a need at a station · report wreckage · emergency button | + take an elevator to a sniper nest |
| Click | report a sniper you spot in a distant window | shoot (in a nest) |
| Q | — | explode a robot in reach |
| F | — | steal any robot's colour (alive or dead) — permanent until you swap |
| V / A / D | — | enter vent · crawl to next vent · climb out |
| X | — | leave the sniper nest |
| T | mic on/off · or **hold to talk** when robo speech is on | same |
| M | music on/off | same |
| Tab | hide/show the lobby panel | same |

### On a phone

Turn it sideways (portrait shows a rotate prompt; Android also goes fullscreen and locks
landscape on the first tap). Multitouch twin-stick:

- **Left thumb** — floating joystick wherever you touch the left side; analog speed.
- **Right thumb** — drag to look; a quick **tap** = a desktop click (spot a sniper at the crosshair).
- **Buttons** follow what you can do: USE/REPORT, EXPLODE/DISGUISE/VENT for the AI,
  ◀ ▶ CLIMB OUT in vents, FIRE/ZOOM/EXIT in a nest, MIC or HOLD TALK, and RULES in the lobby.

## How it plays

- **Needs.** Every robot has four bars — Electricity, Fluid/Oil, Software Update, Gears. Every
  `needIntervalMin…Max` seconds (default 60–120, ~90 avg) one bar starts draining; reach a
  matching station before it empties or you power down. Fulfilling takes `taskDuration` (5s).
  Each need has three stations across the four task rooms. The impostor gets fake needs to
  blend in.
- **Task rooms are sniper-safe.** Their doors face inner corridors and the server rejects any
  shot into them. Everywhere else is fair game from the three distant towers.
- **Sniper.** One round per `sniperCooldown` (60s). While a sniper is in a nest, a dark
  silhouette and a blinking red glint show in that tower's lit window — click it to call a
  meeting.
- **Meetings.** Boardroom button (limited uses), reporting ashes, or reporting the sniper.
  Discussion, then voting; ties and skips eject nobody.
- **Win.** Crew wins by ejecting the AI. The AI wins when crew alive ≤ 1 (or 0 in a
  2-player test game).

## Admin twists (lobby settings, all off by default)

- **Assigned kills** — the AI gets a secret, random kill order and sees *"your target, Name
  Colour"*. The server decides who explodes: if the target is in reach it always dies, even
  with another robot closer, so crowding can't be exploited. Killing anyone else — explosion
  or sniper — ends the game for the crew. Targets that die another way are skipped.
- **Anonymous deaths** — explosions and ashes are grey and reports just say "wreckage".
- **Disguise into next round** — disguises survive meetings, and the voting roster, chat,
  "called by" and ejections all use the identity each robot is *showing*. Red dressed as Pink
  who kills Pink appears in the vote as Pink, with Red gone. Off: disguises drop at meetings.

`bun run test` runs headless checks of these rules against the real lobby code.

## Voice

- **Proximity voice** (default): WebRTC mesh, signalled over the game socket. Volume falls off
  over `voiceRange` and drops behind walls; stereo-panned by direction. The dead hear
  everyone; the living never hear the dead. Meetings are global.
- **Robo speech** (host toggle): mic → text with the browser's Web Speech API (same approach
  as the video-analyzer extension) → everyone nearby hears it in a **robot voice**: eSpeak
  (via meSpeak, GPL) synthesizes it in a Web Worker on each listener's device, then a ring
  modulator, metallic comb, bit-crush and tin-can filter make it a proper sci-fi robot. It runs
  through the same proximity mix as voice chat (fades, pans, muffles behind walls). Pitch and
  warble come from the speaker's **displayed** colour. The lobby has a voice preview button. No raw audio leaves anyone's machine, so a disguised
  impostor is indistinguishable from the robot they copied.
  - Speech-to-text uses the browser's built-in engine where there is one (Chrome, Edge, Safari).
  - Otherwise (Firefox, Brave, …) it falls back to an **on-device model** — Moonshine-tiny via
    transformers.js, ~28 MB, downloaded once in the background and cached. The game plays
    normally meanwhile; only push-to-talk waits, showing `VOICE 43%`. No audio leaves the device
    and there's no API cost.
- STUN only by default. For friends behind strict NATs, set `TURN_URL`, `TURN_USERNAME`,
  `TURN_CREDENTIAL` on the server.

## Deploy (Railway)

```bash
railway init        # once, creates the project
railway up --detach
```

The Dockerfile runs `bun server/index.ts` with `NODE_ENV=production`; Railway's `PORT` is
honoured and WebSockets work out of the box. Share `https://<app>/?code=ABCD` with friends.

## Layout

```
shared/                     read by both server and browser
  constants.ts  protocol.ts
  world/                    the floor as 2D data (collision, line of sight, ranges)
    rooms/                  one file per room: walls/doors, stations, furniture
    open-plan.ts            glass perimeter, elevators, cubicles, columns, lounges
    places.ts               vents, elevators, sniper towers, spawn ring
    assemble.ts  geometry.ts  build.ts  types.ts  index.ts
server/                     Bun.serve + one authoritative 20 Hz loop per lobby
client/
  frontend/                 index.html  main.ts  style.css  net.ts  perf.ts  touch.ts
  game.ts                   input, camera, HUD, meetings, voice mix
  audio/
    robovoice/              worker.ts (eSpeak)  effects.ts (robot chain)  index.ts (playback)
    background/             music.ts (8-bit loop)  ambience.ts (rain, thunder)
    sfx/                    sfx.ts
    context.ts  voice.ts  robospeech.ts  localstt.ts  levels.ts (talking mouths)
  engine/                   Three.js rendering
    shaders/                ink.ts (the Borderlands outline pass)
    fx/                     explode.ts  tracer.ts  sparkle.ts  (+ index.ts manager)
    meshes/                 robot.ts  ash.ts  station.ts  vent.ts  elevator.ts
    world/                  index.ts  city.ts  nests.ts  props.ts  weather.ts
      rooms/                one file per room's look (+ task-room.ts shared shell)
    post.ts  toon.ts  title.ts
scripts/                    tests, icon generator, map snapshot
public/                     home-screen manifest + icons
```

`bun scripts/map-snapshot.ts` prints the whole server-side map as JSON — diff it before and
after editing `shared/world/` to be sure geometry changed only where you meant it to.

## TODO

### Per-player languages for robo speech

Let each player pick the language they speak; recognise it, tag the line with it, and have
listeners speak it in that language's robot voice. The pieces all exist:

- [ ] **Robot voice (TTS):** meSpeak already ships ~26 eSpeak voices in
      `node_modules/mespeak/voices/` (es, fr, de, it, pt, pt-pt, nl, pl, sv, fi, hu, ro, sk,
      cs, ca, el, tr, lv, eo, la, kn, zh, zh-yue, es-la, plus English variants). Each is a
      small JSON file — serve them like `/robovoice-worker.js` and `loadVoice` one on demand
      in `client/audio/robovoice/worker.ts` the first time a line in that language arrives.
- [ ] **Speech recognition, browser engine:** the Web Speech API already handles dozens of
      languages — set `lang` in `client/audio/robospeech.ts` from the player's choice
      (it currently uses `navigator.language`).
- [ ] **Speech recognition, on-device fallback:** Moonshine-tiny (`client/audio/localstt.ts`)
      is English-only. For other languages load a multilingual Whisper model
      (`onnx-community/whisper-tiny` ≈ 40 MB, `whisper-base` ≈ 80 MB) through the same
      transformers.js worker, passing the language to the pipeline.
- [ ] **Protocol + UI:** a language picker in the lobby (remembered per player), a
      `lang` field on the `robo` message in `shared/protocol.ts`, and the server passing it on.
- [ ] **Limit to note:** players speaking different languages hear each other's language —
      there's no translation. Translating would be a separate, larger step (a translation
      model on-device, or a paid API on the server).
