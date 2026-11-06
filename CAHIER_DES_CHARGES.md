# Bluff Gambit (nom provisoire) — cahier des charges

Jeu d'échecs à information cachée et à bluff, en ligne (mobile + PC), serveur qui fait autorité.

## Règles

### Placement
- Chaque joueur a le set classique : 8 pions, 2 tours, 2 cavaliers, 2 fous, 1 dame, 1 roi.
- Il place ses 16 pièces comme il veut sur ses 2 premières rangées.
- Contrainte : 1 fou sur case claire et 1 fou sur case foncée.
- 2 minutes pour placer. Sinon, placement classique automatique.

### Information cachée
- On voit où sont les pièces adverses, jamais leur type.
- Le type n'est révélé que quand la pièce est prise ou démasquée (cimetière visible à côté du plateau), et sur tout le plateau en fin de partie.

### Jouer un coup
1. Je sélectionne une de mes pièces.
2. Je choisis le type que j'imite (par défaut son vrai type).
3. Je joue un coup légal pour ce type (blocages, prises, pion qui avance, double pas si jamais bougé).
4. Le type imité s'affiche en haut à gauche de la pièce, visible pour moi seul (pense-bête).

### Contestation (juste après chaque coup adverse)
- Dès que l'adversaire a joué, j'ai **10 secondes** pour contester ou laisser passer (laisser passer par défaut).
- La contestation porte sur : « ce coup est illégal pour la vraie pièce ».
  - **Vrai (bluff démasqué)** : l'adversaire perd 1 vie et la pièce jouée (révélée, au cimetière). S'il avait pris une pièce avec ce coup, la prise est annulée et la pièce revient.
  - **Faux (coup légal)** : c'est moi qui perds 1 vie. La pièce n'est pas révélée, on affiche seulement « coup légal ».
- Un roi démasqué en bluff est retiré, donc défaite.

### Roi
- Pas d'échec ni de mat. **On gagne en capturant le roi adverse avec un vrai coup.**
- Une capture du roi par bluff est vérifiée automatiquement : le bluffeur perd sa pièce et 1 vie, et le roi reste en place.

### Marquage
- 1 fois tous les 2 tours, avant de jouer, je peux marquer une pièce adverse d'un type (visible pour moi seul).
- Les marquages justes sont comptés en fin de partie.

### Promotion
- Un vrai pion qui atteint la dernière rangée peut devenir une des pièces **qui m'ont été prises** (hors pion). Elle quitte le cimetière.
- Si le cimetière est vide, il reste pion.

### Vies et fin de partie
- 10 vies chacun.
- Fins possibles : roi capturé, 0 vie, abandon, temps écoulé.
- Pas de règle des 50 coups.
- Temps par joueur choisi par l'hôte de la partie : 3, 5, 10 ou 20 minutes.

### Retiré du jeu classique
Roque, prise en passant, échec, pat, règle des 50 coups.

## Points
- **Elo** (classement, matchmaking) : seulement les parties classées, victoire ou défaite, K = 32.
- **Score de partie** (XP, quêtes, classement hebdomadaire) :
  - victoire : +100
  - pièces restantes : valeur × 3 (pion 1, cavalier/fou 3, tour 5, dame 9)
  - vie restante : +5 chacune
  - contestation juste : +15 chacune
  - marquage juste : +5 chacun
  - bluff jamais démasqué : +4 chacun
- **Niveau** = floor(√(XP / 100)) + 1.

## Pages
- **Accueil / menu** : joueurs en ligne, niveau, Elo.
- **Jouer (matchup)** : partie classée (file d'attente par temps), entraînement contre Bluffbot (ni Elo, ni stats, ni quêtes), partie privée (code à 5 lettres), reprendre la partie en cours.
- **Partie** : plateau, vies, pendules, cimetières, contestation, marquage, emotes, journal. En fin de partie : plateau révélé, détail du score, Elo, liste des coups (vrai type, imitation, bluff).
- **Classements** : Elo, score de la semaine, victoires, meilleurs bluffeurs, meilleurs détecteurs.
- **Personnalisation** : skins de pièces et de plateau débloqués par les quêtes.
- **Mon compte** : connexion / inscription, statistiques, historique, face-à-face, mot de passe, déconnexion.
- **Paramètres** : thème (jour, nuit, vert clair, mauve améthyste), afficher les coups possibles, sons.
- **Règles** et **tutoriel interactif** (8 étapes guidées : vrai coup, bluff, contester, fausse alerte, marquer, capturer le roi).

## Technique
- TypeScript partout.
  - `shared/` : règles de déplacement et données communes.
  - `server/` : Node 24 + Socket.IO + SQLite (`node:sqlite`).
  - `client/` : React + Vite.
- Le serveur fait autorité :
  - le client ne reçoit jamais le type des pièces adverses ;
  - les identifiants de pièce sont aléatoires et les listes sont triées par identifiant ;
  - tout est validé côté serveur.
- Comptes : pseudo + e-mail + mot de passe (scrypt), jeton de session.
- Une seule commande en dev (`npm run dev`, port 3000, Vite en middleware).

## Plus tard
Niveaux de difficulté du bot, replay coup par coup, quêtes quotidiennes, saisons, PWA installable, connexion Google, spectateurs, hébergement (Railway / Fly.io).
