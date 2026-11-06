// Friends, invitations, spectating, privacy, password reset and notifications.
import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { call, socket } from './net.ts'
import { Avatar, Board, PieceIcon } from './Board.tsx'
import type { Skins } from './Board.tsx'
import { useNow } from './Game.tsx'
import type { GameView } from './Game.tsx'
import { TIME_CONTROLS } from '../shared/rules.ts'
import type { Color } from '../shared/rules.ts'

const timeLabel = (m: number) => (m ? `${m} min` : '∞')

// ---------- friends ----------
type Friend = { id: number; name: string; avatar: string | null; online: boolean; inGame: boolean; live: string | null }
type Lists = { friends: Friend[]; incoming: Friend[]; outgoing: Friend[] }

export function useFriendRequests(loggedIn: boolean) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!loggedIn) return setCount(0)
    const load = () => call<Lists>('friends:list').then((l) => setCount(l.incoming.length)).catch(() => {})
    load()
    socket.on('friends', load)
    return () => void socket.off('friends', load)
  }, [loggedIn])
  return count
}

export function Friends({ loggedIn }: { loggedIn: boolean }) {
  const [lists, setLists] = useState<Lists | null>(null)
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState(5)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!loggedIn) return
    const load = () => call<Lists>('friends:list').then(setLists).catch(() => {})
    load()
    const declined = () => setMsg('Ton invitation a été refusée.')
    socket.on('friends', load)
    socket.on('invite:declined', declined)
    return () => {
      socket.off('friends', load)
      socket.off('invite:declined', declined)
    }
  }, [loggedIn])
  if (!loggedIn)
    return (
      <main className="page center">
        <div className="card empty"><span className="how-icon" aria-hidden="true">🤝</span><p>Connecte-toi pour ajouter des amis.</p><a className="btn primary" href="#/compte">Se connecter</a></div>
      </main>
    )
  const act = (p: Promise<unknown>, ok = '') => p.then(() => setMsg(ok)).catch((e: Error) => setMsg(e.message))
  const add = (e: FormEvent) => {
    e.preventDefault()
    act(call('friends:add', { name }), 'Demande envoyée ✓')
    setName('')
  }
  const row = (f: Friend, actions: ReactNode) => (
    <li key={f.id} className="friend">
      <span className="friend-pic">
        <Avatar id={f.avatar} name={f.name} size={40} />
        <span className={`presence ${f.online ? 'on' : ''}`} title={f.online ? 'En ligne' : 'Hors ligne'} />
      </span>
      <span className="rank-name">
        <b>{f.name}</b>
        <small className="muted">{f.inGame ? 'en partie' : f.online ? 'en ligne' : 'hors ligne'}</small>
      </span>
      <span className="row">{actions}</span>
    </li>
  )
  return (
    <main className="page">
      <h1>Amis</h1>
      <form className="card row add-friend" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pseudo de ton ami…" aria-label="Pseudo à ajouter" autoComplete="off" spellCheck={false} />
        <button className="primary" type="submit" disabled={!name.trim()}>Ajouter</button>
      </form>
      {msg && <p className="muted" role="status">{msg}</p>}
      {!!lists?.incoming.length && (
        <section className="card">
          <h3>Demandes reçues</h3>
          <ul className="ranking">
            {lists.incoming.map((f) => row(f, <>
              <button className="primary small" onClick={() => act(call('friends:accept', { id: f.id }), `${f.name} est maintenant ton ami ✓`)}>Accepter</button>
              <button className="small" onClick={() => act(call('friends:remove', { id: f.id }))}>Refuser</button>
            </>))}
          </ul>
        </section>
      )}
      <section className="card">
        <div className="daily-head">
          <h3>Mes amis</h3>
          <div className="row segmented small-seg" aria-label="Temps pour les défis">
            {TIME_CONTROLS.map((m) => <button key={m} className={m === minutes ? 'on' : ''} onClick={() => setMinutes(m)}>{timeLabel(m)}</button>)}
          </div>
        </div>
        <ul className="ranking">
          {lists?.friends.map((f) => row(f, <>
            {f.live && <a className="btn small" href={`#/regarder/${f.live}`}>Regarder</a>}
            <button className="primary small" disabled={!f.online || f.inGame} onClick={() => act(call('friends:invite', { id: f.id, minutes }), `Défi envoyé à ${f.name}…`)}>Défier</button>
            <button className="small ghost-btn" aria-label={`Retirer ${f.name}`} onClick={() => confirm(`Retirer ${f.name} de tes amis ?`) && act(call('friends:remove', { id: f.id }))}>✕</button>
          </>))}
          {lists && !lists.friends.length && <p className="muted">Pas encore d'amis : ajoute quelqu'un avec son pseudo.</p>}
        </ul>
      </section>
      {!!lists?.outgoing.length && (
        <section className="card">
          <h3>En attente</h3>
          <ul className="ranking">
            {lists.outgoing.map((f) => row(f, <button className="small" onClick={() => act(call('friends:remove', { id: f.id }))}>Annuler</button>))}
          </ul>
        </section>
      )}
    </main>
  )
}

/** Pops up when a friend challenges you; expires after a minute. */
export function InviteToast() {
  const [inv, setInv] = useState<{ id: string; from: string; avatar: string | null; minutes: number; at: number } | null>(null)
  const [err, setErr] = useState('')
  const now = useNow(500)
  useEffect(() => {
    const on = (i: { id: string; from: string; avatar: string | null; minutes: number }) => {
      setErr('')
      setInv({ ...i, at: Date.now() })
    }
    socket.on('invite', on)
    return () => void socket.off('invite', on)
  }, [])
  if (!inv) return null
  const left = Math.ceil((60_000 - (now - inv.at)) / 1000)
  if (left <= 0) return null
  const answer = (accept: boolean) => call('invite:answer', { id: inv.id, accept }).then(() => setInv(null)).catch((e: Error) => setErr(e.message))
  return (
    <div className="toast" role="alertdialog" aria-label="Invitation">
      <Avatar id={inv.avatar} name={inv.from} size={44} />
      <div>
        <b>{inv.from}</b> te défie ({timeLabel(inv.minutes)})
        <div className="row">
          <button className="primary small" onClick={() => answer(true)}>Accepter</button>
          <button className="small" onClick={() => answer(false)}>Refuser</button>
          <small className="muted">{left} s</small>
        </div>
        {err && <small className="warn">{err}</small>}
      </div>
    </div>
  )
}

// ---------- spectating ----------
type Live = { id: string; names: Record<Color, string>; avatars: Record<Color, string | null>; minutes: number; ranked: boolean; bot: boolean; phase: string; spectators: number }

export function LiveGames() {
  const [games, setGames] = useState<Live[] | null>(null)
  useEffect(() => {
    const load = () => call<Live[]>('live:list').then(setGames).catch(() => setGames([]))
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])
  return (
    <section className="card">
      <h3>👁 Regarder une partie</h3>
      <ul className="ranking">
        {games?.map((g) => (
          <li key={g.id}>
            <Avatar id={g.avatars.w} name={g.names.w} size={28} />
            <span className="rank-name"><b>{g.names.w}</b> <span className="muted">vs</span> <b>{g.names.b}</b>
              <small className="muted">{g.ranked ? 'classée' : g.bot ? 'entraînement' : 'amicale'} · {timeLabel(g.minutes)}{g.spectators ? ` · 👁 ${g.spectators}` : ''}</small>
            </span>
            <a className="btn small" href={`#/regarder/${g.id}`}>Regarder</a>
          </li>
        ))}
        {games && !games.length && <p className="muted">Aucune partie publique en cours pour l'instant.</p>}
        {!games && <p className="muted">Chargement…</p>}
      </ul>
    </section>
  )
}

type SpecView = GameView & { id: string; away: Record<Color, number> }
export function Spectate({ id, skins }: { id: string; skins: Skins }) {
  const [v, setV] = useState<SpecView | null>(null)
  const [err, setErr] = useState('')
  const now = useNow()
  useEffect(() => {
    const on = (s: SpecView) => setV({ ...s, at: Date.now() })
    socket.on('spec', on)
    call('spectate', { id }).catch((e: Error) => setErr(e.message))
    return () => {
      socket.off('spec', on)
      call('unspectate').catch(() => {})
    }
  }, [id])
  if (err) return <main className="page center"><div className="card empty"><p>{err}</p><a className="btn" href="#/jouer">Retour</a></div></main>
  if (!v) return <main className="page center"><p className="muted">Connexion à la partie…</p></main>
  const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
  const bar = (c: Color) => {
    const active = (v.phase === 'move' || v.phase === 'challenge') && v.turn === c
    return (
      <div className={`bar ${active ? 'active' : ''}`}>
        <div className="who"><Avatar id={v.avatars?.[c]} name={v.names[c]} size={30} /><b>{v.names[c]}</b></div>
        <div className="lives">❤ {v.lives[c]}</div>
        <div className="clock">{v.minutes ? fmt(v.clock[c] - (active ? now - v.at : 0)) : '∞'}</div>
        <div className="grave">{v.captured[c].map((k, i) => <PieceIcon key={i} kind={k} owner={c} skin={skins.pieces} />)}</div>
      </div>
    )
  }
  return (
    <main className="game">
      <div className="board-col">
        {bar('b')}
        <Board me="w" pieces={v.pieces} skins={skins} last={v.last ? [v.last.from, v.last.to] : null} captured={v.captured} />
        {bar('w')}
      </div>
      <aside className="panel">
        <div className="card controls">
          <h2>👁 Spectateur</h2>
          <p className="muted">Tu vois les coups, mais pas ce que cachent les pièces. Tout est révélé à la fin.</p>
          {v.phase === 'over' && <p className="success">{v.winner ? `${v.names[v.winner]} gagne (${v.reason})` : 'Partie terminée'}</p>}
          <a className="btn" href="#/jouer">Quitter</a>
        </div>
        <ol className="log card" reversed>{[...v.log].reverse().map((l, i) => <li key={v.log.length - i}>{l}</li>)}</ol>
      </aside>
    </main>
  )
}

// ---------- privacy ----------
export function Privacy({ contact }: { contact: string }) {
  return (
    <main className="page rules">
      <h1>Confidentialité</h1>
      <section className="card">
        <h3>Ce que nous gardons</h3>
        <p>Ton pseudo, ton adresse e-mail, ton mot de passe (chiffré, illisible même pour nous), ta photo de profil, tes réglages de jeu et tes parties (coups, scores, Elo).</p>
        <p>Si tu te connectes avec Google, nous gardons seulement l'identifiant anonyme que Google nous donne et ton e-mail.</p>
        <p>Si tu actives les notifications, ton navigateur nous donne une adresse technique pour t'envoyer « c'est ton tour ».</p>
        <h3>Ce que nous ne faisons pas</h3>
        <p>Pas de publicité, pas de traqueur, pas de revente. Ton e-mail ne sert qu'à te connecter et à réinitialiser ton mot de passe.</p>
        <h3>Où sont les données</h3>
        <p>Le site est hébergé par Render et la base de données par Turso, dans l'Union européenne (Francfort). Tes réglages d'affichage restent dans ton navigateur.</p>
        <h3>Tes droits</h3>
        <p>Tu peux voir tes données dans « Mon compte », les modifier, et supprimer ton compte à tout moment (bouton en bas de « Mon compte »). La suppression efface ton e-mail, ton mot de passe, ta photo et tes amis ; tes anciennes parties restent anonymes pour l'historique de tes adversaires.</p>
        {contact && <p>Pour toute question : <a href={`mailto:${contact}`}>{contact}</a>.</p>}
      </section>
    </main>
  )
}

// ---------- password reset ----------
export function ForgotPassword({ mail, onBack }: { mail: boolean; onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  if (!mail)
    return (
      <div className="card auth">
        <h3>Mot de passe oublié</h3>
        <p className="muted">La réinitialisation par e-mail n'est pas encore activée. Si ton compte est relié à Google, connecte-toi avec Google.</p>
        <button type="button" onClick={onBack}>Retour</button>
      </div>
    )
  return (
    <form className="card auth" onSubmit={(e) => {
      e.preventDefault()
      setBusy(true)
      call('password:forgot', { email }).then(() => setMsg('Si un compte utilise cette adresse, un e-mail vient de partir. Pense à regarder dans les spams.'))
        .catch((e: Error) => setMsg(e.message)).finally(() => setBusy(false))
    }}>
      <h3>Mot de passe oublié</h3>
      <label>Ton e-mail<input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" spellCheck={false} required /></label>
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Recevoir un lien'}</button>
      <button type="button" className="ghost-btn" onClick={onBack}>Retour</button>
      {msg && <p className="muted" role="status">{msg}</p>}
    </form>
  )
}

export function ResetPassword({ token }: { token: string }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)
  return (
    <main className="page narrow">
      <h1>Nouveau mot de passe</h1>
      {done ? (
        <div className="card empty"><p className="success">Mot de passe changé ✓</p><a className="btn primary" href="#/compte">Se connecter</a></div>
      ) : (
        <form className="card auth" onSubmit={(e) => {
          e.preventDefault()
          call('password:reset', { token, password: pw }).then(() => setDone(true)).catch((e: Error) => setMsg(e.message))
        }}>
          <label>Nouveau mot de passe<input type="password" name="new" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
          <button className="primary" type="submit">Enregistrer</button>
          {msg && <p className="warn" role="alert">{msg}</p>}
        </form>
      )}
    </main>
  )
}

// ---------- notifications ----------
const b64ToBytes = (s: string) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

/** "C'est ton tour" pushes, sent by the server when you have no tab open. */
export function NotifySetting({ vapid, loggedIn }: { vapid: string; loggedIn: boolean }) {
  const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  const [on, setOn] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setOn(!!s)).catch(() => {})
  }, [supported])
  if (!supported || !loggedIn || !vapid) return null
  const toggle = async () => {
    setMsg('')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) return setMsg('Installe ou recharge le site pour activer les notifications.')
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await call('push:unsubscribe', { endpoint: existing.endpoint })
        await existing.unsubscribe()
        return setOn(false)
      }
      if ((await Notification.requestPermission()) !== 'granted') return setMsg('Notifications refusées par le navigateur.')
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapid) })
      await call('push:subscribe', { sub: sub.toJSON() })
      setOn(true)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }
  return (
    <>
      <label className="check"><input type="checkbox" checked={on} onChange={toggle} /> Me prévenir quand c'est mon tour (même site fermé)</label>
      {msg && <p className="muted">{msg}</p>}
    </>
  )
}
