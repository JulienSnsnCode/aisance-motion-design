// Render a Motion piece to MP4, frame by frame (deterministic, no dropped frames).
// usage: node render.mjs <piece.html> <out.mp4> [--from N] [--to N] [--stills dir --every N] [--mute] [--stems dir]
//        sound is mixed automatically when the piece declares music/sfx (sound.mjs)
//        node render.mjs <piece.html> - --frames 50,120,300 --stills dir   (check frames only, one browser launch)
// needs: playwright (npm i in this folder) + ffmpeg on PATH.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) { console.error('usage: node render.mjs piece.html out.mp4 [--from N] [--to N] [--stills dir --every N]'); process.exit(1); }
const arg = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };

const browser = await chromium.launch();
const page = await browser.newPage();
// surface page errors immediately (otherwise a syntax error only shows up as a 30 s timeout)
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.error('pageerror:', e.message); });
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto('file://' + resolve(input) + '?paused');
try { await page.waitForFunction(() => window.__motionReady === true, null, { timeout: 30000 }); }
catch { console.error('page never became ready' + (errors.length ? ': ' + errors[0] : ' (fonts blocked? Motion.run not called?)')); await browser.close(); process.exit(1); }
const env = await page.evaluate(() => { const e = window.__motion.env; return { w: e.w, h: e.h, fps: e.fps, frames: e.frames }; });
await page.setViewportSize({ width: env.w, height: env.h });
await page.addStyleTag({ content: 'html,body{margin:0;background:#000;overflow:hidden} canvas{position:fixed;inset:0;width:100vw!important;height:100vh!important}' });

const from = +arg('--from', 0), to = +arg('--to', env.frames);
const stills = arg('--stills'), every = +arg('--every', env.fps / 2);
if (stills) mkdirSync(stills, { recursive: true });

// with sound (default when the piece declares music or sfx): render silent video, then sound.mjs mixes it in
const hasSound = !rest.includes('--mute') && output !== '-' && await page.evaluate(() => { const s = window.__motion.sound(); return !!(s.music || s.cues.length); });
const videoOut = hasSound ? output.replace(/\.mp4$/, '') + '.silent.mp4' : output;
const ff = output === '-' ? null : spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(env.fps), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', videoOut], { stdio: ['pipe', 'inherit', 'inherit'] });

const canvas = await page.$('canvas');
if (arg('--frames')) {
  for (const f of arg('--frames').split(',').map(Number)) {
    await page.evaluate((n) => window.__motion.seek(n), f);
    writeFileSync(`${stills}/f${String(f).padStart(4, '0')}.png`, await canvas.screenshot({ type: 'png' }));
  }
  await browser.close(); console.log('frames ->', stills); process.exit(0);
}
for (let f = from; f < to; f++) {
  await page.evaluate((n) => window.__motion.seek(n), f);
  const png = await canvas.screenshot({ type: 'png' });
  if (ff && !ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (stills && (f - from) % every === 0) writeFileSync(`${stills}/f${String(f).padStart(4, '0')}.png`, png);
  if (f % 60 === 0) process.stdout.write(`\rframe ${f}/${to}`);
}
await browser.close();
if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
if (hasSound) {
  const { spawnSync } = await import('node:child_process');
  const here = new URL('.', import.meta.url).pathname;
  const extra = rest.includes('--stems') ? ['--stems', rest[rest.indexOf('--stems') + 1]] : [];
  const r = spawnSync('node', [here + 'sound.mjs', input, videoOut, output, ...extra], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
console.log(`\ndone -> ${output}`);
