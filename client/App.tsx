import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { call, getToken, saveToken, socket } from './net.ts'
import { Game } from './Game.tsx'
import type { GameView } from './Game.tsx'
import { Board, PieceIcon, reducedMotion } from './Board.tsx'
import type { BoardPiece, Skins } from './Board.tsx'
import { Tutorial } from './Tutorial.tsx'
import { layoutError, levelOf, placementLayout, randomSetup, BOARD_SKINS, DEFAULT_LAYOUT, KINDS, NAMES, PIECE_SKINS, QUESTS, TIME_CONTROLS } from '../shared/rules.ts'
import type { Kind, Sq } from '../shared/rules.ts'

type Profile = {
  id: number; name: string; email: string; elo: number; piece_skin: string; board_skin: string; layout: string
  stats: Record<string, number>; level: number; unlocked: string[]; inGame: boolean
}
type Online = { players: number; visitors: number }
type Settings = { theme: string; hints: boolean; sound: boolean }
const THEMES: Record<string, string> = { jour: 'Jour', nuit: 'Nuit', vert: 'Vert clair', amethyste: 'Mauve améthyste' }
const DEFAULTS: Settings = { theme: 'nuit', hints: true, sound: true }
function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('bg_settings') ?? '{}') }
  } catch {
    return DEFAULTS
  }
}
const route = () => location.hash.slice(1) || '/'
const go = (r: string) => (location.hash = r)
const NAV: [string, string][] = [['/jouer', 'Jouer'], ['/tutoriel', 'Tutoriel'], ['/classements', 'Classements'], ['/perso', 'Personnalisation'], ['/regles', 'Règles']]

export function App() {
  const [page, setPage] = useState(route)
  const [me, setMe] = useState<Profile | null>(null)
  const [online, setOnline] = useState<Online>({ players: 0, visitors: 0 })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<GameView | null>(null)
  const [emote, setEmote] = useState('')
  const [settings, setSettings] = useState(loadSettings)

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    try {
      localStorage.setItem('bg_settings', JSON.stringify(settings))
    } catch {
      // private mode: settings just won't persist
    }
  }, [settings])

  const refresh = useCallback(() => {
    call<{ profile: Profile | null; online: Online }>('me').then((r) => {
      setMe(r.profile)
      setOnline(r.online)
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
    socket.on('saved', refresh) // the finished game is stored: stats and quests changed
    socket.on('online', setOnline)
    if (socket.connected) refresh()
    return () => {
      removeEventListener('hashchange', onHash)
      socket.off('connect', refresh)
      socket.off('game', onGame)
      socket.off('emote', onEmote)
      socket.off('saved', refresh)
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
    body = <Game v={view} skins={skins} layout={me?.layout ?? DEFAULT_LAYOUT} sound={settings.sound} hints={settings.hints} emote={emote} onLeave={leaveGame} />
  else if (page === '/jouer') body = <Play me={me} view={view} />
  else if (page === '/classements') body = <Leaderboards me={me} />
  else if (page === '/perso') body = <Customize me={me} setMe={setMe} />
  else if (page === '/compte') body = <Account me={me} setMe={setMe} />
  else if (page === '/regles') body = <Rules />
  else if (page === '/tutoriel') body = <Tutorial skins={skins} loggedIn={!!me} />
  else body = <Home me={me} online={online} view={view} skins={skins} />

  return (
    <div className={`app ${page === '/partie' ? 'in-game' : ''}`}>
      <header className="top">
        <a href="#/" className="brand"><span className="brand-mark" aria-hidden="true">♞</span>Bluff <span>Gambit</span></a>
        <nav className="nav" aria-label="Navigation principale">
          {NAV.map(([r, l]) => <a key={r} href={`#${r}`} className={page === r ? 'current' : ''} aria-current={page === r ? 'page' : undefined}>{l}</a>)}
        </nav>
        <div className="top-actions">
          {view && view.phase !== 'over' && page !== '/partie' && <a href="#/partie" className="btn primary small pulse">Partie en cours</a>}
          <button className={`icon-btn ${settingsOpen ? 'open' : ''}`} aria-label="Paramètres" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>⚙</button>
          {me ? (
            <a href="#/compte" className={`account ${page === '/compte' ? 'current' : ''}`}>
              <span className="avatar" aria-hidden="true">{me.name[0]?.toUpperCase()}</span>
              <span className="account-text"><b>{me.name}</b><small>Mon compte · Niv. {me.level}</small></span>
            </a>
          ) : (
            <a href="#/compte" className="btn primary small">Se connecter</a>
          )}
        </div>
      </header>
      <div key={page} className="page-anim">{body}</div>
      {settingsOpen && <SettingsModal s={settings} set={setSettings} close={() => setSettingsOpen(false)} />}
    </div>
  )
}

// ---------- home: animated board that loops random scenes showing every mechanic ----------
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
      let prev = -1
      await h.wait(1200)
      while (alive) {
        let n = prev
        while (n === prev) n = Math.floor(Math.random() * SCENES.length)
        prev = n
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
            <span className="dot" aria-hidden="true" /> {online.players} joueur{online.players > 1 ? 's' : ''} connecté{online.players > 1 ? 's' : ''}
            {online.visitors > 0 && <span className="muted"> · {online.visitors} visiteur{online.visitors > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <HeroBoard skins={skins} />
      </section>

      {me && st && (
        <section className="card welcome">
          <div className="welcome-head">
            <span className="avatar big" aria-hidden="true">{me.name[0]?.toUpperCase()}</span>
            <div>
              <h2>Bon retour, {me.name} !</h2>
              <p className="muted">Niveau {me.level} · {st.xp} XP</p>
            </div>
          </div>
          <progress max={xpNext - xpPrev} value={st.xp - xpPrev} aria-label="Progression vers le niveau suivant" />
          <div className="stats">
            <div><b>{me.elo}</b>Elo</div>
            <div><b>{st.games}</b>parties</div>
            <div><b>{st.wins}</b>victoires</div>
            <div><b>{st.uncaught_bluffs}</b>bluffs réussis</div>
          </div>
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
            <button key={m} className={m === minutes ? 'on' : ''} disabled={waiting || !!code} onClick={() => setMinutes(m)}>{m} min</button>
          ))}
        </div>
      </section>
      {waiting || code ? (
        <section className="card searching">
          <span className="spinner" aria-hidden="true" />
          {waiting && <p>Recherche d'un adversaire ({minutes} min)…</p>}
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
            <button onClick={() => call('bot:start', { minutes }).catch(fail)}>Jouer contre le bot</button>
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
    </main>
  )
}

const BOARD_TABS: Record<string, string> = { elo: 'Elo', week: 'Semaine', wins: 'Victoires', bluff: 'Bluffeurs', detect: 'Détecteurs' }
function Leaderboards({ me }: { me: Profile | null }) {
  const [kind, setKind] = useState('elo')
  const [rows, setRows] = useState<{ name: string; value: number }[] | null>(null)
  useEffect(() => {
    setRows(null)
    call('leaderboard', { kind }).then(setRows).catch(() => setRows([]))
  }, [kind])
  return (
    <main className="page">
      <h1>Classements</h1>
      <div className="row tabs segmented" role="tablist">
        {Object.entries(BOARD_TABS).map(([k, l]) => <button key={k} role="tab" aria-selected={k === kind} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <ol className="card ranking">
        {rows?.map((r, i) => (
          <li key={r.name} className={r.name === me?.name ? 'me' : ''} style={{ animationDelay: `${i * 30}ms` }}>
            <span className="rank-n">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
            <span className="rank-name">{r.name}</span>
            <b>{r.value}</b>
          </li>
        ))}
        {rows && !rows.length && <p className="muted">Personne pour l'instant. Sois le premier !</p>}
        {!rows && <p className="muted">Chargement…</p>}
      </ol>
    </main>
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
      <LayoutEditor me={me} setMe={setMe} />
      <h2>Pièces</h2>
      <div className="skins">{Object.entries(PIECE_SKINS).map(([k, l]) => tile('pieces', k, l))}</div>
      <h2>Plateau</h2>
      <div className="skins">{Object.entries(BOARD_SKINS).map(([k, l]) => tile('board', k, l))}</div>
      {err && <p className="warn">{err}</p>}
      <h2>Quêtes</h2>
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

function AuthForm({ setMe }: { setMe: (p: Profile) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [f, setF] = useState({ login: '', name: '', email: '', password: '' })
  const [remember, setRemember] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const field = (k: keyof typeof f) => ({ name: k, value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    call<{ token: string; profile: Profile }>(mode, f).then((r) => {
      saveToken(r.token, remember)
      setMe(r.profile)
      go('/')
    }).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false))
  }
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
      {err && <p className="warn" role="alert">{err}</p>}
    </form>
  )
}

type History = {
  games: { won: number; score: number; elo_before: number; elo_after: number; ended_at: number; opponent: string; reason: string; ranked: number }[]
  rivals: { name: string; games: number; wins: number }[]
}
const dateFmt = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
function Account({ me, setMe }: { me: Profile | null; setMe: (p: Profile | null) => void }) {
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
        <AuthForm setMe={setMe} />
      </main>
    )
  const st = me.stats, xpNext = 100 * me.level ** 2, xpPrev = 100 * (me.level - 1) ** 2
  const logout = () => call('logout', { token: getToken() }).finally(() => {
    saveToken(null)
    setMe(null)
    go('/')
  })
  return (
    <main className="page">
      <section className="card welcome">
        <div className="welcome-head">
          <span className="avatar big" aria-hidden="true">{me.name[0]?.toUpperCase()}</span>
          <div>
            <h1>{me.name}</h1>
            <p className="muted">Niveau {levelOf(st.xp)} · {st.xp} XP · Elo {me.elo}</p>
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
      </section>
      <section className="card">
        <h3>Dernières parties</h3>
        <ul className="ranking">
          {h?.games.map((g) => (
            <li key={g.ended_at}>
              <span className="rank-n">{g.won ? '✅' : '❌'}</span>
              <span className="rank-name">vs {g.opponent} <small className="muted">· {g.reason} · {dateFmt.format(g.ended_at)}</small></span>
              <b>{g.score} pts{g.ranked ? ` · ${g.elo_after - g.elo_before >= 0 ? '+' : ''}${g.elo_after - g.elo_before}` : ''}</b>
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
        call('password', pw).then(() => setMsg('Mot de passe changé ✓')).catch((e: Error) => setMsg(e.message))
      }}>
        <h3>Changer de mot de passe</h3>
        <label>Ancien<input type="password" name="old" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" required /></label>
        <label>Nouveau<input type="password" name="new" value={pw.new} onChange={(e) => setPw({ ...pw, new: e.target.value })} autoComplete="new-password" required /></label>
        <button type="submit">Changer</button>
        {msg && <p className="muted" role="status">{msg}</p>}
      </form>
      <button className="danger ghost-btn" onClick={logout}>Se déconnecter</button>
    </main>
  )
}

function SettingsModal({ s, set, close }: { s: Settings; set: (s: Settings) => void; close: () => void }) {
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
        <h3>Thème</h3>
        <div className="themes">
          {Object.entries(THEMES).map(([k, l]) => (
            <button key={k} className={`theme-swatch ${s.theme === k ? 'on' : ''}`} data-swatch={k} onClick={() => set({ ...s, theme: k })} aria-pressed={s.theme === k}>
              <span className="swatch" aria-hidden="true" />{l}
            </button>
          ))}
        </div>
        <h3>Partie</h3>
        <label className="check"><input type="checkbox" checked={s.hints} onChange={(e) => set({ ...s, hints: e.target.checked })} /> Afficher les coups possibles</label>
        <label className="check"><input type="checkbox" checked={s.sound} onChange={(e) => set({ ...s, sound: e.target.checked })} /> Sons</label>
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
        <p>Touche une pièce, choisis ce qu'elle imite ({KINDS.length} types), puis joue un coup légal pour ce type. La petite lettre en haut à gauche te rappelle comment tu l'as jouée.</p>
        <h3>Contester</h3>
        <p>Juste après chaque coup adverse, tu as 10 secondes pour contester. Si c'était un bluff, il perd 1 vie et la pièce (et sa prise est annulée). Sinon, c'est toi qui perds 1 vie.</p>
        <h3>Gagner</h3>
        <p>Capture le roi adverse avec un vrai coup (un bluff sur le roi est démasqué automatiquement), ou fais tomber ses 10 vies, ou gagne au temps.</p>
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
