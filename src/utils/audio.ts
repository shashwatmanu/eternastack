"use client";

class AudioEngine {
  // --- EXTERNAL AUDIO SUPPORT ---
  private bgmTracks: { [key: string]: HTMLAudioElement } = {};
  private sfxTracks: { [key: string]: HTMLAudioElement } = {};
  private currentBgmKey: string | null = null;
  private fadeIntervals: { [key: string]: NodeJS.Timeout } = {};

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // STAGE 1: BEE BUZZ
  private beeBuzzOsc: OscillatorNode | null = null;
  private beeBuzzMod: OscillatorNode | null = null;
  private beeGain: GainNode | null = null;

  // STAGE 2: ANT FOOTSTEPS & GROUND
  private antGain: GainNode | null = null;
  private antTickInterval: any = null;

  // STAGE 3: CAVERN ECO & WATER DROPS
  private cavernGain: GainNode | null = null;
  private cavernDelay: DelayNode | null = null;
  private cavernFeedback: GainNode | null = null;
  private waterDropInterval: any = null;
  private cavernOsc: OscillatorNode | null = null;

  // PRELOADER RISER SWEEP
  private activeRiserOsc: OscillatorNode | null = null;
  private activeRiserGain: GainNode | null = null;

  // EXTENDED LOOP BUFFERS (drone + ground — decoded AudioBuffer stitched 3x with crossfade)
  private extendedSources: { [key: string]: AudioBufferSourceNode } = {};
  private extendedGains: { [key: string]: GainNode } = {};

  isMuted = false;
  isMachine = false;
  isAscending = false;
  private isInitialized = false;
  private isBooted = false; // Set true only after hold-to-enter completes
  private activeFold: string | null = null;

  setMachineState(machine: boolean) {
    this.isMachine = machine;
  }

  setAscendingState(ascending: boolean) {
    this.isAscending = ascending;
  }

  init() {
    if (this.isInitialized) return;
    try {
      this.initExternalAudio();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.25, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.isInitialized = true;
      // Build extended loops for short tracks so repeats aren't audible.
      // cavern gets a 2s start offset to skip the broken intro.
      this.buildExtendedLoop('drone', '/audio/drone.m4a', 3);
      this.buildExtendedLoop('ant', '/audio/ground.m4a', 3);
      this.buildExtendedLoop('spider', '/audio/cavern.m4a', 3, 2.0);
    } catch (e) {
      console.error("Web Audio API not supported in this browser.", e);
    }
  }

  // Fetch an audio file, decode it, and play it as a seamlessly looping
  // AudioBufferSourceNode using native loopStart/loopEnd to skip a broken intro.
  //
  // Previously this manually stitched `repeats` copies with a crossfade in a
  // O(repeats × srcLen) JS loop — for a 30-second stereo file that means
  // ~8 million iterations on the main thread, freezing the UI for 200–400 ms
  // right after audio.init() on mount. The native loop approach is zero-cost.
  private async buildExtendedLoop(key: string, url: string, _repeats: number, startOffsetSec = 0) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arrayBuffer);

      // Create and connect a gain node for volume control
      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0, this.ctx.currentTime); // volume managed by updateState
      gainNode.connect(this.masterGain);

      const source = this.ctx.createBufferSource();
      source.buffer   = decoded;
      source.loop      = true;
      // Skip the broken/unwanted intro by setting loopStart; browser handles the
      // crossfade-free seamless loop at no JS cost whatsoever.
      source.loopStart = startOffsetSec;
      source.loopEnd   = decoded.duration;
      source.connect(gainNode);
      source.start(0, startOffsetSec);

      // Stop any previous source for this key
      if (this.extendedSources[key]) {
        try { this.extendedSources[key].stop(); } catch (e) { }
      }
      this.extendedSources[key] = source;
      this.extendedGains[key]   = gainNode;
    } catch (e) {
      // Silently fall back to HTMLAudioElement loop if fetch/decode fails
    }
  }

  resume() {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    // Only restart ambient SFX loops if the site is fully booted.
    // During the preloader hold interaction the AudioContext must resume
    // (browser autoplay policy requires a user gesture) but ambient tracks
    // stay silent until startAmbientLoops() is called after boot completes.
    if (this.isBooted) {
      Object.values(this.sfxTracks).forEach(track => {
        if (track.paused && track.loop) {
          track.play().catch(() => { });
        }
      });
    }
  }

  // Called once hold-to-enter completes — arms all ambient looping SFX tracks.
  startAmbientLoops() {
    this.isBooted = true;
    Object.values(this.sfxTracks).forEach(track => {
      if (track.loop) {
        track.play().catch(() => { });
      }
    });
  }

  suspend() {
    if (!this.ctx) return;
    if (this.ctx.state === "running") {
      this.ctx.suspend();
    }
    Object.values(this.sfxTracks).forEach(track => {
      track.pause();
    });
  }

  startDrone() {
    if (!this.ctx || !this.masterGain) return;
    if (this.cavernOsc) return; // Prevent double-triggering

    const t = this.ctx.currentTime;

    // --- PROCEDURAL AMBIENT HUM ---
    this.cavernGain = this.ctx.createGain();
    this.cavernGain.gain.setValueAtTime(0.0, t); // Fade in managed by updateState
    this.cavernGain.connect(this.masterGain);

    // Deep cinematic background low air hum (sine at 70Hz)
    this.cavernOsc = this.ctx.createOscillator();
    this.cavernOsc.type = "sine";
    this.cavernOsc.frequency.setValueAtTime(70, t);
    this.cavernOsc.connect(this.cavernGain);

    this.cavernOsc.start(t);
  }

  playGlitch() {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const t = this.ctx.currentTime;

    // Synthesize a digital glitch sound
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.2);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.3);
  }

  // private startAntFootsteps() {}
  // private startWaterDrops() {}

  // Generate procedural organic clicks for ant walking rhythm
  private startAntFootsteps() {
    let tickCount = 0;
    this.antTickInterval = setInterval(() => {
      if (!this.ctx || this.isMuted || !this.antGain || this.antGain.gain.value < 0.02) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      // Alternating footsteps frequency
      osc.frequency.setValueAtTime(tickCount % 2 === 0 ? 800 : 600, t);

      // Footstep envelope (very short click)
      gain.gain.setValueAtTime(0.02, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

      osc.connect(gain);
      gain.connect(this.antGain);

      osc.start(t);
      osc.stop(t + 0.025);

      tickCount++;
    }, 180); // walking pace
  }

  // Synthesize cavern dripping water echoing in delay loop
  private startWaterDrops() {
    this.waterDropInterval = setInterval(() => {
      if (!this.ctx || this.isMuted || !this.cavernGain || this.cavernGain.gain.value < 0.02) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      const startFreq = 1000 + Math.random() * 800;
      osc.frequency.setValueAtTime(startFreq, t);
      // Fast pitch sweep down representing drop splash
      osc.frequency.exponentialRampToValueAtTime(startFreq * 0.5, t + 0.08);

      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.cavernDelay!); // Feed into delay loop for echo
      gain.connect(this.cavernGain!);  // Also play direct drop sound

      osc.start(t);
      osc.stop(t + 0.09);
    }, 1200 + Math.random() * 2000); // Random drop interval
  }

  // Crossfade channels based on scroll progress and speed
  updateState(progress: number, speed: number) {
    if (!this.ctx || !this.isInitialized) return;
    const t = this.ctx.currentTime;

    // Cross-fade calculations
    let skyVol = 0;
    let groundVol = 0;
    let cavernVol = 0;
    let newFold = null;

    if (!this.isAscending) {
      if (progress < 0.35) {
        // Sky Stage
        const blend = progress / 0.35;
        skyVol = 1.0 - blend;
        groundVol = blend;
        newFold = 'sky';
      } else if (progress < 0.58) {
        // Ground Stage
        const blend = (progress - 0.35) / 0.23;
        groundVol = 1.0 - blend;
        cavernVol = blend;
        newFold = 'ground';
      } else {
        // Cavern Stage
        cavernVol = 1.0;
        newFold = 'cavern';
      }
    }

    if (this.activeFold !== newFold && newFold !== null) {
      this.activeFold = newFold;
      // Restart the tracks for this fold so they don't start in the middle!
      if (newFold === 'sky') {
        if (this.sfxTracks['bee']) this.sfxTracks['bee'].currentTime = 0;
      }
      // Note: drone, ant, spider are extended Web Audio buffers — no currentTime reset needed
    }

    // Apply external SFX looping volumes
    if (this.sfxTracks['bee']) this.sfxTracks['bee'].volume = this.isMuted ? 0 : (!this.isMachine ? skyVol * 0.4 : 0);

    // Extended-loop gain nodes — driven exclusively via Web Audio decoded buffers.
    const droneVol = this.isMuted ? 0 : (this.isMachine ? skyVol * 0.4 : 0);
    const antVol = this.isMuted ? 0 : groundVol * 0.45; // Wind — dominant ground sound
    const spiderVol = this.isMuted ? 0 : cavernVol * 0.10; // Cavern — subtle under the cave hum
    if (this.extendedGains['drone']) this.extendedGains['drone'].gain.setTargetAtTime(droneVol, t, 0.1);
    if (this.extendedGains['ant']) this.extendedGains['ant'].gain.setTargetAtTime(antVol, t, 0.1);
    if (this.extendedGains['spider']) this.extendedGains['spider'].gain.setTargetAtTime(spiderVol, t, 0.1);

    // Ambient Hum volume (muted in space)
    if (this.cavernGain) {
      const ambientVol = this.isAscending ? 0 : 0.08; // 0 in space, 0.08 otherwise
      this.cavernGain.gain.setTargetAtTime(this.isMuted ? 0 : ambientVol, t, 0.2);
    }
  }


  // --- EXTERNAL AUDIO METHODS ---
  private initExternalAudio() {
    if (typeof window === "undefined") return;

    // The user provided specific subtle SFX files.
    // NOTE: drone, ant/ground, and spider/cavern are intentionally omitted —
    // they are handled exclusively by buildExtendedLoop() via Web Audio
    // to avoid double-playing, get longer seamless loops, and apply start-offset trims.
    const sfxFiles: { [key: string]: string } = {
      bee: '/audio/bee.m4a',
      // drone:  handled by buildExtendedLoop
      // ant:    handled by buildExtendedLoop
      rover: '/audio/ground.m4a',
      // spider: handled by buildExtendedLoop (with 2s offset trim)
      // spy:    handled by buildExtendedLoop (with 2s offset trim)
      space_transition: '/audio/space.m4a',
      face: '/audio/space.m4a',
      id_card: '/audio/space.m4a'
    };

    Object.entries(sfxFiles).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto'; // FORCE PRELOAD!
      if (key !== 'space_transition' && key !== 'face' && key !== 'id_card') {
        audio.loop = true; // Set to loop
      }
      audio.volume = 0; // Handled dynamically
      this.sfxTracks[key] = audio;
    });
  }

  playSFX(key: string, volume: number = 0.5) {
    if (this.isMuted) return;
    const sfx = this.sfxTracks[key];
    if (sfx) {
      sfx.volume = volume;
      sfx.currentTime = 0;
      sfx.play().catch(() => { });
    }
  }

  // Start the space ambient track at the given volume on the /founder page.
  // Handles both entry paths:
  //   • Via transition  → track is already playing, just fade the volume down.
  //   • Direct page load → track hasn't started, play from the beginning.
  fadeSpaceTransition(targetVolume: number, durationMs = 800) {
    // Ensure the engine is ready (safe to call multiple times)
    if (!this.isInitialized) this.init();
    const sfx = this.sfxTracks['space_transition'];
    if (!sfx) return;
    if (this.isMuted) { sfx.volume = 0; return; }
    if (sfx.paused) {
      // Either never started (direct load) or briefly paused during navigation.
      // Reset to beginning only if it truly hasn't played yet.
      if (sfx.currentTime === 0) sfx.currentTime = 0; // already 0, no-op, just explicit
      sfx.volume = targetVolume;
      sfx.play().catch(() => { });
      return;
    }
    // Already playing from the transition — just smoothly adjust volume.
    this.fadeAudio(sfx, 'space_transition_fade', targetVolume, durationMs);
  }


  stopSFX(key: string) {
    const sfx = this.sfxTracks[key];
    if (sfx) {
      sfx.pause();
    }
  }

  crossfadeBGM(targetKey: string | null) {
    // Disabled as per user request to keep only procedural ambient background music
  }

  private fadeAudio(audio: HTMLAudioElement, key: string, targetVolume: number, durationMs: number) {
    if (this.fadeIntervals[key]) {
      clearInterval(this.fadeIntervals[key]);
    }

    const steps = 20;
    const stepTime = durationMs / steps;
    const startVolume = audio.volume;
    const volumeStep = (targetVolume - startVolume) / steps;

    let currentStep = 0;
    this.fadeIntervals[key] = setInterval(() => {
      currentStep++;
      let newVol = startVolume + (volumeStep * currentStep);
      newVol = Math.max(0, Math.min(1, newVol));
      audio.volume = newVol;

      if (currentStep >= steps) {
        clearInterval(this.fadeIntervals[key]);
        if (targetVolume === 0) {
          audio.pause();
        }
      }
    }, stepTime);
  }

  // Legacy fallback compatibility
  setScrollTempo(speed: number) { }

  playRiser(duration: number) {
    if (!this.ctx || !this.masterGain) return;
    this.stopRiser(); // Clean up any running riser

    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + duration);

    // Dynamic wave-distortion
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.makeDistortionCurve(60);
    shaper.oversample = "4x";

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(180, t);
    filter.frequency.exponentialRampToValueAtTime(2500, t + duration);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.001, t);
    gainNode.gain.exponentialRampToValueAtTime(0.35, t + duration * 0.85);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(shaper);
    shaper.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);

    this.activeRiserOsc = osc;
    this.activeRiserGain = gainNode;
  }

  stopRiser() {
    if (this.ctx && this.activeRiserGain && this.activeRiserOsc) {
      const t = this.ctx.currentTime;
      try {
        this.activeRiserGain.gain.cancelScheduledValues(t);
        this.activeRiserGain.gain.setValueAtTime(this.activeRiserGain.gain.value, t);
        this.activeRiserGain.gain.linearRampToValueAtTime(0.001, t + 0.1);
        const osc = this.activeRiserOsc;
        setTimeout(() => {
          try { osc.stop(); } catch (e) { }
        }, 120);
      } catch (e) { }
    }
    this.activeRiserOsc = null;
    this.activeRiserGain = null;
  }

  private makeDistortionCurve(amount: number) {
    const k = typeof amount === "number" ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  playTransitionDrop() {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.75);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.25, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

    osc.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.75);
  }

  playGlitchClick() {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.04;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1800, t);
    filter.Q.setValueAtTime(5, t);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.04, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    noise.start(t);
  }

  playKeypressClick() {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(950 + Math.random() * 200, t);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.012, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

    osc.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.015);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    // Toggle external audio volume
    Object.values(this.sfxTracks).forEach(audio => {
      if (this.isMuted) audio.volume = 0;
    });

    if (this.isMuted) {
      Object.values(this.bgmTracks).forEach(audio => { audio.volume = 0; });
    } else if (this.currentBgmKey && this.bgmTracks[this.currentBgmKey]) {
      this.fadeAudio(this.bgmTracks[this.currentBgmKey], this.currentBgmKey, 0.4, 500);
    }

    if (this.ctx && this.masterGain) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
      this.masterGain.gain.linearRampToValueAtTime(this.isMuted ? 0 : 0.25, t + 0.35);
    }
    return this.isMuted;
  }
}

export const audio = new AudioEngine();
