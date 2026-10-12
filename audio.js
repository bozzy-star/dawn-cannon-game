const REPORTS = Object.freeze({
  sunk: { file: 'enemy-sunk', text: '敵艦！ 撃沈ッ！', priority: 1, cooldown: 1900 },
  destroyer: { file: 'sunk-destroyer', text: '敵、駆逐艦、撃沈！', priority: 1, cooldown: 1900 },
  cruiser: { file: 'sunk-cruiser', text: '敵、巡洋艦、撃沈！', priority: 1, cooldown: 1900 },
  battleship: { file: 'sunk-battleship', text: '敵、戦艦、撃沈！', priority: 1, cooldown: 1900 },
  carrier: { file: 'sunk-carrier', text: '敵、空母、撃沈！', priority: 1, cooldown: 1900 },
  submarine: { file: 'sunk-submarine', text: '敵、潜水艦、撃沈！', priority: 1, cooldown: 1900 },
  fire: { file: 'fire-command', text: '撃てえーッ！', priority: 0, cooldown: 4200 },
  salvo: { file: 'salvo-command', text: '全砲門！ 撃てえーッ！', priority: 0, cooldown: 4200 },
  spotted: { file: 'air-spotted', text: '敵機発見！ 来るぞッ！', priority: 2, cooldown: 5500 },
  bow: { file: 'hit-bow', text: '艦首、被弾！ 被弾だッ！', priority: 3, cooldown: 2600 },
  stern: { file: 'hit-stern', text: '艦尾、被弾！ 被弾だッ！', priority: 3, cooldown: 2600 },
  port: { file: 'hit-port', text: '左舷、被弾！ 被弾だッ！', priority: 3, cooldown: 2600 },
  starboard: { file: 'hit-starboard', text: '右舷、被弾！ 被弾だッ！', priority: 3, cooldown: 2600 },
  bridge: { file: 'hit-bridge', text: '艦橋、被弾！ 被弾だッ！', priority: 3, cooldown: 2600 },
  engine: { file: 'hit-engine', text: '機関部、被弾！ 被弾だッ！', priority: 3, cooldown: 2600 },
});
const SHIP_REPORTS = Object.freeze({
  destroyer: 'destroyer', 駆逐艦: 'destroyer',
  cruiser: 'cruiser', 巡洋艦: 'cruiser',
  battleship: 'battleship', 戦艦: 'battleship',
  carrier: 'carrier', carrier3: 'carrier', carrier5: 'carrier', carrier10: 'carrier', 空母: 'carrier',
  submarine: 'submarine', 潜水艦: 'submarine',
});
const HIT_LOCATIONS = Object.freeze({
  bow: 'bow', 艦首: 'bow', 船首: 'bow', 前部: 'bow',
  stern: 'stern', 艦尾: 'stern', 船尾: 'stern', 後部: 'stern',
  port: 'port', 左舷: 'port', 左: 'port',
  starboard: 'starboard', 右舷: 'starboard', 右: 'starboard',
  bridge: 'bridge', 艦橋: 'bridge',
  engine: 'engine', 機関部: 'engine', 機関: 'engine',
});

/** Procedural naval artillery and bundled synthetic young male deck reports. */
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
    this._morseBusyUntil = -Infinity;
    this._speech = globalThis.speechSynthesis || null;
    this._speechVoice = null;
    this._utterance = null;
    this._recordedSunk = null;
    this._recordedReports = Object.create(null);
    this._recordedVoice = null;
    this._voiceLoadPromise = null;
    this._voiceLoadAbort = null;
    this._reportPriority = 0;
    this._reportUntil = -Infinity;
    this._reportKey = null;
    this._reportLast = new Map();
    this._lastHitReport = -Infinity;
    this._lastFireReport = -Infinity;
    this._refreshSpeechVoice = () => {
      try {
        const voices = this._speech?.getVoices().filter(voice =>
          /^ja(?:[-_]|$)/i.test(voice.lang)) || [];
        this._speechVoice = voices.find(voice => /Eddy/i.test(voice.name))
          || voices.find(voice => /Reed|Otoya|Ichiro|男性/i.test(voice.name))
          || voices.find(voice => /Rocko/i.test(voice.name)) || voices[0] || null;
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
      // Fetch after resume is requested; iOS gesture activation must stay intact.
      if (!this._voiceLoadPromise) this._voiceLoadPromise = this._loadRecordedReports(context);
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

  fire(pan = 0, power = 1, distance = 0) {
    return this._play('fire', pan, Math.max(0, Math.min(1.25, Number(power) || 0)), 0.16, distance);
  }

  impact(pan = 0, water = false, distance = 700) {
    return this._play(water ? 'water' : 'hull', pan, water ? 0.66 : 0.9, 0.16, distance);
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

  sinking(pan = 0, distance = 900) {
    return this._play('sinking', pan, 1.02, 0.21, distance);
  }

  /** Voice only; keep sinking() and morse() as independent effects. */
  sunk(kind = '') {
    const label = String(kind).trim();
    const key = Object.prototype.hasOwnProperty.call(SHIP_REPORTS, label) ? SHIP_REPORTS[label] : 'sunk';
    return this._report(key, REPORTS[key], this._recordedReports[key] || (key === 'sunk' ? this._recordedSunk : null));
  }

  /** A short order shares the report channel and never masks incoming damage. */
  fireCommand(salvo = false) {
    const key = salvo ? 'salvo' : 'fire';
    return this._report(key, REPORTS[key], this._recordedReports[key]);
  }

  airSpotted(count = 1) {
    if (!Number.isFinite(Number(count)) || Number(count) <= 0) return false;
    return this._report('spotted', REPORTS.spotted, this._recordedReports.spotted);
  }

  hitReport(location = 'bridge') {
    const label = String(location).trim().replace(/(?:[、,!！ ]*被弾[!！]*)$/, '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(HIT_LOCATIONS, label)) return false;
    const key = HIT_LOCATIONS[label];
    return this._report(key, REPORTS[key], this._recordedReports[key]);
  }

  _report(key, spec, buffer = null) {
    const context = this.context;
    if (!context || context.state !== 'running' || this._muted || this._paused) return false;
    const now = globalThis.performance?.now() ?? Date.now();
    if (now - (this._reportLast.get(key) ?? -Infinity) < spec.cooldown) return false;
    if (spec.priority === 3 && now - this._lastHitReport < 950) return false;
    if ((key === 'fire' || key === 'salvo') && now - this._lastFireReport < 4200) return false;
    // Reports are never queued: stale sightings/sinkings must not play later.
    // Only a more urgent report can interrupt the current voice.
    if (now < this._reportUntil && spec.priority <= this._reportPriority) return false;
    if (!buffer && (!this._speech || !globalThis.SpeechSynthesisUtterance)) return false;
    this._cancelAnnouncement();
    this._reportPriority = spec.priority;
    this._reportKey = key;
    this._reportUntil = now + (buffer ? buffer.duration * 1000 + 70 : Math.max(1200, spec.text.length * 130));
    this._reportLast.set(key, now);
    this._lastAnnouncement = now;
    if (spec.priority === 3) this._lastHitReport = now;
    if (key === 'fire' || key === 'salvo') this._lastFireReport = now;
    if (!buffer) return this._speakReport(spec.text);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    const volume = context.createGain();
    volume.gain.value = 0.98;
    source.connect(volume);
    volume.connect(this.compressor);
    this._recordedVoice = this._track(source, [source, volume], () => {
      if (this._recordedVoice?.source === source) {
        this._recordedVoice = null; this._reportPriority = 0; this._reportUntil = -Infinity; this._reportKey = null;
      }
    });
    source.start(context.currentTime + 0.025);
    return true;
  }

  sonarPing(distance = 1000) {
    const context = this.context;
    if (!context || context.state !== 'running' || this._muted || this._paused) return false;
    const proximity = 1 - Math.max(0, Math.min(2000, Number(distance) || 0)) / 2000;
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1120, start);
    oscillator.frequency.linearRampToValueAtTime(1010, start + 0.13);
    const envelope = context.createGain();
    const peak = 0.09 + proximity * 0.09;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + 0.008);
    envelope.gain.linearRampToValueAtTime(0, start + 0.24);
    envelope.gain.setValueAtTime(0, start + 0.29);
    envelope.gain.linearRampToValueAtTime(peak * 0.26, start + 0.30);
    envelope.gain.linearRampToValueAtTime(0, start + 0.50);
    oscillator.connect(envelope);
    envelope.connect(this.compressor);
    this._track(oscillator, [oscillator, envelope]);
    oscillator.start();
    oscillator.stop(start + 0.52);
    return true;
  }

  aircraftHit(pan = 0, distance = 700) {
    return this._play('hull', pan, 0.4, 0.09, distance);
  }

  aswLaunch(pan = 0) {
    return this._play('fire', pan, 0.42, 0.08, 0);
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
    if (context.currentTime < this._morseBusyUntil) return false;
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
    this._morseBusyUntil = cursor + 0.1;
    oscillator.start(start);
    oscillator.stop(cursor + 0.025);
    return true;
  }

  /** Fallback only: device-installed Japanese male voices are preferred. */
  announce(text = '敵艦、撃沈！') {
    return this._report('generic', { text: String(text), priority: 0, cooldown: 1750 });
  }

  _speakReport(text) {
    try {
      this._refreshSpeechVoice();
      const utterance = new globalThis.SpeechSynthesisUtterance(String(text));
      utterance.lang = 'ja-JP';
      utterance.rate = 1.24;
      utterance.pitch = 1.1;
      utterance.volume = 1;
      if (this._speechVoice) utterance.voice = this._speechVoice;
      const clear = () => {
        if (this._utterance === utterance) {
          this._utterance = null; this._reportPriority = 0; this._reportUntil = -Infinity; this._reportKey = null;
        }
      };
      utterance.onend = utterance.onerror = clear;
      this._utterance = utterance;
      this._speech.speak(utterance);
      return true;
    } catch {
      this._utterance = null; this._reportPriority = 0; this._reportUntil = -Infinity; this._reportKey = null;
      return false;
    }
  }

  _cancelAnnouncement() {
    this._reportPriority = 0; this._reportUntil = -Infinity; this._reportKey = null;
    if (this._recordedVoice) {
      const voice = this._recordedVoice;
      this._recordedVoice = null;
      try { voice.source.stop(); } catch { /* The recording may already have ended. */ }
      for (const node of voice.nodes) {
        try { node.disconnect(); } catch { /* Optional during teardown. */ }
      }
      this._voices.delete(voice);
    }
    if (this._utterance) {
      try { this._speech?.cancel(); } catch { /* Speech is optional on a device. */ }
      this._utterance = null;
    }
  }

  destroy() {
    this._cancelAnnouncement();
    this._voiceLoadAbort?.abort();
    this._voiceLoadAbort = null;
    this._voiceLoadPromise = null;
    this._recordedSunk = null;
    this._recordedReports = Object.create(null);
    this._reportLast.clear();
    this._lastHitReport = -Infinity;
    this._lastFireReport = -Infinity;
    this._morseBusyUntil = -Infinity;
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

  async _loadRecordedReports(context) {
    try {
      if (typeof globalThis.fetch !== 'function' || typeof context.decodeAudioData !== 'function') return false;
      const controller = typeof globalThis.AbortController === 'function' ? new AbortController() : null;
      this._voiceLoadAbort = controller;
      const loaded = await Promise.all(Object.entries(REPORTS).map(async ([key, spec]) => {
        try {
          const response = await fetch(new URL(`./assets/${spec.file}.wav?v=asahi-v6`, import.meta.url), {
            cache: 'force-cache', ...(controller ? { signal: controller.signal } : {}),
          });
          if (!response.ok) return false;
          const bytes = await response.arrayBuffer();
          const buffer = await context.decodeAudioData(bytes);
          if (this.context !== context || context.state === 'closed') return false;
          this._recordedReports[key] = buffer;
          if (key === 'sunk') this._recordedSunk = buffer;
          return true;
        } catch { return false; }
      }));
      return loaded.some(Boolean);
    } catch { return false; }
  }

  _play(name, pan, power, wetLevel, distance = 0) {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.buffers?.[name] || this._muted || this._paused || !power) return false;
    // A fleet-wide strike can destroy hundreds of targets in the same frame.
    // Keep the first impacts; piling more voices on them only produces clipping.
    if (this._voices.size >= 24) return false;
    const source = context.createBufferSource();
    source.buffer = this.buffers[name];
    source.playbackRate.value = 0.975 + Math.random() * 0.05;
    const volume = context.createGain();
    const meters = Math.max(0, Math.min(20000, Number(distance) || 0));
    volume.gain.value = power / (1 + meters / 3500);
    source.connect(volume);

    let spatial = volume;
    const nodes = [source, volume];
    // Long-range explosions lose their sharp crack before their low rumble.
    if (meters > 0 && typeof context.createBiquadFilter === 'function') {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(650, 18000 / (1 + meters / 350));
      filter.Q.value = 0.5;
      spatial.connect(filter);
      spatial = filter;
      nodes.push(filter);
    }
    // StereoPanner is absent on some older iOS releases; mono is a safe fallback.
    if (typeof context.createStereoPanner === 'function') {
      spatial = context.createStereoPanner();
      spatial.pan.value = Math.max(-1, Math.min(1, Number(pan) || 0));
      nodes[nodes.length - 1].connect(spatial);
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

  _track(source, nodes, ended = null) {
    const voice = { source, nodes };
    this._voices.add(voice);
    source.onended = () => {
      this._voices.delete(voice);
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* A teardown may have disposed it. */ }
      }
      ended?.();
    };
    return voice;
  }

  _makeFire(context) {
    const seconds = 3.05;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(seconds * rate), rate);
    const samples = buffer.getChannelData(0);
    const random = this._noise(43171);
    let low = 0, middle = 0, high = 0;
    const lowAlpha = 1 - Math.exp(-2 * Math.PI * 120 / rate);
    const middleAlpha = 1 - Math.exp(-2 * Math.PI * 950 / rate);
    const highAlpha = 1 - Math.exp(-2 * Math.PI * 7200 / rate);
    const tau = 2 * Math.PI;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      const noise = random();
      low += lowAlpha * (noise - low);
      middle += middleAlpha * (noise - middle);
      high += highAlpha * (noise - high);
      const onset = 1 - Math.exp(-t / 0.0012);
      // Integrating a decaying pitch avoids oscillator discontinuities.
      const bassPhase = tau * (30 * t + 75 * 0.028 * (1 - Math.exp(-t / 0.028)));
      const bodyPhase = tau * (83 * t + 86 * 0.024 * (1 - Math.exp(-t / 0.024)));
      const sub = Math.sin(bassPhase) * Math.exp(-t / 0.51);
      // These harmonics keep the weight audible on small phone speakers.
      const body = (Math.sin(bodyPhase) + 0.28 * Math.sin(bodyPhase * 2.03)
        + 0.15 * Math.sin(bodyPhase * 3.17)) * Math.exp(-t / 0.19);
      const crack = (high - middle) * Math.exp(-t / 0.014);
      const pressure = (middle - low) * Math.exp(-t / 0.12);
      const rumble = low * (1 + 0.17 * Math.sin(tau * 17 * t)) * Math.exp(-t / 0.73);
      // Three time scales: the muzzle shock, massive pressure body, then air/steel decay.
      const metal = (Math.sin(tau * 287 * t) + 0.38 * Math.sin(tau * 503 * t)
        + 0.13 * Math.sin(tau * 821 * t)) * Math.exp(-t / 0.078);
      const tail = Math.min(1, (seconds - t) / 0.14);
      samples[i] = onset * tail * (sub * 0.38 + body * 0.24 + crack * 1.30
        + pressure * 1.70 + rumble * 2.65 + metal * 0.075);
    }
    this._addReflections(samples, rate, [[0.12, 0.18], [0.29, 0.11], [0.54, 0.055]]);
    this._normalize(samples, 0.94);
    return buffer;
  }

  _makeImpact(context, water) {
    const seconds = water ? 2.4 : 2.55;
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
        const clang = Math.sin(tau * 173 * t) * 0.16
          + Math.sin(tau * 353 * t) * 0.10 + Math.sin(tau * 619 * t) * 0.07
          + Math.sin(tau * 1093 * t) * 0.028;
        const crush = low * Math.exp(-t / 0.48) * 3.9;
        const blastPhase = tau * (36 * t + 69 * 0.023 * (1 - Math.exp(-t / 0.023)));
        const blast = Math.sin(blastPhase) * Math.exp(-t / 0.31);
        const shards = (smooth - low) * (Math.exp(-t / 0.032) * 1.9
          + Math.exp(-Math.abs(t - 0.11) / 0.019) * 0.3
          + Math.exp(-Math.abs(t - 0.29) / 0.033) * 0.19);
        samples[i] = onset * (shards + clang * Math.exp(-t / 0.45)
          + crush + blast * 0.39);
      }
      samples[i] *= Math.min(1, (seconds - t) / 0.07);
    }
    this._addReflections(samples, rate, water ? [[0.14, 0.075]] : [[0.16, 0.13], [0.41, 0.075]]);
    this._normalize(samples, water ? 0.78 : 0.93);
    return buffer;
  }

  _makeSinking(context) {
    const seconds = 4.85;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(seconds * rate), rate);
    const samples = buffer.getChannelData(0);
    const random = this._noise(71309);
    const lowAlpha = 1 - Math.exp(-2 * Math.PI * 115 / rate);
    const sprayAlpha = 1 - Math.exp(-2 * Math.PI * 2100 / rate);
    const crackAlpha = 1 - Math.exp(-2 * Math.PI * 6200 / rate);
    let low = 0, spray = 0, crack = 0;
    const tau = 2 * Math.PI;
    const detonations = [[0, 1], [0.29, 0.52], [0.77, 0.37], [1.36, 0.24]];
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      const noise = random();
      low += lowAlpha * (noise - low);
      spray += sprayAlpha * (noise - spray);
      crack += crackAlpha * (noise - crack);
      const onset = 1 - Math.exp(-t / 0.002);
      const collapse = Math.exp(-t / 1.18);
      const creakPhase = tau * (136 * t - 6.1 * t * t);
      const creak = (Math.sin(creakPhase) + 0.28 * Math.sin(creakPhase * 2.83))
        * (0.6 + 0.4 * Math.sin(tau * 5.7 * t)) * Math.exp(-t / 1.52);
      let explosions = 0;
      // Main detonation, rupturing magazines, and a final internal collapse.
      for (const [delay, strength] of detonations) {
        const age = t - delay;
        if (age < 0) continue;
        const attack = 1 - Math.exp(-age / 0.0016);
        const phase = tau * (27 * age + 80 * 0.025 * (1 - Math.exp(-age / 0.025)));
        explosions += attack * strength * (
          (crack - spray) * Math.exp(-age / 0.026) * 1.65
          + (spray - low) * Math.exp(-age / 0.17) * 0.88
          + low * Math.exp(-age / 0.57) * 2.9
          + Math.sin(phase) * Math.exp(-age / 0.47) * 0.37);
      }
      const surge = (1 - Math.exp(-Math.max(0, t - 0.38) / 0.31)) * Math.exp(-t / 1.84);
      const tearing = (spray - low) * Math.exp(-Math.abs(t - 0.95) / 0.23) * 0.17;
      samples[i] = onset * (explosions + low * collapse * 1.05 + creak * 0.11
        + tearing + spray * surge * 0.77) * Math.min(1, (seconds - t) / 0.23);
    }
    this._addReflections(samples, rate, [[0.19, 0.12], [0.44, 0.075], [0.82, 0.035]]);
    this._normalize(samples, 0.96);
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

  _addReflections(samples, rate, taps) {
    const direct = new Float32Array(samples);
    for (const [seconds, gain] of taps) {
      const delay = Math.round(seconds * rate);
      let smooth = 0;
      const alpha = 1 - Math.exp(-2 * Math.PI * 1900 / rate);
      for (let i = delay; i < samples.length; i++) {
        smooth += alpha * (direct[i - delay] - smooth);
        samples[i] += smooth * gain;
      }
    }
  }

  _noise(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2147483648 - 1;
    };
  }
}
