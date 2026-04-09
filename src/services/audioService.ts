/**
 * Web Audio API service for ambient soundscapes and contextual sound effects.
 * Ambient audio prefers pre-recorded MP3 loops from /audio/ambient/{category}.mp3.
 * Falls back to warm musical pad synthesis when audio files aren't available.
 * Sound effects are always synthesized procedurally.
 */

// ─── AudioContext singleton ──────────────────────────────────────

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let ambientGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);

    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.3;
    sfxGain.connect(masterGain);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────────

function noiseBuffer(seconds: number): AudioBuffer {
  const c = getCtx();
  const frames = c.sampleRate * seconds;
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}


/** Generate brownian (red) noise — much smoother than white noise. */
function brownianNoiseBuffer(seconds: number): AudioBuffer {
  const c = getCtx();
  const frames = c.sampleRate * seconds;
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < frames; i++) {
    v += (Math.random() * 2 - 1) * 0.06;
    v = Math.max(-1, Math.min(1, v));
    d[i] = v;
  }
  return buf;
}

/** Slowly ramp a param to a target over `dur` seconds. */
function ramp(param: AudioParam, target: number, dur: number) {
  param.setTargetAtTime(target, getCtx().currentTime, dur / 3);
}

// ─── Ambient Soundscape Engine ───────────────────────────────────
// Prefers pre-recorded audio files from /audio/ambient/{category}.mp3.
// Falls back to warm musical pad synthesis when files aren't available.

export type AmbientCategory =
  | 'nature' | 'ocean' | 'space' | 'peaceful'
  | 'mysterious' | 'dramatic' | 'adventure' | 'celebration';

interface AmbientHandle { stop(): void }

let currentAmbient: AmbientHandle | null = null;
let currentCategory: AmbientCategory | null = null;

// ── Audio file cache ─────────────────────────────────────────────

const audioFileCache = new Map<string, AudioBuffer | false>();

async function tryLoadAudioFile(category: AmbientCategory): Promise<AudioBuffer | null> {
  const cached = audioFileCache.get(category);
  if (cached === false) return null;
  if (cached) return cached;
  // Try MP3 first, then OGG
  for (const ext of ['mp3', 'ogg']) {
    try {
      const res = await fetch(`/audio/ambient/${category}.${ext}`);
      if (!res.ok) continue;
      const buf = await getCtx().decodeAudioData(await res.arrayBuffer());
      audioFileCache.set(category, buf);
      return buf;
    } catch { continue; }
  }
  audioFileCache.set(category, false);
  return null;
}

function playAudioFile(buffer: AudioBuffer): AmbientHandle {
  const c = getCtx();
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(ambientGain!);
  source.start();
  return { stop() { try { source.stop(); } catch { /* ok */ } } };
}

// ── Musical pad synthesis (fallback) ─────────────────────────────

function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

interface PadConfig {
  notes: number[];
  waveform: OscillatorType;
  detuneSpread: number;
  filterFreq: number;
  filterLfoFreq: number;
  filterLfoDepth: number;
  attackTime: number;
  voiceVolume: number;
  useNoise?: boolean;
  noiseVolume?: number;
}

// Each category maps to a warm chord played with detuned oscillators
// through a slowly-modulated lowpass filter + subtle delay reverb.
const PAD_CONFIGS: Record<AmbientCategory, PadConfig> = {
  nature: {
    notes: [60, 64, 67, 72],       // C E G C' (C major — bright, open)
    waveform: 'sine', detuneSpread: 6, filterFreq: 1800,
    filterLfoFreq: 0.05, filterLfoDepth: 400, attackTime: 4,
    voiceVolume: 0.025, useNoise: true, noiseVolume: 0.035,
  },
  ocean: {
    notes: [48, 53, 60, 65],       // C3 F3 C4 F4 (deep, flowing)
    waveform: 'sine', detuneSpread: 10, filterFreq: 1200,
    filterLfoFreq: 0.04, filterLfoDepth: 500, attackTime: 5,
    voiceVolume: 0.02, useNoise: true, noiseVolume: 0.05,
  },
  space: {
    notes: [45, 52, 57, 64],       // A2 E3 A3 E4 (open fifths — ethereal)
    waveform: 'sine', detuneSpread: 15, filterFreq: 2500,
    filterLfoFreq: 0.02, filterLfoDepth: 800, attackTime: 6,
    voiceVolume: 0.02,
  },
  peaceful: {
    notes: [55, 59, 62, 67],       // G3 B3 D4 G4 (G major — gentle)
    waveform: 'sine', detuneSpread: 5, filterFreq: 2000,
    filterLfoFreq: 0.06, filterLfoDepth: 300, attackTime: 3,
    voiceVolume: 0.025,
  },
  mysterious: {
    notes: [46, 53, 58, 61],       // Bb2 F3 Bb3 Db4 (Bb minor — dark)
    waveform: 'triangle', detuneSpread: 12, filterFreq: 1000,
    filterLfoFreq: 0.03, filterLfoDepth: 300, attackTime: 5,
    voiceVolume: 0.02,
  },
  dramatic: {
    notes: [45, 48, 52, 57],       // A2 C3 E3 A3 (A minor — tense)
    waveform: 'triangle', detuneSpread: 8, filterFreq: 1500,
    filterLfoFreq: 0.07, filterLfoDepth: 600, attackTime: 4,
    voiceVolume: 0.025, useNoise: true, noiseVolume: 0.02,
  },
  adventure: {
    notes: [52, 56, 59, 64],       // E3 G#3 B3 E4 (E major — energetic)
    waveform: 'triangle', detuneSpread: 5, filterFreq: 2500,
    filterLfoFreq: 0.08, filterLfoDepth: 500, attackTime: 3,
    voiceVolume: 0.025,
  },
  celebration: {
    notes: [62, 66, 69, 74],       // D4 F#4 A4 D5 (D major — joyful)
    waveform: 'sine', detuneSpread: 4, filterFreq: 3000,
    filterLfoFreq: 0.1, filterLfoDepth: 500, attackTime: 2,
    voiceVolume: 0.02,
  },
};

function createMusicalPad(config: PadConfig): AmbientHandle {
  const c = getCtx();
  const dest = ambientGain!;
  const allNodes: (OscillatorNode | AudioBufferSourceNode)[] = [];

  // Lowpass filter for warmth
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = config.filterFreq;
  filter.Q.value = 0.7;
  filter.connect(dest);

  // Slow LFO modulates filter cutoff for gentle movement
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = config.filterLfoFreq;
  const lfoGain = c.createGain();
  lfoGain.gain.value = config.filterLfoDepth;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  allNodes.push(lfo);

  // Simple feedback delay for subtle reverb / spaciousness
  const delay = c.createDelay(1);
  delay.delayTime.value = 0.3;
  const feedback = c.createGain();
  feedback.gain.value = 0.2;
  delay.connect(feedback);
  feedback.connect(delay);
  const delayMix = c.createGain();
  delayMix.gain.value = 0.15;
  delay.connect(delayMix);
  delayMix.connect(filter);

  // Two detuned oscillators per note create a warm "unison" pad
  for (const note of config.notes) {
    const freq = midiToFreq(note);
    for (const det of [-config.detuneSpread, config.detuneSpread]) {
      const osc = c.createOscillator();
      osc.type = config.waveform;
      osc.frequency.value = freq;
      osc.detune.value = det;
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(
        config.voiceVolume / config.notes.length,
        c.currentTime,
        config.attackTime / 3,
      );
      osc.connect(g);
      g.connect(filter);
      g.connect(delay);
      osc.start();
      allNodes.push(osc);
    }
  }

  // Optional smooth brownian noise texture (nature, ocean, dramatic)
  if (config.useNoise && config.noiseVolume) {
    const noiseBuf = brownianNoiseBuffer(8);
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const nFilt = c.createBiquadFilter();
    nFilt.type = 'lowpass';
    nFilt.frequency.value = 600;
    nFilt.Q.value = 0.5;
    const ng = c.createGain();
    ng.gain.value = 0;
    ng.gain.setTargetAtTime(config.noiseVolume, c.currentTime, config.attackTime / 3);
    src.connect(nFilt).connect(ng).connect(dest);
    src.start();
    allNodes.push(src);
  }

  return {
    stop() {
      allNodes.forEach((n) => { try { n.stop(); } catch { /* ok */ } });
    },
  };
}

// ─── Ambient Public API ──────────────────────────────────────────

const AMBIENT_FADE_SEC = 2;

export async function startAmbient(category: AmbientCategory): Promise<void> {
  if (currentCategory === category && currentAmbient) return;
  stopAmbient();
  getCtx();
  currentCategory = category;

  // Try pre-recorded audio files first, fall back to pad synthesis
  const buffer = await tryLoadAudioFile(category);
  if (currentCategory !== category) return; // category changed while loading

  currentAmbient = buffer
    ? playAudioFile(buffer)
    : createMusicalPad(PAD_CONFIGS[category]);

  ramp(ambientGain!.gain, 0.12, AMBIENT_FADE_SEC);
}

export function stopAmbient(): void {
  if (!currentAmbient) return;
  const handle = currentAmbient;
  currentAmbient = null;
  currentCategory = null;
  if (ambientGain) {
    ramp(ambientGain.gain, 0, AMBIENT_FADE_SEC);
    setTimeout(() => handle.stop(), AMBIENT_FADE_SEC * 1000 + 200);
  } else {
    handle.stop();
  }
}

export function isAmbientPlaying(): boolean {
  return currentAmbient !== null;
}

// ─── Sound Effects Engine ────────────────────────────────────────

export type SoundEffect =
  | 'falling' | 'splash' | 'honk' | 'thunder' | 'wind' | 'rain'
  | 'bark' | 'roar' | 'bell' | 'whistle' | 'bird' | 'whoosh'
  | 'knock' | 'pop' | 'buzz' | 'boom' | 'gallop' | 'wave'
  | 'cheer' | 'fire' | 'ding' | 'creak' | 'snap' | 'engine'
  | 'scream';

function sfxFalling() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'sine';
  const t = c.currentTime;
  osc.frequency.setValueAtTime(1200, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.8);
  const g = c.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.linearRampToValueAtTime(0.001, t + 1);
  osc.connect(g).connect(sfxGain!);
  osc.start(t);
  osc.stop(t + 1.1);
}

function sfxSplash() {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(0.4);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3000;
  bp.Q.value = 1;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  src.connect(bp).connect(g).connect(sfxGain!);
  src.start(t);
}

function sfxHonk() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 350;
  const osc2 = c.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = 440;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.15, t);
  g.gain.setValueAtTime(0.15, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(g).connect(sfxGain!);
  osc2.connect(g);
  osc.start(t);
  osc2.start(t);
  osc.stop(t + 0.42);
  osc2.stop(t + 0.42);
}

function sfxThunder() {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(2);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 200;
  lp.Q.value = 3;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
  src.connect(lp).connect(g).connect(sfxGain!);
  src.start(t);
}

function sfxWind() {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(1.5);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 600;
  bp.Q.value = 0.3;
  const t = c.currentTime;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(1500, t + 0.6);
  bp.frequency.exponentialRampToValueAtTime(400, t + 1.3);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.3);
  g.gain.linearRampToValueAtTime(0.001, t + 1.4);
  src.connect(bp).connect(g).connect(sfxGain!);
  src.start(t);
}

function sfxRain() {
  const c = getCtx();
  let count = 0;
  const total = 30;
  function drop() {
    if (count >= total) return;
    count++;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.02);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000 + Math.random() * 4000;
    bp.Q.value = 5;
    const g = c.createGain();
    g.gain.value = 0.05 + Math.random() * 0.1;
    src.connect(bp).connect(g).connect(sfxGain!);
    src.start();
    setTimeout(drop, 30 + Math.random() * 80);
  }
  drop();
}

function sfxBark() {
  const c = getCtx();
  const t = c.currentTime;
  for (let i = 0; i < 2; i++) {
    const offset = i * 0.2;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t + offset);
    osc.frequency.exponentialRampToValueAtTime(150, t + offset + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0.2, t + offset);
    g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.1);
    osc.connect(g).connect(sfxGain!);
    osc.start(t + offset);
    osc.stop(t + offset + 0.12);
  }
}

function sfxRoar() {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(1.2);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 300;
  lp.Q.value = 5;
  const t = c.currentTime;
  lp.frequency.setValueAtTime(100, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.2);
  lp.frequency.exponentialRampToValueAtTime(150, t + 1);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  src.connect(lp).connect(g).connect(sfxGain!);
  src.start(t);
}

function sfxBell() {
  const c = getCtx();
  const t = c.currentTime;
  const freqs = [800, 1600, 2400]; // fundamental + harmonics
  for (const f of freqs) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(f === 800 ? 0.2 : 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2);
    osc.connect(g).connect(sfxGain!);
    osc.start(t);
    osc.stop(t + 2.1);
  }
}

function sfxWhistle() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'sine';
  const t = c.currentTime;
  osc.frequency.setValueAtTime(1200, t);
  osc.frequency.linearRampToValueAtTime(1800, t + 0.15);
  osc.frequency.linearRampToValueAtTime(1400, t + 0.4);
  // Vibrato
  const vib = c.createOscillator();
  vib.type = 'sine';
  vib.frequency.value = 6;
  const vibG = c.createGain();
  vibG.gain.value = 20;
  vib.connect(vibG).connect(osc.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.2, t);
  g.gain.linearRampToValueAtTime(0.001, t + 0.5);
  osc.connect(g).connect(sfxGain!);
  osc.start(t);
  vib.start(t);
  osc.stop(t + 0.55);
  vib.stop(t + 0.55);
}

function sfxBird() {
  const c = getCtx();
  const t = c.currentTime;
  for (let i = 0; i < 3; i++) {
    const off = i * 0.12;
    const osc = c.createOscillator();
    osc.type = 'sine';
    const base = 3000 + Math.random() * 1500;
    osc.frequency.setValueAtTime(base, t + off);
    osc.frequency.exponentialRampToValueAtTime(base * 1.3, t + off + 0.04);
    osc.frequency.exponentialRampToValueAtTime(base * 0.6, t + off + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t + off);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.1);
    osc.connect(g).connect(sfxGain!);
    osc.start(t + off);
    osc.stop(t + off + 0.11);
  }
}

function sfxWhoosh() {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(0.5);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2;
  const t = c.currentTime;
  bp.frequency.setValueAtTime(200, t);
  bp.frequency.exponentialRampToValueAtTime(6000, t + 0.2);
  bp.frequency.exponentialRampToValueAtTime(800, t + 0.4);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  src.connect(bp).connect(g).connect(sfxGain!);
  src.start(t);
}

function sfxKnock() {
  const c = getCtx();
  const t = c.currentTime;
  for (let i = 0; i < 3; i++) {
    const off = i * 0.18;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.05);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    lp.Q.value = 8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.3, t + off);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.08);
    src.connect(lp).connect(g).connect(sfxGain!);
    src.start(t + off);
  }
}

function sfxPop() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'sine';
  const t = c.currentTime;
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(g).connect(sfxGain!);
  osc.start(t);
  osc.stop(t + 0.1);
}

function sfxBuzz() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 150;
  // FM buzz modulation
  const mod = c.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = 80;
  const modG = c.createGain();
  modG.gain.value = 40;
  mod.connect(modG).connect(osc.frequency);
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.1);
  g.gain.linearRampToValueAtTime(0.12, t + 0.4);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  osc.connect(g).connect(sfxGain!);
  osc.start(t);
  mod.start(t);
  osc.stop(t + 0.65);
  mod.stop(t + 0.65);
}

function sfxBoom() {
  const c = getCtx();
  // Low sine thud
  const osc = c.createOscillator();
  osc.type = 'sine';
  const t = c.currentTime;
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
  const g1 = c.createGain();
  g1.gain.setValueAtTime(0.4, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 1);
  osc.connect(g1).connect(sfxGain!);
  osc.start(t);
  osc.stop(t + 1.1);
  // Noise burst overlay
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(0.6);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 300;
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.3, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  src.connect(lp).connect(g2).connect(sfxGain!);
  src.start(t);
}

function sfxGallop() {
  const c = getCtx();
  const t = c.currentTime;
  const pattern = [0, 0.15, 0.35, 0.5, 0.65, 0.8]; // galloping rhythm
  for (const off of pattern) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.04);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    lp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.2, t + off);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.06);
    src.connect(lp).connect(g).connect(sfxGain!);
    src.start(t + off);
  }
}

function sfxWave() {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(2.5);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  const t = c.currentTime;
  lp.frequency.setValueAtTime(200, t);
  lp.frequency.linearRampToValueAtTime(1500, t + 0.8);
  lp.frequency.linearRampToValueAtTime(200, t + 2.2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.25, t + 0.5);
  g.gain.linearRampToValueAtTime(0.001, t + 2.3);
  src.connect(lp).connect(g).connect(sfxGain!);
  src.start(t);
}

function sfxCheer() {
  const c = getCtx();
  const t = c.currentTime;
  // Multiple layered noise bursts simulating voices
  for (let i = 0; i < 5; i++) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(1.5);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800 + Math.random() * 2000;
    bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.1);
    g.gain.setValueAtTime(0.06, t + 1);
    g.gain.linearRampToValueAtTime(0.001, t + 1.4);
    src.connect(bp).connect(g).connect(sfxGain!);
    src.start(t + Math.random() * 0.1);
  }
}

function sfxFire() {
  const c = getCtx();
  const t = c.currentTime;
  let count = 0;
  const total = 20;
  function crackle() {
    if (count >= total) return;
    count++;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.03);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1000 + Math.random() * 3000;
    bp.Q.value = 8;
    const g = c.createGain();
    g.gain.value = 0.08 + Math.random() * 0.12;
    src.connect(bp).connect(g).connect(sfxGain!);
    src.start();
    setTimeout(crackle, 40 + Math.random() * 120);
  }
  crackle();
  // Low fire bed
  const bed = c.createBufferSource();
  bed.buffer = noiseBuffer(1.5);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  const bg = c.createGain();
  bg.gain.setValueAtTime(0.001, t);
  bg.gain.linearRampToValueAtTime(0.15, t + 0.2);
  bg.gain.linearRampToValueAtTime(0.001, t + 1.4);
  bed.connect(lp).connect(bg).connect(sfxGain!);
  bed.start(t);
}

function sfxDing() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 1200;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  osc.connect(g).connect(sfxGain!);
  osc.start(t);
  osc.stop(t + 0.85);
}

function sfxCreak() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  const t = c.currentTime;
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.linearRampToValueAtTime(200, t + 0.3);
  osc.frequency.linearRampToValueAtTime(100, t + 0.5);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  lp.Q.value = 5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  osc.connect(lp).connect(g).connect(sfxGain!);
  osc.start(t);
  osc.stop(t + 0.6);
}

function sfxSnap() {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(0.015);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2000;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  src.connect(hp).connect(g).connect(sfxGain!);
  src.start(t);
}

function sfxEngine() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 60;
  // Rumble modulation
  const mod = c.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = 8;
  const modG = c.createGain();
  modG.gain.value = 10;
  mod.connect(modG).connect(osc.frequency);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 300;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.15, t + 0.2);
  g.gain.setValueAtTime(0.15, t + 0.8);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  osc.connect(lp).connect(g).connect(sfxGain!);
  osc.start(t);
  mod.start(t);
  osc.stop(t + 1.25);
  mod.stop(t + 1.25);
}

function sfxScream() {
  const c = getCtx();
  const t = c.currentTime;
  // Cartoonish descending scream — frequency-modulated
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(300, t + 0.6);
  // Vibrato for scream quality
  const vib = c.createOscillator();
  vib.type = 'sine';
  vib.frequency.value = 12;
  const vibG = c.createGain();
  vibG.gain.value = 40;
  vib.connect(vibG).connect(osc.frequency);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200;
  bp.Q.value = 2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.18, t + 0.05);
  g.gain.setValueAtTime(0.18, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  osc.connect(bp).connect(g).connect(sfxGain!);
  osc.start(t);
  vib.start(t);
  osc.stop(t + 0.75);
  vib.stop(t + 0.75);
}

const sfxMap: Record<SoundEffect, () => void> = {
  falling: sfxFalling,
  splash: sfxSplash,
  honk: sfxHonk,
  thunder: sfxThunder,
  wind: sfxWind,
  rain: sfxRain,
  bark: sfxBark,
  roar: sfxRoar,
  bell: sfxBell,
  whistle: sfxWhistle,
  bird: sfxBird,
  whoosh: sfxWhoosh,
  knock: sfxKnock,
  pop: sfxPop,
  buzz: sfxBuzz,
  boom: sfxBoom,
  gallop: sfxGallop,
  wave: sfxWave,
  cheer: sfxCheer,
  fire: sfxFire,
  ding: sfxDing,
  creak: sfxCreak,
  snap: sfxSnap,
  engine: sfxEngine,
  scream: sfxScream,
};

// ─── SFX Public API ──────────────────────────────────────────────

/** Play a one-shot sound effect. Unknown names produce a fallback "ding". */
export function playSoundEffect(name: string): void {
  getCtx(); // ensure context + user-gesture resume
  const fn = sfxMap[name as SoundEffect] ?? sfxDing;
  try { fn(); } catch { /* best-effort */ }
}

/** All known sound-effect names (useful for prompt engineering). */
export const SOUND_EFFECT_NAMES: readonly string[] = Object.keys(sfxMap);
