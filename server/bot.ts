// Training bot. It decides only from G.view() of its own side, so it never sees hidden enemy kinds.
import { canMove, destinations, lastRank, opp, KINDS, VALUE } from '../shared/rules.ts'
import type { Color, Kind, Sq } from '../shared/rules.ts'
import type { Move, View } from './game.ts'

type P = { id: string; owner: Color; x: number; y: number; kind?: Kind; moved?: boolean }
export type Level = 'facile' | 'normal' | 'difficile'
export const LEVELS: Level[] = ['facile', 'normal', 'difficile']
/** Tuned by self-play (300 games each): difficile beats normal ~58%, both beat facile ~70%. */
const TUNING: Record<Level, { noise: number; danger: number; bluff: number; contestBase: number; contestSpread: number; learns: boolean; kingSafety: number }> = {
  facile: { noise: 8, danger: 0.1, bluff: 0.1, contestBase: 0.85, contestSpread: 0.2, learns: false, kingSafety: 0 },
  normal: { noise: 2.5, danger: 0.5, bluff: 0.25, contestBase: 0.6, contestSpread: 0.3, learns: true, kingSafety: 1 },
  difficile: { noise: 2.5, danger: 0.5, bluff: 0.3, contestBase: 0.4, contestSpread: 0.2, learns: true, kingSafety: 1 },
}
/** What the bot believes about each enemy piece: kinds still consistent with its moves. */
export type Mem = { possible: Map<string, Set<Kind>>; moved: Set<string>; level: Level }
export const newMem = (level: Level = 'normal'): Mem => ({ possible: new Map(), moved: new Set(), level })

const COUNT: Record<Kind, number> = { K: 1, Q: 1, R: 2, B: 2, N: 2, P: 8 }
const key = (x: number, y: number) => x * 8 + y
const same = (a: Sq, b: Sq) => a.x === b.x && a.y === b.y
const mass = (s: Iterable<Kind>) => [...s].reduce((a, k) => a + COUNT[k], 0)
const possibleOf = (m: Mem, id: string) => m.possible.get(id) ?? new Set(KINDS)
const chance = (m: Mem, id: string, k: Kind) => {
  const s = possibleOf(m, id)
  return s.has(k) ? COUNT[k] / mass(s) : 0
}
/** Expected worth of capturing an enemy piece; the king counts as the game. */
const worth = (m: Mem, id: string) => {
  const s = possibleOf(m, id), king = 30
  return [...s].reduce((a, k) => a + COUNT[k] * (k === 'K' ? king : VALUE[k]), 0) / mass(s)
}
const grid = (ps: P[]) => new Map(ps.map((p) => [key(p.x, p.y), p.owner]))
const occOf = (g: Map<number, Color>) => (x: number, y: number) => g.get(key(x, y)) ?? null

/** Decides whether to contest the last enemy move; call learn() with the view after the decision. */
export function challengeTurn(m: Mem, v: View, rnd = Math.random) {
  const L = v.last!, me = v.me, foe = opp(me), ps = v.pieces as P[]
  const piece = ps.find((p) => p.x === L.to.x && p.y === L.to.y)!
  const before = grid(ps)
  before.delete(key(L.to.x, L.to.y))
  before.set(key(L.from.x, L.from.y), foe)
  if (L.capture) before.set(key(L.to.x, L.to.y), me)
  const compat = new Set(KINDS.filter((k) => canMove(k, foe, L.from, L.to, occOf(before), m.moved.has(piece.id))))
  const prior = possibleOf(m, piece.id)
  const both = [...prior].filter((k) => compat.has(k))
  let pBluff = both.length ? (1 - mass(both) / mass(prior)) * 0.7 : 0.95
  if (L.capture) pBluff += 0.1
  if (v.lives[me] <= 2) pBluff -= 0.25
  const t = TUNING[m.level]
  const contest = pBluff > t.contestBase + rnd() * t.contestSpread
  return {
    contest,
    learn(after: View) {
      if (!(after.pieces as P[]).some((p) => p.id === piece.id)) return void m.possible.delete(piece.id)
      if (!t.learns) return
      m.possible.set(piece.id, new Set(both.length ? both : compat))
      m.moved.add(piece.id)
    },
  }
}

export function decideMark(m: Mem, v: View): { pieceId: string; kind: Kind } | null {
  if (!v.canMark) return null
  const best = (v.pieces as P[])
    .filter((p) => p.owner !== v.me && possibleOf(m, p.id).size < KINDS.length)
    .map((p) => ({ p, s: [...possibleOf(m, p.id)].sort((a, b) => COUNT[b] - COUNT[a]) }))
    .filter(({ p, s }) => v.marks[p.id] !== s[0])
    .sort((a, b) => a.s.length - b.s.length)[0]
  return best ? { pieceId: best.p.id, kind: best.s[0] } : null
}

export function decideMove(m: Mem, v: View, rnd = Math.random): Move {
  const me = v.me, foe = opp(me), ps = v.pieces as P[]
  const mine = ps.filter((p) => p.owner === me), enemies = ps.filter((p) => p.owner === foe)
  const now = grid(ps), occ = occOf(now)
  const attacked = (sq: Sq, o: (x: number, y: number) => Color | null) =>
    enemies.some((e) => (e.x !== sq.x || e.y !== sq.y) && [...possibleOf(m, e.id)].some((k) => canMove(k, foe, e, sq, o, m.moved.has(e.id))))
  const t = TUNING[m.level]
  const tryBluff = rnd() < t.bluff
  const promo = [...v.captured[me]].filter((k) => k !== 'P' && k !== 'K').sort((a, b) => VALUE[b] - VALUE[a])[0]

  const king = mine.find((p) => p.kind === 'K')
  let best: { s: number; move: Move } | null = null
  for (const p of mine) {
    const kind = p.kind!, value = VALUE[kind] + (kind === 'K' ? 40 : 0)
    const inDanger = attacked(p, occ)
    for (const as of KINDS) {
      if (as !== kind && !tryBluff) continue
      for (const to of destinations(as, me, p, occ, !!p.moved)) {
        const bluff = !canMove(kind, me, p, to, occ, !!p.moved)
        if (as !== kind && !bluff) continue // a real move is already scored under the real kind
        const target = enemies.find((e) => e.x === to.x && e.y === to.y)
        const after = new Map(now)
        after.delete(key(p.x, p.y))
        after.set(key(to.x, to.y), me)
        let s = rnd() * t.noise
        if (target) s += worth(m, target.id) * (bluff ? 0.6 : 1)
        if (attacked(to, occOf(after))) s -= value * t.danger
        else if (inDanger) s += value * 0.5 * t.danger
        if (kind === 'K') s -= m.level === 'difficile' ? 3 : 1
        // Does this move leave our king where a real enemy move could take it?
        if (t.kingSafety && king) {
          const k = kind === 'K' ? to : king
          if (attacked(k, occOf(after)) && !(target && same(target, k))) s -= t.kingSafety
        }
        if (kind === 'P') s += 0.15 * Math.abs(to.y - p.y)
        if (bluff) {
          const risk = VALUE[kind] + 3 + (kind === 'K' ? 100 : 0)
          s -= 0.35 * risk + (target ? chance(m, target.id, 'K') * risk : 0)
        }
        if (!best || s > best.s)
          best = { s, move: { pieceId: p.id, to, as, promo: kind === 'P' && to.y === lastRank(me) ? promo : undefined } }
      }
    }
  }
  if (best) return best.move
  // Fully blocked with real moves and no bluff drawn: any queen-shaped move will do.
  for (const p of mine) {
    const to = destinations('Q', me, p, occ, !!p.moved)[0] ?? destinations('N', me, p, occ, !!p.moved)[0]
    if (to) return { pieceId: p.id, to, as: to && canMove('Q', me, p, to, occ, !!p.moved) ? 'Q' : 'N' }
  }
  throw new Error('Aucun coup possible')
}
