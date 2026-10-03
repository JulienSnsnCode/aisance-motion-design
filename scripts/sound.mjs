// Sound for a Motion piece: synthesized beat-locked music bed + sound effects, mixed under the video.
// No samples, no licence: everything is synthesized here, deterministic (seeded noise).
//
// usage: node sound.mjs <piece.html> <video.mp4> <out.mp4> [--stems dir] [--no-music] [--no-sfx]
//        node sound.mjs --bank <dir>            write the sfx bank as WAVs (to listen to them)
//
// The piece declares its sound (see SKILL.md "Son"):
//   Motion.run({ ..., music: { intro: 1, breaks: [4], outro: true, vol: 0.55, prog: [1,2,3,0], lead: [[beat, midi, beats, vol?], ...] }
//                       | { file: 'assets/track.mp3', start: 0, vol: 0.8 } | false,
//   prog = chord order by bar (0 Am, 1 F, 2 C, 3 G, cycled); lead = melody notes in ABSOLUTE beats (the jingle hook / sonic logo).
//                scenes: [{ ..., sfx: [[beat, 'name', vol?, { align: 'end' }?], ...] }] })
// Cue times are in BEATS from the scene start, the same expressions as the animation, so sound never drifts.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SR = 48000;
const TAU = Math.PI * 2;

// ---------- utils ----------
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; }; }
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
function normalize(b, peak = 0.5) { let m = 1e-9; for (const x of b) m = Math.max(m, Math.abs(x)); for (let i = 0; i < b.length; i++) b[i] = (b[i] / m) * peak; return b; }
function add(dst, src, at, gain = 1) { const o = Math.round(at * SR); for (let i = 0; i < src.length; i++) { const j = o + i; if (j >= 0 && j < dst.length) dst[j] += src[i] * gain; } }
function wav(path, b) {
  const data = Buffer.alloc(44 + b.length * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + b.length * 2, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(b.length * 2, 40);
  for (let i = 0; i < b.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b[i])) * 32767), 44 + i * 2);
  writeFileSync(path, data);
}
// one-pole low-pass with a cutoff (Hz) that may vary per sample
function lowpass(b, cutoff) { let y = 0; for (let i = 0; i < b.length; i++) { const fc = typeof cutoff === 'function' ? cutoff(i / SR) : cutoff; const a = 1 - Math.exp((-TAU * fc) / SR); y += a * (b[i] - y); b[i] = y; } return b; }
function highpass(b, cutoff) { const lp = lowpass(Float32Array.from(b), cutoff); for (let i = 0; i < b.length; i++) b[i] -= lp[i]; return b; }

// ---------- sound-effect bank ----------
// Five sounds follow the aisance-reel bank (click, pop, tick, whoosh, ding); the rest are motion-specific.
const BANK = {
  click() { const r = rng(1), b = buf(0.025); let p = 0; for (let i = 0; i < b.length; i++) { const t = i / SR, n = r(); b[i] = (0.6 * (n - p) + 0.4 * Math.sin(TAU * 3200 * t)) * Math.exp(-t / 0.004); p = n; } return normalize(b); },
  pop() { const b = buf(0.09); let ph = 0; for (let i = 0; i < b.length; i++) { const t = i / SR; ph += (TAU * (300 + 600 * Math.exp(-t / 0.02))) / SR; b[i] = Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.025); } return normalize(b); },
  tick() { const b = buf(0.035); for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] = Math.sin(TAU * 2400 * t) * Math.exp(-t / 0.006); } return normalize(b); },
  whoosh() { const r = rng(7), b = buf(0.45); let lp = 0; for (let i = 0; i < b.length; i++) { const u = i / b.length, a = 0.02 + 0.25 * Math.sin(Math.PI * u); lp += a * (r() - lp); b[i] = lp * Math.sin(Math.PI * u) ** 1.5; } return normalize(b); },
  ding() { const b = buf(0.6); for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] = (Math.sin(TAU * 1320 * t) + 0.45 * Math.sin(TAU * 1980 * t) + 0.2 * Math.sin(TAU * 2640 * t)) * Math.min(1, t / 0.003) * Math.exp(-t / 0.18); } return normalize(b); },
  // fast swish for slams and quick moves: brighter and shorter than the whoosh
  swish() { const r = rng(11), b = buf(0.2); for (let i = 0; i < b.length; i++) b[i] = r(); highpass(b, 900); lowpass(b, (t) => 1500 + 9000 * Math.sin(Math.PI * Math.min(1, t / 0.2))); for (let i = 0; i < b.length; i++) { const u = i / b.length; b[i] *= Math.sin(Math.PI * u) ** 2; } return normalize(b); },
  // impact: sub boom + noise transient, for big hits on a downbeat
  impact() { const r = rng(3), b = buf(1.1); let ph = 0; for (let i = 0; i < b.length; i++) { const t = i / SR; ph += (TAU * (42 + 90 * Math.exp(-t / 0.05))) / SR; b[i] = Math.sin(ph) * Math.exp(-t / 0.35) + r() * Math.exp(-t / 0.012) * 0.5; } lowpass(b, 2500); return normalize(b, 0.6); },
  // low thud: an object landing (squash)
  thud() { const b = buf(0.18); let ph = 0; for (let i = 0; i < b.length; i++) { const t = i / SR; ph += (TAU * (70 + 120 * Math.exp(-t / 0.015))) / SR; b[i] = Math.sin(ph) * Math.exp(-t / 0.05); } return normalize(b); },
  // riser: noise + rising tone over ~1 s; cue it with { align: 'end' } so it ENDS on the cut
  riser() { const r = rng(5), d = 1.0, b = buf(d); let ph = 0, lp = 0; for (let i = 0; i < b.length; i++) { const u = i / b.length; ph += (TAU * (200 + 1400 * u * u)) / SR; lp += (0.02 + 0.5 * u * u) * (r() - lp); b[i] = (0.5 * lp + 0.25 * Math.sin(ph)) * u ** 2.2; } return normalize(b); },
  // key: typewriter / keyboard tick, slightly random pitch per hit is done at mix time with the cue index
  key() { const r = rng(9), b = buf(0.03); let p = 0; for (let i = 0; i < b.length; i++) { const t = i / SR, n = r(); b[i] = ((n - p) * 0.7 + Math.sin(TAU * 1800 * t) * 0.3) * Math.exp(-t / 0.005); p = n; } return normalize(b); },
};

// ---------- music bed (beat-locked) ----------
// Am – F – C – G, kick on every beat, clap on 2 and 4, off-beat hats, 8th-note bass ducked by the kick, soft pad.
function music(bpm, bars, opt = {}) {
  const beat = 60 / bpm, bar = beat * 4, dur = bars * bar + 2.5;
  const out = buf(dur), r = rng(42);
  const roots = [110, 87.31, 130.81, 98], chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  const intro = opt.intro ?? 1, breaks = new Set(opt.breaks || []), outro = opt.outro ?? true, prog = opt.prog || [0, 1, 2, 3];
  const kick = (() => { const b = buf(0.4); let ph = 0; for (let i = 0; i < b.length; i++) { const t = i / SR; ph += (TAU * (45 + 110 * Math.exp(-t / 0.03))) / SR; b[i] = Math.sin(ph) * Math.exp(-t / 0.22) + r() * Math.exp(-t / 0.002) * 0.15; } return b; })();
  const clap = (() => { const b = buf(0.25); for (let i = 0; i < b.length; i++) { const t = i / SR, env = [0, 0.011, 0.022].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) / (o === 0.022 ? 0.09 : 0.006)) : 0), 0); b[i] = r() * env; } highpass(b, 800); lowpass(b, 6000); return b; })();
  const hat = (() => { const b = buf(0.05); for (let i = 0; i < b.length; i++) b[i] = r() * Math.exp(-(i / SR) / 0.012); return highpass(b, 7000); })();
  for (let k = 0; k < bars; k++) {
    const t0 = k * bar, ci = prog[k % prog.length], last = outro && k === bars - 1;
    const full = k >= intro && !breaks.has(k) && !last;
    // pad: whole bar, slow attack; on the last bar it rings out
    for (const f of chords[ci]) for (const det of [-0.003, 0.003]) {
      const len = last ? bar + 2.4 : bar + 0.05, b = buf(len);
      for (let i = 0; i < b.length; i++) { const t = i / SR, env = Math.min(1, t / 0.25) * (last ? Math.exp(-t / 1.2) : Math.min(1, (len - t) / 0.08)); b[i] = (Math.sin(TAU * f * (1 + det) * t) + 0.25 * Math.sin(TAU * 2 * f * (1 + det) * t)) * env; }
      add(out, b, t0, 0.035);
    }
    if (last) { add(out, kick, t0, 0.9); continue; }                 // final hit, then only the pad tail
    for (let q = 0; q < 4; q++) {
      const tb = t0 + q * beat;
      if (full) add(out, kick, tb, 0.9);
      if (full && (q === 1 || q === 3)) add(out, clap, tb, 0.32);
      add(out, hat, tb + beat / 2, k < intro ? 0.12 : 0.18);
      // bass: two 8ths per beat, ducked right after each kick (sidechain feel)
      for (let e = 0; e < 2; e++) {
        const len = beat / 2, b = buf(len), f = roots[ci];
        for (let i = 0; i < b.length; i++) { const t = i / SR, saw = 2 * ((f * t) % 1) - 1; b[i] = (saw * 0.6 + Math.sin(TAU * f * t) * 0.6) * Math.min(1, t / 0.004) * Math.exp(-t / 0.16); }
        lowpass(b, full ? 520 : 300);
        add(out, b, tb + e * len, (full && e === 0 ? 0.55 : 0.85) * (k < intro ? 0.6 : 1) * 0.3);
      }
    }
  }
  // lead: bell-pluck melody (sine + harmonics, fast decay) with a dotted-8th echo — the memorable hook of a jingle
  for (const [nb, midi, len = 1, v = 1] of opt.lead || []) {
    const f = 440 * 2 ** ((midi - 69) / 12), d = len * beat + 0.6, b = buf(d);
    for (let i = 0; i < b.length; i++) { const t = i / SR, env = Math.min(1, t / 0.003) * Math.exp(-t / (0.12 + 0.18 * len)); b[i] = (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.08) + 0.18 * Math.sin(TAU * 3 * f * t) * Math.exp(-t / 0.04) + 0.3 * Math.sin(TAU * f * 0.5 * t)) * env; }
    add(out, b, nb * beat, 0.16 * v);
    add(out, b, nb * beat + beat * 0.75, 0.05 * v);
  }
  return normalize(out, 0.7);
}

// ---------- main ----------
const argv = process.argv.slice(2);
if (argv[0] === '--bank') {
  mkdirSync(argv[1], { recursive: true });
  for (const [k, f] of Object.entries(BANK)) wav(join(argv[1], `${k}.wav`), f());
  console.log('bank ->', argv[1], Object.keys(BANK).join(', ')); process.exit(0);
}
const [piece, video, out, ...rest] = argv;
if (!piece || !video || !out) { console.error('usage: node sound.mjs <piece.html> <video.mp4> <out.mp4> [--stems dir] [--no-music] [--no-sfx]'); process.exit(1); }
const flag = (k) => rest.includes(k), opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto('file://' + resolve(piece) + '?paused');
await page.waitForFunction(() => window.__motionReady === true, null, { timeout: 30000 });
const spec = await page.evaluate(() => window.__motion.sound());
await browser.close();

const total = buf(spec.duration);
const stems = opt('--stems');
if (stems) mkdirSync(stems, { recursive: true });

// music: a provided track (licensed, from the user) wins over the synthesized bed
let musicTrack = null;
if (spec.music && !flag('--no-music')) {
  if (spec.music.file) musicTrack = { file: resolve(dirname(resolve(piece)), spec.music.file), start: spec.music.start || 0, vol: spec.music.vol ?? 0.8 };
  else { const m = music(spec.bpm, spec.bars, spec.music); add(total, m.subarray(0, total.length), 0, spec.music.vol ?? 0.55); if (stems) wav(join(stems, 'music.wav'), m); }
}
// sfx
const sfxBus = buf(spec.duration), cache = {};
if (!flag('--no-sfx')) for (const [n, c] of spec.cues.entries()) {
  if (!BANK[c.name]) { console.error(`unknown sfx "${c.name}" (bank: ${Object.keys(BANK).join(', ')})`); continue; }
  const s = (cache[c.name] ||= BANK[c.name]());
  const at = c.align === 'end' ? c.t - s.length / SR : c.t;
  add(sfxBus, s, at, c.vol ?? 0.5);
}
add(total, sfxBus, 0, 1);
// short fade on the very end: no click when the video stops mid-ring
for (let i = 0, n = Math.round(0.12 * SR); i < n; i++) total[total.length - 1 - i] *= i / n;
if (stems) wav(join(stems, 'sfx.wav'), sfxBus);
const tmp = mkdtempSync(join(tmpdir(), 'motion-sound-'));
wav(join(tmp, 'mix.wav'), total);

// mux: optional user track + our mix -> loudness to -14 LUFS (social), true peak -1.5 dB, limiter at -1 dB
const inputs = ['-i', video, '-i', join(tmp, 'mix.wav')];
let fc = '[1:a]anull[m]';
if (musicTrack) {
  inputs.push('-ss', String(musicTrack.start), '-i', musicTrack.file);
  fc = `[2:a]volume=${musicTrack.vol},afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, spec.duration - 0.6)}:d=0.6[t];[1:a][t]amix=inputs=2:normalize=0:duration=first[m]`;
}
// two-pass loudnorm in LINEAR mode: one gain for the whole piece (dynamic mode pumps quiet tails up)
const pass1 = spawnSync('ffmpeg', ['-v', 'info', ...inputs, '-filter_complex', fc + ';[m]loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[a]', '-map', '[a]', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const m = JSON.parse(pass1.slice(pass1.lastIndexOf('{'), pass1.lastIndexOf('}') + 1));
fc += `;[m]loudnorm=I=-14:TP=-1.5:LRA=11:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset},alimiter=limit=0.891:level=false[a]`;
const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
if (r.status) process.exit(r.status);
const vd = spawnSync('ffmpeg', ['-i', out, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/max_volume: (-?[\d.]+) dB/);
console.log(`sound: ${spec.cues.length} cues, music ${musicTrack ? 'track' : spec.music ? 'synth' : 'off'}, max ${vd ? vd[1] : '?'} dB -> ${out}`);
