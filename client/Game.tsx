import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { beep, call } from './net.ts'
import { Board, PieceIcon } from './Board.tsx'
import type { BoardPiece, Skins } from './Board.tsx'
import { classicSetup, destinations, homeRows, lastRank, layoutPlacement, opp, randomSetup, setupError, sqName, EMOTES, KINDS, NAMES } from '../shared/rules.ts'
import type { Color, Kind, Placement, Sq } from '../shared/rules.ts'
import type { View } from '../server/game.ts'

export { PieceIcon, glyph } from './Board.tsx'
export type { Skins } from './Board.tsx'
export type GameView = View & {
  names: Record<Color, string>; elo: Record<Color, number>; ranked: boolean; minutes: number
  clock: Record<Color, number>; windowLeft: number; setupLeft: number; eloDelta?: Record<Color, number>; at: number
}
type Piece = { id: string; owner: Color; x: number; y: number; kind?: Kind; moved?: boolean; claim?: Kind | null }
type SetupPiece = Placement[number] & { id: string }

export function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const withIds = (p: Placement): SetupPiece[] => p.map((e, i) => ({ ...e, id: `s${i}` }))

export function Game({ v, skins, layout, sound, hints, emote, onLeave }: {
  v: GameView; skins: Skins; layout: string; sound: boolean; hints: boolean; emote: string; onLeave: () => void
}) {
  const me = v.me, foe = opp(me), now = useNow()
  const pieces = v.pieces as Piece[]
  const [sel, setSel] = useState<string | null>(null)
  const [as, setAs] = useState<Kind>('P')
  const [marking, setMarking] = useState(false)
  const [markTarget, setMarkTarget] = useState<string | null>(null)
  const [promo, setPromo] = useState<Sq | null>(null)
  const [pl, setPl] = useState<SetupPiece[]>(() => withIds(layoutPlacement(me, layout)))
  const [swap, setSwap] = useState<Sq | null>(null)
  const [err, setErr] = useState('')
  const [showEnd, setShowEnd] = useState(true)
  const graves = useRef<Record<Color, HTMLDivElement | null>>({ w: null, b: null })

  useEffect(() => {
    setSel(null)
    setMarking(false)
    setMarkTarget(null)
    setPromo(null)
  }, [v.turn, v.phase])
  useEffect(() => {
    if (sound && v.phase === 'challenge' && v.turn === me) beep(880)
  }, [v.phase, v.turn, me, sound])

  const send = (ev: string, data: unknown = {}) => call(ev, data).then(() => setErr('')).catch((e: Error) => setErr(e.message))
  const setupMode = v.phase === 'setup' && !v.ready[me]
  const myTurn = v.phase === 'move' && v.turn === me
  const occ = useMemo(() => {
    const m = new Map(pieces.map((p) => [p.x * 8 + p.y, p.owner]))
    return (x: number, y: number) => m.get(x * 8 + y) ?? null
  }, [pieces])
  const selected = pieces.find((p) => p.id === sel)
  const dests = selected && myTurn ? destinations(as, me, selected, occ, !!selected.moved) : []
  const promoKinds = [...new Set(v.captured[me].filter((k) => k !== 'P' && k !== 'K'))]
  const setupErr = setupMode ? setupError(me, pl) : null
  const boardPieces: BoardPiece[] = useMemo(
    () => (setupMode ? pl.map((e) => ({ ...e, owner: me })) : pieces.map((p) => ({ ...p, mark: p.kind ? undefined : v.marks[p.id] }))),
    [setupMode, pl, pieces, v.marks, me],
  )

  function play(to: Sq, promoKind?: Kind) {
    send('game:move', { pieceId: sel, to, as, promo: promoKind })
    setSel(null)
    setPromo(null)
  }

  function click(x: number, y: number) {
    setErr('')
    if (setupMode) {
      if (!homeRows(me).includes(y)) return
      if (!swap) return setSwap({ x, y })
      const a = pl.find((e) => e.x === swap.x && e.y === swap.y)!, b = pl.find((e) => e.x === x && e.y === y)!
      setPl(pl.map((e) => (e === a ? { ...e, x, y } : e === b ? { ...e, x: swap.x, y: swap.y } : e)))
      return setSwap(null)
    }
    const p = pieces.find((q) => q.x === x && q.y === y)
    if (marking) {
      if (p?.owner === foe) setMarkTarget(p.id)
      return
    }
    if (!myTurn) return
    if (p?.owner === me) {
      setSel(p.id)
      setAs(p.kind!)
      return
    }
    if (selected && dests.some((d) => d.x === x && d.y === y)) {
      if (selected.kind === 'P' && y === lastRank(me) && promoKinds.length) return setPromo({ x, y })
      return play({ x, y })
    }
    setSel(null)
  }

  const picker = (kinds: Kind[], cur: Kind | null, pick: (k: Kind) => void, real?: Kind) => (
    <div className="picker">
      {kinds.map((k) => (
        <button key={k} className={k === cur ? 'on' : ''} onClick={() => pick(k)}>
          <PieceIcon kind={k} owner={me} skin={skins.pieces} /> {NAMES[k]}
          {k === real && <small> (vraie)</small>}
        </button>
      ))}
    </div>
  )

  function bar(c: Color) {
    const active = (v.phase === 'move' || v.phase === 'challenge') && v.turn === c
    const ms = v.clock[c] - (active ? now - v.at : 0)
    return (
      <div className={`bar ${active ? 'active' : ''}`}>
        <div className="who">
          <span className="avatar" aria-hidden="true">{v.names[c][0]?.toUpperCase()}</span>
          <b>{v.names[c]}</b> <small>{v.elo[c]}</small>
          {c === foe && emote && <span className="bubble" role="status">{emote}</span>}
        </div>
        <div className="lives" aria-label={`${v.lives[c]} vies`}><span key={v.lives[c]} className="heart">❤</span> {v.lives[c]}</div>
        <div className={`clock ${active && ms < 30_000 ? 'low' : ''}`}>{fmt(ms)}</div>
        <div className="grave" ref={(el) => { graves.current[c] = el }}>
          {v.captured[c].map((k, i) => <PieceIcon key={i} kind={k} owner={c} skin={skins.pieces} />)}
        </div>
      </div>
    )
  }

  const left = (ms: number) => Math.ceil(Math.max(0, ms - (now - v.at)) / 1000)
  let controls: ReactNode
  if (setupMode)
    controls = (
      <>
        <h3>Place tes pièces</h3>
        <p>Touche deux cases de tes 2 rangées pour échanger les pièces. Tout est permis, sauf les 2 fous sur la même couleur. <span className="muted">({left(v.setupLeft)} s)</span></p>
        <div className="row">
          <button onClick={() => setPl(withIds(layoutPlacement(me, layout)))}>Mon arrangement</button>
          <button onClick={() => setPl(withIds(classicSetup(me)))}>Classique</button>
          <button onClick={() => setPl(withIds(randomSetup(me)))}>Aléatoire</button>
          <button className="primary" disabled={!!setupErr} onClick={() => send('game:setup', { placement: pl.map(({ x, y, kind }) => ({ x, y, kind })) })}>Prêt</button>
        </div>
        {setupErr && <p className="warn">{setupErr}</p>}
      </>
    )
  else if (v.phase === 'setup') controls = <p className="waiting">En attente du placement adverse… ({left(v.setupLeft)} s)</p>
  else if (v.phase === 'challenge' && v.turn === me)
    controls = (
      <div className="challenge">
        <p>
          L'adversaire a joué <b>{v.last && `${sqName(v.last.from)} → ${sqName(v.last.to)}`}</b>. Bluff ?
        </p>
        <div className="timer" style={{ animationDuration: `${Math.max(0, v.windowLeft)}ms` }} aria-hidden="true" />
        <div className="row">
          <button className="danger" onClick={() => send('game:challenge', { contest: true })}>Contester</button>
          <button onClick={() => send('game:challenge', { contest: false })}>Laisser passer</button>
          <span className="muted">{left(v.windowLeft)} s</span>
        </div>
      </div>
    )
  else if (v.phase === 'challenge') controls = <p className="waiting">L'adversaire peut contester ton coup… ({left(v.windowLeft)} s)</p>
  else if (myTurn)
    controls = (
      <>
        {promo ? (
          <>
            <p>Promotion : choisis une pièce de ton cimetière.</p>
            {picker(promoKinds, null, (k) => play(promo, k))}
            <button onClick={() => play(promo)}>Rester pion</button>
          </>
        ) : markTarget ? (
          <>
            <p>Marquer cette pièce comme…</p>
            {picker(KINDS, v.marks[markTarget] ?? null, (k) => {
              send('game:mark', { pieceId: markTarget, kind: k })
              setMarking(false)
              setMarkTarget(null)
            })}
          </>
        ) : marking ? (
          <p>Touche une pièce adverse à marquer. <button onClick={() => setMarking(false)}>Annuler</button></p>
        ) : selected ? (
          <>
            <p>Jouer cette pièce comme :</p>
            {picker(KINDS, as, setAs, selected.kind)}
          </>
        ) : (
          <p className="your-turn">À toi de jouer : touche une de tes pièces.</p>
        )}
        {v.canMark && !marking && !promo && <button onClick={() => { setSel(null); setMarking(true) }}>🏷 Marquer une pièce</button>}
      </>
    )
  else if (v.phase === 'move') controls = <p className="waiting">L'adversaire réfléchit…</p>

  const s = v.scores?.[me]
  return (
    <div className="game">
      <div className="board-col">
        {bar(foe)}
        <Board
          me={me} pieces={boardPieces} skins={skins} onSquare={click} hints={hints}
          sel={setupMode ? swap : selected} dests={dests} last={v.last ? [v.last.from, v.last.to] : null}
          home={setupMode ? homeRows(me) : undefined} captured={v.captured} graveOf={(c) => graves.current[c]}
        />
        {bar(me)}
      </div>

      <aside className="panel">
        <div className="controls card" aria-live="polite">
          {controls}
          {err && <p className="warn">{err}</p>}
        </div>
        {v.phase !== 'over' && (
          <div className="row emotes">
            {EMOTES.map((e) => <button key={e} aria-label={`Envoyer ${e}`} onClick={() => send('game:emote', { emoji: e })}>{e}</button>)}
            <button className="danger ghost-btn" onClick={() => confirm('Abandonner la partie ?') && send('game:resign')}>Abandonner</button>
          </div>
        )}
        {v.phase === 'over' && !showEnd && <button className="primary" onClick={() => setShowEnd(true)}>Voir le résultat</button>}
        <ol className="log card" reversed>
          {[...v.log].reverse().map((l, i) => <li key={v.log.length - i}>{l}</li>)}
        </ol>
      </aside>

      {v.phase === 'over' && showEnd && s && (
        <div className="modal" role="dialog" aria-label="Fin de partie">
          <div className={`card end ${v.winner === me ? 'won' : 'lost'}`}>
            <div className="end-icon" aria-hidden="true">{v.winner === me ? '🏆' : '🎭'}</div>
            <h2>{v.winner === me ? 'Victoire !' : 'Défaite'}</h2>
            <p className="muted">{v.reason}</p>
            <table>
              <tbody>
                {Object.entries(s.detail).map(([k, n]) => <tr key={k}><td>{k}</td><td>+{n}</td></tr>)}
                <tr className="total"><td>Score</td><td>{s.total}</td></tr>
                {v.ranked && v.eloDelta && <tr><td>Elo</td><td>{v.eloDelta[me] >= 0 ? '+' : ''}{v.eloDelta[me]}</td></tr>}
              </tbody>
            </table>
            <details>
              <summary>Tous les coups, révélés</summary>
              <ol className="history">
                {v.history?.map((h, i) => (
                  <li key={i} className={h.bluff ? 'bluff' : ''}>
                    {h.mover === me ? 'Toi' : 'Lui'} : {sqName(h.from)} → {sqName(h.to)}, {NAMES[h.real]}
                    {h.as !== h.real && ` joué comme ${NAMES[h.as]}`}
                    {h.bluff && (h.challenged ? ' · bluff démasqué' : ' · bluff réussi')}
                  </li>
                ))}
              </ol>
            </details>
            <div className="row">
              <button onClick={() => setShowEnd(false)}>Voir le plateau révélé</button>
              <button className="primary" onClick={onLeave}>Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
