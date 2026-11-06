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
- `client/` : React (App.tsx = pages, Game.tsx = plateau, Tutorial.tsx = tutoriel scripté en 8 étapes, local, sans serveur)

## Règle d'or
Le type des pièces adverses ne doit jamais sortir du serveur avant la fin (`view()`). Toute entrée client est validée côté serveur.

## Test à 2 joueurs sur un PC
Deux onglets, sans cocher « Rester connecté » (le jeton est alors stocké par onglet), ou une fenêtre normale + une privée.

## Avancement
- Fait : règles, comptes, parties classées et privées, pendules, contestation, marquage, promotion, score, Elo, classements, quêtes, skins, thèmes, paramètres, règles, emotes, historique, face-à-face, Bluffbot (entraînement, partie non sauvegardée), tutoriel interactif
- À faire : niveaux du bot, replay coup par coup, quêtes quotidiennes, PWA

## Mise en ligne
Render (gratuit, `render.yaml` + `Dockerfile`) + Turso (base gratuite). Marche à suivre : `DEPLOIEMENT.md`. Production : `npm run build` puis `npm start` (`--prod` sert `client/dist`).
