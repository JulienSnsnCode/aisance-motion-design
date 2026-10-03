/* motion-design engine — deterministic, beat-locked canvas motion.
 * Everything on screen is a pure function of time t (seconds).
 * No requestAnimationFrame state, no Math.random() in draw code: the same t
 * always paints the same frame, so the piece can be scrubbed and rendered
 * frame-by-frame to video (see render.mjs).
 *
 * Usage:
 *   <canvas id="stage"></canvas>
 *   <script src="engine.js"></script>
 *   <script>
 *     Motion.run({ w:1920, h:1080, fps:60, bpm:128, scenes:[ ... ] })
 *   </script>
 */
(function () {
  'use strict';

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  // normalized progress of t inside [a,b] -> 0..1 (clamped)
  const range = (t, a, b) => clamp((t - a) / (b - a));
  const TAU = Math.PI * 2;
  // deterministic hash noise: same input -> same output, every frame
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const mixColor = (c1, c2, k) => {
    const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const a = p(c1), b = p(c2);
    return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`;
  };

  // ---------- easing ----------
  // Rule of thumb: entrances = out-curves (fast start, soft landing),
  // exits = in-curves (soft start, fast leave), moves = inOut.
  const ease = {
    linear: (x) => x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inCubic: (x) => x * x * x,
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuart: (x) => 1 - Math.pow(1 - x, 4),
    outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
    inOutExpo: (x) => x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
    outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
    inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  };
  // Closed-form damped spring 0 -> 1. elapsed in seconds. Overshoots then settles.
  // freq ~ oscillations/sec, damping 0..1 (0.25 bouncy, 0.5 snappy, 0.8 stiff)
  const spring = (elapsed, freq = 2.2, damping = 0.45) => {
    if (elapsed <= 0) return 0;
    const w = TAU * freq, z = damping, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * elapsed) * (Math.cos(wd * elapsed) + (z * w / wd) * Math.sin(wd * elapsed));
  };

  // ---------- staggering ----------
  // progress of item i among n when the group animates over [a,b] and each
  // item takes `dur` fraction of the window. Gives the cascading "wave" feel.
  const stagger = (t, a, b, i, n, dur = 0.5) => {
    const span = (1 - dur) / Math.max(1, n - 1);
    const s = a + (b - a) * span * i;
    return range(t, s, s + (b - a) * dur);
  };

  // ---------- squash & stretch ----------
  // Draw a dot stretched along its velocity vector. Volume preserved.
  // square: true -> axis-aligned stretch for pixel/square motifs (rotating a square
  // to a diagonal velocity reads as an "×"); stretch goes on each axis by its own speed.
  function blob(ctx, x, y, r, vx, vy, color, k = 0.012, square = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    if (square) {
      const sx = 1 + Math.min(Math.abs(vx) * k, 1.2), sy = 1 + Math.min(Math.abs(vy) * k, 1.2);
      ctx.scale(sx / Math.sqrt(sy), sy / Math.sqrt(sx));
      ctx.fillRect(-r, -r, r * 2, r * 2);
    } else {
      const stretch = 1 + Math.min(Math.hypot(vx, vy) * k, 1.2);
      ctx.rotate(Math.atan2(vy, vx));
      ctx.scale(stretch, 1 / Math.sqrt(stretch));
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // velocity of any position function f(t) -> [x,y], in px/s
  const velocity = (f, t, h = 1 / 240) => { const a = f(t - h), b = f(t + h); return [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)]; };

  // ---------- text ----------
  function text(ctx, str, x, y, { font, color = '#000', align = 'left', base = 'alphabetic', tracking = 0, stroke = 0 } = {}) {
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = base;
    if ('letterSpacing' in ctx) ctx.letterSpacing = tracking + 'px';
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = color; ctx.strokeText(str, x, y); }
    else { ctx.fillStyle = color; ctx.fillText(str, x, y); }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  // text laid along a circle (for marquee -> ring warps). k=0 straight line, k=1 full ring.
  function textOnArc(ctx, str, cx, cy, radius, startAngle, { font, color, stroke = 0, tracking = 0 } = {}) {
    ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    let a = startAngle;
    for (const ch of str) {
      const w = ctx.measureText(ch).width + tracking;
      const da = w / radius;
      ctx.save();
      ctx.translate(cx + Math.cos(a + da / 2) * radius, cy + Math.sin(a + da / 2) * radius);
      ctx.rotate(a + da / 2 + Math.PI / 2);
      if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = color; ctx.strokeText(ch, 0, 0); }
      else { ctx.fillStyle = color; ctx.fillText(ch, 0, 0); }
      ctx.restore();
      a += da;
    }
  }


  // ---------- images & captures (see capture.mjs) ----------
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // draw an image like CSS object-fit: cover inside (x,y,w,h). fx/fy = focal point 0..1, zoom >= 1
  function cover(ctx, img, x, y, w, h, { radius = 0, fx = 0.5, fy = 0.5, zoom = 1, alpha = 1 } = {}) {
    if (!img) return;
    const s = Math.max(w / img.width, h / img.height) * zoom, iw = img.width * s, ih = img.height * s;
    ctx.save(); ctx.globalAlpha *= alpha;
    roundRect(ctx, x, y, w, h, radius); ctx.clip();
    ctx.drawImage(img, x - (iw - w) * fx, y - (ih - h) * fy, iw, ih);
    ctx.restore();
  }
  // circular image (avatars)
  // without an image (missing file): a coloured disc with the initials, so a template still renders
  function avatar(ctx, img, cx, cy, r, { ring = 0, ringColor = '#fff', initials = '', fill = '#333', ink = '#fff', font = 'sans-serif' } = {}) {
    if (r <= 0) return;
    if (ring) { ctx.beginPath(); ctx.arc(cx, cy, r + ring, 0, TAU); ctx.fillStyle = ringColor; ctx.fill(); }
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    if (img) {
      const s = (2 * r) / Math.min(img.width, img.height);
      ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
    } else {
      ctx.fillStyle = fill; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      ctx.fillStyle = ink; ctx.font = `${Math.round(r * 0.9)}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(initials, cx, cy + r * 0.05);
    }
    ctx.restore();
  }
  // Browser window showing a page screenshot through a camera.
  // cam = {x, y, zoom}: point of the screenshot (screenshot px) at the centre of the viewport; zoom 1 = page width fits.
  // Returns toScreen(px, py) -> [x, y] and the scale, so overlays (boxes, cursor) can be pinned to page elements.
  function browser(ctx, img, x, y, w, h, { url = '', cam, radius = 18, bar = 50, theme = 'light' } = {}) {
    const dark = theme === 'dark', ch = h - bar;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
    roundRect(ctx, x, y, w, h, radius); ctx.fillStyle = dark ? '#1d1d20' : '#ececee'; ctx.fill();
    ctx.restore();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.beginPath(); ctx.arc(x + 26 + i * 22, y + bar / 2, 7, 0, TAU); ctx.fillStyle = c; ctx.fill(); });
    const pw = Math.min(w * 0.5, 620);
    roundRect(ctx, x + (w - pw) / 2, y + 11, pw, bar - 22, (bar - 22) / 2); ctx.fillStyle = dark ? '#2c2c30' : '#ffffff'; ctx.fill();
    text(ctx, url, x + w / 2, y + bar / 2 + 6, { font: '500 16px ui-sans-serif, system-ui, sans-serif', color: dark ? '#bbb' : '#555', align: 'center' });
    const c = cam || { x: img.width / 2, y: img.height / 2, zoom: 1 };
    const s = (w / img.width) * c.zoom;
    const toScreen = (px, py) => [x + w / 2 + (px - c.x) * s, y + bar + ch / 2 + (py - c.y) * s];
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x, y + bar); ctx.lineTo(x + w, y + bar); ctx.lineTo(x + w, y + h - radius); ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h); ctx.arcTo(x, y + h, x, y + h - radius, radius); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y + bar, w, ch);
    const [ox, oy] = toScreen(0, 0); ctx.drawImage(img, ox, oy, img.width * s, img.height * s);
    ctx.restore();
    return { toScreen, scale: s };
  }
  // camera that frames a capture box (screenshot px) inside a viewport of vw x vh screen px, with padding factor
  const frameBox = (box, vw, vh, imgW, pad = 1.4) => {
    const zoom = Math.min(vw / (box.w * pad), vh / (box.h * pad)) * (imgW / vw);
    return { x: box.x + box.w / 2, y: box.y + box.h / 2, zoom };
  };
  const lerpCam = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), k)) });
  // macOS-style arrow cursor; press 0..1 shrinks it (click)
  function cursor(ctx, x, y, { press = 0, scale = 1.6, color = '#111', outline = '#fff' } = {}) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale * (1 - press * 0.15), scale * (1 - press * 0.15));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.lineTo(5.5, 17); ctx.lineTo(9.5, 26); ctx.lineTo(13, 24.5); ctx.lineTo(9, 16); ctx.lineTo(16, 16); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = outline; ctx.stroke(); ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }
  // expanding click ring; e = seconds since click
  function clickRing(ctx, x, y, e, color, size = 70) {
    if (e < 0 || e > 0.5) return;
    const k = ease.outCubic(e / 0.5);
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = color; ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(x, y, size * k, 0, TAU); ctx.stroke(); ctx.restore();
  }

  // ---------- finishing passes ----------
  function makeGrain(w, h, count = 6) {
    const tiles = [];
    for (let k = 0; k < count; k++) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g = c.getContext('2d'), img = g.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = hash(i * 0.37 + k * 999.1) * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0); tiles.push(c);
    }
    return tiles;
  }
  function finish(ctx, env, frame) {
    const { w, h } = env;
    // grain: animated (tile changes every 2 frames), soft-light so it rides the colors
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = env.grain;
    ctx.fillStyle = ctx.createPattern(env._grain[Math.floor(frame / 2) % env._grain.length], 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // vignette
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.5, w / 2, h / 2, h * 1.1);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${env.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  // ---------- HUD (frame chrome) ----------
  // Crop marks + title + bar/beat counter + frame/timecode. Color adapts to bg.
  function hud(ctx, env, t, frame, scene) {
    const { w, h, fps } = env;
    const ink = scene.hudInk || '#ffffff';
    const m = 40, L = 22, mono = `600 15px ${env.monoFont}`;
    ctx.save();
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
    [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
    });
    if (scene.hud !== 'corners') {
      ctx.globalAlpha = 1;
      text(ctx, env.title[0], m + 20, m + 26, { font: `700 15px ${env.monoFont}`, color: ink, tracking: 3 });
      ctx.globalAlpha = 0.5;
      text(ctx, env.title[1], m + 20 + ctx.measureText(env.title[0]).width + 3 * env.title[0].length + 14, m + 26, { font: mono, color: ink, tracking: 3 });
      // beat pips + bar counter
      const beat = Math.floor(env.beatOf(t)) % 4, bar = Math.floor(env.barOf(t)) + 1;
      const right = w - m - 20, bpmTxt = `${env.bpm} BPM`, barTxt = `BAR ${bar}/${env.bars}`;
      const width = (s, f) => { ctx.font = f; return ctx.measureText(s).width + 2 * s.length; };
      const x1 = right - width(bpmTxt, `700 15px ${env.monoFont}`) - 18, x2 = x1 - width(barTxt, mono) - 16;
      ctx.globalAlpha = 1;
      text(ctx, bpmTxt, right, m + 26, { font: `700 15px ${env.monoFont}`, color: ink, align: 'right', tracking: 2 });
      ctx.globalAlpha = 0.6;
      text(ctx, barTxt, x1, m + 26, { font: mono, color: ink, align: 'right', tracking: 2 });
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = i === beat ? 1 : 0.25; ctx.fillStyle = ink;
        ctx.fillRect(x2 - 48 + i * 12, m + 15, 8, 8);
      }
    }
    const tc = (s) => { const f = frame % fps, S = Math.floor(t) % 60, M = Math.floor(t / 60); return `00:${String(M).padStart(2, '0')}:${String(S).padStart(2, '0')}:${String(f).padStart(2, '0')}`; };
    ctx.globalAlpha = 1;
    text(ctx, tc(), w - m - 20, h - m - 12, { font: `700 15px ${env.monoFont}`, color: ink, align: 'right', tracking: 2 });
    if (scene.hud !== 'corners') {
      ctx.globalAlpha = 0.5;
      ctx.font = `700 15px ${env.monoFont}`;
      text(ctx, 'F' + String(frame).padStart(4, '0'), w - m - 20 - ctx.measureText(tc()).width - 2 * 11 - 24, h - m - 12, { font: mono, color: ink, align: 'right', tracking: 2 });
    }
    ctx.restore();
  }

  // ---------- runner ----------
  function run(opts) {
    const env = Object.assign({
      w: 1920, h: 1080, fps: 60, bpm: 128, bars: 8, canvas: '#stage',
      title: ['CLAUDE', 'MOTION REEL'], monoFont: '"JetBrains Mono", ui-monospace, monospace',
      grain: 0.22, vignette: 0.14, motionBlur: 6, shutter: 0.5, // shutter = fraction of a frame
      showHud: true, loop: true,
    }, opts);
    const SPB = 60 / env.bpm;                        // seconds per beat
    env.beat = SPB; env.bar = SPB * 4;
    env.beatOf = (t) => t / SPB; env.barOf = (t) => t / (SPB * 4);
    env.duration = env.bars * env.bar;
    env.frames = Math.round(env.duration * env.fps);
    // scenes: { bar: startBar, bars: length, bg, hudInk, hud:'full'|'corners', motionBlur, sfx: [[beat, name, vol, {align}]], draw(ctx, p, lt, env, t) }
    env.scenes.forEach((s) => { s.t0 = s.bar * env.bar; s.t1 = s.t0 + (s.bars || 1) * env.bar; });

    const cv = document.querySelector(env.canvas);
    cv.width = env.w; cv.height = env.h; cv.style.aspectRatio = `${env.w} / ${env.h}`;
    const ctx = cv.getContext('2d');
    const acc = document.createElement('canvas'); acc.width = env.w; acc.height = env.h;
    const actx = acc.getContext('2d');
    env._grain = makeGrain(env.w, env.h);

    const sceneAt = (t) => env.scenes.find((s) => t >= s.t0 && t < s.t1) || env.scenes[env.scenes.length - 1];
    const paint = (c, t) => {
      const s = sceneAt(t);
      c.save();
      c.fillStyle = s.bg; c.fillRect(0, 0, env.w, env.h);
      const lt = t - s.t0;                              // local time in seconds
      s.draw(c, lt / (s.t1 - s.t0), lt, env, t);        // p = 0..1 across the scene
      c.restore();
      return s;
    };

    // Motion blur by temporal supersampling: average N sub-frames inside the
    // shutter window. Only moving things smear; static things stay sharp.
    function renderFrame(frame) {
      const t = frame / env.fps;
      let s = sceneAt(t);
      const N = (s.motionBlur ?? env.motionBlur) | 0;   // per-scene override: raise it for big fast edges (iris, wipes)
      if (N > 1) {
        ctx.clearRect(0, 0, env.w, env.h);
        for (let i = 0; i < N; i++) {
          // sub-frames stay inside the current scene: a hard cut must stay hard (no ghosting across the cut)
          const st = clamp(t + (i / N - 0.5) * env.shutter / env.fps, s.t0, s.t1 - 1e-6);
          paint(actx, st);
          ctx.globalAlpha = 1 / (i + 1);                // running average
          ctx.drawImage(acc, 0, 0);
        }
        ctx.globalAlpha = 1;
      } else s = paint(ctx, t);
      finish(ctx, env, frame);
      if (env.showHud) hud(ctx, env, t, frame, s);
    }

    // player: space = play/pause, ←/→ = ±1 frame, shift+←/→ = ±1 beat, click = scrub
    let frame = 0, playing = !/[?&]paused/.test(location.search), last = performance.now(), accT = 0;
    const loop = (now) => {
      if (playing) {
        accT += (now - last) / 1000;
        const step = Math.floor(accT * env.fps);
        if (step > 0) { accT -= step / env.fps; frame = (frame + step) % env.frames; renderFrame(frame); }
      }
      last = now; requestAnimationFrame(loop);
    };
    addEventListener('keydown', (e) => {
      const beatF = Math.round(env.beat * env.fps);
      if (e.code === 'Space') { playing = !playing; e.preventDefault(); }
      if (e.code === 'ArrowRight') { frame = (frame + (e.shiftKey ? beatF : 1)) % env.frames; renderFrame(frame); }
      if (e.code === 'ArrowLeft') { frame = (frame - (e.shiftKey ? beatF : 1) + env.frames) % env.frames; renderFrame(frame); }
    });
    cv.addEventListener('click', (e) => { const r = cv.getBoundingClientRect(); frame = Math.floor(((e.clientX - r.left) / r.width) * env.frames); renderFrame(frame); });

    // hooks for render.mjs (headless frame export)
    // sound spec for sound.mjs: cues in absolute seconds, computed from the same beats as the animation
    const sound = () => ({
      bpm: env.bpm, bars: env.bars, duration: env.duration, music: env.music ?? false,
      cues: env.scenes.flatMap((s) => (s.sfx || []).map(([beat, name, vol, o]) => ({ t: s.t0 + beat * env.beat, name, vol, ...(o || {}) })))
        .concat((env.sfx || []).map(([sec, name, vol, o]) => ({ t: sec, name, vol, ...(o || {}) }))).sort((a, b) => a.t - b.t),
    });
    window.__motion = { env, seek: (f) => { renderFrame(f); return true; }, sound };
    // canvas-only fonts are NOT fetched by document.fonts.ready: load each one explicitly
    const fontsLoaded = document.fonts ? Promise.all((env.fonts || []).map((f) => document.fonts.load(f))).then(() => document.fonts.ready) : Promise.resolve();
    // images: { key: 'path/or/url' } -> env.img[key] (decoded before the first frame)
    env.img = {};
    const imagesLoaded = Promise.all(Object.entries(env.images || {}).map(([k, src]) => new Promise((ok) => {
      const im = new Image(); im.onload = () => { env.img[k] = im; ok(); }; im.onerror = () => { console.error('image failed: ' + src); ok(); }; im.src = src;
    })));
    Promise.all([fontsLoaded, imagesLoaded]).then(() => {
      renderFrame(0); window.__motionReady = true; requestAnimationFrame(loop);
    });
    return env;
  }

  window.Motion = { run, roundRect, cover, avatar, browser, frameBox, lerpCam, cursor, clickRing, clamp, lerp, range, ease, spring, stagger, blob, velocity, text, textOnArc, hash, mixColor, TAU };
})();
