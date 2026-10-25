type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[] };

/** Quiet, self-contained vehicle audio. The graph is created by a user gesture. */
export class GameAudio {
  private _enabled = true;
  private unlocked = false;
  private disposed = false;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineNoise: AudioBufferSourceNode | null = null;
  private engineTone: OscillatorNode | null = null;
  private toneGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private loops: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private voices = new Set<Voice>();
  private lastEvent = new Map<string, number>();
  private stateChange: Promise<void> = Promise.resolve();

  constructor() {}

  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(value: boolean) {
    this.setEnabled(value);
  }

  async unlock(): Promise<void> {
    if (this.disposed) return;
    this.unlocked = true;
    if (!this.context) this.createGraph();
    await this.syncState();
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this._enabled = enabled;
    if (!enabled) {
      this.silence();
      this.stopVoices();
    }
    void this.syncState();
  }

  update(speed: number, boosting: boolean, flying: boolean): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this._enabled || !this.unlocked || this.disposed)
      return;
    const amount = Number.isFinite(speed) ? Math.max(0, Math.min(1, speed / 100)) : 0;
    const moving = speed > 0.5;
    const time = ctx.currentTime;
    // Most of the engine is low-pass noise; the bass fundamental stays very quiet.
    this.engineFilter?.frequency.setTargetAtTime(
      115 + amount * 210 + (boosting ? 45 : 0),
      time,
      0.12,
    );
    this.engineNoise?.playbackRate.setTargetAtTime(
      0.7 + amount * 0.65 + (boosting ? 0.15 : 0),
      time,
      0.12,
    );
    this.engineGain?.gain.setTargetAtTime(moving ? 0.12 + amount * 0.045 : 0, time, 0.15);
    this.engineTone?.frequency.setTargetAtTime(36 + amount * 32 + (boosting ? 8 : 0), time, 0.14);
    this.toneGain?.gain.setTargetAtTime(moving ? 0.004 + amount * 0.003 : 0, time, 0.15);
    this.windFilter?.frequency.setTargetAtTime(1200 + amount * 1600, time, 0.2);
    this.windGain?.gain.setTargetAtTime(
      moving ? (flying ? 0.012 + amount * 0.018 : amount * 0.003) : 0,
      time,
      0.2,
    );
  }

  play(event: string): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this._enabled || !this.unlocked || this.disposed)
      return;
    const cooldown = event === 'bolt' ? 0.045 : event === 'click' ? 0.035 : 0.1;
    if (ctx.currentTime - (this.lastEvent.get(event) ?? -Infinity) < cooldown) return;
    this.lastEvent.set(event, ctx.currentTime);
    try {
      switch (event) {
        case 'start':
          this.tone(190, 280, 0.15, 0.055);
          this.tone(380, 520, 0.2, 0.04, 0.09);
          break;
        case 'bolt':
          this.tone(1046, 1568, 0.09, 0.045);
          break;
        case 'pickup':
          [440, 660, 880].forEach((frequency, index) =>
            this.tone(frequency, frequency * 1.12, 0.16, 0.045, index * 0.075),
          );
          break;
        case 'roll':
          this.noiseBurst(0.24, 0.075, 850, 'bandpass');
          this.tone(180, 320, 0.23, 0.02);
          break;
        case 'nearMiss':
          this.noiseBurst(0.2, 0.065, 1800, 'bandpass');
          break;
        case 'crash':
          this.noiseBurst(0.6, 0.2, 480, 'lowpass');
          this.tone(85, 26, 0.5, 0.06);
          break;
        case 'click':
          this.tone(680, 620, 0.045, 0.025);
          break;
      }
    } catch {
      // A browser may close or interrupt its audio device between frames.
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this._enabled = false;
    this.unlocked = false;
    this.releaseGraph();
    this.lastEvent.clear();
  }

  private createGraph(): void {
    const audioGlobal = globalThis as typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Context = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
    if (!Context) return;
    try {
      const ctx = new Context({ latencyHint: 'interactive' });
      this.context = ctx;
      const node = <T extends AudioNode>(value: T): T => {
        this.nodes.push(value);
        return value;
      };
      this.master = node(ctx.createGain());
      this.master.gain.value = 0;
      const compressor = node(ctx.createDynamicsCompressor());
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.006;
      compressor.release.value = 0.2;
      this.master.connect(compressor).connect(ctx.destination);
      this.voiceBus = node(ctx.createGain());
      this.voiceBus.gain.value = 0;
      this.voiceBus.connect(this.master);

      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

      this.engineNoise = node(ctx.createBufferSource());
      this.engineNoise.buffer = this.noise;
      this.engineNoise.loop = true;
      this.engineFilter = node(ctx.createBiquadFilter());
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 150;
      this.engineFilter.Q.value = 0.65;
      const rumble = node(ctx.createBiquadFilter());
      rumble.type = 'highpass';
      rumble.frequency.value = 28;
      this.engineGain = node(ctx.createGain());
      this.engineGain.gain.value = 0;
      this.engineNoise
        .connect(this.engineFilter)
        .connect(rumble)
        .connect(this.engineGain)
        .connect(this.master);

      this.engineTone = node(ctx.createOscillator());
      this.engineTone.type = 'sine';
      this.engineTone.frequency.value = 36;
      this.toneGain = node(ctx.createGain());
      this.toneGain.gain.value = 0;
      this.engineTone.connect(this.toneGain).connect(this.master);

      const wind = node(ctx.createBufferSource());
      wind.buffer = this.noise;
      wind.loop = true;
      const windHighpass = node(ctx.createBiquadFilter());
      windHighpass.type = 'highpass';
      windHighpass.frequency.value = 550;
      this.windFilter = node(ctx.createBiquadFilter());
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.value = 1500;
      this.windFilter.Q.value = 0.4;
      this.windGain = node(ctx.createGain());
      this.windGain.gain.value = 0;
      wind
        .connect(windHighpass)
        .connect(this.windFilter)
        .connect(this.windGain)
        .connect(this.master);
      this.loops = [this.engineNoise, this.engineTone, wind];
      this.loops.forEach((source) => source.start());
    } catch {
      this.releaseGraph();
    }
  }

  private syncState(): Promise<void> {
    const apply = async (): Promise<void> => {
      const ctx = this.context;
      if (!ctx || ctx.state === 'closed') return;
      try {
        if (this._enabled && this.unlocked && !this.disposed) {
          if (ctx.state !== 'running') await ctx.resume();
          if (this.context !== ctx) return;
          if (this._enabled && this.unlocked && !this.disposed) {
            this.voiceBus?.gain.setValueAtTime(1, ctx.currentTime);
            this.master?.gain.setTargetAtTime(0.65, ctx.currentTime, 0.04);
            return;
          }
        }
        this.silence();
        if (ctx.state === 'running') await ctx.suspend();
      } catch {
        this.silence();
      }
    };
    // Serialize resume/suspend so rapid mute clicks cannot leave the context in the wrong state.
    this.stateChange = this.stateChange.then(apply, apply);
    return this.stateChange;
  }

  private silence(): void {
    const time = this.context?.currentTime ?? 0;
    for (const gain of [
      this.master,
      this.voiceBus,
      this.engineGain,
      this.toneGain,
      this.windGain,
    ]) {
      if (!gain) continue;
      gain.gain.cancelScheduledValues(time);
      gain.gain.setValueAtTime(0, time);
    }
  }

  private tone(from: number, to: number, duration: number, volume: number, delay = 0): void {
    const ctx = this.context;
    if (!ctx || !this.voiceBus) return;
    const source = ctx.createOscillator();
    source.type = 'sine';
    const start = ctx.currentTime + delay;
    source.frequency.setValueAtTime(from, start);
    source.frequency.exponentialRampToValueAtTime(to, start + duration);
    const envelope = this.envelope(start, duration, volume);
    source.connect(envelope).connect(this.voiceBus);
    this.trackVoice(source, [envelope]);
    source.start(start);
    source.stop(start + duration + 0.025);
  }

  private noiseBurst(
    duration: number,
    volume: number,
    frequency: number,
    type: BiquadFilterType,
  ): void {
    const ctx = this.context;
    if (!ctx || !this.voiceBus || !this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const envelope = this.envelope(ctx.currentTime, duration, volume);
    source.connect(filter).connect(envelope).connect(this.voiceBus);
    this.trackVoice(source, [filter, envelope]);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration + 0.025);
  }

  private envelope(start: number, duration: number, volume: number): GainNode {
    const envelope = this.context!.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    envelope.gain.setValueAtTime(0, start + duration + 0.01);
    return envelope;
  }

  private trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    const voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
      this.voices.delete(voice);
    };
  }

  private stopVoices(): void {
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {
        /* Already ended. */
      }
      voice.source.disconnect();
      voice.nodes.forEach((node) => node.disconnect());
    }
    this.voices.clear();
  }

  private releaseGraph(): void {
    this.silence();
    this.stopVoices();
    for (const source of this.loops) {
      try {
        source.stop();
      } catch {
        /* A partially built graph may not have started. */
      }
    }
    this.loops = [];
    this.nodes.forEach((node) => node.disconnect());
    this.nodes = [];
    const ctx = this.context;
    this.context = null;
    this.master = this.voiceBus = this.engineGain = this.toneGain = this.windGain = null;
    this.engineFilter = this.windFilter = null;
    this.engineNoise = null;
    this.engineTone = null;
    this.noise = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }
}
