# aisance-motion-design

**FR** — Skill [Claude Code](https://claude.com/claude-code) pour faire des vidéos de motion design écrites en code (canvas HTML → MP4) : animation calée sur le tempo, flou de mouvement réel, captures automatiques de sites, bruitages et musique synchronisés.

**EN** — A [Claude Code](https://claude.com/claude-code) skill for motion-design videos written in code (HTML canvas → MP4): tempo-locked animation, real motion blur, automatic website captures, synced sound effects and music. The skill's instructions are written in French; Claude follows them in any language.

## Contenu / Contents
| | |
|---|---|
| `SKILL.md` | méthode, règles, API du moteur / method, rules, engine API |
| `scripts/engine.js` | moteur canvas déterministe / deterministic canvas engine |
| `scripts/render.mjs` | rendu image par image → MP4 (Playwright + ffmpeg) / frame-by-frame render |
| `scripts/capture.mjs` | captures de pages, éléments, textes / page, element and text captures |
| `scripts/sound.mjs` | bruitages et musique synthétisés, mixage / synthesized sfx and music, mix |
| `templates/` | reel de référence, promo de chaîne YouTube, intro jingle / reference reel, YouTube channel promo, intro jingle |
| `references/` | techniques, captures, son / techniques, captures, sound |

## Installation
Requires Node 18+ and ffmpeg on the PATH.
```
git clone https://github.com/<owner>/aisance-motion-design ~/.claude/skills/aisance-motion-design
cd ~/.claude/skills/aisance-motion-design/scripts
npm i
npx playwright install chromium-headless-shell
```

## Usage
In Claude Code:
- « Fais-moi une intro de 8 secondes pour ma chaîne YouTube » / "Make me an 8-second intro for my YouTube channel"
- « Une promo de 15 s de mon site https://example.com » / "A 15 s promo of my site https://example.com" (the skill captures the real pages itself)
- "Animate this logo, beat-locked, 128 BPM"

Or by hand:
```
cd ~/.claude/skills/aisance-motion-design
node scripts/render.mjs templates/intro-jingle.html intro.mp4                                # full render with sound
node scripts/render.mjs templates/reel.html - --frames 60,300,600 --stills check             # a few still frames
```
Edit the `BRAND` block at the top of `templates/intro-jingle.html` and `templates/promo-youtube.html` (name, handle, slogan, topics, accent colour). `promo-youtube.html` documents the `capture.mjs` commands to run first.

## Music / Musique
The default music is synthesized by `sound.mjs` (no samples, no licence needed). To use a real track, only use music you have the rights to use (`music: { file, start, vol }`). Nothing is downloaded by the skill.
La musique par défaut est synthétisée. Pour une vraie piste, n'utilisez que de la musique dont vous avez les droits.

Captures: only capture and publish content you are allowed to use (your own site or channel, or with permission).

## License
MIT — see `LICENSE`.
