/** Procedural naval artillery: no downloads and no AudioContext before a gesture. */
export class CannonAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.reverb = null;
    this.reverbReturn = null;
    this.buffers = null;
    this._muted = false;
    this._voices = new Set();
  }

  get muted() { return this._muted; }

  /** Call directly from the Start/Sound button's click or pointer handler. */
  async unlock() {
    try {
      if (!this.context || this.context.state === 'closed') {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) return false;
        this.context = new AudioContextClass({ latencyHint: 'interactive' });
        const context = this.context;

        this.master = context.createGain();
        this.master.gain.value = this._muted ? 0 : 0.4;
        this.master.connect(context.destination);

        // A whole salvo shares this bus, so closely spaced guns do not clip.
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -17;
        this.compressor.knee.value = 12;
        this.compressor.ratio.value = 10;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.24;
        this.compressor.connect(this.master);

        this.reverb = context.createConvolver();
        this.reverb.buffer = this._makeReverb(context);
        this.reverbReturn = context.createGain();
        this.reverbReturn.gain.value = 0.22;
        this.reverb.connect(this.reverbReturn);
        this.reverbReturn.connect(this.compressor);
        this.buffers = {
          fire: this._makeFire(context),
          hull: this._makeImpact(context, false),
          water: this._makeImpact(context, true),
        };
      }

      // Request resume before yielding, while iOS still has gesture activation.
      const context = this.context;
      const resumed = context.state === 'running' ? Promise.resolve() : context.resume();
      // A silent one-frame source also primes older Safari audio routes.
      const primer = context.createBufferSource();
      primer.buffer = context.createBuffer(1, 1, context.sampleRate);
      primer.connect(this.master);
      primer.onended = () => primer.disconnect();
      primer.start();
      await resumed;
      return context.state === 'running';
    } catch {
      // The game remains playable if a browser/device denies sound.
      return false;
    }
  }

  setMuted(value) {
    this._muted = Boolean(value);
    if (this.context && this.master && this.context.state !== 'closed') {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this._muted ? 0 : 0.4, now, 0.012);
    }
  }

  fire(pan = 0, power = 1) {
    this._play('fire', pan, Math.max(0, Math.min(1.25, Number(power) || 0)), 0.21);
  }

  impact(pan = 0, water = false) {
    this._play(water ? 'water' : 'hull', pan, water ? 0.58 : 0.72, 0.17);
  }

  destroy() {
    for (const voice of this._voices) {
      try { voice.source.stop(); } catch { /* Already ended. */ }
      for (const node of voice.nodes) {
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      }
    }
    this._voices.clear();
    const context = this.context;
    this.context = null;
    this.master = this.compressor = this.reverb = this.reverbReturn = null;
    this.buffers = null;
    if (context && context.state !== 'closed') context.close().catch(() => {});
  }

  _play(name, pan, power, wetLevel) {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.buffers || this._muted || !power) return;
    const source = context.createBufferSource();
    source.buffer = this.buffers[name];
    source.playbackRate.value = 0.975 + Math.random() * 0.05;
    const volume = context.createGain();
    volume.gain.value = power;
    source.connect(volume);

    let spatial = volume;
    const nodes = [source, volume];
    // StereoPanner is absent on some older iOS releases; mono is a safe fallback.
    if (typeof context.createStereoPanner === 'function') {
      spatial = context.createStereoPanner();
      spatial.pan.value = Math.max(-1, Math.min(1, Number(pan) || 0));
      volume.connect(spatial);
      nodes.push(spatial);
    }
    spatial.connect(this.compressor);
    const send = context.createGain();
    send.gain.value = wetLevel;
    spatial.connect(send);
    send.connect(this.reverb);
    nodes.push(send);

    const voice = { source, nodes };
    this._voices.add(voice);
    source.onended = () => {
      this._voices.delete(voice);
      for (const node of nodes) node.disconnect();
    };
    source.start();
  }

  _makeFire(context) {
    const seconds = 2.2;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(seconds * rate), rate);
    const samples = buffer.getChannelData(0);
    const random = this._noise(43171);
    let low = 0, middle = 0, high = 0;
    const lowAlpha = 1 - Math.exp(-2 * Math.PI * 190 / rate);
    const middleAlpha = 1 - Math.exp(-2 * Math.PI * 680 / rate);
    const highAlpha = 1 - Math.exp(-2 * Math.PI * 5600 / rate);
    const tau = 2 * Math.PI;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      const noise = random();
      low += lowAlpha * (noise - low);
      middle += middleAlpha * (noise - middle);
      high += highAlpha * (noise - high);
      const onset = 1 - Math.exp(-t / 0.0025);
      // Integrating a decaying pitch avoids oscillator discontinuities.
      const bassPhase = tau * (47 * t + 58 * 0.055 * (1 - Math.exp(-t / 0.055)));
      const bodyPhase = tau * (94 * t + 51 * 0.032 * (1 - Math.exp(-t / 0.032)));
      const sub = Math.sin(bassPhase) * Math.exp(-t / 0.40);
      // These harmonics keep the weight audible on small phone speakers.
      const body = (Math.sin(bodyPhase) + 0.48 * Math.sin(bodyPhase * 1.96)
        + 0.2 * Math.sin(bodyPhase * 3.08)) * Math.exp(-t / 0.22);
      const crack = (high - middle) * Math.exp(-t / 0.018);
      const pressure = (middle - low) * Math.exp(-t / 0.14);
      const rumble = (low * 3.4 + Math.sin(tau * 36 * t) * 0.085) * Math.exp(-t / 0.61);
      const metal = (Math.sin(tau * 420 * t) + 0.45 * Math.sin(tau * 670 * t)) * Math.exp(-t / 0.061);
      const tail = Math.min(1, (seconds - t) / 0.09);
      samples[i] = onset * tail * (sub * 0.51 + body * 0.31 + crack * 0.65
        + pressure * 1.0 + rumble * 0.33 + metal * 0.062);
    }
    this._normalize(samples, 0.9);
    return buffer;
  }

  _makeImpact(context, water) {
    const seconds = water ? 1.35 : 0.95;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(seconds * rate), rate);
    const samples = buffer.getChannelData(0);
    const random = this._noise(water ? 99183 : 65193);
    const alpha = 1 - Math.exp(-2 * Math.PI * (water ? 950 : 3800) / rate);
    let smooth = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      smooth += alpha * (random() - smooth);
      const onset = 1 - Math.exp(-t / (water ? 0.007 : 0.001));
      if (water) {
        const plunge = Math.sin(2 * Math.PI * (63 * t + 35 * 0.05 * (1 - Math.exp(-t / 0.05))));
        samples[i] = onset * (plunge * Math.exp(-t / 0.18) * 0.44
          + smooth * Math.exp(-t / 0.35) * 1.25);
      } else {
        const clang = Math.sin(2 * Math.PI * 178 * t) * 0.25
          + Math.sin(2 * Math.PI * 349 * t) * 0.17
          + Math.sin(2 * Math.PI * 613 * t) * 0.095;
        samples[i] = onset * (smooth * Math.exp(-t / 0.052) * 0.95
          + clang * Math.exp(-t / 0.23));
      }
      samples[i] *= Math.min(1, (seconds - t) / 0.06);
    }
    this._normalize(samples, water ? 0.65 : 0.72);
    return buffer;
  }

  _makeReverb(context) {
    const seconds = 1.65;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(2, Math.ceil(seconds * rate), rate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      const random = this._noise(91267 + channel * 729);
      let smooth = 0;
      const alpha = 1 - Math.exp(-2 * Math.PI * 1700 / rate);
      for (let i = 0; i < samples.length; i++) {
        const t = i / rate;
        smooth += alpha * (random() - smooth);
        const age = t - 0.038 - channel * 0.005;
        if (age < 0) continue;
        const diffusion = 1 - Math.exp(-age / 0.011);
        samples[i] = smooth * diffusion * Math.exp(-age / 0.29)
          * Math.min(1, (seconds - t) / 0.1);
      }
    }
    return buffer;
  }

  _normalize(samples, peak) {
    let max = 0;
    for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]));
    if (!max) return;
    const scale = peak / max;
    for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  }

  _noise(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2147483648 - 1;
    };
  }
}
