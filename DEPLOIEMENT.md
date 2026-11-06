# Mettre Bluff Gambit en ligne gratuitement

Render (gratuit) fait tourner le jeu, Turso (gratuit, sans carte bancaire) garde la base de données.
Limite du gratuit : le serveur s'endort après 15 min sans visiteur, le premier chargement prend ensuite ~1 min.

## 1. Base de données : Turso
1. Crée un compte sur https://turso.tech (connexion avec GitHub possible).
2. Crée une base nommée `bluff-gambit`, région **Europe (Frankfurt)**.
3. Note son **URL** (commence par `libsql://`).
4. Crée un **jeton** (token) pour cette base et note-le. Ne le partage avec personne.

## 2. Code : GitHub
1. Crée un dépôt **privé** vide nommé `bluff-gambit` sur https://github.com/new (sans README).
2. Dans un terminal :
   ```bash
   cd ~/Documents/web/bluff-gambit
   git remote add origin https://github.com/TON-PSEUDO/bluff-gambit.git
   git push -u origin main
   ```

## 3. Serveur : Render
1. Crée un compte sur https://render.com (connexion avec GitHub).
2. **New → Blueprint**, choisis le dépôt `bluff-gambit` : Render lit `render.yaml`.
3. Remplis `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` avec les valeurs de l'étape 1, puis **Apply**.
4. Après la construction (~3 min), le jeu est sur `https://bluff-gambit.onrender.com` (ou le nom que Render affiche).

## 4. Connexion Google (facultatif)
1. Sur https://console.cloud.google.com, crée un projet `bluff-gambit`.
2. **API et services → Écran de consentement OAuth** : type « Externe », nom « Bluff Gambit », ton e-mail. Publie-le (« En production »).
3. **API et services → Identifiants → Créer des identifiants → ID client OAuth**, type « Application Web ».
   - **Origines JavaScript autorisées** : `https://bluff-gambit-bgy7.onrender.com` et `http://localhost:3000`.
   - Pas besoin d'URI de redirection.
4. Copie l'**ID client** (il finit par `.apps.googleusercontent.com`). Ce n'est pas un secret.
5. Dans Render → ton service → **Environment**, ajoute `GOOGLE_CLIENT_ID` = cet ID, puis enregistre (Render redémarre).
6. Le bouton « Continuer avec Google » apparaît sur la page de connexion. En local : lance le serveur avec `GOOGLE_CLIENT_ID=… npm run dev`.

Un compte créé avec un e-mail + mot de passe ne se relie pas automatiquement à Google (son e-mail n'a jamais été vérifié) : ces joueurs continuent avec leur mot de passe.

## 5. Mot de passe oublié (facultatif)
Les e-mails de réinitialisation partent via Brevo (gratuit, 300 e-mails/jour, sans carte bancaire).
1. Crée un compte sur https://www.brevo.com.
2. **Senders, Domains & Dedicated IPs → Senders** : ajoute ton adresse d'envoi (ex. ton Gmail) et valide le lien reçu.
3. **SMTP & API → API Keys** : crée une clé API.
4. Dans Render → **Environment**, ajoute :
   - `BREVO_API_KEY` = la clé
   - `MAIL_FROM` = l'adresse validée à l'étape 2
   - `PUBLIC_URL` = `https://bluff-gambit-bgy7.onrender.com`
5. Le lien « Mot de passe oublié ? » envoie alors un e-mail valable 1 heure.

## 6. Contact (page Confidentialité)
Ajoute `CONTACT_EMAIL` dans Render pour afficher une adresse de contact sur la page Confidentialité (obligatoire pour le RGPD dès que le site est public).

## Mettre à jour le site
`git push` : Render reconstruit et redéploie tout seul. Les parties en cours sont coupées pendant le redéploiement, les comptes et classements restent (ils sont chez Turso).

## Ce qui reste local
Sans `TURSO_DATABASE_URL`, le serveur utilise `data/bluff.db` : `npm run dev` marche comme avant.
