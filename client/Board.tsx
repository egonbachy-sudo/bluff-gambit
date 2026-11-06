// Shared animated board: squares handle clicks, pieces live in a layer above and glide between squares.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { KINDS, LETTER, NAMES } from '../shared/rules.ts'
import type { Color, Kind, Sq } from '../shared/rules.ts'

export type Skins = { pieces: string; board: string }
export type BoardPiece = { id: string; owner: Color; x: number; y: number; kind?: Kind; claim?: Kind | null; mark?: Kind }

const FILLED: Record<Kind, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }
const OUTLINE: Record<Kind, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' }
export const glyph = (k: Kind, skin: string) => (skin === 'lettres' ? LETTER[k] : (skin === 'contour' ? OUTLINE : FILLED)[k] + '︎')

export function PieceIcon({ kind, owner, skin }: { kind: Kind; owner: Color; skin: string }) {
  return <span className={`pc ${owner} skin-${skin}`} aria-label={NAMES[kind]}>{glyph(kind, skin)}</span>
}

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const same = (a: Sq | null | undefined, x: number, y: number) => !!a && a.x === x && a.y === y
const F = 'abcdefgh'

/** Row of piece-type buttons shown in a popover above a piece. */
export function KindPicker({ kinds = KINDS, owner, skin, cur, real, guide, onPick }: {
  kinds?: Kind[]; owner: Color; skin: string; cur?: Kind | null; real?: Kind; guide?: Kind; onPick: (k: Kind) => void
}) {
  return (
    <div className="kind-picker" role="group" aria-label="Choisir un type de pièce">
      {kinds.map((k) => (
        <button key={k} className={[k === cur && 'on', k === guide && 'guide-btn'].filter(Boolean).join(' ')} onClick={() => onPick(k)} title={NAMES[k]} aria-label={NAMES[k] + (k === real ? ' (vraie pièce)' : '')}>
          <PieceIcon kind={k} owner={owner} skin={skin} />
          <small>{NAMES[k]}</small>
          {k === real && <span className="real-dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}

type Ghost = BoardPiece & { key: string }

/** A captured piece pops up, then flies to its owner's graveyard (or fades out if there is none). */
function GhostPiece({ g, pos, target, skin, onDone }: { g: Ghost; pos: string; target: HTMLElement | null; skin: string; onDone: () => void }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current!
    const from = el.getBoundingClientRect(), to = target?.getBoundingClientRect()
    const dx = to ? to.left + Math.min(to.width, 24 * target!.childElementCount + 12) - from.left - from.width / 2 : 0
    const dy = to ? to.top + to.height / 2 - from.top - from.height / 2 : -from.height * 0.6
    const a = el.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: 'translate(0, -18%) scale(1.3)', opacity: 1, offset: 0.25 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: to ? 0.85 : 0 },
      ],
      { duration: 750, easing: 'cubic-bezier(.55,0,.25,1)' },
    )
    a.onfinish = onDone
    return () => a.cancel()
  }, [])
  return (
    <div className="piece ghost" style={{ transform: pos }}>
      <span ref={ref} className="ghost-inner">
        {g.kind ? <PieceIcon kind={g.kind} owner={g.owner} skin={skin} /> : <span className={`token ${g.owner}`}>?</span>}
      </span>
    </div>
  )
}

export function Board(props: {
  me: Color; pieces: BoardPiece[]; skins: Skins; onSquare?: (x: number, y: number) => void
  sel?: Sq | null; dests?: Sq[]; last?: Sq[] | null; home?: number[]; hints?: boolean
  captured?: Record<Color, Kind[]>; graveOf?: (c: Color) => HTMLElement | null
  /** Squares the tutorial wants you to touch (pulsing ring). */
  guide?: Sq[]
  /** Small panel anchored above a square (piece picker, mark picker…). */
  popover?: { at: Sq; content: ReactNode } | null
  /** Centered panel over the whole board (contest / mark prompts, hero badges). */
  overlay?: ReactNode
}) {
  const { me, pieces, skins, onSquare, sel, dests = [], last, home, hints = true, captured, graveOf, guide, popover, overlay } = props
  const ys = me === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const xs = me === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const pos = (x: number, y: number) => `translate(${xs.indexOf(x) * 100}%, ${ys.indexOf(y) * 100}%)`

  const prev = useRef({ pieces, captured })
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  useEffect(() => {
    const before = prev.current
    prev.current = { pieces, captured }
    const gone = before.pieces.filter((p) => !pieces.some((q) => q.id === p.id))
    // More than two pieces vanishing at once is a new game or a reveal, not a capture.
    if (!gone.length || gone.length > 2 || reducedMotion()) return
    const t = Date.now()
    setGhosts((g) => [
      ...g,
      ...gone.map((p) => {
        const list = captured?.[p.owner] ?? [], old = before.captured?.[p.owner] ?? []
        return { ...p, key: `${p.id}-${t}`, kind: p.kind ?? (list.length > old.length ? list[list.length - 1] : undefined) }
      }),
    ])
  }, [pieces, captured])

  const popCol = popover ? xs.indexOf(popover.at.x) : 0, popRow = popover ? ys.indexOf(popover.at.y) : 0
  const boardRef = useRef<HTMLDivElement>(null), popRef = useRef<HTMLDivElement>(null)
  // Center the popover on its square, but keep it inside the board on narrow screens.
  useLayoutEffect(() => {
    const b = boardRef.current, p = popRef.current
    if (!b || !p) return
    const B = b.clientWidth, w = Math.min(p.offsetWidth, B)
    p.style.left = `${Math.max(0, Math.min(B - w, ((popCol + 0.5) * B) / 8 - w / 2))}px`
  })
  return (
    <div className={`board board-${skins.board}`} ref={boardRef}>
      <div className="grid">
        {ys.map((y) =>
          xs.map((x) => {
            const occupied = pieces.some((p) => p.x === x && p.y === y)
            const isDest = dests.some((d) => same(d, x, y))
            const cls = [
              'sq', (x + y) % 2 ? 'light' : 'dark',
              last?.some((s) => same(s, x, y)) && 'last',
              same(sel, x, y) && 'sel',
              isDest && hints && (occupied ? 'dest cap' : 'dest'),
              isDest && 'target',
              home?.includes(y) && 'home',
              guide?.some((s) => same(s, x, y)) && 'guide',
            ].filter(Boolean).join(' ')
            return (
              <button key={`${x}${y}`} className={cls} onClick={() => onSquare?.(x, y)} aria-label={F[x] + (y + 1)} tabIndex={onSquare ? 0 : -1}>
                {x === xs[0] && <span className="rank" aria-hidden="true">{y + 1}</span>}
                {y === ys[7] && <span className="file" aria-hidden="true">{F[x]}</span>}
              </button>
            )
          }),
        )}
      </div>
      <div className="layer" aria-hidden="true">
        {pieces.map((p) => (
          <div key={p.id} className={`piece ${same(sel, p.x, p.y) ? 'lift' : ''}`} style={{ transform: pos(p.x, p.y) }}>
            {p.kind ? <PieceIcon kind={p.kind} owner={p.owner} skin={skins.pieces} />
              : <span className={`token ${p.owner} ${p.mark ? 'marked' : ''}`}>{p.mark ? glyph(p.mark, skins.pieces) : '?'}</span>}
            {p.claim && <span key={p.claim} className="claim" title={`Joué comme ${NAMES[p.claim]}`}><PieceIcon kind={p.claim} owner={p.owner} skin={skins.pieces} /></span>}
          </div>
        ))}
        {ghosts.map((g) => (
          <GhostPiece key={g.key} g={g} pos={pos(g.x, g.y)} target={graveOf?.(g.owner) ?? null} skin={skins.pieces}
            onDone={() => setGhosts((all) => all.filter((x) => x.key !== g.key))} />
        ))}
      </div>
      {popover && (
        <div ref={popRef} className={`popover ${popRow < 2 ? 'below' : 'above'}`} style={{ '--row': popRow } as CSSProperties}>
          {popover.content}
        </div>
      )}
      {overlay && <div className="board-overlay">{overlay}</div>}
    </div>
  )
}
