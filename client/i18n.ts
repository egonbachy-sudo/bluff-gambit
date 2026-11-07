// English version: the UI (and the server's messages) are written in French; this layer translates what reaches
// the screen. A MutationObserver rewrites text nodes and a few attributes, and puts the French back when switching.
// shortcut: sentence-level dictionary + patterns; move to per-component keys if more languages are added.

export type Lang = 'fr' | 'en'

const KIND: Record<string, string> = { Roi: 'King', Dame: 'Queen', Tour: 'Rook', Fou: 'Bishop', Cavalier: 'Knight', Pion: 'Pawn', roi: 'king', dame: 'queen', tour: 'rook', fou: 'bishop', cavalier: 'knight', pion: 'pawn' }
const SIDE: Record<string, string> = { Blanc: 'White', Noir: 'Black' }
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const REASON: Record<string, string> = {
  'roi capturé': 'king captured', 'plus de vies': 'out of lives', abandon: 'resignation', 'temps écoulé': 'time out',
  'roi démasqué en bluff': 'king caught bluffing', 'abandon (déconnexion)': 'resignation (disconnected)',
  'rois seuls, plus de vies': 'lone kings, more lives', 'rois seuls, égalité de vies : dernière prise': 'lone kings, equal lives: last capture',
}

const EN: Record<string, string> = {
  ...KIND, ...SIDE, ...REASON,
  // navigation & common
  Jouer: 'Play', Amis: 'Friends', Tutoriel: 'Tutorial', Tuto: 'Tutorial', Classements: 'Leaderboards', Personnalisation: 'Customise', Perso: 'Customise', nnalisation: '', Règles: 'Rules',
  'Se connecter': 'Sign in', 'Mon compte': 'My account', 'Paramètres': 'Settings', Fermer: 'Close', Retour: 'Back', Annuler: 'Cancel', Menu: 'Menu', Non: 'No', Oui: 'Yes',
  'Partie en cours': 'Game in progress', 'Chargement…': 'Loading…', 'Un instant…': 'One moment…', Enregistrer: 'Save', Changer: 'Change', Ajouter: 'Add', Accepter: 'Accept', Refuser: 'Decline',
  Confidentialité: 'Privacy', 'Navigation principale': 'Main navigation', Niveau: 'Level', 'Niv.': 'Lvl', XP: 'XP', Elo: 'Elo', vs: 'vs', ou: 'or', Toi: 'You', Adversaire: 'Opponent', Lui: 'Them',
  // home
  'Échecs · bluff · information cachée': 'Chess · bluff · hidden information', 'Les échecs où chaque pièce': 'The chess game where every piece', 'peut mentir': 'can lie',
  'Place tes pièces en secret, fais passer un pion pour une dame, et démasque les bluffs adverses.': 'Set up your pieces in secret, pass a pawn off as a queen, and call out your opponent’s bluffs.',
  'Jouer maintenant': 'Play now', 'Défier Bluffbot 🤖': 'Challenge Bluffbot 🤖', 'Créer un compte': 'Create an account', 'Essayer le tutoriel': 'Try the tutorial', 'Reprendre la partie': 'Resume the game',
  'joueur connecté': 'player online', 'joueurs connectés': 'players online', visiteur: 'visitor', visiteurs: 'visitors', 'Bon retour,': 'Welcome back,',
  parties: 'games', victoires: 'wins', 'bluffs réussis': 'successful bluffs', 'contestations justes': 'correct challenges', 'contestations ratées': 'wrong challenges', 'marquages justes': 'correct marks',
  Cache: 'Hide', Bluffe: 'Bluff', Conteste: 'Challenge',
  'Tes 16 pièces se placent où tu veux sur tes 2 rangées. L’adversaire ne voit que des pions mystère.': 'Your 16 pieces go wherever you like on your first 2 ranks. Your opponent only sees mystery tokens.',
  'Joue un cavalier comme une tour, un pion comme une dame. Personne ne le sait… sauf toi.': 'Play a knight as a rook, a pawn as a queen. Nobody knows… except you.',
  'Tu soupçonnes un bluff ? Conteste. Vu juste : il perd une vie et la pièce. Raté : c’est toi qui la perds.': 'Smell a bluff? Challenge it. Right: they lose a life and the piece. Wrong: you lose the life.',
  'Nouveau ici ?': 'New here?', 'Le tutoriel interactif t’apprend tout en 2 minutes.': 'The interactive tutorial teaches you everything in 2 minutes.', 'Lancer le tutoriel': 'Start the tutorial',
  'Quêtes du jour': 'Daily quests', 'nouvelles dans': 'new in', 'Progression vers le niveau suivant': 'Progress to next level',
  'Bluff ?': 'Bluff?', 'Démasqué ! −1 ❤': 'Caught! −1 ❤', 'Contesté…': 'Challenged…', 'Coup légal ✓ L’adversaire perd 1 vie': 'Legal move ✓ The challenger loses 1 life', 'Prise !': 'Capture!',
  'Un pion joué en dame…': 'A pawn played as a queen…', 'Personne ne conteste 😏': 'Nobody challenges 😏', 'Marquage 🏷': 'Marking 🏷', 'Promotion !': 'Promotion!', 'Personnalise ton jeu ✨': 'Customise your game ✨',
  'Le roi se cache en a8…': 'The king hides on a8…', 'Roi capturé : victoire ! 🏆': 'King captured: victory! 🏆',
  // play
  'Connecte-toi pour accéder à cette page.': 'Sign in to open this page.', 'Reprendre la partie en cours': 'Resume the current game', 'Temps par joueur': 'Time per player', '∞ Illimité': '∞ Unlimited',
  'Partie classée': 'Ranked game', 'Un adversaire au hasard, l\'Elo compte.': 'A random opponent; Elo counts.', 'Trouver un adversaire': 'Find an opponent',
  Entraînement: 'Training', 'Contre Bluffbot, qui bluffe et conteste aussi. Ne compte ni pour l\'Elo ni pour les quêtes.': 'Against Bluffbot, who bluffs and challenges too. Does not count for Elo or quests.',
  Facile: 'Easy', Normal: 'Normal', Difficile: 'Hard', 'Niveau du bot': 'Bot level', 'Jouer contre le bot': 'Play the bot',
  'Partie privée': 'Private game', 'Entre amis, sans Elo. Tu es l\'hôte et tu choisis le temps.': 'With friends, no Elo. You host and pick the time.', 'Créer une partie': 'Create a game', Rejoindre: 'Join',
  'Code de partie': 'Game code', 'Code, ex. K7M2Q…': 'Code, e.g. K7M2Q…', 'Code de ta partie privée :': 'Your private game code:', 'Donne-le à ton ami.': 'Give it to your friend.',
  '👁 Regarder une partie': '👁 Watch a game', Regarder: 'Watch', 'Aucune partie publique en cours pour l\'instant.': 'No public game in progress right now.', classée: 'ranked', entraînement: 'training', amicale: 'friendly',
  // leaderboards
  Saison: 'Season', Semaine: 'Week', Victoires: 'Wins', Bluffeurs: 'Bluffers', Détecteurs: 'Detectors', 'Personne pour l\'instant. Sois le premier !': 'Nobody yet. Be the first!',
  '🏆 Score cumulé ce mois-ci : le compteur repart à zéro le 1er du mois.': '🏆 Total score this month: it resets on the 1st.', 'se termine dans': 'ends in', 'jour(s)': 'day(s)',
  // customise
  'Photo de profil': 'Profile picture', 'Visible dans les parties et les classements.': 'Shown in games and leaderboards.', 'Pour l’instant, ton initiale s’affiche. Choisis une photo !': 'Your initial is shown for now. Pick a picture!',
  'Photos rares': 'Rare pictures', 'Finir dans le top 3 d’une saison': 'Finish in the top 3 of a season', 'Arrangement de départ': 'Starting arrangement',
  'Touche deux pièces pour les échanger. Tout est permis, sauf les 2 fous sur la même couleur. Il est proposé au début de chaque partie.': 'Tap two pieces to swap them. Anything goes, except both bishops on the same colour. It is offered at the start of every game.',
  Classique: 'Classic', Aléatoire: 'Random', 'Arrangement enregistré ✓': 'Arrangement saved ✓', Pièces: 'Pieces', Plateau: 'Board', Équipé: 'Equipped', Succès: 'Achievements',
  Contour: 'Outline', Lettres: 'Letters', Néon: 'Neon', Bois: 'Wood', Marbre: 'Marble', Océan: 'Ocean', Améthyste: 'Amethyst',
  Masque: 'Mask', Joker: 'Joker', Œil: 'Eye', Diamant: 'Diamond', Couronne: 'Crown', Dragon: 'Dragon', Champion: 'Champion',
  'Jouer 5 parties': 'Play 5 games', 'Gagner 3 parties': 'Win 3 games', 'Réussir 10 contestations': 'Make 10 correct challenges', 'Faire 20 marquages justes': 'Make 20 correct marks',
  'Réussir 15 bluffs jamais démasqués': 'Pull off 15 bluffs never caught', 'Gagner une partie avec tes 10 vies': 'Win a game with all 10 lives', 'Gagner 15 parties': 'Win 15 games',
  'Jouer 10 parties': 'Play 10 games', 'Réussir 25 bluffs jamais démasqués': 'Pull off 25 bluffs never caught', 'Réussir 25 contestations': 'Make 25 correct challenges',
  'Faire 40 marquages justes': 'Make 40 correct marks', 'Gagner 30 parties': 'Win 30 games', 'Jouer 50 parties': 'Play 50 games',
  'Jouer 2 parties': 'Play 2 games', 'Gagner 1 partie': 'Win 1 game', 'Réussir 2 contestations': 'Make 2 correct challenges', 'Réussir 3 bluffs jamais démasqués': 'Pull off 3 bluffs never caught',
  'Faire 3 marquages justes': 'Make 3 correct marks', 'Jouer 1 partie classée': 'Play 1 ranked game', 'Marquer 200 points en une partie': 'Score 200 points in one game', 'Gagner en gardant 8 vies ou plus': 'Win with 8 lives or more',
  // account
  Bienvenue: 'Welcome', 'Connecte-toi ou crée un compte pour jouer en ligne, monter au classement et débloquer des skins.': 'Sign in or create an account to play online, climb the leaderboards and unlock skins.',
  Connexion: 'Sign in', Inscription: 'Sign up', 'Pseudo ou e-mail': 'Username or e-mail', Pseudo: 'Username', 'E-mail': 'E-mail', 'Mot de passe': 'Password', 'Rester connecté': 'Stay signed in',
  'Créer mon compte': 'Create my account', 'Mot de passe oublié ?': 'Forgot your password?', 'En créant un compte, tu acceptes notre': 'By creating an account you accept our', 'politique de confidentialité': 'privacy policy',
  'Continuer avec Google': 'Continue with Google', 'Dernière étape : choisis ton pseudo': 'Last step: pick your username', 'Ton compte Google est vérifié. Ce pseudo sera visible par les autres joueurs.': 'Your Google account is verified. Other players will see this username.',
  'Dernières parties': 'Recent games', 'Aucune partie jouée pour l\'instant.': 'No games played yet.', Revoir: 'Replay', 'Face-à-face': 'Head to head', pts: 'pts',
  'Changer de mot de passe': 'Change password', 'Créer un mot de passe': 'Create a password', 'Ton compte utilise Google. Un mot de passe te permet aussi de te connecter avec ton pseudo.': 'Your account uses Google. A password also lets you sign in with your username.',
  Ancien: 'Current', Nouveau: 'New', 'Mot de passe enregistré ✓': 'Password saved ✓', 'Connexion Google': 'Google sign-in', 'Ton compte est relié à Google ✓': 'Your account is linked to Google ✓',
  'Relie ton compte Google pour te connecter en un clic.': 'Link your Google account to sign in with one click.', 'Se déconnecter': 'Sign out', 'Supprimer mon compte': 'Delete my account',
  'Ton e-mail, ton mot de passe, ta photo et tes amis sont effacés définitivement. Tes anciennes parties restent anonymes pour tes adversaires. Tape ton pseudo pour confirmer.': 'Your e-mail, password, picture and friends are erased for good. Your past games stay anonymous for your opponents. Type your username to confirm.',
  'Ton pseudo pour confirmer': 'Your username to confirm', 'Supprimer définitivement': 'Delete permanently', 'Confidentialité et données': 'Privacy and data',
  'Mot de passe oublié': 'Forgotten password', 'Ton e-mail': 'Your e-mail', 'Recevoir un lien': 'Send me a link', 'Envoi…': 'Sending…',
  'Si un compte utilise cette adresse, un e-mail vient de partir. Pense à regarder dans les spams.': 'If an account uses this address, an e-mail is on its way. Check your spam folder.',
  'La réinitialisation par e-mail n\'est pas encore activée. Si ton compte est relié à Google, connecte-toi avec Google.': 'Password reset by e-mail is not enabled yet. If your account is linked to Google, sign in with Google.',
  'Nouveau mot de passe': 'New password', 'Mot de passe changé ✓': 'Password changed ✓',
  // settings
  Thème: 'Theme', Jour: 'Day', Nuit: 'Night', 'Vert clair': 'Light green', 'Mauve améthyste': 'Amethyst purple', Partie: 'Game', Langue: 'Language',
  'Afficher les coups possibles': 'Show possible moves', Sons: 'Sounds', Application: 'App', '📲 Installer Bluff Gambit': '📲 Install Bluff Gambit',
  'Pour l’installer : menu du navigateur → « Ajouter à l’écran d’accueil » (ou « Installer l’application » sur PC).': 'To install it: browser menu → “Add to Home screen” (or “Install app” on a computer).',
  'Me prévenir quand c\'est mon tour (même site fermé)': 'Notify me when it is my turn (even with the site closed)', 'Notifications refusées par le navigateur.': 'Notifications blocked by the browser.',
  'Installe ou recharge le site pour activer les notifications.': 'Install or reload the site to enable notifications.',
  // friends
  'Connecte-toi pour ajouter des amis.': 'Sign in to add friends.', 'Pseudo de ton ami…': 'Your friend’s username…', 'Pseudo à ajouter': 'Username to add', 'Demande envoyée ✓': 'Request sent ✓',
  'Demandes reçues': 'Requests received', 'Mes amis': 'My friends', 'Temps pour les défis': 'Time for challenges', Défier: 'Challenge', 'en partie': 'in a game', 'en ligne': 'online', 'hors ligne': 'offline',
  'En ligne': 'Online', 'Hors ligne': 'Offline', 'Pas encore d\'amis : ajoute quelqu\'un avec son pseudo.': 'No friends yet: add someone by username.', 'En attente': 'Pending', 'Ton invitation a été refusée.': 'Your invitation was declined.',
  'te défie': 'challenges you', Invitation: 'Invitation',
  // game
  'Place tes pièces': 'Set up your pieces', 'Touche deux cases de tes 2 rangées pour échanger les pièces. Tout est permis, sauf les 2 fous sur la même couleur.': 'Tap two squares on your 2 ranks to swap pieces. Anything goes, except both bishops on the same colour.',
  'Mon arrangement': 'My arrangement', Prêt: 'Ready', 'En attente du placement adverse…': 'Waiting for the opponent’s setup…', 'L\'adversaire vient de jouer : contester ou non ?': 'Your opponent just moved: challenge or not?',
  'L\'adversaire peut contester ton coup…': 'Your opponent may challenge your move…', 'L\'adversaire réfléchit…': 'Your opponent is thinking…', 'Choisis ce que ta pièce imite.': 'Choose what your piece imitates.',
  'À toi de jouer : touche une de tes pièces.': 'Your turn: tap one of your pieces.', 'Touche une pièce adverse à marquer.': 'Tap an enemy piece to mark.', 'Annuler le marquage': 'Cancel marking', '🏷 Marquer une pièce': '🏷 Mark a piece',
  'Jouer comme…': 'Play as…', 'Marquer comme…': 'Mark as…', Promotion: 'Promotion', 'Rester pion': 'Stay a pawn', 'Choisir un type de pièce': 'Choose a piece type', '(vraie pièce)': '(real piece)', '(vraie)': '(real)',
  'Veux-tu contester ?': 'Challenge this move?', 'L\'adversaire a joué': 'Your opponent played', 'en prenant une pièce': 'capturing a piece', 'Oui, contester': 'Yes, challenge', 'Plus que': 'Only', s: 's',
  'Marquer une pièce adverse ?': 'Mark an enemy piece?', 'Possible 1 tour sur 2, pour te souvenir de ce que tu soupçonnes.': 'Allowed every other turn, to remember what you suspect.', 'Oui, marquer': 'Yes, mark', 'Possible 1 tour sur 2.': 'Allowed every other turn.',
  Abandonner: 'Resign', 'Abandonner la partie ?': 'Resign this game?', 'Voir le résultat': 'See the result', 'Victoire !': 'Victory!', Défaite: 'Defeat', victoire: 'win', pieces: 'pieces', vies: 'lives',
  contestations: 'challenges', marquages: 'marks', bluffs: 'bluffs', Score: 'Score', 'Tous les coups, révélés': 'Every move, revealed', 'joué comme': 'played as', '· bluff démasqué': '· bluff caught', '· bluff réussi': '· successful bluff',
  'Voir le plateau révélé': 'See the revealed board', 'Revoir la partie': 'Replay the game', 'Reconnexion…': 'Reconnecting…', spectateur: 'spectator', spectateurs: 'spectators', 'Fin de partie': 'Game over', 'Contester le coup adverse': 'Challenge the opponent’s move',
  // replay & spectate
  Replay: 'Replay', 'Position de départ, tout est révélé.': 'Starting position, everything revealed.', Coup: 'Move', 'bluff démasqué': 'bluff caught', 'bluff réussi': 'successful bluff', 'promu en': 'promoted to',
  'Coup affiché': 'Shown move', Début: 'Start', 'Coup précédent': 'Previous move', Lecture: 'Play', Pause: 'Pause', 'Coup suivant': 'Next move', Fin: 'End', comme: 'as',
  '👁 Spectateur': '👁 Spectator', 'Tu vois les coups, mais pas ce que cachent les pièces. Tout est révélé à la fin.': 'You see the moves, but not what the pieces hide. Everything is revealed at the end.',
  Quitter: 'Leave', 'Connexion à la partie…': 'Joining the game…', 'Partie terminée': 'Game over',
  // tutorial
  'Étape': 'Step', Précédent: 'Previous', Suivant: 'Next', 'Créer un compte pour jouer': 'Create an account to play',
  'Bluff Gambit, ce sont les échecs… avec des cartes cachées. Tu vois où sont les pièces adverses, jamais ce qu\'elles sont. Et chaque pièce peut se faire passer pour une autre.': 'Bluff Gambit is chess… with hidden cards. You see where the enemy pieces are, never what they are. And any piece can pretend to be another.',
  'Placer ses pièces': 'Setting up', 'Au début de la partie, tu as 2 minutes pour placer tes 16 pièces comme tu veux sur tes 2 rangées. Touche ton roi (e1) puis ta tour (h1) pour les échanger.': 'At the start you have 2 minutes to place your 16 pieces however you like on your 2 ranks. Tap your king (e1) then your rook (h1) to swap them.',
  'Échangé ! Seule règle : un fou sur case claire, l’autre sur case foncée. Ton arrangement préféré s’enregistre dans Personnalisation et revient à chaque partie.': 'Swapped! Only rule: one bishop on a light square, the other on a dark one. Your favourite arrangement is saved in Customise and comes back every game.',
  'Un vrai coup': 'A real move', 'Touche ton cavalier en g1. Au-dessus de lui, laisse « Cavalier » choisi, puis joue-le en L, en f3.': 'Tap your knight on g1. Keep “Knight” selected, then play it in an L to f3.',
  'Touche le cavalier en g1.': 'Tap the knight on g1.', 'Ça, c’est un bluff ! Garde « Cavalier » et joue en L.': 'That’s a bluff! Keep “Knight” and move in an L.',
  'Parfait. Un vrai coup ne risque rien. La petite icône en haut à gauche de la pièce te rappelle comment tu l’as jouée (ici : cavalier).': 'Perfect. A real move risks nothing. The small icon at the top left of the piece reminds you how you played it (here: knight).',
  'Ton premier bluff': 'Your first bluff', 'Touche le pion e2. Au-dessus de lui, choisis « Dame », puis va en e5 : trois cases tout droit, impossible pour un pion.': 'Tap the pawn on e2. Choose “Queen”, then go to e5: three squares straight ahead, impossible for a pawn.',
  'Ce coup est légal pour un pion : choisis « Dame » au-dessus de la pièce, puis va en e5.': 'That move is legal for a pawn: choose “Queen”, then go to e5.',
  'Bluff joué ! L’icône de dame te rappelle ton mensonge. Si l’adversaire conteste, tu perds 1 vie et la pièce. S’il ne dit rien, tu as gagné ton pari.': 'Bluff played! The queen icon reminds you of your lie. If your opponent challenges, you lose 1 life and the piece. If they say nothing, your bet paid off.',
  'Démasquer un bluff': 'Calling a bluff', 'Après chaque coup adverse, une fenêtre te demande si tu veux contester (10 secondes). Ici, la pièce marquée « cavalier » (elle a sauté en L avant) vient d\'aller tout droit de f6 en f3.': 'After each enemy move, a window asks whether you want to challenge (10 seconds). Here, the piece marked “knight” (it jumped in an L earlier) just moved straight from f6 to f3.',
  'Bluff démasqué ! C\'était bien un cavalier : l\'adversaire perd 1 vie et la pièce part au cimetière, révélée.': 'Bluff caught! It really was a knight: your opponent loses 1 life and the piece goes to the graveyard, revealed.',
  'Un cavalier ne va jamais tout droit… c’était un bluff. Réessaie.': 'A knight never moves straight… it was a bluff. Try again.',
  'Attention aux fausses alertes': 'Beware of false alarms', 'La pièce en e7 avance d\'une case. Tu contestes ?': 'The piece on e7 moves one square forward. Do you challenge?',
  'Bien vu. Un pion, une tour, une dame ou un roi peuvent faire ce coup : conteste seulement quand tu as un indice. Contester à tort te coûte 1 vie.': 'Well spotted. A pawn, rook, queen or king can all make that move: only challenge when you have a clue. A wrong challenge costs you 1 life.',
  'Raté : c’était un vrai pion. Contester à tort te coûte 1 vie. Réessaie.': 'Missed: it was a real pawn. A wrong challenge costs you 1 life. Try again.',
  'Un bluff qui prend une pièce': 'A bluff that captures', 'La pièce marquée « cavalier » vient d’aller tout droit de b5 en b2… en prenant ton pion (il est dans ton cimetière). Contester ?': 'The piece marked “knight” just moved straight from b5 to b2… capturing your pawn (it is in your graveyard). Challenge?',
  'Démasqué ! Quand un bluff est démasqué, sa prise est annulée : ton pion revient sur le plateau.': 'Caught! When a bluff is caught, its capture is undone: your pawn comes back to the board.',
  'Une pièce qui saute en L n’a pas pu aller tout droit… Réessaie.': 'A piece that jumps in an L could not move straight… Try again.',
  'Marquer une pièce': 'Marking a piece', 'Un tour sur deux, avant de jouer, on te propose de marquer une pièce adverse. Réponds « Oui », touche la pièce en d8, puis choisis ce que tu soupçonnes.': 'Every other turn, before moving, you may mark an enemy piece. Answer “Yes”, tap the piece on d8, then choose what you suspect.',
  'Marqué ! La marque n’est visible que par toi. En fin de partie, chaque marquage juste rapporte +5 points.': 'Marked! Only you can see it. At the end, each correct mark is worth +5 points.', 'Réponds « Oui » pour essayer.': 'Answer “Yes” to try it.',
  'La promotion': 'Promotion', 'Un vrai pion qui atteint la dernière rangée devient une des pièces qu’on t’a prises (ton cimetière). Avance le pion b7 en b8, puis choisis.': 'A real pawn reaching the last rank becomes one of your captured pieces (your graveyard). Push the pawn from b7 to b8, then choose.',
  'Touche le pion en b7.': 'Tap the pawn on b7.', 'Joue-le comme un vrai pion, d’une case.': 'Play it as a real pawn, one square.', 'Promu ! La pièce quitte ton cimetière. S’il est vide, ton pion reste un pion.': 'Promoted! The piece leaves your graveyard. If it is empty, your pawn stays a pawn.',
  'Capturer le roi': 'Capturing the king', 'Pas d’échec ni de mat : on gagne en prenant le roi. Pour l’exercice, la pièce en a8 est le roi. Prends-la avec ta tour, en vrai coup.': 'No check, no mate: you win by taking the king. For this exercise the piece on a8 is the king. Take it with your rook, as a real move.',
  'Prends la pièce en a8.': 'Take the piece on a8.', 'Un bluff sur le roi est démasqué automatiquement : tu perdrais ta pièce et 1 vie. Prends-le avec un vrai coup, avec ta tour.': 'A bluff on the king is caught automatically: you would lose your piece and 1 life. Take it with a real move, with your rook.',
  'Victoire ! Un roi ne se prend qu’avec un vrai coup : un bluff sur le roi est démasqué tout de suite.': 'Victory! A king can only be taken with a real move: a bluff on the king is caught at once.',
  'Vies, temps et fin de partie': 'Lives, time and the end', 'Chaque joueur a 10 vies.': 'Each player has 10 lives.',
  'Tu perds 1 vie quand ton bluff est démasqué, ou quand tu contestes à tort.': 'You lose 1 life when your bluff is caught, or when you challenge wrongly.',
  'La partie se termine si un roi est pris, si un joueur n’a plus de vies, si sa pendule tombe à zéro, ou s’il abandonne.': 'The game ends when a king is taken, a player runs out of lives, a clock hits zero, or someone resigns.',
  'S’il ne reste que les deux rois, la partie s’arrête : le plus de vies gagne (à égalité, celui qui a fait la dernière prise).': 'If only the two kings remain, the game stops: more lives wins (on a tie, whoever made the last capture).',
  'L’hôte choisit le temps de chaque joueur : 3, 5, 10, 20 minutes ou illimité. Tu as 10 secondes pour contester.': 'The host picks each player’s time: 3, 5, 10, 20 minutes or unlimited. You have 10 seconds to challenge.',
  'Les pièces prises sont révélées dans les cimetières, à côté du plateau. En fin de partie, tout le plateau est révélé.': 'Captured pieces are revealed in the graveyards next to the board. At the end the whole board is revealed.',
  'Pas d’échec, de mat, de pat, de roque, de prise en passant ni de règle des 50 coups.': 'No check, mate, stalemate, castling, en passant or 50-move rule.',
  'Les points': 'Points', 'À la fin de chaque partie, ton score se calcule ainsi :': 'At the end of each game your score is:', 'Victoire : +100.': 'Win: +100.',
  'Victoire : +100, plus un bonus de rapidité (jusqu’à +30) et +30 si tu gagnes après avoir eu 3 vies de retard.': 'Win: +100, plus a speed bonus (up to +30) and +30 if you win after being 3 lives behind.',
  'Pièces restantes : leur valeur (pion 1, cavalier et fou 3, tour 5, dame 9). Vies restantes : +5 chacune.': 'Pieces left: their value (pawn 1, knight and bishop 3, rook 5, queen 9). Lives left: +5 each.',
  'Contestation juste : +15, ratée : −5. Marquage juste : +5. Bluff jamais démasqué : +6. Abandonner donne 0.': 'Correct challenge: +15, wrong: −5. Correct mark: +5. Bluff never caught: +6. Resigning scores 0.',
  'Le score donne de l’XP (doublée pour ta 1re victoire du jour) et de l’or pour acheter des skins.': 'Your score gives XP (doubled for your first win of the day) and gold to buy skins.',
  'En partie classée, l’Elo fixe ton rang (Bronze → Maître) et tu gagnes des points de saison.': 'In ranked games, Elo sets your rank (Bronze → Master) and you earn season points.',
  'Les parties contre Bluffbot ne comptent pas.': 'Games against Bluffbot do not count.',
  // ranks, season points, gold
  Rang: 'Rank', Bronze: 'Bronze', Argent: 'Silver', Or: 'Gold', Platine: 'Platinum', Maître: 'Master', rapidité: 'speed', remontada: 'comeback',
  Médaille: 'Medal', Étoile: 'Star', 'pts de saison': 'season pts', 'Elo ·': 'Elo ·',
  '🏆 Points des parties classées ce mois-ci : le compteur repart à zéro le 1er du mois.': '🏆 Points from ranked games this month: the counter resets on the 1st.',
  'Victoire classée +10 (+2 par victoire d’affilée, jusqu’à +10), défaite −4. Plus de 3 parties par jour contre le même joueur ne comptent pas.': 'Ranked win +10 (+2 per win in a row, up to +10), loss −4. More than 3 games a day against the same player do not count.',
  'Article inconnu': 'Unknown item', 'Tu l’as déjà': 'You already have it', 'Pas assez d’or': 'Not enough gold',
  'Marquer 150 points en une partie': 'Score 150 points in one game',
  'À toi de jouer': 'Your turn', 'Tu connais toutes les règles. Entraîne-toi contre Bluffbot : il bluffe et conteste lui aussi.': 'You know every rule. Practise against Bluffbot: it bluffs and challenges too.',
  // rules page
  'Apprendre avec le tutoriel interactif': 'Learn with the interactive tutorial', 'Le principe': 'The idea', Placement: 'Setup', Contester: 'Challenge', Gagner: 'Winning', Marquer: 'Marking', Points: 'Points',
  'Tu vois où sont les pièces adverses, jamais ce qu\'elles sont. Chaque pièce peut imiter n\'importe quelle autre… à tes risques.': 'You see where the enemy pieces are, never what they are. Any piece can imitate any other… at your own risk.',
  'Place tes 16 pièces comme tu veux sur tes 2 premières rangées, avec 1 fou sur case claire et 1 fou sur case foncée. Ton arrangement préféré s\'enregistre dans Personnalisation.': 'Place your 16 pieces however you like on your first 2 ranks, with 1 bishop on a light square and 1 on a dark square. Your favourite arrangement is saved in Customise.',
  'Juste après chaque coup adverse, tu as 10 secondes pour contester. Si c\'était un bluff, il perd 1 vie et la pièce (et sa prise est annulée). Sinon, c\'est toi qui perds 1 vie.': 'Right after each enemy move you have 10 seconds to challenge. If it was a bluff, they lose 1 life and the piece (and its capture is undone). Otherwise you lose 1 life.',
  'Capture le roi adverse avec un vrai coup (un bluff sur le roi est démasqué automatiquement), ou fais tomber ses 10 vies, ou gagne au temps. S\'il ne reste que les deux rois, la partie s\'arrête : le joueur qui a le plus de vies gagne (à égalité, celui qui a fait la dernière prise).': 'Capture the enemy king with a real move (a bluff on the king is caught automatically), bring their 10 lives down, or win on time. If only the two kings remain, the game stops: the player with more lives wins (on a tie, whoever made the last capture).',
  'Un tour sur deux, avant de jouer, marque une pièce adverse pour t\'en souvenir. Les marquages justes rapportent des points.': 'Every other turn, before moving, mark an enemy piece to remember it. Correct marks are worth points.',
  'Un vrai pion arrivé au bout devient une des pièces qu\'on t\'a prises.': 'A real pawn reaching the end becomes one of your captured pieces.',
  'Victoire +100, pièces restantes (valeur × 3), vies × 5, contestation juste +15, marquage juste +5, bluff jamais démasqué +4.': 'Win +100, pieces left (value × 3), lives × 5, correct challenge +15, correct mark +5, bluff never caught +4.',
  // privacy
  'Ce que nous gardons': 'What we keep', 'Ce que nous ne faisons pas': 'What we don’t do', 'Où sont les données': 'Where the data lives', 'Tes droits': 'Your rights', 'Pour toute question :': 'Questions:',
  'Ton pseudo, ton adresse e-mail, ton mot de passe (chiffré, illisible même pour nous), ta photo de profil, tes réglages de jeu et tes parties (coups, scores, Elo).': 'Your username, e-mail address, password (hashed, unreadable even to us), profile picture, game settings and games (moves, scores, Elo).',
  'Si tu te connectes avec Google, nous gardons seulement l\'identifiant anonyme que Google nous donne et ton e-mail.': 'If you sign in with Google, we only keep the anonymous ID Google gives us and your e-mail.',
  'Si tu actives les notifications, ton navigateur nous donne une adresse technique pour t\'envoyer « c\'est ton tour ».': 'If you turn on notifications, your browser gives us a technical address to send you “your turn”.',
  'Pas de publicité, pas de traqueur, pas de revente. Ton e-mail ne sert qu\'à te connecter et à réinitialiser ton mot de passe.': 'No ads, no trackers, no selling. Your e-mail is only used to sign in and reset your password.',
  'Le site est hébergé par Render et la base de données par Turso, dans l\'Union européenne (Francfort). Tes réglages d\'affichage restent dans ton navigateur.': 'The site is hosted by Render and the database by Turso, in the European Union (Frankfurt). Your display settings stay in your browser.',
  'Tu peux voir tes données dans « Mon compte », les modifier, et supprimer ton compte à tout moment (bouton en bas de « Mon compte »). La suppression efface ton e-mail, ton mot de passe, ta photo et tes amis ; tes anciennes parties restent anonymes pour l\'historique de tes adversaires.': 'You can see your data in “My account”, change it, and delete your account at any time (button at the bottom of “My account”). Deletion erases your e-mail, password, picture and friends; your past games stay anonymous in your opponents’ history.',
  // server messages
  'Connecte-toi d\'abord': 'Sign in first', 'Abonnement invalide': 'Invalid subscription', 'Ancien mot de passe incorrect': 'Current password is wrong', 'Aucun joueur avec ce pseudo': 'No player with that username',
  'Aucune partie en cours': 'No game in progress', 'Ce compte Google est déjà relié à un autre joueur': 'This Google account is already linked to another player', 'Ce joueur n’est pas dans tes amis': 'This player is not your friend',
  'Ce pseudo est déjà pris': 'That username is taken', 'Ce pseudo est réservé, choisis-en un autre': 'That username is reserved, pick another', 'Cette partie a été jouée avant l’arrivée des replays': 'This game was played before replays existed',
  'Cette partie n’est plus en cours': 'This game is over', 'Code introuvable': 'Code not found', 'Composition invalide': 'Invalid piece set', 'Connexion Google expirée, recommence': 'Google sign-in expired, try again',
  'Connexion Google pas encore configurée': 'Google sign-in is not set up yet', 'Coup invalide': 'Invalid move', 'Demande introuvable': 'Request not found', 'Deux pièces sur la même case': 'Two pieces on the same square',
  'E-mail invalide': 'Invalid e-mail', 'Identifiants incorrects': 'Wrong username or password', 'Il faut 1 fou sur case claire et 1 fou sur case foncée': 'You need 1 bishop on a light square and 1 on a dark square',
  'Il faut placer 16 pièces': 'You must place 16 pieces', 'Invitation expirée': 'Invitation expired', 'Jeton Google invalide': 'Invalid Google token', 'La réinitialisation par e-mail n’est pas encore activée': 'Password reset by e-mail is not enabled yet',
  'Les pièces doivent être sur tes 2 premières rangées': 'Pieces must be on your first 2 ranks', 'Lien expiré ou déjà utilisé, refais une demande': 'Link expired or already used, ask again', 'L’e-mail n’a pas pu partir, réessaie plus tard': 'The e-mail could not be sent, try again later',
  'Marquage disponible 1 tour sur 2, avant de jouer': 'Marking is allowed every other turn, before moving', 'Marquage invalide': 'Invalid mark', 'Mot de passe : 8 caractères minimum': 'Password: 8 characters minimum',
  'Partage ce code à un ami': 'Share this code with a friend', 'Partie introuvable': 'Game not found', 'Photo inconnue': 'Unknown picture', 'Photo pas encore débloquée': 'Picture not unlocked yet', 'Pièce inconnue': 'Unknown piece',
  'Pièce invalide': 'Invalid piece', 'Placement déjà validé': 'Setup already confirmed', 'Placement invalide': 'Invalid setup', 'Pseudo : 3 à 16 lettres, chiffres, _ ou -': 'Username: 3 to 16 letters, digits, _ or -',
  'Pseudo ou e-mail déjà utilisé': 'Username or e-mail already used', 'Rien à contester': 'Nothing to challenge', 'Skin pas encore débloqué': 'Skin not unlocked yet', 'Tape exactement ton pseudo pour confirmer': 'Type your username exactly to confirm',
  'Temps invalide': 'Invalid time', 'Temps écoulé': 'Time out', 'Ton ami a déjà commencé une autre partie': 'Your friend already started another game', 'Ton ami est déjà en partie': 'Your friend is already in a game',
  'Ton ami n’est pas connecté': 'Your friend is not online', 'Trop de demandes, réessaie dans une heure': 'Too many requests, try again in an hour', 'Trop de tentatives, réessaie dans 15 minutes': 'Too many attempts, try again in 15 minutes',
  'Tu es déjà en partie': 'You are already in a game', 'Tu ne peux pas t’ajouter toi-même': 'You can’t add yourself', 'Arrangement invalide': 'Invalid arrangement', 'Emote inconnue': 'Unknown emote',
  'Un compte existe déjà avec cet e-mail : connecte-toi avec ton pseudo et ton mot de passe.': 'An account already uses this e-mail: sign in with your username and password.',
  "Ce n'est pas ton tour": 'It is not your turn', 'Bluff Gambit': 'Bluff Gambit', Français: 'Français', English: 'English',
  "Touche une pièce, choisis ce qu'elle imite, puis joue un coup légal pour ce type. La petite icône en haut à gauche te rappelle comment tu l'as jouée.": 'Tap a piece, choose what it imitates, then make a legal move for that type. The small icon at the top left reminds you how you played it.',
  'XP · Elo': 'XP · Elo', '· se termine dans': '· ends in', "L'adversaire peut contester ton coup… (": 'Your opponent may challenge your move… (',
  'En attente du placement adverse… (': 'Waiting for the opponent’s setup… (', 'Mon compte · Niv.': 'My account · Lvl',
  'La partie commence, Blanc joue.': 'The game begins, White to move.', 'Ton ami': 'Your friend',
}

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(Blanc|Noir) : ([a-h][1-8]) → ([a-h][1-8])(?: \(prend : (\S+)\))?$/, (m) => `${SIDE[m[1]]}: ${m[2]} → ${m[3]}${m[4] ? ` (takes: ${KIND[m[4]] ?? m[4]})` : ''}`],
  [/^(Blanc|Noir) conteste : bluff démasqué ! (Blanc|Noir) perd 1 vie et son (\S+)\.$/, (m) => `${SIDE[m[1]]} challenges: bluff caught! ${SIDE[m[2]]} loses 1 life and their ${KIND[m[3]]?.toLowerCase() ?? m[3]}.`],
  [/^(Blanc|Noir) conteste à tort : le coup était légal\. (Blanc|Noir) perd 1 vie\.$/, (m) => `${SIDE[m[1]]} challenges wrongly: the move was legal. ${SIDE[m[2]]} loses 1 life.`],
  [/^(Blanc|Noir) tente de prendre le roi en bluff : démasqué automatiquement, (Blanc|Noir) perd 1 vie et son (\S+)\.$/, (m) => `${SIDE[m[1]]} tries to take the king with a bluff: caught automatically, ${SIDE[m[2]]} loses 1 life and their ${KIND[m[3]]?.toLowerCase() ?? m[3]}.`],
  [/^Fin de partie : (Blanc|Noir) gagne \((.+)\)\.$/, (m) => `Game over: ${SIDE[m[1]]} wins (${REASON[m[2]] ?? m[2]}).`],
  [/^Coup impossible pour : (\S+)$/, (m) => `Impossible move for a ${KIND[m[1]]?.toLowerCase() ?? m[1]}`],
  [/^Jouée comme (\S+) : touche une case en surbrillance \(ou ta pièce pour changer\)\.$/, (m) => `Played as a ${KIND[m[1]] ?? m[1]}: tap a highlighted square (or your piece to change).`],
  [/^Joué comme (\S+)$/, (m) => `Played as ${KIND[m[1]] ?? m[1]}`],
  [/^Déconnecté · victoire dans (.+)$/, (m) => `Disconnected · you win in ${m[1]}`],
  [/^Défi envoyé à (.+)…$/, (m) => `Challenge sent to ${m[1]}…`],
  [/^(.+) est maintenant ton ami ✓$/, (m) => `${m[1]} is now your friend ✓`],
  [/^Retirer (.+) de tes amis \?$/, (m) => `Remove ${m[1]} from your friends?`],
  [/^Retirer (.+)$/, (m) => `Remove ${m[1]}`],
  [/^Saison de (\S+) (\d{4})$/, (m) => `${MONTHS_EN[MONTHS.indexOf(m[1])] ?? m[1]} ${m[2]} season`],
  [/^Recherche d'un adversaire \((.+)\)…$/, (m) => `Looking for an opponent (${m[1].replace('temps illimité', 'unlimited time')})…`],
  [/^(\d+) min$/, (m) => `${m[1]} min`],
  [/^Bluffbot \((facile|normal|difficile)\)$/, (m) => `Bluffbot (${({ facile: 'easy', normal: 'normal', difficile: 'hard' } as Record<string, string>)[m[1]]})`],
  [/^(.+) gagne \((.+)\)$/, (m) => `${m[1] === 'Toi' ? 'You win' : `${m[1]} wins`} (${REASON[m[2]] ?? m[2]})`],
  [/^\(comme (\S+)\)$/, (m) => `(as ${KIND[m[1]] ?? m[1]})`],
  [/^joué comme (\S+)$/, (m) => `played as ${KIND[m[1]] ?? m[1]}`],
  [/^Envoyer (.+)$/, (m) => `Send ${m[1]}`],
  [/^Photo (.+)$/, (m) => `Picture ${m[1]}`],
  [/^(.+) \(verrouillée\)$/, (m) => `${EN[m[1]] ?? m[1]} (locked)`],
  [/^Atteindre (.+) pendant une saison$/, (m) => `Reach ${EN[m[1]] ?? m[1]} during a season`],
  [/^Placement : (\d+)\/(\d+) parties classées \(l’Elo bouge plus vite\)\.$/, (m) => `Placement: ${m[1]}/${m[2]} ranked games (Elo moves faster).`],
  [/^(.+) · (\d+) 🪙$/, (m) => `${EN[m[1]] ?? m[1]} · ${m[2]} 🪙`],
  [/^(Saison de \S+ \d{4}) · (.+)$/, (m) => `${MONTHS_EN[MONTHS.indexOf(m[1].split(' ')[2])] ?? ''} ${m[1].split(' ')[3]} season · ${EN[m[2]] ?? m[2]}`],
  [/^Pas envie d’attendre \? Achète avec ton or \((\d+) 🪙, gagné en jouant : 1 pour 10 points de score\)\.$/, (m) => `Can’t wait? Buy it with your gold (${m[1]} 🪙, earned by playing: 1 per 10 score points).`],
  [/^(\d+) vies$/, (m) => `${m[1]} lives`],
  [/^(.+), case (\d+)$/, (m) => `${KIND[m[1]] ?? m[1]}, square ${m[2]}`],
  [/^(.+) \(vraie pièce\)$/, (m) => `${KIND[m[1]] ?? m[1]} (real piece)`],
  [/^Plus que (\d+) s$/, (m) => `Only ${m[1]} s left`],
  [/^● À toi de jouer · Bluff Gambit$/, () => '● Your turn · Bluff Gambit'],
]

let lang: Lang = 'fr'
const missing = new Set<string>()
const looksFrench = (s: string) => /[a-zà-ÿ]{3}/i.test(s) && !/^[\w.@-]+$/.test(s)

export function translate(text: string): string {
  if (lang === 'fr') return text
  const key = text.trim()
  if (!key) return text
  const hit = EN[key] ?? PATTERNS.reduce<string | undefined>((found, [re, f]) => found ?? (key.match(re) ? f(key.match(re)!) : undefined), undefined)
  if (hit === undefined) {
    if (looksFrench(key)) missing.add(key)
    return text
  }
  return text.replace(key, hit)
}

// Originals live here so French can be restored and our own writes are not re-translated.
const textOrig = new WeakMap<Text, { fr: string; shown: string }>()
const attrOrig = new WeakMap<Element, Record<string, { fr: string; shown: string }>>()
const ATTRS = ['placeholder', 'aria-label', 'title']

function doText(n: Text) {
  const cur = n.nodeValue ?? '', rec = textOrig.get(n)
  const fr = rec && cur === rec.shown ? rec.fr : cur
  const shown = translate(fr)
  textOrig.set(n, { fr, shown })
  if (shown !== cur) n.nodeValue = shown
}
function doAttrs(el: Element) {
  const recs = attrOrig.get(el) ?? {}
  for (const a of ATTRS) {
    const cur = el.getAttribute(a)
    if (cur === null) continue
    const fr = recs[a] && cur === recs[a].shown ? recs[a].fr : cur
    const shown = translate(fr)
    recs[a] = { fr, shown }
    if (shown !== cur) el.setAttribute(a, shown)
  }
  attrOrig.set(el, recs)
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text)
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const el = root as Element
  if (el.closest('input, textarea, script, style')) return
  doAttrs(el)
  const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text)
    else doAttrs(n as Element)
  }
}

let observer: MutationObserver | undefined
export function setLang(l: Lang) {
  lang = l
  document.documentElement.lang = l
  walk(document.body)
  document.title = translate(document.title)
  if (observer) return
  observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text)
      else if (m.type === 'attributes') doAttrs(m.target as Element)
      else m.addedNodes.forEach(walk)
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  const nativeConfirm = window.confirm.bind(window)
  window.confirm = (msg?: string) => nativeConfirm(translate(msg ?? ''))
}
export const getLang = () => lang
export const defaultLang = (): Lang => (navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en')
// Dev helper: French text seen on screen that has no translation yet.
;(window as unknown as { __i18nMissing: () => string[] }).__i18nMissing = () => [...missing]
