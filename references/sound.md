# Son : musique et bruitages

Activé par défaut : `render.mjs` mixe le son automatiquement dès que la pièce déclare `music` ou des `sfx` (`--mute` pour s'en passer). Pour changer seulement le son, sans re-rendre l'image : `node ~/.claude/skills/aisance-motion-design/scripts/sound.mjs piece.html out.silent.mp4 out.mp4 [--stems dir]` (environ 2 s).
- **Bruitages = des temps, jamais des secondes.** Dans chaque scène, `sfx: [[temps, 'nom', vol, {align:'end'}?]]`, avec les **mêmes nombres** que dans `draw` (un mot qui arrive à `b * 2` → `[2, 'swish', 0.5]`). Le son ne peut donc pas se décaler de l'image.
- **Banque synthétisée** (sans licence, déterministe ; `node sound.mjs --bank dir` pour l'écouter). Usage :

| Son | Usage |
|---|---|
| `swish` | mot qui claque, déplacement rapide |
| `whoosh` | transition de scène, gros mouvement de caméra |
| `impact` | coup fort sur un temps 1, apparition majeure (2 ou 3 par pièce au plus) |
| `riser` | montée vers une coupe, avec `{align:'end'}` pour qu'il **finisse** sur la coupe |
| `thud` | objet qui atterrit (squash) |
| `pop` | élément qui apparaît |
| `click` | clic du curseur |
| `tick` | cadre, label ou crochet qui se pose |
| `key` | frappe et rouleaux de compteur (helper `roll(de, à, n, 'key', vol)`) |
| `ding` | récompense, appel à l'action (une fois, à la fin) |

- **Musique** : `music: { intro: 1, breaks: [5], outro: true, vol: 0.42 }`. C'est un fond synthétisé **au BPM exact de la pièce** (kick sur chaque temps, clap sur 2 et 4, charleston, basse qui s'efface après chaque kick, nappe Am–F–C–G). `intro` = nombre de mesures sans kick ; `breaks` = mesures de respiration (la scène épurée) ; `outro` = coup final plus queue de nappe sur la dernière mesure.
- **Grille d'accords** : `prog: [1, 2, 3, 0]` = ordre des accords par mesure (0 Am, 1 F, 2 C, 3 G, en boucle). Pour une pièce courte qui doit « conclure », finir sur Am (0) ou C (2) ; F–C–G–Am monte puis se résout.
- **Mélodie / jingle** : `lead: [[temps, midi, durée_en_temps, vol?], ...]`, en temps **absolus** depuis le début. Synthé cloche avec écho. Une note par impact visuel (atterrissage, slam), et un **logo sonore** de 2 à 3 notes sur le plan final (ex. E–G–A = 76, 79, 81 sur l'arrivée du logo, la dernière tenue 2 à 3 temps). C'est ce motif court et répété qui fait un jingle mémorable. 
- **Piste fournie dont le BPM est lent (ex. 80)** : faire tourner la pièce au **double** (160 BPM : 1 temps d'animation = une croche, 1 mesure = 1,5 s), et choisir `start` pour que les gros kicks du morceau tombent sur les coupes importantes (le drop sur la scène forte, un kick sur le logo). Trouver les kicks : enveloppe passe-bas 150 Hz, pics espacés d'une mesure. Exemple : le commentaire `music` de `templates/intro-jingle.html`.
- **Bruitages par-dessus une vraie musique** : 1 à 2 par scène au plus, volumes 0,15 à 0,3, seulement sur ce que la musique ne marque pas déjà. Un son à chaque impact devient vite répétitif et trop fort : la musique porte déjà le rythme.
- **Piste fournie par l'utilisateur** (licenciée uniquement) : `music: { file: 'assets/track.mp3', start: 12.3, vol: 0.8 }`. Le BPM de la pièce doit être celui de la piste, et `start` placé sur un temps 1 de la piste. Ne jamais télécharger de musique soi-même.
- **Dosage** (repris d'aisance-reel) :
  - Pas de son sur chaque élément : un son par **action lisible**.
  - `whoosh` seulement aux vrais changements de scène.
  - La musique reste sous les bruitages (`vol` 0,4 à 0,5).
- **Mastering** (automatique) : normalisation à -14 LUFS en deux passes, en mode **linéaire** (le mode dynamique remonte les fins calmes), limiteur à -1 dB. Le script affiche le `max` : il doit être ≤ -1 dB.
- **Vérifier sans écouter** :
  - `ffmpeg -i out.mp4 -filter_complex showwavespic=s=1800x300 -frames:v 1 wave.png` : la forme d'onde doit montrer l'intro calme, les kicks réguliers, la respiration et la fin.
  - `ebur128` pour mesurer le niveau.
  - Proposer ensuite à l'utilisateur d'écouter : le ressenti sonore se valide à l'oreille.
