# Catalogue des techniques (décortiquées du « Claude Motion Reel 2026 »)

Source : reel de 15 s, 900 frames, 60 fps, 128 BPM, 8 mesures, « written entirely in code ».
Chaque technique : ce qu'on voit → pourquoi ça marche → recette. Les recettes 1, 2, 5, 6, 9, 10, 11 sont implémentées dans `templates/reel.html` ; les autres sont décrites ici pour être codées à la demande.

## Structure temporelle du reel original

| Mesure | Fond | Scène | Sortie / transition |
|---|---|---|---|
| 1 | encre | Un point rouge apparaît, se divise 1→2→4→8 sur chaque temps, puis forme un anneau | les points convergent au centre |
| 2 | rouge | « EVERY / [FRAME] / ON PURPOSE » claque mot par mot | iris noir qui grossit depuis le centre, point rouge au cœur |
| 3 | encre | Morph cercle→carré→triangle→fleur, outil de sélection (cadre + poignées + « ROT 101.4° / SHAPE SQUARE »), traînées fantômes | la forme se pixellise en fleur de points (phyllotaxie) |
| 4 | papier | La fleur de points explose en une grille plein écran ; anneaux rouges qui se propagent ; la caméra bascule en perspective 3D | la grille 3D continue sur fond bleu (coupe de raccord) |
| 5 | cobalt | Nuage de particules 3D : sphère → tore → cube fil de fer, particules d'accent jaunes qui circulent | la caméra traverse le cube |
| 6 | jaune | Un tube rayé (noir/rouge/blanc/bleu) se dessine avec une tête en bille, fait une boucle, petites lignes d'impact | le tube sort du cadre |
| 7 | encre | Rangées de texte (plein / contour alternés, puces rouges) défilent en sens opposés puis se courbent en anneaux concentriques ; le point rouge grossit au centre | les anneaux s'effondrent avec un flou radial |
| 8 | papier | « Claude. » en serif, lettres qui montent en cascade, le point rouge arrive en arc et devient le point final ; « MOTION DESIGNER » ; ligne de métadonnées tapée | fin (le HUD se réduit aux coins) |

## 1. Grille musicale (la base de tout)
- **On voit** : chaque changement tombe pile sur un temps ; le HUD affiche `BAR 3/8 · 128 BPM` avec 4 pastilles de temps.
- **Pourquoi** : le cerveau anticipe le temps suivant. Quand l'image tombe dessus, c'est « satisfaisant », même sans musique.
- **Recette** : `beat = 60/BPM`, `bar = 4·beat`. Une scène = une mesure. Coupes sur le premier temps, accents (apparition, division, impact) sur les temps, mouvements secondaires sur les demi-temps. À 128 BPM : 1 temps ≈ 0,469 s ≈ 28 frames à 60 fps.

## 2. Aplat de couleur par scène, coupe franche
- **On voit** : encre → rouge → encre → papier → cobalt → jaune → encre → papier. Coupes sèches, aucun fondu.
- **Pourquoi** : le changement de fond plein cadre agit comme une percussion visuelle ; l'alternance sombre / clair donne la respiration.
- **Recette** : palette de 5 couleurs maximum (`ink #101012`, `signal #FA5030`, `cobalt #3147FC`, `sun #FAC73C`, `paper #F2EBE3`). Ne jamais enchaîner deux scènes de même fond, sauf si le fond est le raccord. Le flou de mouvement ne doit **jamais** traverser une coupe (le moteur borne les sous-frames à la scène courante).

## 3. Le motif récurrent (fil rouge)
- **On voit** : le point rouge ouvre le reel, se cache au centre de l'iris, réapparaît au centre des anneaux et finit en point final de « Claude. ».
- **Pourquoi** : un objet suivi d'un bout à l'autre transforme une suite de démos en histoire, et la fin « rime » avec le début.
- **Recette** : choisir **un** élément simple (point, trait, carré) dans la couleur signal. Il doit être présent dans au moins 3 scènes, et le plan final doit le résoudre (il devient une lettre, un logo, une ponctuation).

## 4. Transitions motivées (l'objet devient la scène suivante)
- Iris : un disque de la couleur du fond suivant grossit (`inExpo`) jusqu'à couvrir le cadre.
- Explosion : la fleur de points devient la grille plein écran (mêmes particules, nouvelle position cible).
- Raccord : la grille 3D continue sur un autre fond (coupe sur l'action, l'objet ne s'arrête pas).
- Traversée : la caméra entre dans l'objet (zoom > 1 jusqu'à ce qu'il remplisse le cadre).
- Sortie de champ : le tube quitte le cadre, coupe sur le cadre vide.
- **Règle** : les ~0,4 dernier temps d'une scène préparent la suivante.

## 5. Squash & stretch
- **On voit** : les points s'allongent dans le sens du mouvement quand ils se divisent ; le point final s'écrase à l'atterrissage.
- **Recette** : `Motion.blob()`, qui étire selon la vitesse (`Motion.velocity()`) en conservant le volume (`scale(s, 1/√s)`). À l'atterrissage, sur-échelle 1,35 puis `spring` vers 1.

## 6. Le vrai flou de mouvement
- **On voit** : les mots qui claquent, la forme qui tourne, la tête du tube et les anneaux qui s'effondrent sont flous **uniquement pendant le mouvement**. Les éléments fixes restent nets.
- **Pourquoi** : c'est la signature « tourné à la caméra ». Sans ça, le mouvement rapide paraît saccadé et numérique.
- **Recette** : suréchantillonnage temporel. Le moteur dessine N sous-frames dans la fenêtre d'obturateur (`shutter 0.5` = 180°) et en fait la moyenne. N=6 par défaut, 12 à 16 pour les gros bords rapides (iris, volets), sinon on voit des marches.

## 7. Ressorts et dépassement
- Mots : arrivée hors champ, `spring(e, 2.4, 0.42)` : dépasse puis se pose. Petite rotation qui s'annule (`tilt·(1-k)`).
- Crochets : arrivent 0,08 s après le mot, de plus loin, avec plus de raideur (`spring(e, 3, 0.5)`).
- **Règle** : entrées en `out` (rapide puis doux), sorties en `in` (doux puis rapide), déplacements en `inOut`. Jamais de `linear` sauf pour le défilement continu.

## 8. Couche « outil de design » (le process visible)
- **On voit** : cadre de sélection avec 8 poignées, croix de centre, `ROT 101.4°` / `SHAPE SQUARE` qui se mettent à jour, cercle guide, coins de recadrage.
- **Pourquoi** : on montre le geste du designer. Ça donne de la crédibilité technique et de la texture d'information.
- **Recette** : traits de 1,5 px blancs à 55 %, police mono 15 px, interlettrage +2. Les valeurs sont **calculées** depuis l'état réel (rotation en degrés, nom de la forme).

## 9. HUD permanent
- Coins de recadrage, titre `CLAUDE` (gras) + `MOTION REEL 2026` (50 %), `BAR n/8`, pastilles de temps, `F0123`, timecode `00:00:03:42`.
- La couleur s'adapte au fond (`hudInk`). Sur le plan final, il ne reste que les coins (`hud: 'corners'`) : le calme signale la fin.

## 10. Grain + vignettage
- Grain animé (texture qui change toutes les 2 frames) en `soft-light` à environ 22 %, plus un léger vignettage (14 %). Ça casse le côté « vectoriel plat » et unifie toutes les scènes.

## 11. Une règle, mille éléments (grilles et particules)
- Grille de points : la taille, la couleur et le déplacement de chaque point dépendent de sa distance à un front d'onde qui avance (`exp(-((d - front)/70)²)`). Un nouveau front part à chaque temps.
- Apparition en cascade depuis le centre (délai proportionnel à la distance).
- Fleur : phyllotaxie, `angle = i·137.508°` et `r = c·√i`.

## 12. Particules 3D qui changent de forme
- N points (environ 800) ont une position cible par forme : sphère (Fibonacci), tore, arêtes de cube. Interpolation avec un délai par particule (`stagger`) pour que la transformation « coule ».
- Projection perspective maison : `x' = x·f/(z+d)`. Rotation lente continue. Taille et opacité selon la profondeur.
- Quelques particules d'accent (3 à 5 %) dans une autre couleur circulent le long des arêtes : elles guident l'œil.

## 13. Tracé de ligne (tube rayé)
- Chemin en Bézier échantillonné ; on dessine `0 → progress`. Traits superposés de largeur décroissante (noir 44, rouge 34, blanc 22, bleu 8) avec des extrémités arrondies : ça donne un tube rayé.
- Tête : une bille, avec le flou de mouvement du moteur. Petites lignes d'impact (4 à 6 traits radiaux de 0,15 s) quand la boucle se ferme.
- Sortie : la queue rattrape la tête (`start` animé aussi), puis sortie de champ.

## 14. Typo cinétique
- Rangées en défilement (plein / contour alternés, puces `•` en couleur signal), à des vitesses et dans des sens opposés.
- Ligne → anneau : on interpole le **rayon** en espace logarithmique (`R = r·(6000/r)^(1-k)`), ce qui donne une courbure progressive et régulière. Ensuite, rotation en sens alternés.
- Plan final : lettres serif qui montent derrière un masque de ligne de base, en cascade ; sous-titre dont l'interlettrage s'ouvre ; ligne de métadonnées tapée caractère par caractère.

## 15. Rythme de densité
- On alterne une scène chargée (grille, particules, anneaux) et une scène épurée (un point, une forme). Le plan final est le plus vide de tous.
