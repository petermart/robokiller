// Proximity voice: a WebRTC mesh (fine for ≤10 players), signalled over the game socket.
// Every remote voice runs through its own gain + stereo pan, which the game loop drives
// from distance, walls, and who is alive.

import type { Net } from "../net.ts";
import { audio } from "./sound.ts";

interface Peer {
  pc: RTCPeerConnection;
  gain: GainNode;
  pan: StereoPannerNode;
  el: HTMLAudioElement | null;
  pendingIce: RTCIceCandidateInit[];
  level: AnalyserNode;
}

type Signal =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; c: RTCIceCandidateInit };

export class Voice {
  private me = "";
  private peers = new Map<string, Peer>();
  private ice: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  private micStream: MediaStream | null = null;
  micTrack: MediaStreamTrack | null = null;
  /** False while robo speech is on or voice chat is disabled: no raw audio leaves. */
  private sending = true;
  muted = false;
  micError = "";
  private micLevel: AnalyserNode | null = null;
  /** Resolves once the server's ICE list (incl. any TURN relay) has arrived. */
  private iceReady: Promise<void>;
  /** Signals are handled strictly in order, after ICE is ready, so none are dropped. */
  private chain: Promise<void> = Promise.resolve();
  private pending = new Set<string>();
  hasRelay = false;
  /** Called with a peer id when a connection gives up (usually: no TURN relay). */
  onFailed: (id: string) => void = () => {};
  /** Called whenever our outgoing mic state changes, so the server can show it. */
  onMicState: (on: boolean) => void = () => {};

  constructor(private net: Net) {
    this.iceReady = fetch("/api/ice")
      .then((r) => r.json())
      .then((list: RTCIceServer[]) => {
        this.ice = list;
        this.hasRelay = list.some((s) => [s.urls].flat().some((u) => /^turns?:/.test(u)));
      })
      .catch(() => {});
  }

  /** What our side of the link to a peer looks like, for the lobby list. */
  peerState(id: string): RTCPeerConnectionState | "none" {
    return this.peers.get(id)?.pc.connectionState ?? (this.pending.has(id) ? "connecting" : "none");
  }

  get sendingMic() {
    return !!this.outgoing();
  }

  private lastMicState: boolean | null = null;

  get micReady() {
    return !!this.micTrack;
  }

  async enableMic(): Promise<MediaStream | null> {
    if (this.micStream) return this.micStream;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.micTrack = this.micStream.getAudioTracks()[0] ?? null;
      this.micError = "";
      const c = audio();
      this.micLevel = c.createAnalyser();
      this.micLevel.fftSize = 256;
      c.createMediaStreamSource(this.micStream).connect(this.micLevel);
      this.applyTrack();
      return this.micStream;
    } catch (e) {
      this.micError = (e as Error).message || "Microphone blocked";
      return null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyTrack();
  }

  setSending(on: boolean) {
    if (on === this.sending) return;
    this.sending = on;
    this.applyTrack();
  }

  private outgoing(): MediaStreamTrack | null {
    return this.sending && !this.muted ? this.micTrack : null;
  }

  private applyTrack() {
    const on = this.sendingMic;
    if (on !== this.lastMicState) {
      this.lastMicState = on;
      this.onMicState(on);
    }
    for (const p of this.peers.values()) {
      const tr = p.pc.getTransceivers()[0];
      if (tr) void tr.sender.replaceTrack(this.outgoing()).catch(() => {});
    }
  }

  /** Keep one connection per other connected player. */
  sync(me: string, ids: string[]) {
    if (me !== this.me) {
      for (const id of [...this.peers.keys()]) this.close(id);
      this.me = me;
    }
    const want = new Set(ids.filter((id) => id !== me));
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.close(id);
    for (const id of want) {
      // The lower id makes the offer; the other side waits for it.
      if (!this.peers.has(id) && !this.pending.has(id) && this.me < id) void this.call(id);
    }
  }

  private make(id: string): Peer {
    const c = audio();
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const gain = c.createGain();
    gain.gain.value = 0;
    const pan = c.createStereoPanner();
    const level = c.createAnalyser();
    level.fftSize = 256;
    gain.connect(pan).connect(c.destination);
    const peer: Peer = { pc, gain, pan, el: null, pendingIce: [], level };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal(id, { type: "ice", c: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      // Chrome only feeds remote WebRTC audio into WebAudio if a media element also
      // holds the stream, so keep a muted one alive.
      const el = new Audio();
      el.srcObject = stream;
      el.muted = true;
      void el.play().catch(() => {});
      peer.el = el;
      const src = c.createMediaStreamSource(stream);
      src.connect(gain);
      src.connect(level);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        this.onFailed(id);
        this.close(id);
        if (this.me < id) setTimeout(() => void this.call(id), 1500);
      }
    };
    this.peers.set(id, peer);
    return peer;
  }

  private async call(id: string) {
    this.pending.add(id);
    await this.iceReady;
    this.pending.delete(id);
    if (this.peers.has(id)) return;
    const p = this.make(id);
    const tr = p.pc.addTransceiver("audio", { direction: "sendrecv" });
    await tr.sender.replaceTrack(this.outgoing());
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    this.signal(id, { type: "offer", sdp: offer.sdp! });
  }

  private signal(to: string, data: Signal) {
    this.net.send({ t: "rtc", to, data });
  }

  onSignal(from: string, data: Signal) {
    this.chain = this.chain.then(() => this.handleSignal(from, data));
    return this.chain;
  }

  private async handleSignal(from: string, data: Signal) {
    await this.iceReady;
    try {
      if (data.type === "offer") {
        if (this.peers.has(from)) this.close(from);
        const p = this.make(from);
        await p.pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        const tr = p.pc.getTransceivers()[0];
        if (tr) {
          tr.direction = "sendrecv";
          await tr.sender.replaceTrack(this.outgoing());
        }
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        this.signal(from, { type: "answer", sdp: answer.sdp! });
        for (const c of p.pendingIce) await p.pc.addIceCandidate(c);
        p.pendingIce = [];
      } else if (data.type === "answer") {
        const p = this.peers.get(from);
        if (!p) return;
        await p.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        for (const c of p.pendingIce) await p.pc.addIceCandidate(c);
        p.pendingIce = [];
      } else if (data.type === "ice") {
        const p = this.peers.get(from);
        if (!p) return;
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.c);
        else p.pendingIce.push(data.c);
      }
    } catch (e) {
      console.warn("rtc", e);
    }
  }

  setMix(id: string, gain: number, pan: number) {
    const p = this.peers.get(id);
    if (!p) return;
    const t = p.gain.context.currentTime;
    p.gain.gain.setTargetAtTime(gain, t, 0.08);
    p.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.08);
  }

  private static rms(a: AnalyserNode | null): number {
    if (!a) return 0;
    const buf = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += ((v - 128) / 128) ** 2;
    return Math.sqrt(s / buf.length);
  }

  /** Loudness of a peer's raw voice (before proximity), for talking indicators. */
  peerLevel(id: string) {
    return Voice.rms(this.peers.get(id)?.level ?? null);
  }

  micLevelNow() {
    return this.muted ? 0 : Voice.rms(this.micLevel);
  }

  private close(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.gain.disconnect();
    p.el && (p.el.srcObject = null);
    this.peers.delete(id);
  }
}
