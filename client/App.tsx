import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { call, getToken, saveToken, socket } from './net.ts'
import { Game, PieceIcon } from './Game.tsx'
import type { GameView } from './Game.tsx'
import { Tutorial } from './Tutorial.tsx'
import { levelOf, BOARD_SKINS, KINDS, PIECE_SKINS, QUESTS, TIME_CONTROLS } from '../shared/rules.ts'

type Profile = {
  id: number; name: string; email: string; elo: number; piece_skin: string; board_skin: string
  stats: Record<string, number>; level: number; unlocked: string[]; inGame: boolean
}
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

export function App() {
  const [page, setPage] = useState(route)
  const [me, setMe] = useState<Profile | null>(null)
  const [online, setOnline] = useState(0)
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
    call<{ profile: Profile | null; online: number }>('me').then((r) => {
      setMe(r.profile)
      setOnline(r.online)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const onHash = () => setPage(route())
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
    if (socket.connected) refresh()
    return () => {
      removeEventListener('hashchange', onHash)
      socket.off('connect', refresh)
      socket.off('game', onGame)
      socket.off('emote', onEmote)
      socket.off('saved', refresh)
    }
  }, [refresh])

  const skins = { pieces: me?.piece_skin ?? 'classique', board: me?.board_skin ?? 'bois' }
  const leaveGame = () => {
    setView(null)
    go('/')
  }

  let body
  if (page === '/partie' && view)
    body = <Game v={view} skins={skins} sound={settings.sound} hints={settings.hints} emote={emote} onLeave={leaveGame} />
  else if (page === '/jouer') body = <Play me={me} view={view} />
  else if (page === '/classements') body = <Leaderboards />
  else if (page === '/perso') body = <Customize me={me} setMe={setMe} />
  else if (page === '/compte') body = <Account me={me} setMe={setMe} />
  else if (page === '/parametres') body = <SettingsPage s={settings} set={setSettings} />
  else if (page === '/regles') body = <Rules />
  else if (page === '/tutoriel') body = <Tutorial skins={skins} loggedIn={!!me} />
  else body = <Home me={me} online={online} view={view} />

  return (
    <div className="app">
      {page !== '/' && (
        <header className="top">
          <a href="#/" className="brand">♞ Bluff <span>Gambit</span></a>
          {me && <span className="muted">{me.name} · Elo {me.elo}</span>}
        </header>
      )}
      {body}
    </div>
  )
}

function Home({ me, online, view }: { me: Profile | null; online: number; view: GameView | null }) {
  return (
    <main className="home">
      <h1 className="logo">Bluff <span>Gambit</span></h1>
      <p className="tag">Les échecs où chaque pièce peut mentir.</p>
      {me ? (
        <div className="card hello">
          Salut <b>{me.name}</b> · Niveau {me.level} · Elo {me.elo}
        </div>
      ) : (
        <a className="btn primary" href="#/compte">Se connecter / créer un compte</a>
      )}
      <nav className="menu">
        {view && view.phase !== 'over' && <a className="btn primary" href="#/partie">Reprendre la partie</a>}
        <a className="btn primary" href="#/jouer">Jouer</a>
        <a className="btn" href="#/tutoriel">Tutoriel</a>
        <a className="btn" href="#/classements">Classements</a>
        <a className="btn" href="#/perso">Personnalisation</a>
        <a className="btn" href="#/compte">Mon compte</a>
        <a className="btn" href="#/parametres">Paramètres</a>
        <a className="btn" href="#/regles">Règles</a>
      </nav>
      <p className="muted">{online} joueur{online > 1 ? 's' : ''} en ligne</p>
    </main>
  )
}

const NeedLogin = () => (
  <main className="page">
    <p>Connecte-toi pour jouer.</p>
    <a className="btn primary" href="#/compte">Se connecter</a>
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
      <main className="page">
        <a className="btn primary" href="#/partie">Reprendre la partie en cours</a>
      </main>
    )
  const fail = (e: Error) => setErr(e.message)
  const cancel = () => call('queue:leave').then(() => { setWaiting(false); setCode('') })
  return (
    <main className="page">
      <h2>Jouer</h2>
      <section className="card">
        <h3>Temps par joueur</h3>
        <div className="row">
          {TIME_CONTROLS.map((m) => (
            <button key={m} className={m === minutes ? 'on' : ''} disabled={waiting || !!code} onClick={() => setMinutes(m)}>{m} min</button>
          ))}
        </div>
      </section>
      {waiting || code ? (
        <section className="card">
          {waiting && <p>Recherche d'un adversaire ({minutes} min)…</p>}
          {code && <p>Code de ta partie privée : <b className="code">{code}</b><br />Donne-le à ton ami.</p>}
          <button onClick={cancel}>Annuler</button>
        </section>
      ) : (
        <>
          <section className="card">
            <h3>Partie classée</h3>
            <p className="muted">Un adversaire au hasard, l'Elo compte.</p>
            <button className="primary" onClick={() => call('queue:join', { minutes }).then((r) => setWaiting(r.waiting)).catch(fail)}>Trouver un adversaire</button>
          </section>
          <section className="card">
            <h3>Entraînement</h3>
            <p className="muted">Contre Bluffbot, qui bluffe et conteste aussi. Ne compte ni pour l'Elo ni pour les quêtes.</p>
            <button onClick={() => call('bot:start', { minutes }).catch(fail)}>Jouer contre le bot</button>
          </section>
          <section className="card">
            <h3>Partie privée</h3>
            <p className="muted">Entre amis, sans Elo. Tu es l'hôte et tu choisis le temps.</p>
            <button onClick={() => call('private:create', { minutes }).then((r) => setCode(r.code)).catch(fail)}>Créer une partie</button>
            <form className="row" onSubmit={(e) => { e.preventDefault(); call('private:join', { code: join }).catch(fail) }}>
              <input value={join} onChange={(e) => setJoin(e.target.value)} placeholder="Code" maxLength={5} aria-label="Code de partie" />
              <button type="submit">Rejoindre</button>
            </form>
          </section>
        </>
      )}
      {err && <p className="warn">{err}</p>}
    </main>
  )
}

const BOARD_TABS: Record<string, string> = { elo: 'Elo', week: 'Semaine', wins: 'Victoires', bluff: 'Bluffeurs', detect: 'Détecteurs' }
function Leaderboards() {
  const [kind, setKind] = useState('elo')
  const [rows, setRows] = useState<{ name: string; value: number }[]>([])
  useEffect(() => {
    call('leaderboard', { kind }).then(setRows).catch(() => setRows([]))
  }, [kind])
  return (
    <main className="page">
      <h2>Classements</h2>
      <div className="row tabs">
        {Object.entries(BOARD_TABS).map(([k, l]) => <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <ol className="card ranking">
        {rows.map((r) => <li key={r.name}><span>{r.name}</span><b>{r.value}</b></li>)}
        {!rows.length && <p className="muted">Personne pour l'instant.</p>}
      </ol>
    </main>
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
      <button key={id} className={`skin ${active ? 'on' : ''}`} disabled={!open} onClick={() => pick(type, key)}>
        <span className={`mini board-${type === 'board' ? key : me.board_skin}`}>
          {(['K', 'Q', 'N', 'P'] as const).map((k, i) => (
            <span key={k} className={`sq ${i % 3 ? 'dark' : 'light'}`}>
              <PieceIcon kind={k} owner={i % 2 ? 'b' : 'w'} skin={type === 'pieces' ? key : me.piece_skin} />
            </span>
          ))}
        </span>
        <b>{label}</b>
        {!open && <small>🔒 {quest(id)?.label}</small>}
      </button>
    )
  }
  return (
    <main className="page">
      <h2>Personnalisation</h2>
      <h3>Pièces</h3>
      <div className="skins">{Object.entries(PIECE_SKINS).map(([k, l]) => tile('pieces', k, l))}</div>
      <h3>Plateau</h3>
      <div className="skins">{Object.entries(BOARD_SKINS).map(([k, l]) => tile('board', k, l))}</div>
      {err && <p className="warn">{err}</p>}
      <h3>Quêtes</h3>
      <ul className="card quests">
        {QUESTS.map((q) => {
          const n = Math.min(me.stats[q.stat] ?? 0, q.goal)
          return (
            <li key={q.id}>
              <span>{q.label}</span>
              <progress max={q.goal} value={n} />
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
  const field = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    call<{ token: string; profile: Profile }>(mode, f).then((r) => {
      saveToken(r.token, remember)
      setMe(r.profile)
    }).catch((e: Error) => setErr(e.message))
  }
  return (
    <form className="card auth" onSubmit={submit}>
      <div className="row tabs">
        <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Connexion</button>
        <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Inscription</button>
      </div>
      {mode === 'login' ? (
        <label>Pseudo ou e-mail<input {...field('login')} autoComplete="username" required /></label>
      ) : (
        <>
          <label>Pseudo<input {...field('name')} autoComplete="username" required /></label>
          <label>E-mail<input {...field('email')} type="email" autoComplete="email" required /></label>
        </>
      )}
      <label>Mot de passe<input {...field('password')} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>
      <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Rester connecté</label>
      <button className="primary" type="submit">{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
      {err && <p className="warn">{err}</p>}
    </form>
  )
}

type History = {
  games: { won: number; score: number; elo_before: number; elo_after: number; ended_at: number; opponent: string; reason: string; ranked: number }[]
  rivals: { name: string; games: number; wins: number }[]
}
function Account({ me, setMe }: { me: Profile | null; setMe: (p: Profile | null) => void }) {
  const [h, setH] = useState<History | null>(null)
  const [pw, setPw] = useState({ old: '', new: '' })
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (me) call<History>('history').then(setH).catch(() => {})
  }, [me])
  if (!me)
    return (
      <main className="page">
        <h2>Mon compte</h2>
        <AuthForm setMe={setMe} />
      </main>
    )
  const st = me.stats, xpNext = 100 * me.level ** 2, xpPrev = 100 * (me.level - 1) ** 2
  const logout = () => call('logout', { token: getToken() }).finally(() => {
    saveToken(null)
    setMe(null)
  })
  return (
    <main className="page">
      <h2>{me.name}</h2>
      <section className="card">
        <p>Niveau {levelOf(st.xp)} · {st.xp} XP · Elo {me.elo}</p>
        <progress max={xpNext - xpPrev} value={st.xp - xpPrev} />
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
              <span>{g.won ? '✅' : '❌'} vs {g.opponent} <small className="muted">({g.reason})</small></span>
              <b>{g.score} pts{g.ranked ? ` · ${g.elo_after - g.elo_before >= 0 ? '+' : ''}${g.elo_after - g.elo_before}` : ''}</b>
            </li>
          ))}
          {!h?.games.length && <p className="muted">Aucune partie jouée.</p>}
        </ul>
        {!!h?.rivals.length && (
          <>
            <h3>Face-à-face</h3>
            <ul className="ranking">
              {h.rivals.map((r) => <li key={r.name}><span>{r.name}</span><b>{r.wins} V / {r.games - r.wins} D</b></li>)}
            </ul>
          </>
        )}
      </section>
      <form className="card auth" onSubmit={(e) => {
        e.preventDefault()
        call('password', pw).then(() => setMsg('Mot de passe changé.')).catch((e: Error) => setMsg(e.message))
      }}>
        <h3>Changer de mot de passe</h3>
        <label>Ancien<input type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" required /></label>
        <label>Nouveau<input type="password" value={pw.new} onChange={(e) => setPw({ ...pw, new: e.target.value })} autoComplete="new-password" required /></label>
        <button type="submit">Changer</button>
        {msg && <p className="muted">{msg}</p>}
      </form>
      <button className="danger" onClick={logout}>Se déconnecter</button>
    </main>
  )
}

function SettingsPage({ s, set }: { s: Settings; set: (s: Settings) => void }) {
  return (
    <main className="page">
      <h2>Paramètres</h2>
      <section className="card">
        <h3>Thème</h3>
        <div className="row">
          {Object.entries(THEMES).map(([k, l]) => (
            <button key={k} className={`theme-${k} ${s.theme === k ? 'on' : ''}`} onClick={() => set({ ...s, theme: k })}>{l}</button>
          ))}
        </div>
      </section>
      <section className="card">
        <label className="check"><input type="checkbox" checked={s.hints} onChange={(e) => set({ ...s, hints: e.target.checked })} /> Afficher les coups possibles</label>
        <label className="check"><input type="checkbox" checked={s.sound} onChange={(e) => set({ ...s, sound: e.target.checked })} /> Sons</label>
      </section>
    </main>
  )
}

function Rules() {
  return (
    <main className="page rules">
      <h2>Règles</h2>
      <a className="btn primary" href="#/tutoriel">Apprendre avec le tutoriel interactif</a>
      <section className="card">
        <h3>Le principe</h3>
        <p>Tu vois où sont les pièces adverses, jamais ce qu'elles sont. Chaque pièce peut imiter n'importe quelle autre… à tes risques.</p>
        <h3>Placement</h3>
        <p>Place tes 16 pièces comme tu veux sur tes 2 premières rangées, avec 1 fou sur case claire et 1 fou sur case foncée.</p>
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
