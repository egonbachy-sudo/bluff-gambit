import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { call, getToken, saveToken, socket } from './net.ts'
import { Game } from './Game.tsx'
import type { GameView } from './Game.tsx'
import { Avatar, Board, PieceIcon, reducedMotion, RankBadge } from './Board.tsx'
import type { BoardPiece, Skins } from './Board.tsx'
import { Tutorial } from './Tutorial.tsx'
import { Replay } from './Replay.tsx'
import { defaultLang, getLang, setLang } from './i18n.ts'
import type { Lang } from './i18n.ts'
import { ForgotPassword, Friends, InviteToast, LiveGames, NotifySetting, Privacy, ResetPassword, Spectate, useFriendRequests } from './Social.tsx'
import { avatarOf, layoutError, levelOf, rankOf, PLACEMENT_GAMES, RANKS, SEASON_RANK_REWARDS, SHOP, placementLayout, randomSetup, AVATARS_BASE, AVATARS_SPECIAL, BOARD_SKINS, DEFAULT_LAYOUT, KINDS, NAMES, PIECE_SKINS, QUESTS, TIME_CONTROLS } from '../shared/rules.ts'
import type { Kind, Sq } from '../shared/rules.ts'

type Profile = {
  id: number; name: string; email: string; elo: number; piece_skin: string; board_skin: string; layout: string; avatar: string | null
  stats: Record<string, number>; level: number; unlocked: string[]; inGame: boolean; google: boolean; hasPassword: boolean
  daily: { quests: { id: string; label: string; goal: number; progress: number; done: boolean; xp: number }[]; resetAt: number }
  season: { label: string; start: number; end: number }
  awards: { season: string; rank: number; label: string }[]
  seasonRanks: { season: string; rank: string; label: string }[]; gold: number; seasonPoints: number
}
type Online = { players: number; visitors: number }
type Settings = { theme: string; hints: boolean; sound: boolean; lang: Lang }
const THEMES: Record<string, string> = { jour: 'Jour', nuit: 'Nuit', vert: 'Vert clair', amethyste: 'Mauve améthyste' }
const DEFAULTS: Settings = { theme: 'nuit', hints: true, sound: true, lang: defaultLang() }
function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('bg_settings') ?? '{}') }
  } catch {
    return DEFAULTS
  }
}
const route = () => location.hash.slice(1) || '/'
const go = (r: string) => (location.hash = r)
const NAV: [string, string, string][] = [['/jouer', 'Jouer', '♟'], ['/amis', 'Amis', '🤝'], ['/tutoriel', 'Tutoriel', '🎓'], ['/classements', 'Classements', '🏆'], ['/perso', 'Personnalisation', '🎨'], ['/regles', 'Règles', '📖']]

export function App() {
  const [page, setPage] = useState(route)
  const [me, setMe] = useState<Profile | null>(null)
  const requests = useFriendRequests(!!me)
  const [online, setOnline] = useState<Online>({ players: 0, visitors: 0 })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [cfg, setCfg] = useState({ mail: false, contact: '', vapid: '' })
  const [savedId, setSavedId] = useState<number | null>(null)
  const [view, setView] = useState<GameView | null>(null)
  const [emote, setEmote] = useState('')
  const [settings, setSettings] = useState(loadSettings)

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    setLang(settings.lang)
    try {
      localStorage.setItem('bg_settings', JSON.stringify(settings))
    } catch {
      // private mode: settings just won't persist
    }
  }, [settings])

  const refresh = useCallback(() => {
    call<{ profile: Profile | null; online: Online; googleClientId: string; mail: boolean; contact: string; vapid: string }>('me').then((r) => {
      setMe(r.profile)
      setOnline(r.online)
      setGoogleClientId(r.googleClientId)
      setCfg({ mail: r.mail, contact: r.contact, vapid: r.vapid })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const onHash = () => {
      if (route() === '/parametres') return setSettingsOpen(true)
      setPage(route())
      scrollTo({ top: 0 })
    }
    const onGame = (g: GameView) => {
      setView({ ...g, at: Date.now() })
      if (g.phase !== 'over' && route() !== '/partie') go('/partie')
    }
    const onEmote = (e: string) => {
      setEmote(e)
      clearTimeout(t)
      t = setTimeout(() => setEmote(''), 3000)
    }
    addEventListener('hashchange', onHash)
    socket.on('connect', refresh)
    socket.on('game', onGame)
    socket.on('emote', onEmote)
    const onSaved = (id: number) => {
      setSavedId(id)
      refresh() // the finished game is stored: stats and quests changed
    }
    socket.on('saved', onSaved)
    socket.on('online', setOnline)
    if (socket.connected) refresh()
    return () => {
      removeEventListener('hashchange', onHash)
      socket.off('connect', refresh)
      socket.off('game', onGame)
      socket.off('emote', onEmote)
      socket.off('saved', onSaved)
      socket.off('online', setOnline)
    }
  }, [refresh])

  const skins = { pieces: me?.piece_skin ?? 'classique', board: me?.board_skin ?? 'bois' }
  const leaveGame = () => {
    setView(null)
    go('/')
  }

  let body
  if (page === '/partie' && view)
    body = <Game v={view} skins={skins} layout={me?.layout ?? DEFAULT_LAYOUT} sound={settings.sound} hints={settings.hints} emote={emote} onLeave={leaveGame} savedId={savedId} />
  else if (page === '/jouer') body = <Play me={me} view={view} />
  else if (page === '/classements') body = <Leaderboards me={me} />
  else if (page === '/perso') body = <Customize me={me} setMe={setMe} />
  else if (page === '/compte') body = <Account me={me} setMe={setMe} googleClientId={googleClientId} mail={cfg.mail} />
  else if (page === '/regles') body = <Rules />
  else if (page === '/tutoriel') body = <Tutorial skins={skins} loggedIn={!!me} />
  else if (page.startsWith('/replay/')) body = <Replay id={Number(page.slice(8))} skins={skins} />
  else if (page === '/amis') body = <Friends loggedIn={!!me} />
  else if (page.startsWith('/regarder/')) body = <Spectate id={page.slice(10)} skins={skins} />
  else if (page === '/confidentialite') body = <Privacy contact={cfg.contact} />
  else if (page.startsWith('/reset/')) body = <ResetPassword token={page.slice(7)} />
  else body = <Home me={me} online={online} view={view} skins={skins} />

  return (
    <div className={`app ${page === '/partie' && view ? 'in-game' : ''}`}>
      <header className="top">
        <a href="#/" className="brand"><span className="brand-mark" aria-hidden="true">♞</span>Bluff <span>Gambit</span></a>
        <nav className="nav" aria-label="Navigation principale">
          {NAV.map(([r, l, icon]) => (
            <a key={r} href={`#${r}`} className={page === r ? 'current' : ''} aria-current={page === r ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">{icon}{r === '/amis' && requests > 0 && <span className="badge">{requests}</span>}</span>
              <span className="nav-label">{r === '/perso' ? <>Perso<span className="nav-long">nnalisation</span></> : l}</span>
            </a>
          ))}
        </nav>
        <div className="top-actions">
          {view && view.phase !== 'over' && page !== '/partie' && <a href="#/partie" className="btn primary small pulse">Partie en cours</a>}
          <button className={`icon-btn ${settingsOpen ? 'open' : ''}`} aria-label="Paramètres" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>⚙</button>
          {me ? (
            <a href="#/compte" className={`account ${page === '/compte' ? 'current' : ''}`}>
              <Avatar id={me.avatar} name={me.name} />
              <span className="account-text"><b>{me.name}</b><small>Mon compte · Niv. {me.level}</small></span>
            </a>
          ) : (
            <a href="#/compte" className="btn primary small">Se connecter</a>
          )}
        </div>
      </header>
      <div key={page} className="page-anim">{body}</div>
      {settingsOpen && <SettingsModal s={settings} set={setSettings} close={() => setSettingsOpen(false)} vapid={cfg.vapid} loggedIn={!!me} />}
      {me && <InviteToast />}
      <footer className="foot"><a href="#/confidentialite">Confidentialité</a><span aria-hidden="true">·</span><a href="#/regles">Règles</a></footer>
    </div>
  )
}

// ---------- home: animated board that loops through scenes showing every mechanic ----------
const HF = 'abcdefgh'
const hsq = (n: string): Sq => ({ x: HF.indexOf(n[0]), y: Number(n[1]) - 1 })
/** Enemy pieces are hidden: the real kind only shows when a scene reveals it. */
const HERO_BASE = ['wKe1', 'wQd1', 'wRa1', 'wNg1', 'wBc1', 'wPd4', 'wPe4', 'wPf2', 'wPb7', 'bKa8', 'bQd8', 'bRe8', 'bNc6', 'bPd5', 'bPf7', 'bPh7', 'bBg7']
type HeroApi = {
  move: (spec: string, to: string, claim?: Kind) => void
  reveal: (spec: string) => void
  remove: (spec: string) => void
  setKind: (spec: string, kind: Kind) => void
  mark: (spec: string, kind: Kind) => void
  badge: (text: string, tone?: string) => void
  skins: (s: Skins | null) => void
  wait: (ms: number) => Promise<void>
}
const SCENES: ((h: HeroApi) => Promise<void>)[] = [
  async (h) => { // bluff caught
    h.move('bNc6', 'c3'); await h.wait(900)
    h.badge('Bluff ?'); await h.wait(1300)
    h.badge('Démasqué ! −1 ❤', 'danger'); h.reveal('bNc6'); await h.wait(1300)
    h.remove('bNc6'); await h.wait(900)
  },
  async (h) => { // wrong contest
    h.move('wNg1', 'f3', 'N'); await h.wait(900)
    h.badge('Contesté…'); await h.wait(1200)
    h.badge('Coup légal ✓ L’adversaire perd 1 vie', 'success'); await h.wait(1600)
  },
  async (h) => { // capture
    h.move('wPe4', 'd5', 'P'); h.remove('bPd5'); await h.wait(300)
    h.badge('Prise !'); await h.wait(1500)
  },
  async (h) => { // successful bluff
    h.move('wPf2', 'f5', 'Q'); await h.wait(900)
    h.badge('Un pion joué en dame…'); await h.wait(1400)
    h.badge('Personne ne conteste 😏', 'success'); await h.wait(1400)
  },
  async (h) => { // marking
    h.badge('Marquage 🏷'); await h.wait(700)
    h.mark('bPh7', 'P'); await h.wait(700)
    h.mark('bQd8', 'Q'); await h.wait(700)
    h.mark('bBg7', 'B'); await h.wait(1200)
  },
  async (h) => { // promotion
    h.move('wPb7', 'b8', 'P'); await h.wait(800)
    h.setKind('wPb7', 'Q'); h.badge('Promotion !', 'success'); await h.wait(1600)
  },
  async (h) => { // customisation
    h.badge('Personnalise ton jeu ✨')
    for (const s of [{ pieces: 'neon', board: 'amethyste' }, { pieces: 'or', board: 'marbre' }, { pieces: 'contour', board: 'ocean' }, { pieces: 'lettres', board: 'bois' }]) {
      h.skins(s)
      await h.wait(1000)
    }
  },
  async (h) => { // king capture
    h.badge('Le roi se cache en a8…'); await h.wait(1200)
    h.reveal('bKa8'); await h.wait(500)
    h.move('wRa1', 'a8', 'R'); h.remove('bKa8'); await h.wait(400)
    h.badge('Roi capturé : victoire ! 🏆', 'success'); await h.wait(1600)
  },
]

// Stable ids: between scenes the pieces glide back home instead of all popping out and in.
const heroStart = (): BoardPiece[] => HERO_BASE.map((s) => ({ id: s, owner: s[0] as 'w' | 'b', kind: s[0] === 'w' ? (s[1] as Kind) : undefined, ...hsq(s.slice(2)) }))

function HeroBoard({ skins }: { skins: Skins }) {
  const [pieces, setPieces] = useState<BoardPiece[]>(heroStart)
  const [badge, setBadge] = useState<{ text: string; tone: string; leaving?: boolean } | null>(null)
  const [last, setLast] = useState<Sq[] | null>(null)
  const [skin, setSkin] = useState<Skins | null>(null)

  useEffect(() => {
    if (reducedMotion()) return
    let alive = true
    const edit = (spec: string, f: (p: BoardPiece) => BoardPiece | null) =>
      setPieces((ps) => ps.flatMap((p) => (p.id === spec ? (f(p) ?? []) : [p])))
    const h: HeroApi = {
      move: (spec, to, claim) => {
        const from = hsq(HERO_BASE.find((s) => s === spec)!.slice(2))
        setLast([from, hsq(to)])
        edit(spec, (p) => ({ ...p, ...hsq(to), claim }))
      },
      reveal: (spec) => edit(spec, (p) => ({ ...p, kind: spec[1] as Kind, mark: undefined })),
      remove: (spec) => edit(spec, () => null),
      setKind: (spec, kind) => edit(spec, (p) => ({ ...p, kind })),
      mark: (spec, kind) => edit(spec, (p) => ({ ...p, mark: kind })),
      badge: (text, tone = '') => setBadge({ text, tone }),
      skins: setSkin,
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    }
    ;(async () => {
      let n = -1
      await h.wait(1200)
      while (alive) {
        n = (n + 1) % SCENES.length // scenes play in order, then loop
        await SCENES[n](h)
        if (!alive) return
        setBadge((b) => b && { ...b, leaving: true })
        await h.wait(350)
        setBadge(null)
        setLast(null)
        setSkin(null)
        setPieces(heroStart())
        await h.wait(1600)
      }
    })()
    return () => { alive = false }
  }, [])

  return (
    <div className="hero-board" aria-hidden="true">
      <Board me="w" pieces={pieces} skins={skin ?? skins} last={last}
        overlay={badge && <span key={badge.text} className={`hero-badge ${badge.tone} ${badge.leaving ? 'leaving' : ''}`}>{badge.text}</span>} />
    </div>
  )
}

function Home({ me, online, view, skins }: { me: Profile | null; online: Online; view: GameView | null; skins: Skins }) {
  const [err, setErr] = useState('')
  const bot = () => call('bot:start', { minutes: 5 }).catch((e: Error) => setErr(e.message))
  const st = me?.stats
  const xpPrev = me ? 100 * (me.level - 1) ** 2 : 0, xpNext = me ? 100 * me.level ** 2 : 1
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Échecs · bluff · information cachée</p>
          <h1>Les échecs où chaque pièce <em>peut mentir</em>.</h1>
          <p className="lead">Place tes pièces en secret, fais passer un pion pour une dame, et démasque les bluffs adverses.</p>
          <div className="row cta">
            {view && view.phase !== 'over' ? (
              <a className="btn primary big" href="#/partie">Reprendre la partie</a>
            ) : me ? (
              <>
                <a className="btn primary big" href="#/jouer">Jouer maintenant</a>
                <button className="big" onClick={bot}>Défier Bluffbot 🤖</button>
              </>
            ) : (
              <>
                <a className="btn primary big" href="#/compte">Créer un compte</a>
                <a className="btn big" href="#/tutoriel">Essayer le tutoriel</a>
              </>
            )}
          </div>
          {err && <p className="warn" role="alert">{err}</p>}
          <p className="online">
            <span className="dot" aria-hidden="true" /> {online.players} <span>{online.players > 1 ? 'joueurs connectés' : 'joueur connecté'}</span>
            {online.visitors > 0 && <span className="muted"> · {online.visitors} <span>{online.visitors > 1 ? 'visiteurs' : 'visiteur'}</span></span>}
          </p>
        </div>
        <HeroBoard skins={skins} />
      </section>

      {me && st && (
        <section className="card welcome">
          <div className="welcome-head">
            <Avatar id={me.avatar} name={me.name} size={56} />
            <div>
              <h2>Bon retour, {me.name} !</h2>
              <p className="muted">Niveau {me.level} · {st.xp} XP</p>
            </div>
          </div>
          <progress max={xpNext - xpPrev} value={st.xp - xpPrev} aria-label="Progression vers le niveau suivant" />
          <div className="stats">
            <div><b>{rankOf(me.elo).label}</b>{me.elo} Elo</div>
            <div><b>{me.seasonPoints}</b>pts de saison</div>
            <div><b>{st.games}</b>parties</div>
            <div><b>{st.wins}</b>victoires</div>
            <div><b>{st.uncaught_bluffs}</b>bluffs réussis</div>
          </div>
          <DailyQuests daily={me.daily} />
        </section>
      )}

      <section className="how">
        {[
          ['🎭', 'Cache', 'Tes 16 pièces se placent où tu veux sur tes 2 rangées. L’adversaire ne voit que des pions mystère.'],
          ['🃏', 'Bluffe', 'Joue un cavalier comme une tour, un pion comme une dame. Personne ne le sait… sauf toi.'],
          ['⚖️', 'Conteste', 'Tu soupçonnes un bluff ? Conteste. Vu juste : il perd une vie et la pièce. Raté : c’est toi qui la perds.'],
        ].map(([icon, title, text]) => (
          <article key={title} className="card how-card">
            <span className="how-icon" aria-hidden="true">{icon}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="card band">
        <div>
          <h3>Nouveau ici ?</h3>
          <p className="muted">Le tutoriel interactif t’apprend tout en 2 minutes.</p>
        </div>
        <a className="btn" href="#/tutoriel">Lancer le tutoriel</a>
      </section>
    </main>
  )
}

const NeedLogin = () => (
  <main className="page center">
    <div className="card empty">
      <span className="how-icon" aria-hidden="true">🔒</span>
      <p>Connecte-toi pour accéder à cette page.</p>
      <a className="btn primary" href="#/compte">Se connecter</a>
    </div>
  </main>
)

function Play({ me, view }: { me: Profile | null; view: GameView | null }) {
  const [minutes, setMinutes] = useState(5)
  const [level, setLevel] = useState('normal')
  const [waiting, setWaiting] = useState(false)
  const [code, setCode] = useState('')
  const [join, setJoin] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => () => void call('queue:leave').catch(() => {}), [])
  if (!me) return <NeedLogin />
  if (view && view.phase !== 'over')
    return (
      <main className="page center">
        <a className="btn primary big" href="#/partie">Reprendre la partie en cours</a>
      </main>
    )
  const fail = (e: Error) => setErr(e.message)
  const cancel = () => call('queue:leave').then(() => { setWaiting(false); setCode('') })
  return (
    <main className="page wide">
      <h1>Jouer</h1>
      <section className="card">
        <h3>Temps par joueur</h3>
        <div className="row segmented">
          {TIME_CONTROLS.map((m) => (
            <button key={m} className={m === minutes ? 'on' : ''} disabled={waiting || !!code} onClick={() => setMinutes(m)}>{m ? `${m} min` : '∞ Illimité'}</button>
          ))}
        </div>
      </section>
      {waiting || code ? (
        <section className="card searching">
          <span className="spinner" aria-hidden="true" />
          {waiting && <p>Recherche d'un adversaire ({minutes ? `${minutes} min` : 'temps illimité'})…</p>}
          {code && <p>Code de ta partie privée : <b className="code" translate="no">{code}</b><br />Donne-le à ton ami.</p>}
          <button onClick={cancel}>Annuler</button>
        </section>
      ) : (
        <div className="modes">
          <section className="card mode">
            <span className="how-icon" aria-hidden="true">🏆</span>
            <h3>Partie classée</h3>
            <p className="muted">Un adversaire au hasard, l'Elo compte.</p>
            <button className="primary" onClick={() => call('queue:join', { minutes }).then((r) => setWaiting(r.waiting)).catch(fail)}>Trouver un adversaire</button>
          </section>
          <section className="card mode">
            <span className="how-icon" aria-hidden="true">🤖</span>
            <h3>Entraînement</h3>
            <p className="muted">Contre Bluffbot, qui bluffe et conteste aussi. Ne compte ni pour l'Elo ni pour les quêtes.</p>
            <div className="row segmented small-seg" role="radiogroup" aria-label="Niveau du bot">
              {['facile', 'normal', 'difficile'].map((l) => (
                <button key={l} role="radio" aria-checked={l === level} className={l === level ? 'on' : ''} onClick={() => setLevel(l)}>{l[0].toUpperCase() + l.slice(1)}</button>
              ))}
            </div>
            <button onClick={() => call('bot:start', { minutes, level }).catch(fail)}>Jouer contre le bot</button>
          </section>
          <section className="card mode">
            <span className="how-icon" aria-hidden="true">🤝</span>
            <h3>Partie privée</h3>
            <p className="muted">Entre amis, sans Elo. Tu es l'hôte et tu choisis le temps.</p>
            <button onClick={() => call('private:create', { minutes }).then((r) => setCode(r.code)).catch(fail)}>Créer une partie</button>
            <form className="row" onSubmit={(e) => { e.preventDefault(); call('private:join', { code: join }).catch(fail) }}>
              <input value={join} onChange={(e) => setJoin(e.target.value)} placeholder="Code, ex. K7M2Q…" maxLength={5} aria-label="Code de partie" autoComplete="off" spellCheck={false} />
              <button type="submit">Rejoindre</button>
            </form>
          </section>
        </div>
      )}
      {err && <p className="warn" role="alert">{err}</p>}
      <LiveGames />
    </main>
  )
}

const RANKS_LABEL = Object.fromEntries(RANKS.map((r) => [r.key, r.label]))
const BOARD_TABS: Record<string, string> = { elo: 'Rang', season: 'Saison', week: 'Semaine', wins: 'Victoires', bluff: 'Bluffeurs', detect: 'Détecteurs' }
function Leaderboards({ me }: { me: Profile | null }) {
  const [kind, setKind] = useState('elo')
  const [rows, setRows] = useState<{ name: string; avatar: string | null; value: number }[] | null>(null)
  useEffect(() => {
    setRows(null)
    call('leaderboard', { kind }).then(setRows).catch(() => setRows([]))
  }, [kind])
  return (
    <main className="page">
      <h1>Classements</h1>
      {kind === 'season' && me && <p className="muted season">🏆 {me.season.label} · se termine dans {Math.max(1, Math.ceil((me.season.end - Date.now()) / 86_400_000))} jour(s)</p>}
      {kind === 'season' && !me && <p className="muted season">🏆 Points des parties classées ce mois-ci : le compteur repart à zéro le 1er du mois.</p>}
      {(kind === 'season' || kind === 'week') && <p className="muted">Victoire classée +10 (+2 par victoire d’affilée, jusqu’à +10), défaite −4. Plus de 3 parties par jour contre le même joueur ne comptent pas.</p>}
      <div className="row tabs segmented" role="tablist">
        {Object.entries(BOARD_TABS).map(([k, l]) => <button key={k} role="tab" aria-selected={k === kind} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <ol className="card ranking">
        {rows?.map((r, i) => (
          <li key={r.name} className={r.name === me?.name ? 'me' : ''} style={{ animationDelay: `${i * 30}ms` }}>
            <span className="rank-n">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
            <Avatar id={r.avatar} name={r.name} size={30} />
            <span className="rank-name">{r.name}</span>
            {kind === 'elo' && <RankBadge elo={r.value} />}
            <b>{r.value}</b>
          </li>
        ))}
        {rows && !rows.length && <p className="muted">Personne pour l'instant. Sois le premier !</p>}
        {!rows && <p className="muted">Chargement…</p>}
      </ol>
    </main>
  )
}

function AvatarPicker({ me, setMe }: { me: Profile; setMe: (p: Profile) => void }) {
  const [err, setErr] = useState('')
  const pick = (avatar: string) => call<Profile>('avatar', { avatar }).then(setMe).catch((e: Error) => setErr(e.message))
  const quest = (key: string) => QUESTS.find((q) => q.reward === `avatar:${key}`)
  const lockText = (key: string) => {
    const rank = SEASON_RANK_REWARDS.find((r) => r.reward === `avatar:${key}`)?.rank
    return quest(key)?.label ?? (rank ? `Atteindre ${RANKS_LABEL[rank]} pendant une saison` : 'Finir dans le top 3 d’une saison')
  }
  const current = avatarOf(me.avatar)
  return (
    <section className="card">
      <div className="avatar-head">
        <Avatar id={me.avatar} name={me.name} size={64} />
        <div>
          <h3>Photo de profil</h3>
          <p className="muted">{current ? 'Visible dans les parties et les classements.' : 'Pour l’instant, ton initiale s’affiche. Choisis une photo !'}</p>
        </div>
      </div>
      <div className="avatar-grid">
        {AVATARS_BASE.map((e, i) => {
          const id = `b:${i}`
          return (
            <button key={id} className={`avatar-opt ${me.avatar === id ? 'on' : ''}`} onClick={() => pick(id)} aria-label={`Photo ${e}`} aria-pressed={me.avatar === id}>
              <Avatar id={id} name={me.name} size={44} />
            </button>
          )
        })}
      </div>
      <h3>Photos rares</h3>
      <div className="avatar-grid rare">
        {Object.entries(AVATARS_SPECIAL).map(([key, a]) => {
          const id = `s:${key}`, open = me.unlocked.includes(`avatar:${key}`)
          return (
            <button key={id} className={`avatar-opt rare ${me.avatar === id ? 'on' : ''} ${open ? '' : 'locked'}`} disabled={!open} onClick={() => pick(id)}
              aria-label={`${a.label}${open ? '' : ' (verrouillée)'}`} aria-pressed={me.avatar === id}>
              <Avatar id={id} name={me.name} size={52} />
              <b>{a.label}</b>
              {!open && <small>🔒 {lockText(key)}</small>}
            </button>
          )
        })}
      </div>
      <BuyRow me={me} setMe={setMe} items={Object.keys(AVATARS_SPECIAL).map((k) => `avatar:${k}`)} />
      {err && <p className="warn">{err}</p>}
    </section>
  )
}

/** Locked quest rewards that can be bought with gold instead. */
function BuyRow({ me, setMe, items }: { me: Profile; setMe: (p: Profile) => void; items: string[] }) {
  const [err, setErr] = useState('')
  const forSale = items.filter((i) => SHOP[i] && !me.unlocked.includes(i))
  if (!forSale.length) return null
  const label = (i: string) => {
    const [type, key] = i.split(':')
    return type === 'avatar' ? AVATARS_SPECIAL[key].label : type === 'board' ? BOARD_SKINS[key] : PIECE_SKINS[key]
  }
  return (
    <div className="shop">
      <p className="muted">{`Pas envie d’attendre ? Achète avec ton or (${me.gold} 🪙, gagné en jouant : 1 pour 10 points de score).`}</p>
      <div className="row">
        {forSale.map((i) => (
          <button key={i} disabled={me.gold < SHOP[i]} onClick={() => { setErr(''); call<Profile>('shop:buy', { item: i }).then(setMe).catch((e: Error) => setErr(e.message)) }}>
            {`${label(i)} · ${SHOP[i]} 🪙`}
          </button>
        ))}
      </div>
      {err && <p className="warn">{err}</p>}
    </div>
  )
}

/** The arrangement offered at the start of each game (and used if the placement timer runs out). */
function LayoutEditor({ me, setMe }: { me: Profile; setMe: (p: Profile) => void }) {
  const [layout, setLayout] = useState(me.layout)
  const [pick, setPick] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const err = layoutError(layout)
  const tap = (i: number) => {
    setMsg('')
    if (pick === null) return setPick(i)
    const a = [...layout]
    ;[a[pick], a[i]] = [a[i], a[pick]]
    setLayout(a.join(''))
    setPick(null)
  }
  // Front row on top, back row at the bottom, as seen from your side of the board.
  const cell = (i: number) => {
    const col = i % 8, y = i < 8 ? 0 : 1
    return (
      <button key={`${i}${layout[i]}`} className={`sq ${(col + y) % 2 ? 'light' : 'dark'} ${pick === i ? 'sel' : ''}`} onClick={() => tap(i)} aria-label={`${NAMES[layout[i] as Kind]}, case ${i + 1}`}>
        <PieceIcon kind={layout[i] as Kind} owner="w" skin={me.piece_skin} />
      </button>
    )
  }
  return (
    <section className="card">
      <h3>Arrangement de départ</h3>
      <p className="muted">Touche deux pièces pour les échanger. Tout est permis, sauf les 2 fous sur la même couleur. Il est proposé au début de chaque partie.</p>
      <div className={`layout-editor board-${me.board_skin}`}>
        {[8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7].map(cell)}
      </div>
      {err && <p className="warn">{err}</p>}
      <div className="row">
        <button onClick={() => setLayout(DEFAULT_LAYOUT)}>Classique</button>
        <button onClick={() => setLayout(placementLayout('w', randomSetup('w')))}>Aléatoire</button>
        <button className="primary" disabled={!!err || layout === me.layout}
          onClick={() => call<Profile>('layout', { layout }).then((p) => { setMe(p); setMsg('Arrangement enregistré ✓') }).catch((e: Error) => setMsg(e.message))}>
          Enregistrer
        </button>
        {msg && <span className="success" role="status">{msg}</span>}
      </div>
    </section>
  )
}

function Customize({ me, setMe }: { me: Profile | null; setMe: (p: Profile) => void }) {
  const [err, setErr] = useState('')
  if (!me) return <NeedLogin />
  const pick = (type: string, skin: string) => call<Profile>('skin', { type, skin }).then(setMe).catch((e: Error) => setErr(e.message))
  const quest = (reward: string) => QUESTS.find((q) => q.reward === reward)
  const tile = (type: 'pieces' | 'board', key: string, label: string) => {
    const id = `${type}:${key}`, open = me.unlocked.includes(id)
    const active = (type === 'pieces' ? me.piece_skin : me.board_skin) === key
    return (
      <button key={id} className={`skin ${active ? 'on' : ''} ${open ? '' : 'locked'}`} disabled={!open} onClick={() => pick(type, key)} aria-pressed={active}>
        <span className={`mini board-${type === 'board' ? key : me.board_skin}`}>
          {(['K', 'Q', 'N', 'P'] as const).map((k, i) => (
            <span key={k} className={`sq ${i % 3 ? 'dark' : 'light'}`}>
              <PieceIcon kind={k} owner={i % 2 ? 'b' : 'w'} skin={type === 'pieces' ? key : me.piece_skin} />
            </span>
          ))}
        </span>
        <b>{label}</b>
        {active && <small className="success">Équipé</small>}
        {!open && <small>🔒 {quest(id)?.label}</small>}
      </button>
    )
  }
  return (
    <main className="page wide">
      <h1>Personnalisation</h1>
      <AvatarPicker me={me} setMe={setMe} />
      <LayoutEditor me={me} setMe={setMe} />
      <h2>Pièces</h2>
      <div className="skins">{Object.entries(PIECE_SKINS).map(([k, l]) => tile('pieces', k, l))}</div>
      <h2>Plateau</h2>
      <div className="skins">{Object.entries(BOARD_SKINS).map(([k, l]) => tile('board', k, l))}</div>
      <BuyRow me={me} setMe={setMe} items={[...Object.keys(PIECE_SKINS).map((k) => `pieces:${k}`), ...Object.keys(BOARD_SKINS).map((k) => `board:${k}`)]} />
      {err && <p className="warn">{err}</p>}
      <h2>Quêtes du jour</h2>
      <div className="card"><DailyQuests daily={me.daily} /></div>
      <h2>Succès</h2>
      <ul className="card quests">
        {QUESTS.map((q) => {
          const n = Math.min(me.stats[q.stat] ?? 0, q.goal)
          return (
            <li key={q.id} className={n >= q.goal ? 'done' : ''}>
              <span>{q.label}</span>
              <progress max={q.goal} value={n} aria-label={q.label} />
              <small>{n}/{q.goal}{n >= q.goal ? ' ✓' : ''}</small>
            </li>
          )
        })}
      </ul>
    </main>
  )
}

declare global {
  interface Window { google?: any }
}
let gisLoading: Promise<void> | undefined
const loadGis = () => (gisLoading ??= new Promise<void>((ok, ko) => {
  const s = document.createElement('script')
  s.src = 'https://accounts.google.com/gsi/client'
  s.async = true
  s.onload = () => ok()
  s.onerror = () => ko(new Error('Google indisponible'))
  document.head.appendChild(s)
}))

/** Official "Continuer avec Google" button; hands back Google's signed ID token. */
function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onCredential)
  cb.current = onCredential
  useEffect(() => {
    if (!clientId) return
    loadGis().then(() => {
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => cb.current(r.credential) })
      if (ref.current) window.google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'fr', width: 300 })
    }).catch(() => {})
  }, [clientId])
  return clientId ? <div className="google-btn" ref={ref} /> : null
}

function AuthForm({ setMe, googleClientId, mail }: { setMe: (p: Profile) => void; googleClientId: string; mail: boolean }) {
  const [forgot, setForgot] = useState(false)
  const [google, setGoogle] = useState<{ ticket: string; name: string } | null>(null)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [f, setF] = useState({ login: '', name: '', email: '', password: '' })
  const [remember, setRemember] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const field = (k: keyof typeof f) => ({ name: k, value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) })
  const signedIn = (r: { token: string; profile: Profile }) => {
    saveToken(r.token, remember)
    setMe(r.profile)
    go('/')
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const req = google ? call('google:register', { ticket: google.ticket, name: google.name }) : call(mode, f)
    req.then(signedIn).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false))
  }
  const withGoogle = (credential: string) =>
    call<{ token: string; profile: Profile } | { needName: true; ticket: string; suggestion: string }>('google', { credential })
      .then((r) => ('needName' in r ? setGoogle({ ticket: r.ticket, name: r.suggestion }) : signedIn(r)))
      .catch((e: Error) => setErr(e.message))
  if (forgot) return <ForgotPassword mail={mail} onBack={() => setForgot(false)} />
  if (google)
    return (
      <form className="card auth" onSubmit={submit}>
        <h3>Dernière étape : choisis ton pseudo</h3>
        <p className="muted">Ton compte Google est vérifié. Ce pseudo sera visible par les autres joueurs.</p>
        <label>Pseudo<input name="name" value={google.name} onChange={(e) => setGoogle({ ...google, name: e.target.value })} autoComplete="username" spellCheck={false} required /></label>
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Un instant…' : 'Créer mon compte'}</button>
        <button type="button" className="ghost-btn" onClick={() => setGoogle(null)}>Annuler</button>
        {err && <p className="warn" role="alert">{err}</p>}
      </form>
    )
  return (
    <form className="card auth" onSubmit={submit}>
      <div className="row tabs segmented">
        <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Connexion</button>
        <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Inscription</button>
      </div>
      {mode === 'login' ? (
        <label>Pseudo ou e-mail<input {...field('login')} autoComplete="username" spellCheck={false} required /></label>
      ) : (
        <>
          <label>Pseudo<input {...field('name')} autoComplete="username" spellCheck={false} required /></label>
          <label>E-mail<input {...field('email')} type="email" autoComplete="email" spellCheck={false} required /></label>
        </>
      )}
      <label>Mot de passe<input {...field('password')} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>
      <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Rester connecté</label>
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Un instant…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
      {mode === 'login' ? <button type="button" className="link-btn" onClick={() => setForgot(true)}>Mot de passe oublié ?</button>
        : <small className="muted">En créant un compte, tu acceptes notre <a href="#/confidentialite">politique de confidentialité</a>.</small>}
      {googleClientId && <div className="or" aria-hidden="true">ou</div>}
      <GoogleButton clientId={googleClientId} onCredential={withGoogle} />
      {err && <p className="warn" role="alert">{err}</p>}
    </form>
  )
}

type History = {
  games: { game_id: number; replayable: number; won: number; score: number; elo_before: number; elo_after: number; ended_at: number; opponent: string; reason: string; ranked: number }[]
  rivals: { name: string; games: number; wins: number }[]
}
const dateFmt = { format: (t: number) => new Intl.DateTimeFormat(getLang() === 'en' ? 'en-GB' : 'fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t) }
function Account({ me, setMe, googleClientId, mail }: { me: Profile | null; setMe: (p: Profile | null) => void; googleClientId: string; mail: boolean }) {
  const [del, setDel] = useState('')
  const [delMsg, setDelMsg] = useState('')
  const [h, setH] = useState<History | null>(null)
  const [pw, setPw] = useState({ old: '', new: '' })
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (me) call<History>('history').then(setH).catch(() => {})
  }, [me])
  if (!me)
    return (
      <main className="page narrow">
        <h1>Bienvenue</h1>
        <p className="muted">Connecte-toi ou crée un compte pour jouer en ligne, monter au classement et débloquer des skins.</p>
        <AuthForm setMe={setMe} googleClientId={googleClientId} mail={mail} />
      </main>
    )
  const st = me.stats, xpNext = 100 * me.level ** 2, xpPrev = 100 * (me.level - 1) ** 2
  const refreshMe = () => call<{ profile: Profile }>('me').then((r) => setMe(r.profile)).catch(() => {})
  const logout = () => call('logout', { token: getToken() }).finally(() => {
    saveToken(null)
    setMe(null)
    go('/')
  })
  return (
    <main className="page">
      <section className="card welcome">
        <div className="welcome-head">
          <Avatar id={me.avatar} name={me.name} size={56} />
          <div>
            <h1>{me.name}</h1>
            <p className="muted">Niveau {levelOf(st.xp)} · {st.xp} XP · <RankBadge elo={me.elo} /> {me.elo} Elo · {me.gold} 🪙</p>
            {st.ranked < PLACEMENT_GAMES && <p className="muted">{`Placement : ${st.ranked}/${PLACEMENT_GAMES} parties classées (l’Elo bouge plus vite).`}</p>}
          </div>
        </div>
        <progress max={xpNext - xpPrev} value={st.xp - xpPrev} aria-label="Progression vers le niveau suivant" />
        <div className="stats">
          <div><b>{st.games}</b>parties</div>
          <div><b>{st.wins}</b>victoires</div>
          <div><b>{st.correct_challenges}</b>contestations justes</div>
          <div><b>{st.wrong_challenges}</b>contestations ratées</div>
          <div><b>{st.uncaught_bluffs}</b>bluffs réussis</div>
          <div><b>{st.correct_marks}</b>marquages justes</div>
        </div>
        {!!(me.awards.length + me.seasonRanks.length) && (
          <div className="awards">
            {me.awards.map((a) => <span key={a.season} className="award">{['', '🥇', '🥈', '🥉'][a.rank]} {a.label}</span>)}
            {me.seasonRanks.map((a) => <span key={`r${a.season}`} className="award">{`${a.label} · ${RANKS_LABEL[a.rank]}`}</span>)}
          </div>
        )}
      </section>
      <section className="card">
        <h3>Dernières parties</h3>
        <ul className="ranking">
          {h?.games.map((g) => (
            <li key={g.ended_at}>
              <span className="rank-n">{g.won ? '✅' : '❌'}</span>
              <span className="rank-name">vs {g.opponent} <small className="muted">· {g.reason} · {dateFmt.format(g.ended_at)}</small></span>
              <b>{g.score} pts{g.ranked ? ` · ${g.elo_after - g.elo_before >= 0 ? '+' : ''}${g.elo_after - g.elo_before}` : ''}</b>
              {!!g.replayable && <a className="btn small" href={`#/replay/${g.game_id}`}>Revoir</a>}
            </li>
          ))}
          {h && !h.games.length && <p className="muted">Aucune partie jouée pour l'instant.</p>}
        </ul>
        {!!h?.rivals.length && (
          <>
            <h3>Face-à-face</h3>
            <ul className="ranking">
              {h.rivals.map((r) => <li key={r.name}><span className="rank-name">{r.name}</span><b>{r.wins} V / {r.games - r.wins} D</b></li>)}
            </ul>
          </>
        )}
      </section>
      <form className="card auth" onSubmit={(e) => {
        e.preventDefault()
        call('password', pw).then(() => { setMsg('Mot de passe enregistré ✓'); refreshMe() }).catch((e: Error) => setMsg(e.message))
      }}>
        <h3>{me.hasPassword ? 'Changer de mot de passe' : 'Créer un mot de passe'}</h3>
        {!me.hasPassword && <p className="muted">Ton compte utilise Google. Un mot de passe te permet aussi de te connecter avec ton pseudo.</p>}
        {me.hasPassword && <label>Ancien<input type="password" name="old" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" required /></label>}
        <label>Nouveau<input type="password" name="new" value={pw.new} onChange={(e) => setPw({ ...pw, new: e.target.value })} autoComplete="new-password" required /></label>
        <button type="submit">Changer</button>
        {msg && <p className="muted" role="status">{msg}</p>}
      </form>
      {googleClientId && (
        <section className="card">
          <h3>Connexion Google</h3>
          {me.google ? (
            <p className="success">Ton compte est relié à Google ✓</p>
          ) : (
            <>
              <p className="muted">Relie ton compte Google pour te connecter en un clic.</p>
              <GoogleButton clientId={googleClientId} onCredential={(credential) => call<Profile>('google:link', { credential }).then(setMe).catch((e: Error) => setMsg(e.message))} />
            </>
          )}
        </section>
      )}
      <button className="danger ghost-btn" onClick={logout}>Se déconnecter</button>
      <details className="card danger-zone">
        <summary>Supprimer mon compte</summary>
        <p className="muted">Ton e-mail, ton mot de passe, ta photo et tes amis sont effacés définitivement. Tes anciennes parties restent anonymes pour tes adversaires. Tape ton pseudo pour confirmer.</p>
        <form className="row" onSubmit={(e) => {
          e.preventDefault()
          call('account:delete', { name: del }).then(() => { saveToken(null); setMe(null); go('/') }).catch((e: Error) => setDelMsg(e.message))
        }}>
          <input value={del} onChange={(e) => setDel(e.target.value)} placeholder={me.name} aria-label="Ton pseudo pour confirmer" autoComplete="off" spellCheck={false} />
          <button className="danger-fill" type="submit" disabled={del.toLowerCase() !== me.name.toLowerCase()}>Supprimer définitivement</button>
        </form>
        {delMsg && <p className="warn">{delMsg}</p>}
      </details>
      <p className="muted"><a href="#/confidentialite">Confidentialité et données</a></p>
    </main>
  )
}

/** Today's three quests; they change every day at midnight (UTC). */
function DailyQuests({ daily }: { daily: Profile['daily'] }) {
  const hours = Math.max(1, Math.ceil((daily.resetAt - Date.now()) / 3_600_000))
  return (
    <div className="daily">
      <div className="daily-head"><h3>Quêtes du jour</h3><small className="muted">nouvelles dans {hours} h</small></div>
      <ul className="quests">
        {daily.quests.map((q) => (
          <li key={q.id} className={q.done ? 'done' : ''}>
            <span>{q.label} <small className="xp">+{q.xp} XP</small></span>
            <progress max={q.goal} value={q.progress} aria-label={q.label} />
            <small>{q.progress}/{q.goal}{q.done ? ' ✓' : ''}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Browsers fire this once when the site can be installed; keep it for the settings button.
let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt = e as typeof installPrompt
})
function InstallApp() {
  const [can, setCan] = useState(!!installPrompt)
  const standalone = matchMedia('(display-mode: standalone)').matches
  if (standalone) return null
  return (
    <>
      <h3>Application</h3>
      {can ? (
        <button className="primary" onClick={() => installPrompt?.prompt().then(() => { installPrompt = null; setCan(false) })}>📲 Installer Bluff Gambit</button>
      ) : (
        <p className="muted">Pour l’installer : menu du navigateur → « Ajouter à l’écran d’accueil » (ou « Installer l’application » sur PC).</p>
      )}
    </>
  )
}

function SettingsModal({ s, set, close, vapid, loggedIn }: { s: Settings; set: (s: Settings) => void; close: () => void; vapid: string; loggedIn: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [close])
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="card settings" role="dialog" aria-modal="true" aria-label="Paramètres">
        <div className="settings-head">
          <h2>Paramètres</h2>
          <button className="icon-btn" aria-label="Fermer" onClick={close}>✕</button>
        </div>
        <h3>Langue</h3>
        <div className="row segmented" role="radiogroup" aria-label="Langue">
          {([['fr', 'Français'], ['en', 'English']] as const).map(([l, label]) => (
            <button key={l} role="radio" aria-checked={s.lang === l} className={s.lang === l ? 'on' : ''} onClick={() => set({ ...s, lang: l })} translate="no">{label}</button>
          ))}
        </div>
        <h3>Thème</h3>
        <div className="themes">
          {Object.entries(THEMES).map(([k, l]) => (
            <button key={k} className={`theme-swatch ${s.theme === k ? 'on' : ''}`} data-swatch={k} onClick={() => set({ ...s, theme: k })} aria-pressed={s.theme === k}>
              <span className="swatch" aria-hidden="true" />{l}
            </button>
          ))}
        </div>
        <InstallApp />
        <h3>Partie</h3>
        <label className="check"><input type="checkbox" checked={s.hints} onChange={(e) => set({ ...s, hints: e.target.checked })} /> Afficher les coups possibles</label>
        <label className="check"><input type="checkbox" checked={s.sound} onChange={(e) => set({ ...s, sound: e.target.checked })} /> Sons</label>
        <NotifySetting vapid={vapid} loggedIn={loggedIn} />
      </div>
    </div>
  )
}

function Rules() {
  return (
    <main className="page rules">
      <h1>Règles</h1>
      <a className="btn primary" href="#/tutoriel">Apprendre avec le tutoriel interactif</a>
      <section className="card">
        <h3>Le principe</h3>
        <p>Tu vois où sont les pièces adverses, jamais ce qu'elles sont. Chaque pièce peut imiter n'importe quelle autre… à tes risques.</p>
        <h3>Placement</h3>
        <p>Place tes 16 pièces comme tu veux sur tes 2 premières rangées, avec 1 fou sur case claire et 1 fou sur case foncée. Ton arrangement préféré s'enregistre dans Personnalisation.</p>
        <h3>Jouer</h3>
        <p>Touche une pièce, choisis ce qu'elle imite, puis joue un coup légal pour ce type. La petite icône en haut à gauche te rappelle comment tu l'as jouée.</p>
        <h3>Contester</h3>
        <p>Juste après chaque coup adverse, tu as 10 secondes pour contester. Si c'était un bluff, il perd 1 vie et la pièce (et sa prise est annulée). Sinon, c'est toi qui perds 1 vie.</p>
        <h3>Gagner</h3>
        <p>Capture le roi adverse avec un vrai coup (un bluff sur le roi est démasqué automatiquement), ou fais tomber ses 10 vies, ou gagne au temps. S'il ne reste que les deux rois, la partie s'arrête : le joueur qui a le plus de vies gagne (à égalité, celui qui a fait la dernière prise).</p>
        <h3>Marquer</h3>
        <p>Un tour sur deux, avant de jouer, marque une pièce adverse pour t'en souvenir. Les marquages justes rapportent des points.</p>
        <h3>Promotion</h3>
        <p>Un vrai pion arrivé au bout devient une des pièces qu'on t'a prises.</p>
        <h3>Points</h3>
        <p>Victoire +100, pièces restantes (valeur × 3), vies × 5, contestation juste +15, marquage juste +5, bluff jamais démasqué +4.</p>
      </section>
    </main>
  )
}
