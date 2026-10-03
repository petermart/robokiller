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

## Voice

- **Proximity voice** (default): WebRTC mesh, signalled over the game socket. Volume falls off
  over `voiceRange` and drops behind walls; stereo-panned by direction. The dead hear
  everyone; the living never hear the dead. Meetings are global.
- **Robo speech** (host toggle): mic → text with the browser's Web Speech API (same approach
  as the video-analyzer extension) → everyone nearby hears a shared robot TTS voice pitched by
  the speaker's **displayed** colour. No raw audio leaves anyone's machine, so a disguised
  impostor is indistinguishable from the robot they copied. Needs Chrome or Edge.
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
shared/   constants, the 2D map (collision, line-of-sight), wire protocol
server/   Bun.serve + per-lobby authoritative game loop (20 Hz)
client/   Three.js renderer (toon + ink post), robots, world, audio, UI
```
