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
    this._paused = false;
    this._lastAnnouncement = -Infinity;
    this._speech = globalThis.speechSynthesis || null;
    this._speechVoice = null;
    this._utterance = null;
    this._refreshSpeechVoice = () => {
      try {
        this._speechVoice = this._speech?.getVoices().find(voice =>
          /^ja(?:[-_]|$)/i.test(voice.lang)) || null;
      } catch { this._speechVoice = null; }
    };
    this._speech?.addEventListener?.('voiceschanged', this._refreshSpeechVoice);
    this._refreshSpeechVoice();
  }

  get muted() { return this._muted; }

  /** Call directly from the Start/Sound button's click or pointer handler. */
  async unlock() {
    if (this._paused) return false;
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
          sinking: this._makeSinking(context),
          beam: this._makeEnergy(context, false),
          special: this._makeEnergy(context, true),
        };
      }

      // Request resume before yielding, while iOS still has gesture activation.
      const context = this.context;
      const resumed = context.state === 'running' ? Promise.resolve() : context.resume();
      // A silent one-frame source also primes older Safari audio routes.
      const primer = context.createBufferSource();
      primer.buffer = context.createBuffer(1, 1, context.sampleRate);
      primer.connect(this.master);
      this._track(primer, [primer]);
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
    if (this._muted) this._cancelAnnouncement();
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

  /** Suspend in the background; call pause(false) from a Resume button gesture. */
  pause(value) {
    this._paused = Boolean(value);
    if (this._paused) {
      this._cancelAnnouncement();
      if (this.context && this.context.state === 'running') {
        return this.context.suspend().catch(() => false);
      }
      return Promise.resolve(false);
    }
    return this.unlock();
  }

  sinking(pan = 0) {
    return this._play('sinking', pan, 0.82, 0.28);
  }

  beam(pan = 0) {
    return this._play('beam', pan, 0.93, 0.24);
  }

  special() {
    return this._play('special', 0, 1.1, 0.32);
  }

  /** Standard international Morse; the default encodes S U N K, not a loop. */
  morse(message = 'SUNK') {
    const context = this.context;
    if (!context || context.state !== 'running' || this._muted || this._paused) return false;
    const alphabet = {
      A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
      H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
      O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
      V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
      0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
      5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
      '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.',
      '=': '-...-', '+': '.-.-.', '-': '-....-', '@': '.--.-.',
    };
    const words = String(message).toUpperCase().slice(0, 40).trim().split(/\s+/)
      .map(word => [...word].filter(letter => alphabet[letter])).filter(word => word.length);
    if (!words.length) return false;
    const unit = 0.067;
    const start = context.currentTime + 0.075;
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 720;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, context.currentTime);
    oscillator.connect(envelope);
    envelope.connect(this.compressor);
    let cursor = start;
    words.forEach((letters, wordIndex) => {
      letters.forEach((letter, letterIndex) => {
        [...alphabet[letter]].forEach((symbol, symbolIndex) => {
          const duration = (symbol === '.' ? 1 : 3) * unit;
          envelope.gain.setValueAtTime(0, cursor);
          envelope.gain.linearRampToValueAtTime(0.19, cursor + 0.003);
          envelope.gain.setValueAtTime(0.19, cursor + duration - 0.004);
          envelope.gain.linearRampToValueAtTime(0, cursor + duration);
          cursor += duration;
          if (symbolIndex < alphabet[letter].length - 1) cursor += unit;
        });
        if (letterIndex < letters.length - 1) cursor += 3 * unit;
      });
      if (wordIndex < words.length - 1) cursor += 7 * unit;
    });
    this._track(oscillator, [oscillator, envelope]);
    oscillator.start(start);
    oscillator.stop(cursor + 0.025);
    return true;
  }

  /** A device-installed Japanese voice is used when available. */
  announce(text = '敵艦、沈没。') {
    const context = this.context;
    if (!this._speech || !globalThis.SpeechSynthesisUtterance || this._muted || this._paused
      || !context || context.state !== 'running') return false;
    const now = globalThis.performance?.now() ?? Date.now();
    if (now - this._lastAnnouncement < 1200) return false;
    try {
      this._refreshSpeechVoice();
      this._cancelAnnouncement();
      const utterance = new globalThis.SpeechSynthesisUtterance(String(text));
      utterance.lang = 'ja-JP';
      utterance.rate = 0.88;
      utterance.pitch = 0.8;
      utterance.volume = 0.8;
      if (this._speechVoice) utterance.voice = this._speechVoice;
      const clear = () => { if (this._utterance === utterance) this._utterance = null; };
      utterance.onend = utterance.onerror = clear;
      this._utterance = utterance;
      this._speech.speak(utterance);
      this._lastAnnouncement = now;
      return true;
    } catch { this._utterance = null; return false; }
  }

  _cancelAnnouncement() {
    if (this._utterance) {
      try { this._speech?.cancel(); } catch { /* Speech is optional on a device. */ }
      this._utterance = null;
    }
  }

  destroy() {
    this._cancelAnnouncement();
    this._speech?.removeEventListener?.('voiceschanged', this._refreshSpeechVoice);
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
    if (!context || context.state !== 'running' || !this.buffers || this._muted || this._paused || !power) return false;
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

    this._track(source, nodes);
    source.start();
    return true;
  }

  _track(source, nodes) {
    const voice = { source, nodes };
    this._voices.add(voice);
    source.onended = () => {
      this._voices.delete(voice);
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* A teardown may have disposed it. */ }
      }
    };
    return voice;
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
    const seconds = water ? 1.9 : 1.35;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(seconds * rate), rate);
    const samples = buffer.getChannelData(0);
    const random = this._noise(water ? 99183 : 65193);
    const alpha = 1 - Math.exp(-2 * Math.PI * (water ? 1700 : 4700) / rate);
    const lowAlpha = 1 - Math.exp(-2 * Math.PI * 180 / rate);
    let smooth = 0, low = 0;
    const tau = 2 * Math.PI;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      const noise = random();
      smooth += alpha * (noise - smooth);
      low += lowAlpha * (noise - low);
      const onset = 1 - Math.exp(-t / (water ? 0.005 : 0.001));
      if (water) {
        const plunge = Math.sin(tau * (65 * t + 50 * 0.043 * (1 - Math.exp(-t / 0.043))));
        const spray = (smooth - low) * Math.exp(-t / 0.39);
        const falling = Math.max(0, t - 0.28);
        const droplets = smooth * (0.6 + 0.4 * Math.sin(tau * 19 * t))
          * (1 - Math.exp(-falling / 0.16)) * Math.exp(-falling / 0.4);
        samples[i] = onset * (plunge * Math.exp(-t / 0.21) * 0.4
          + spray * 1.15 + low * Math.exp(-t / 0.32) * 1.3 + droplets * 0.36);
      } else {
        const clang = Math.sin(tau * 178 * t) * 0.25
          + Math.sin(tau * 349 * t) * 0.22 + Math.sin(tau * 613 * t) * 0.13
          + Math.sin(tau * 1087 * t) * 0.07;
        const crush = low * Math.exp(-t / 0.19) * 2.2;
        samples[i] = onset * ((smooth - low) * Math.exp(-t / 0.04) * 1.15
          + clang * Math.exp(-t / 0.31) + crush);
      }
      samples[i] *= Math.min(1, (seconds - t) / 0.07);
    }
    this._normalize(samples, water ? 0.75 : 0.86);
    return buffer;
  }

  _makeSinking(context) {
    const seconds = 3.4;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(seconds * rate), rate);
    const samples = buffer.getChannelData(0);
    const random = this._noise(71309);
    const lowAlpha = 1 - Math.exp(-2 * Math.PI * 210 / rate);
    const sprayAlpha = 1 - Math.exp(-2 * Math.PI * 1300 / rate);
    let low = 0, spray = 0;
    const tau = 2 * Math.PI;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      const noise = random();
      low += lowAlpha * (noise - low);
      spray += sprayAlpha * (noise - spray);
      const onset = 1 - Math.exp(-t / 0.008);
      const collapse = Math.exp(-t / 0.72);
      const creakPhase = tau * (129 * t - 12 * t * t);
      const creak = (Math.sin(creakPhase) + 0.28 * Math.sin(creakPhase * 2.83))
        * (0.7 + 0.3 * Math.sin(tau * 7.7 * t)) * Math.exp(-t / 1.08);
      const crash = (spray - low) * (Math.exp(-t / 0.045)
        + Math.exp(-Math.abs(t - 0.48) / 0.07) * 0.42
        + Math.exp(-Math.abs(t - 0.93) / 0.09) * 0.28);
      const surge = (1 - Math.exp(-t / 0.22)) * Math.exp(-t / 1.12);
      samples[i] = onset * (low * collapse * 2.6 + creak * 0.22 + crash * 0.75
        + spray * surge * 0.95 + Math.sin(tau * 44 * t) * collapse * 0.19)
        * Math.min(1, (seconds - t) / 0.2);
    }
    this._normalize(samples, 0.86);
    return buffer;
  }

  _makeEnergy(context, special) {
    const charge = special ? 1.03 : 0.15;
    const seconds = special ? 4.3 : 2.4;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(seconds * rate), rate);
    const samples = buffer.getChannelData(0);
    const random = this._noise(special ? 99057 : 87157);
    const lowAlpha = 1 - Math.exp(-2 * Math.PI * 230 / rate);
    const crackAlpha = 1 - Math.exp(-2 * Math.PI * 4800 / rate);
    let low = 0, crack = 0;
    const tau = 2 * Math.PI;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      const noise = random();
      low += lowAlpha * (noise - low);
      crack += crackAlpha * (noise - crack);
      let value = 0;
      if (t < charge) {
        const progress = t / charge;
        const phase = tau * (220 * t + 520 * t * t / charge);
        const rise = Math.sin(Math.PI * progress / 2) * Math.min(1, (charge - t) / 0.012);
        value = (Math.sin(phase) + Math.sin(phase * 1.52) * 0.32)
          * rise * (special ? 0.2 : 0.13) + low * progress * 0.28;
      }
      const count = special ? 3 : 1;
      for (let burst = 0; burst < count; burst++) {
        const age = t - charge - burst * 0.17;
        if (age < 0) continue;
        const onset = 1 - Math.exp(-age / 0.002);
        const phase = tau * (42 * age + 83 * 0.06 * (1 - Math.exp(-age / 0.06)));
        const bass = (Math.sin(phase) + 0.36 * Math.sin(phase * 2.01)) * Math.exp(-age / 0.57);
        const crackle = (crack - low) * Math.exp(-age / 0.05);
        const roar = low * Math.exp(-age / 0.81) * 2.3;
        const electric = (Math.sin(tau * 113 * age) + 0.22 * Math.sin(tau * 673 * age))
          * Math.exp(-age / 0.24);
        value += onset * (bass * 0.55 + crackle * 0.85 + roar * 0.46 + electric * 0.11);
      }
      samples[i] = value * Math.min(1, (seconds - t) / 0.16);
    }
    this._normalize(samples, special ? 0.97 : 0.93);
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
