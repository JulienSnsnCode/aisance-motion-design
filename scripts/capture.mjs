// Capture real web content for a motion piece: page screenshots, element crops,
// lists of elements, text values and element bounding boxes (so the animation can
// zoom the "camera" onto a precise element of the real page).
//
// usage:
//   node capture.mjs <url> <assetsDir> --name <key> [options]
// options:
//   --viewport 1440x900   --scale 2   --dark   --locale fr-FR   --wait 2500
//   --full                 full-page screenshot instead of viewport
//   --el   key=selector    one element: crop <name>.<key>.png + its box in the page shot
//   --list key=selector    every match (max --max, default 12): <name>.<key>-0.png ...
//   --text key=selector    innerText of the first match -> data
//   --texts key=selector   innerText of every match (max --max) -> data (array)
//   --attrs key=selector@attr  attribute of every match, e.g. a#thumbnail@href -> data (array)
//   --img  key=selector    download the image file behind an <img> (src / largest srcset) instead of a screenshot
//   --hide selector        hide elements before capture (banners, popups)
//   --click selector       click something before capture (tab, "more" button)
//   --scroll px            scroll before capture
// output (merged across runs): <assetsDir>/captures.json and captures.js
//   window.CAPTURES[name] = { url, title, page: 'name.png', w, h, scale,
//                             boxes: {key: {x,y,w,h}}, el: {key: file}, list: {key: [files]}, text: {key: str} }
// Boxes are in screenshot pixels (CSS px * scale), relative to the page screenshot.
import { chromium } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const [, , url, dir, ...rest] = process.argv;
if (!url || !dir) { console.error('usage: node capture.mjs <url> <assetsDir> --name key [--el k=sel] [--list k=sel] [--text k=sel] ...'); process.exit(1); }
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const all = (k) => rest.flatMap((v, i) => (v === k ? [rest[i + 1]] : []));
const pairs = (k) => all(k).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; });
const flag = (k) => rest.includes(k);

const name = opt('--name', 'page');
const [vw, vh] = opt('--viewport', '1440x900').split('x').map(Number);
const scale = +opt('--scale', 2), max = +opt('--max', 12);
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: scale, locale: opt('--locale', 'fr-FR'), colorScheme: flag('--dark') ? 'dark' : 'light' });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1500);

// cookie / consent walls: try the usual buttons in several languages, then common CMP ids
const consent = ['Tout accepter', 'Accepter tout', 'Accept all', 'Accept', 'Alle akzeptieren', 'Accepter', 'J\'accepte', 'Agree', 'Allow all', 'Tillad alle', 'Accepter alle'];
for (const label of consent) {
  const b = page.getByRole('button', { name: label, exact: false }).first();
  if (await b.count().catch(() => 0)) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1500); break; }
}
await page.locator('#onetrust-accept-btn-handler, #didomi-notice-agree-button, .fc-cta-consent, [data-testid="cookie-accept"]').first().click({ timeout: 1000 }).catch(() => {});
if (!page.url().startsWith(url.split('?')[0].slice(0, 20))) await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});

for (const sel of all('--click')) await page.locator(sel).first().click({ timeout: 5000 }).catch((e) => console.error('click failed:', sel));
for (const sel of all('--hide')) await page.addStyleTag({ content: `${sel}{visibility:hidden!important}` });
if (opt('--scroll')) await page.evaluate((y) => window.scrollTo(0, y), +opt('--scroll'));
await page.waitForTimeout(+opt('--wait', 2500));

const out = { url: page.url(), title: await page.title(), page: `${name}.png`, scale, boxes: {}, el: {}, list: {}, text: {} };

// element crops first (screenshotting an element may scroll it into view and trigger lazy images)
for (const [k, sel] of pairs('--el')) {
  const loc = page.locator(sel).first();
  if (!(await loc.count())) { console.error(`--el ${k}: no match for ${sel}`); continue; }
  await loc.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300);
  await loc.screenshot({ path: join(dir, `${name}.${k}.png`) }); out.el[k] = `${name}.${k}.png`;
}
for (const [k, sel] of pairs('--list')) {
  const locs = await page.locator(sel).all(); out.list[k] = [];
  for (const [i, loc] of locs.slice(0, max).entries()) {
    await loc.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(250);
    const f = `${name}.${k}-${i}.png`; await loc.screenshot({ path: join(dir, f) }).catch(() => null); out.list[k].push(f);
  }
  if (!locs.length) console.error(`--list ${k}: no match for ${sel}`);
}
for (const [k, sel] of pairs('--text')) out.text[k] = (await page.locator(sel).first().innerText({ timeout: 3000 }).catch(() => '')).trim();
for (const [k, sel] of pairs('--texts')) out.text[k] = (await page.locator(sel).allInnerTexts()).slice(0, max).map((t) => t.trim());
for (const [k, spec] of pairs('--attrs')) { const [sel, attr] = spec.split('@'); out.text[k] = (await page.locator(sel).evaluateAll((els, a) => els.map((e) => e[a] ?? e.getAttribute(a)), attr)).slice(0, max); }
for (const [k, sel] of pairs('--img')) {
  const src = await page.locator(sel).first().evaluate((e) => { const set = (e.srcset || '').split(',').map((s) => s.trim().split(' ')).filter((p) => p[0]); return set.length ? set.sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))[0][0] : e.currentSrc || e.src; }).catch(() => null);
  if (!src) { console.error(`--img ${k}: no image for ${sel}`); continue; }
  const res = await fetch(new URL(src, page.url()).href); const ext = (res.headers.get('content-type') || 'image/png').split('/')[1].replace('jpeg', 'jpg').split(';')[0];
  const f = `${name}.${k}.${ext}`; writeFileSync(join(dir, f), Buffer.from(await res.arrayBuffer())); out.el[k] = f;
}

// page shot + boxes, measured in the same scroll position as the screenshot
await page.evaluate((y) => window.scrollTo(0, y), +opt('--scroll', 0)); await page.waitForTimeout(600);
const full = flag('--full');
await page.screenshot({ path: join(dir, out.page), fullPage: full });
for (const [k, sel] of [...pairs('--el'), ...pairs('--box')]) {
  const r = await page.locator(sel).first().evaluate((e, full) => { const b = e.getBoundingClientRect(); return { x: b.x + (full ? scrollX : 0), y: b.y + (full ? scrollY : 0), w: b.width, h: b.height }; }, full).catch(() => null);
  if (r) out.boxes[k] = { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale };
}
const dims = await page.evaluate((full) => ({ w: innerWidth, h: full ? document.documentElement.scrollHeight : innerHeight }), full);
out.w = dims.w * scale; out.h = dims.h * scale;
await browser.close();

const jf = join(dir, 'captures.json');
const db = existsSync(jf) ? JSON.parse(readFileSync(jf, 'utf8')) : {};
db[name] = out;
writeFileSync(jf, JSON.stringify(db, null, 2));
writeFileSync(join(dir, 'captures.js'), `window.CAPTURES = ${JSON.stringify(db, null, 2)};\n`);
console.log(JSON.stringify({ name, page: out.page, boxes: Object.keys(out.boxes), el: Object.keys(out.el), list: Object.fromEntries(Object.entries(out.list).map(([k, v]) => [k, v.length])), text: out.text }, null, 1));
