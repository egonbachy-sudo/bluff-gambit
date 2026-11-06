// Move-by-move replay of a finished game, everything revealed.
import { useEffect, useMemo, useState } from 'react'
import { call } from './net.ts'
import { Board } from './Board.tsx'
import type { BoardPiece, Skins } from './Board.tsx'
import { sqName, NAMES } from '../shared/rules.ts'
import type { Color, Kind, Sq } from '../shared/rules.ts'

type Move = { mover: Color; from: Sq; to: Sq; as: Kind; real: Kind; bluff: boolean; challenged: boolean; promo?: Kind }
type Data = { start: BoardPiece[]; history: Move[]; names: Record<Color, string>; me: Color; winner: Color | null; reason: string }

/** Board after each move: a caught bluff only removes the bluffer (its capture was undone). */
export function replayStates(start: BoardPiece[], history: Move[]) {
  let ps = start.map((p) => ({ ...p }))
  const out = [ps]
  for (const h of history) {
    const mover = ps.find((p) => p.x === h.from.x && p.y === h.from.y)
    let next = ps.filter((p) => p !== mover)
    if (mover && !(h.bluff && h.challenged)) {
      next = next.filter((p) => p.x !== h.to.x || p.y !== h.to.y)
      next.push({ ...mover, ...h.to, kind: h.promo ?? mover.kind, claim: h.as })
    }
    ps = next
    out.push(ps)
  }
  return out
}

export function Replay({ id, skins }: { id: number; skins: Skins }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    call<Data>('replay', { id }).then(setData).catch((e: Error) => setErr(e.message))
  }, [id])
  const states = useMemo(() => (data ? replayStates(data.start, data.history) : []), [data])
  const total = data?.history.length ?? 0
  useEffect(() => {
    if (!playing) return
    if (step >= total) return setPlaying(false)
    const t = setTimeout(() => setStep(step + 1), 1100)
    return () => clearTimeout(t)
  }, [playing, step, total])

  if (err) return <main className="page center"><div className="card empty"><p>{err}</p><a className="btn" href="#/compte">Retour</a></div></main>
  if (!data) return <main className="page center"><p className="muted">Chargement…</p></main>
  const h = data.history[step - 1]
  const who = (c: Color) => (c === data.me ? 'Toi' : data.names[c])
  const go = (n: number) => { setPlaying(false); setStep(Math.max(0, Math.min(total, n))) }
  return (
    <main className="game replay">
      <div className="board-col">
        <div className="bar"><div className="who"><b>{data.names[data.me === 'w' ? 'b' : 'w']}</b></div></div>
        <Board me={data.me} pieces={states[step]} skins={skins} last={h ? [h.from, h.to] : null} />
        <div className="bar"><div className="who"><b>{data.names[data.me]}</b></div></div>
      </div>
      <aside className="panel">
        <div className="card controls">
          <h2>Replay</h2>
          <p className="muted">{data.winner ? `${who(data.winner)} gagne (${data.reason})` : data.reason}</p>
          <p className="replay-now" aria-live="polite">
            {h ? (
              <>Coup {step}/{total} · <b>{who(h.mover)}</b> : {sqName(h.from)} → {sqName(h.to)}, {NAMES[h.real]}
                {h.as !== h.real && <> joué comme {NAMES[h.as]}</>}
                {h.bluff && <span className={`tag ${h.challenged ? 'caught' : 'ok'}`}>{h.challenged ? 'bluff démasqué' : 'bluff réussi'}</span>}
                {h.promo && <span className="tag ok">promu en {NAMES[h.promo]}</span>}
              </>
            ) : 'Position de départ, tout est révélé.'}
          </p>
          <input type="range" min={0} max={total} value={step} onChange={(e) => go(Number(e.target.value))} aria-label="Coup affiché" className="scrub" />
          <div className="row replay-controls">
            <button aria-label="Début" onClick={() => go(0)}>⏮</button>
            <button aria-label="Coup précédent" onClick={() => go(step - 1)}>◀</button>
            <button className="primary" aria-label={playing ? 'Pause' : 'Lecture'} onClick={() => (step >= total ? (setStep(0), setPlaying(true)) : setPlaying(!playing))}>{playing ? '⏸' : '▶'}</button>
            <button aria-label="Coup suivant" onClick={() => go(step + 1)}>▶|</button>
            <button aria-label="Fin" onClick={() => go(total)}>⏭</button>
          </div>
        </div>
        <ol className="card log moves">
          {data.history.map((m, i) => (
            <li key={i}>
              <button className={`move-link ${i + 1 === step ? 'on' : ''} ${m.bluff ? 'bluff' : ''}`} onClick={() => go(i + 1)}>
                {who(m.mover)} : {sqName(m.from)} → {sqName(m.to)} · {NAMES[m.real]}{m.as !== m.real ? ` (comme ${NAMES[m.as]})` : ''}
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </main>
  )
}
