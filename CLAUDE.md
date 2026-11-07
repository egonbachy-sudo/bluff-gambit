# Bluff Gambit

Échecs à information cachée et bluff. Règles et points : voir `CAHIER_DES_CHARGES.md`.

## Commandes
- `npm run dev` : serveur + client sur http://localhost:3000 (Vite en middleware, Node relancé à chaque modif de `server/` ou `shared/`)
- `npm test` : tests du moteur et du bot (`server/*.test.ts`, dont 30 parties bot contre bot)
- `npm run check` : TypeScript
- `npm run build` puis `npm start` : production (sert `client/dist`)

## Structure
- `shared/rules.ts` : géométrie des coups, validation du placement, quêtes, skins, constantes
- `server/bot.ts` : Bluffbot (entraînement) ; ne décide qu'à partir de `view()` de son camp, garde en mémoire les types encore possibles de chaque pièce adverse
- `server/game.ts` : machine d'état pure (setup → move → challenge → … → over), `view()` filtre ce que chaque joueur voit
- `server/index.ts` : Socket.IO, comptes, matchmaking, pendules, fin de partie → SQLite
- `server/db.ts` : schéma + accès SQLite via libSQL (`data/bluff.db` en local, Turso en ligne si `TURSO_DATABASE_URL` est défini)
- `client/` : React (App.tsx = en-tête + pages, Board.tsx = plateau animé partagé (glissements, prises qui volent au cimetière), Game.tsx = partie, Tutorial.tsx = tutoriel scripté en 13 étapes couvrant toutes les règles, aides à l’écran, local, sans serveur)

## Règle d'or
Le type des pièces adverses ne doit jamais sortir du serveur avant la fin (`view()`). Toute entrée client est validée côté serveur.

## Test à 2 joueurs sur un PC
Deux onglets, sans cocher « Rester connecté » (le jeton est alors stocké par onglet), ou une fenêtre normale + une privée.

## Avancement
- Fait : règles, comptes, parties classées et privées, pendules, contestation, marquage, promotion, score, Elo, classements, quêtes, skins, thèmes, paramètres, règles, emotes, historique, face-à-face, Bluffbot (entraînement, partie non sauvegardée), tutoriel interactif
- Fait aussi : niveaux du bot (facile/normal/difficile, réglés par auto-parties), replay coup par coup (`Replay.tsx`, départ + historique en base), quêtes du jour (3 par jour UTC, XP en table `rewards`), saisons mensuelles (classement « Saison »), appli installable (`client/public` : manifeste, icônes, `sw.js`), liaison Google depuis Mon compte, sessions qui expirent après 30 jours sans usage, photos de profil (20 de base + 6 rares par quêtes, `avatarOf` dans shared), temps illimité (minutes = 0)
- Points (refonte 2026-11-07) : score de fin de partie dans `G.stats` (victoire 100 + rapidité ≤30 + remontada 30, pièces ×1, vies ×5, contestation +15/−5, marquage +5, bluff +6, abandon = 0) → XP (1re victoire du jour doublée via `rewards` 'firstwin') et or (`goldOf`, boutique `SHOP` / table `purchases`). Rangs depuis l'Elo (`rankOf`, K=48 pendant 5 parties de placement). Classements Saison/Semaine = `game_players.season_pts` (classées seulement, `seasonPoints` : +10 +série, −4, 0 après 3 parties/jour contre le même joueur). Fin de saison : top 3 + rang max atteint (`season_ranks` → avatars Médaille/Étoile).
- Fait aussi : abandon après 90 s de déconnexion, parties en cours sauvegardées (`live_games`) et reprises au redémarrage, suppression de compte (anonymisation) + page Confidentialité, mot de passe oublié (Brevo), amis + invitations, mode spectateur, récompenses de fin de saison (top 3 → photo Champion), notifications push (`web-push`, clés VAPID en base), version anglaise (`client/i18n.ts` : traduction à l'affichage, dictionnaire FR→EN + motifs ; `window.__i18nMissing()` liste les textes non traduits)
- À faire : à définir

## Mise en ligne
Render (gratuit, `render.yaml` + `Dockerfile`) + Turso (base gratuite). Marche à suivre : `DEPLOIEMENT.md`. Production : `npm run build` puis `npm start` (`--prod` sert `client/dist`).
