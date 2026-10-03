---
name: aisance-motion-design
description: Use when asked to create motion design, a promo video for a channel/site/product (capturing its real pages, thumbnails, stats), an animated reel, a kinetic typography piece, an animated intro/outro, a logo animation, a looping animated visual or a "video written in code" (HTML canvas → MP4, with synced music and sound effects), or when an animation feels flat, floaty, generic or "not premium" and needs pro motion-design polish.
---

# Motion design en code

## Principe
Une pièce de motion « satisfaisante » est **verrouillée sur un tempo** et **calculée image par image**. Chaque image est une fonction pure de `t`, chaque événement tombe sur un temps musical, et tout ce qui bouge vite est flou comme sous un obturateur de caméra. Le reste (palette, motif, transitions) sert ce rythme.

Référence décortiquée : `references/techniques.md`. C'est le catalogue des 15 techniques, avec la structure mesure par mesure du reel d'origine.

## Démarrage
1. Copier `templates/reel.html` dans le projet, et `scripts/engine.js` à côté (puis ajuster le `src`). Déclarer chaque police utilisée dans `fonts: [...]` de `Motion.run` : le canvas ne déclenche pas seul le chargement des polices.
2. Écrire le **storyboard en mesures** avant tout code (format ci-dessous).
3. Une fonction `draw(ctx, p, lt, env)` par scène. `p` = 0→1 sur la scène, `lt` = secondes locales, `env.beat` / `env.bar` = durées.
4. Vérifier en ouvrant le HTML (espace, flèches, shift + flèches = un temps).
5. Rendre. Le script reste dans le dossier du skill et se lance depuis n'importe où :
   - une seule fois : `cd ~/.claude/skills/aisance-motion-design/scripts && npm i && npx playwright install chromium-headless-shell`
   - images de contrôle (rapide, un seul lancement) : `node ~/.claude/skills/aisance-motion-design/scripts/render.mjs piece.html - --frames 50,160,300,420 --stills chk`
   - vérifier une transition : `node ~/.claude/skills/aisance-motion-design/scripts/render.mjs piece.html - --from 220 --to 232 --stills chk --every 3`
   - rendu complet : `node ~/.claude/skills/aisance-motion-design/scripts/render.mjs piece.html out.mp4 [--stills dir --every 15]`
   - coût indicatif : environ 2 à 4 min pour 600 à 700 frames avec le flou activé. Itérer sur des rendus partiels, ne faire le rendu complet qu'à la fin.
6. **Regarder les images en taille réelle autour de chaque coupe** (3 ou 4 frames juxtaposées avec ffmpeg `hstack`, ou une planche de 8 frames au plus). Les grandes planches contact induisent en erreur. À vérifier : coupes nettes, rien de rogné, texte lisible, dernière image posée.

## Contenu réel et son (toujours lire la référence avant)
- **Captures** : quand la vidéo parle d'un site, d'une chaîne ou d'un produit, capturer soi-même le vrai contenu avec `scripts/capture.mjs` (pages, éléments, listes, textes, positions des éléments pour les zooms caméra). → `references/captures.md`. Exemple complet : `templates/promo-youtube.html`. Intro / jingle de chaîne (5 mesures, sans HUD, logo sonore, textes dans `BRAND`) : `templates/intro-jingle.html`.
- **Son** : activé par défaut. Bruitages déclarés par scène en **temps** (`sfx: [[2, 'swish', 0.5]]`, mêmes nombres que l'animation), fond musical synthétisé au BPM de la pièce, ou piste licenciée fournie par l'utilisateur. Mixé et masterisé par `render.mjs`. → `references/sound.md`.

## Storyboard obligatoire (à remplir avant de coder)
```
BPM: 128 · mesures: 8 · fps: 60 · format: 1920×1080
Motif: <l'objet récurrent, couleur signal>
| Mesure | Fond | Ce qui se passe, temps par temps (1-2-3-4) | Sortie → raccord vers la mesure suivante |
```
Chaque ligne doit nommer : l'événement sur le temps 1, les accents sur 2-3-4, et la transition motivée (iris, explosion, raccord, traversée, sortie de champ).

## Les règles qui font la différence
| Règle | Concrètement |
|---|---|
| Tempo d'abord | 1 scène = 1 mesure ; coupes sur le temps 1, accents sur les temps. Aucune durée « au hasard » (0,8 s, 1,9 s…) : tout s'exprime en `b` (temps). |
| Coupes franches en aplats | Le fond change à chaque scène (5 couleurs **de fond** max ; une couleur d'accent ou de chrome en plus, c'est OK) ; alterner sombre / clair ; pas de fondu entre scènes. |
| Motif récurrent | Un élément présent dans au moins 3 scènes, résolu dans le plan final (point → ponctuation du logo). |
| Transitions motivées | Les ~0,4 dernier temps de chaque scène fabriquent l'entrée de la suivante. |
| Flou de mouvement réel | `motionBlur` du moteur (sous-frames). 12 à 16 pour les gros bords rapides. Jamais à travers une coupe (géré). |
| Courbes | Entrée `outExpo`/`spring`, sortie `inExpo`, déplacement `inOutExpo`/`inOutCubic`. `linear` seulement pour du défilement continu. |
| Physique | Squash & stretch selon la vitesse (`blob`), dépassement par ressort, rotation qui se résorbe. |
| Cascade | `stagger` sur lettres, points, rangées ; ordre spatial (centre → bord, gauche → droite). |
| Couche process | HUD (mesure, temps, frame, timecode) + outil de design (cadre, poignées, valeurs live). |
| Finition | Grain animé + léger vignettage sur tout. Plan final épuré, HUD réduit aux coins. |
| Pose finale | Tout est arrivé et immobile au moins 1 temps avant la dernière image (rien ne s'écrit encore). |
| Densité | Alterner scène chargée (1 règle × 1000 éléments) et scène épurée (1 forme). |

## API du moteur (`Motion.*`)
`run(opts)` · `range(t,a,b)` · `ease.{outExpo,inExpo,inOutExpo,outBack,outCubic,…}` · `spring(elapsed, freq, damping)` · `stagger(t,a,b,i,n,dur)` · `blob(ctx,x,y,r,vx,vy,color,k,square)` (`square=true` = étirement aligné sur les axes, pour les motifs pixel) · `velocity(fn,t)` · `text(ctx,str,x,y,{font,color,align,tracking,stroke})` · `textOnArc` · `mixColor` · `hash` (bruit déterministe).
Captures : `browser`, `frameBox`, `lerpCam`, `cursor`, `clickRing`, `cover`, `avatar`, `roundRect` (voir plus haut).
Options de `run` : `w,h,fps,bpm,bars,title,monoFont,fonts[],images{},music,sfx[[sec,nom,vol]],grain,vignette,motionBlur,shutter,showHud,scenes[]`. Une scène prend `{bar, bars, bg, hudInk, hud:'corners', motionBlur, sfx, draw}`.

## Erreurs fréquentes
- **`Math.random()` dans `draw`** : les images ne sont plus reproductibles et le grain scintille différemment au rendu. Utiliser `hash(i)`.
- **État mutable entre frames** (positions qu'on incrémente) : casse le scrub et le rendu. Tout doit se calculer depuis `t`.
- **`-x ** 2`** est une erreur de syntaxe en JS : écrire `-(x ** 2)`.
- **Marches visibles** sur un iris ou un volet : augmenter le `motionBlur` de la scène.
- **Texte tapé qui se dédouble** : un texte centré qui s'écrit lettre à lettre se décale à chaque frame, et le flou moyenne ces positions. Ancrer le texte tapé au bord gauche de la chaîne complète.
- **Clignotement gris** : un curseur ou un flash qui change d'état pendant l'obturateur ressort à moitié. Placer les fronts de clignotement sur des multiples exacts de frame (`Math.floor(frame/…)`), ou dessiner l'élément hors flou.
- **Carré qui tourne selon sa vitesse** : sur une diagonale, ça se lit comme un « × ». Utiliser `blob(..., square=true)`.
- **Compteur à rouleaux (odomètre)** : découper chaque colonne au plus près de la hauteur des capitales (environ 0,75 em), sinon les chiffres voisins dépassent en haut et en bas.
- **Le rendu dit « page never became ready »** : l'erreur JS est affichée juste au-dessus (`pageerror:`).
- **Typo trop petite** : un mot-titre occupe 50 à 70 % de la largeur (≈ 200 px+ en 1080p).
- **Tout bouge tout le temps** : garder des temps de pose ; c'est le contraste pose / mouvement qui rend le claquement satisfaisant.
- **Vertical 9:16 / 4:5** : changer `w/h` (le ratio du canvas et le HUD suivent) ; tout le placement doit partir de `CX/CY`/`W/H`, pas de coordonnées en dur ; réduire les tailles de typo d'environ 40 %.
