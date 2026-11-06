import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { beep, call } from './net.ts'
import { classicSetup, destinations, homeRows, lastRank, opp, randomSetup, setupError, sqName, EMOTES, KINDS, LETTER, NAMES } from '../shared/rules.ts'
import type { Color, Kind, Placement, Sq } from '../shared/rules.ts'
import type { View } from '../server/game.ts'

export type GameView = View & {
  names: Record<Color, string>; elo: Record<Color, number>; ranked: boolean; minutes: number
  clock: Record<Color, number>; windowLeft: number; setupLeft: number; eloDelta?: Record<Color, number>; at: number
}
type Piece = { id: string; owner: Color; x: number; y: number; kind?: Kind; moved?: boolean; claim?: Kind | null }
export type Skins = { pieces: string; board: string }

const FILLED: Record<Kind, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }
const OUTLINE: Record<Kind, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' }
export const glyph = (k: Kind, skin: string) => (skin === 'lettres' ? LETTER[k] : (skin === 'contour' ? OUTLINE : FILLED)[k] + '︎')

export function PieceIcon({ kind, owner, skin }: { kind: Kind; owner: Color; skin: string }) {
  return <span className={`pc ${owner} skin-${skin}`}>{glyph(kind, skin)}</span>
}

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
const same = (a: Sq | null | undefined, x: number, y: number) => !!a && a.x === x && a.y === y

export function Game({ v, skins, sound, hints, emote, onLeave }: {
  v: GameView; skins: Skins; sound: boolean; hints: boolean; emote: string; onLeave: () => void
}) {
  const me = v.me, foe = opp(me), now = useNow()
  const pieces = v.pieces as Piece[]
  const [sel, setSel] = useState<string | null>(null)
  const [as, setAs] = useState<Kind>('P')
  const [marking, setMarking] = useState(false)
  const [markTarget, setMarkTarget] = useState<string | null>(null)
  const [promo, setPromo] = useState<Sq | null>(null)
  const [pl, setPl] = useState<Placement>(() => classicSetup(me))
  const [swap, setSwap] = useState<Sq | null>(null)
  const [err, setErr] = useState('')
  const [showEnd, setShowEnd] = useState(true)

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
      const a = pl.find((e) => same(swap, e.x, e.y))!.kind, b = pl.find((e) => e.x === x && e.y === y)!.kind
      setPl(pl.map((e) => (e.x === x && e.y === y ? { ...e, kind: a } : same(swap, e.x, e.y) ? { ...e, kind: b } : e)))
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

  const ys = me === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const xs = me === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]

  function content(x: number, y: number) {
    if (setupMode) {
      const e = pl.find((q) => q.x === x && q.y === y)
      return e && <PieceIcon kind={e.kind} owner={me} skin={skins.pieces} />
    }
    const p = pieces.find((q) => q.x === x && q.y === y)
    if (!p) return null
    if (p.kind)
      return (
        <>
          <PieceIcon kind={p.kind} owner={p.owner} skin={skins.pieces} />
          {p.owner === me && p.claim && <span className="claim" title={`Joué comme ${NAMES[p.claim]}`}>{LETTER[p.claim]}</span>}
        </>
      )
    const m = v.marks[p.id]
    return <span className={`token ${p.owner} ${m ? 'marked' : ''}`}>{m ? glyph(m, skins.pieces) : '?'}</span>
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
          <b>{v.names[c]}</b> <small>{v.elo[c]}</small>
          {c === foe && emote && <span className="bubble">{emote}</span>}
        </div>
        <div className="lives" aria-label={`${v.lives[c]} vies`}>❤ {v.lives[c]}</div>
        <div className={`clock ${active && ms < 30_000 ? 'low' : ''}`}>{fmt(ms)}</div>
        <div className="grave">
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
        <p>Place tes pièces : touche deux cases de tes rangées pour les échanger. ({left(v.setupLeft)} s)</p>
        <div className="row">
          <button onClick={() => setPl(classicSetup(me))}>Classique</button>
          <button onClick={() => setPl(randomSetup(me))}>Aléatoire</button>
          <button className="primary" disabled={!!setupErr} onClick={() => send('game:setup', { placement: pl })}>Prêt</button>
        </div>
        {setupErr && <p className="warn">{setupErr}</p>}
      </>
    )
  else if (v.phase === 'setup') controls = <p>En attente du placement adverse… ({left(v.setupLeft)} s)</p>
  else if (v.phase === 'challenge' && v.turn === me)
    controls = (
      <div className="challenge">
        <p>
          L'adversaire a joué <b>{v.last && `${sqName(v.last.from)} → ${sqName(v.last.to)}`}</b>. Bluff ? ({left(v.windowLeft)} s)
        </p>
        <div className="row">
          <button className="danger" onClick={() => send('game:challenge', { contest: true })}>Contester</button>
          <button onClick={() => send('game:challenge', { contest: false })}>Laisser passer</button>
        </div>
      </div>
    )
  else if (v.phase === 'challenge') controls = <p>L'adversaire peut contester ton coup… ({left(v.windowLeft)} s)</p>
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
          <p>À toi de jouer : touche une de tes pièces.</p>
        )}
        {v.canMark && !marking && !promo && <button onClick={() => { setSel(null); setMarking(true) }}>🏷 Marquer une pièce</button>}
      </>
    )
  else if (v.phase === 'move') controls = <p>L'adversaire réfléchit…</p>

  const s = v.scores?.[me]
  return (
    <div className="game">
      <div className="board-col">
        {bar(foe)}
        <div className={`board board-${skins.board}`}>
          {ys.map((y) =>
            xs.map((x) => {
              const isDest = dests.some((d) => d.x === x && d.y === y)
              const cls = [
                'sq', (x + y) % 2 ? 'light' : 'dark',
                (same(v.last?.from, x, y) || same(v.last?.to, x, y)) && 'last',
                selected && same(selected, x, y) && 'sel',
                same(swap, x, y) && 'sel',
                isDest && hints && (occ(x, y) ? 'dest cap' : 'dest'),
                setupMode && homeRows(me).includes(y) && 'home',
              ].filter(Boolean).join(' ')
              return (
                <button key={`${x}${y}`} className={cls} onClick={() => click(x, y)} aria-label={sqName({ x, y })}>
                  {x === xs[0] && <span className="rank">{y + 1}</span>}
                  {y === ys[7] && <span className="file">{'abcdefgh'[x]}</span>}
                  {content(x, y)}
                </button>
              )
            }),
          )}
        </div>
        {bar(me)}
      </div>

      <aside className="panel">
        <div className="controls card">
          {controls}
          {err && <p className="warn">{err}</p>}
        </div>
        {v.phase !== 'over' && (
          <div className="row emotes">
            {EMOTES.map((e) => <button key={e} onClick={() => send('game:emote', { emoji: e })}>{e}</button>)}
            <button className="danger" onClick={() => confirm('Abandonner la partie ?') && send('game:resign')}>Abandonner</button>
          </div>
        )}
        {v.phase === 'over' && !showEnd && <button className="primary" onClick={() => setShowEnd(true)}>Voir le résultat</button>}
        <ol className="log card" reversed>
          {[...v.log].reverse().map((l, i) => <li key={i}>{l}</li>)}
        </ol>
      </aside>

      {v.phase === 'over' && showEnd && s && (
        <div className="modal" role="dialog" aria-label="Fin de partie">
          <div className="card end">
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
