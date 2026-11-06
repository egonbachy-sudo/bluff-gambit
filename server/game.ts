// Pure game state machine: no I/O, no clocks. The server wraps it with timers and sockets.
import { randomBytes } from 'node:crypto'
import { canMove, opp, lastRank, setupError, sqName, KINDS, NAMES, VALUE } from '../shared/rules.ts'
import type { Color, Kind, Placement, Sq } from '../shared/rules.ts'

export type Piece = { id: string; owner: Color; kind: Kind; x: number; y: number; moved: boolean; alive: boolean; claim: Kind | null }
type Player = {
  lives: number; captured: Kind[]; marks: Record<string, Kind>; lastMark: number; turns: number; ready: boolean
  correctChallenges: number; wrongChallenges: number; bluffs: number; uncaughtBluffs: number
}
type Last = { mover: Color; pieceId: string; from: Sq; to: Sq; as: Kind; real: Kind; bluff: boolean; captured: Piece | null }
export type Game = {
  phase: 'setup' | 'move' | 'challenge' | 'over'
  /** Side that must act now (in 'challenge' it is the challenger, who moves next). */
  turn: Color
  pieces: Piece[]
  players: Record<Color, Player>
  last: Last | null
  log: string[]
  history: (Last & { challenged: boolean })[]
  winner: Color | null
  reason: string
}

export const LIVES = 10
const NAME: Record<Color, string> = { w: 'Blanc', b: 'Noir' }

const player = (): Player => ({
  lives: LIVES, captured: [], marks: {}, lastMark: -2, turns: 0, ready: false,
  correctChallenges: 0, wrongChallenges: 0, bluffs: 0, uncaughtBluffs: 0,
})

export const newGame = (): Game => ({
  phase: 'setup', turn: 'w', pieces: [], players: { w: player(), b: player() },
  last: null, log: [], history: [], winner: null, reason: '',
})

const alive = (g: Game) => g.pieces.filter((p) => p.alive)
const occOf = (g: Game) => {
  const grid = new Map(alive(g).map((p) => [p.x * 8 + p.y, p.owner]))
  return (x: number, y: number) => grid.get(x * 8 + y) ?? null
}

function end(g: Game, winner: Color, reason: string) {
  g.phase = 'over'
  g.winner = winner
  g.reason = reason
  g.log.push(`Fin de partie : ${NAME[winner]} gagne (${reason}).`)
}

/** Removes a caught bluffing piece and costs its owner a life. */
function punish(g: Game, p: Piece) {
  const pl = g.players[p.owner]
  p.alive = false
  pl.captured.push(p.kind)
  pl.lives--
  if (p.kind === 'K') end(g, opp(p.owner), 'roi démasqué en bluff')
  else if (pl.lives <= 0) end(g, opp(p.owner), 'plus de vies')
}

export function setup(g: Game, c: Color, placement: unknown): string | null {
  if (g.phase !== 'setup' || g.players[c].ready) return 'Placement déjà validé'
  const err = setupError(c, placement)
  if (err) return err
  for (const { x, y, kind } of placement as Placement)
    g.pieces.push({ id: randomBytes(6).toString('hex'), owner: c, kind, x, y, moved: false, alive: true, claim: null })
  g.players[c].ready = true
  if (g.players[opp(c)].ready) {
    g.phase = 'move'
    g.turn = 'w'
    g.log.push('La partie commence, Blanc joue.')
  }
  return null
}

export type Move = { pieceId: string; to: Sq; as: Kind; promo?: Kind }

export function move(g: Game, c: Color, m: Move): string | null {
  if (g.phase !== 'move' || g.turn !== c) return "Ce n'est pas ton tour"
  const p = alive(g).find((q) => q.owner === c && q.id === m?.pieceId)
  if (!p) return 'Pièce invalide'
  if (!KINDS.includes(m.as) || !Number.isInteger(m.to?.x) || !Number.isInteger(m.to?.y)) return 'Coup invalide'
  const occ = occOf(g), from = { x: p.x, y: p.y }, to = { x: m.to.x, y: m.to.y }
  if (!canMove(m.as, c, from, to, occ, p.moved)) return `Coup impossible pour : ${NAMES[m.as]}`
  const bluff = !canMove(p.kind, c, from, to, occ, p.moved)
  const target = alive(g).find((q) => q.x === to.x && q.y === to.y) ?? null
  const me = g.players[c], foe = opp(c)
  me.turns++
  if (bluff) me.bluffs++

  if (target?.kind === 'K') {
    g.history.push({ mover: c, pieceId: p.id, from, to, as: m.as, real: p.kind, bluff, captured: target, challenged: bluff })
    if (!bluff) {
      target.alive = false
      g.players[foe].captured.push('K')
      end(g, c, 'roi capturé')
      return null
    }
    g.log.push(`${NAME[c]} tente de prendre le roi en bluff : démasqué automatiquement, ${NAME[c]} perd 1 vie et son ${NAMES[p.kind]}.`)
    punish(g, p)
    g.last = null
    if (!g.winner) g.turn = foe
    return null
  }

  const real = p.kind
  if (target) {
    target.alive = false
    g.players[foe].captured.push(target.kind)
  }
  p.x = to.x
  p.y = to.y
  p.moved = true
  p.claim = m.as
  if (real === 'P' && to.y === lastRank(c) && m.promo && m.promo !== 'P' && m.promo !== 'K') {
    const i = me.captured.indexOf(m.promo)
    if (i >= 0) {
      me.captured.splice(i, 1)
      p.kind = m.promo
    }
  }
  g.last = { mover: c, pieceId: p.id, from, to, as: m.as, real, bluff, captured: target }
  g.log.push(`${NAME[c]} : ${sqName(from)} → ${sqName(to)}${target ? ` (prend : ${NAMES[target.kind]})` : ''}`)
  g.phase = 'challenge'
  g.turn = foe
  return null
}

export function challenge(g: Game, c: Color, contest: boolean): string | null {
  const L = g.last
  if (g.phase !== 'challenge' || g.turn !== c || !L) return 'Rien à contester'
  const mover = L.mover
  g.history.push({ ...L, challenged: contest })
  if (!contest) {
    if (L.bluff) g.players[mover].uncaughtBluffs++
  } else if (L.bluff) {
    const p = g.pieces.find((q) => q.id === L.pieceId)!
    g.players[c].correctChallenges++
    if (L.captured) {
      L.captured.alive = true
      const cap = g.players[c].captured
      cap.splice(cap.lastIndexOf(L.captured.kind), 1)
    }
    g.log.push(`${NAME[c]} conteste : bluff démasqué ! ${NAME[mover]} perd 1 vie et son ${NAMES[p.kind]}.`)
    punish(g, p)
  } else {
    g.players[c].wrongChallenges++
    g.players[c].lives--
    g.log.push(`${NAME[c]} conteste à tort : le coup était légal. ${NAME[c]} perd 1 vie.`)
    if (g.players[c].lives <= 0) end(g, mover, 'plus de vies')
  }
  g.last = null
  if (!g.winner) g.phase = 'move'
  return null
}

export const canMark = (g: Game, c: Color) =>
  g.phase === 'move' && g.turn === c && g.players[c].turns >= g.players[c].lastMark + 2

export function mark(g: Game, c: Color, pieceId: unknown, kind: unknown): string | null {
  if (!canMark(g, c)) return 'Marquage disponible 1 tour sur 2, avant de jouer'
  if (!KINDS.includes(kind as Kind) || !alive(g).some((p) => p.owner !== c && p.id === pieceId)) return 'Marquage invalide'
  g.players[c].marks[pieceId as string] = kind as Kind
  g.players[c].lastMark = g.players[c].turns
  return null
}

export function resign(g: Game, c: Color): string | null {
  if (g.phase === 'over') return 'Partie terminée'
  end(g, opp(c), 'abandon')
  return null
}

export function timeout(g: Game, c: Color) {
  if (g.phase !== 'over') end(g, opp(c), 'temps écoulé')
}

export function stats(g: Game, c: Color) {
  const pl = g.players[c]
  const pieces = alive(g).filter((p) => p.owner === c).reduce((s, p) => s + VALUE[p.kind], 0)
  const correctMarks = Object.entries(pl.marks).filter(([id, k]) => g.pieces.find((p) => p.id === id)?.kind === k).length
  const detail = {
    victoire: g.winner === c ? 100 : 0,
    pieces: pieces * 3,
    vies: pl.lives * 5,
    contestations: pl.correctChallenges * 15,
    marquages: correctMarks * 5,
    bluffs: pl.uncaughtBluffs * 4,
  }
  const total = Object.values(detail).reduce((a, b) => a + b, 0)
  return { detail, total, correctMarks, lives: pl.lives, correctChallenges: pl.correctChallenges, wrongChallenges: pl.wrongChallenges, uncaughtBluffs: pl.uncaughtBluffs }
}

/** Elo change for the side scoring `result` (1 win, 0 loss). */
export const eloDelta = (mine: number, theirs: number, result: number) =>
  Math.round(32 * (result - 1 / (1 + 10 ** ((theirs - mine) / 400))))

/** What side `c` is allowed to see. Enemy kinds never leave the server before the end. */
export function view(g: Game, c: Color) {
  const over = g.phase === 'over', pl = g.players[c]
  return {
    phase: g.phase,
    turn: g.turn,
    me: c,
    pieces: alive(g)
      .filter((p) => p.owner === c || g.phase !== 'setup')
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((p) =>
        p.owner === c ? { id: p.id, owner: p.owner, x: p.x, y: p.y, kind: p.kind, moved: p.moved, claim: p.claim }
        : over ? { id: p.id, owner: p.owner, x: p.x, y: p.y, kind: p.kind }
        : { id: p.id, owner: p.owner, x: p.x, y: p.y }),
    marks: pl.marks,
    canMark: canMark(g, c),
    lives: { w: g.players.w.lives, b: g.players.b.lives },
    captured: { w: g.players.w.captured, b: g.players.b.captured },
    ready: { w: g.players.w.ready, b: g.players.b.ready },
    last: g.last && { mover: g.last.mover, from: g.last.from, to: g.last.to, capture: !!g.last.captured },
    log: g.log.slice(-40),
    winner: g.winner,
    reason: g.reason,
    history: over ? g.history.map(({ mover, from, to, as, real, bluff, challenged }) => ({ mover, from, to, as, real, bluff, challenged })) : undefined,
    scores: over ? { w: stats(g, 'w'), b: stats(g, 'b') } : undefined,
  }
}
export type View = ReturnType<typeof view>
