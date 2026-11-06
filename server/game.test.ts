import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nameError, canMove, classicSetup, layoutError, layoutPlacement, placementLayout, randomSetup, setupError, DEFAULT_LAYOUT } from '../shared/rules.ts'
import type { Kind, Color } from '../shared/rules.ts'
import * as G from './game.ts'

const empty = () => null
const started = () => {
  const g = G.newGame()
  assert.equal(G.setup(g, 'w', classicSetup('w')), null)
  assert.equal(G.setup(g, 'b', classicSetup('b')), null)
  return g
}
const at = (g: G.Game, x: number, y: number) => g.pieces.find((p) => p.alive && p.x === x && p.y === y)!
const id = (g: G.Game, x: number, y: number) => at(g, x, y).id
const put = (g: G.Game, owner: Color, kind: Kind, x: number, y: number) => {
  const p = g.pieces.find((q) => q.alive && q.owner === owner && q.kind === kind)!
  Object.assign(p, { x, y })
  return p
}

test('geometry', () => {
  assert.ok(canMove('N', 'w', { x: 1, y: 0 }, { x: 2, y: 2 }, empty, false))
  assert.ok(!canMove('N', 'w', { x: 1, y: 0 }, { x: 1, y: 2 }, empty, false))
  const blocked = (x: number, y: number) => (x === 0 && y === 1 ? 'w' : null)
  assert.ok(!canMove('R', 'w', { x: 0, y: 0 }, { x: 0, y: 4 }, blocked, false))
  assert.ok(canMove('P', 'w', { x: 4, y: 1 }, { x: 4, y: 3 }, empty, false))
  assert.ok(!canMove('P', 'w', { x: 4, y: 1 }, { x: 4, y: 3 }, empty, true))
  assert.ok(canMove('P', 'b', { x: 4, y: 6 }, { x: 3, y: 5 }, (x, y) => (x === 3 && y === 5 ? 'w' : null), true))
  assert.ok(!canMove('P', 'w', { x: 4, y: 1 }, { x: 5, y: 2 }, empty, true))
})

test('setup validation', () => {
  assert.equal(setupError('w', classicSetup('w')), null)
  assert.equal(setupError('b', randomSetup('b')), null)
  const sameColor = classicSetup('w').map((e) => (e.x === 5 && e.y === 0 ? { ...e, kind: 'N' as Kind } : e.x === 6 && e.y === 0 ? { ...e, kind: 'B' as Kind } : e))
  assert.match(setupError('w', sameColor)!, /fou/)
  assert.ok(setupError('w', classicSetup('b')))
})

test('wrong challenge costs the challenger a life', () => {
  const g = started()
  assert.equal(G.move(g, 'w', { pieceId: id(g, 4, 1), to: { x: 4, y: 3 }, as: 'P' }), null)
  assert.equal(G.challenge(g, 'b', true), null)
  assert.equal(g.players.b.lives, 9)
  assert.equal(g.players.w.lives, 10)
  assert.equal(g.phase, 'move')
  assert.equal(g.turn, 'b')
})

test('caught bluff removes the piece and restores the capture', () => {
  const g = started()
  const pawn = put(g, 'w', 'P', 3, 4)
  pawn.moved = true
  // d5 pawn pretending to be a queen captures the black pawn on f7
  assert.equal(G.move(g, 'w', { pieceId: pawn.id, to: { x: 5, y: 6 }, as: 'Q' }), null)
  assert.deepEqual(g.players.b.captured, ['P'])
  assert.equal(G.challenge(g, 'b', true), null)
  assert.equal(g.players.w.lives, 9)
  assert.ok(!pawn.alive)
  assert.ok(at(g, 5, 6).owner === 'b')
  assert.deepEqual(g.players.b.captured, [])
  assert.deepEqual(g.players.w.captured, ['P'])
})

test('uncaught bluff is counted', () => {
  const g = started()
  G.move(g, 'w', { pieceId: id(g, 0, 1), to: { x: 0, y: 4 }, as: 'Q' })
  G.challenge(g, 'b', false)
  assert.equal(g.players.w.uncaughtBluffs, 1)
})

test('king: bluff capture is auto-caught, real capture wins', () => {
  const g = started()
  at(g, 4, 6).alive = false
  const pawn = put(g, 'w', 'P', 4, 5)
  assert.equal(G.move(g, 'w', { pieceId: pawn.id, to: { x: 4, y: 7 }, as: 'R' }), null)
  assert.ok(!pawn.alive)
  assert.equal(g.players.w.lives, 9)
  assert.equal(at(g, 4, 7).kind, 'K')
  assert.equal(g.phase, 'move')
  assert.equal(g.turn, 'b')

  const g2 = started()
  at(g2, 4, 6).alive = false
  const rook = put(g2, 'w', 'R', 4, 5)
  G.move(g2, 'w', { pieceId: rook.id, to: { x: 4, y: 7 }, as: 'R' })
  assert.equal(g2.winner, 'w')
})

test('losing all lives ends the game', () => {
  const g = started()
  g.players.b.lives = 1
  G.move(g, 'w', { pieceId: id(g, 4, 1), to: { x: 4, y: 3 }, as: 'P' })
  G.challenge(g, 'b', true)
  assert.equal(g.winner, 'w')
})

test('promotion only into a captured piece', () => {
  const g = started()
  at(g, 1, 7).alive = false
  const pawn = put(g, 'w', 'P', 1, 6)
  pawn.moved = true
  g.players.w.captured.push('N')
  G.move(g, 'w', { pieceId: pawn.id, to: { x: 0, y: 7 }, as: 'P', promo: 'Q' })
  assert.equal(pawn.kind, 'P') // no queen in the graveyard
  const g2 = started()
  at(g2, 1, 7).alive = false
  const p2 = put(g2, 'w', 'P', 1, 6)
  p2.moved = true
  g2.players.w.captured.push('N')
  G.move(g2, 'w', { pieceId: p2.id, to: { x: 0, y: 7 }, as: 'P', promo: 'N' })
  assert.equal(p2.kind, 'N')
  assert.deepEqual(g2.players.w.captured, [])
})

test('marking once every two turns', () => {
  const g = started()
  const enemy = id(g, 0, 6)
  assert.equal(G.mark(g, 'w', enemy, 'P'), null)
  assert.ok(G.mark(g, 'w', enemy, 'R'))
  G.move(g, 'w', { pieceId: id(g, 4, 1), to: { x: 4, y: 3 }, as: 'P' })
  G.challenge(g, 'b', false)
  G.move(g, 'b', { pieceId: id(g, 4, 6), to: { x: 4, y: 4 }, as: 'P' })
  G.challenge(g, 'w', false)
  assert.ok(G.mark(g, 'w', enemy, 'R')) // turn 1: still locked
  G.move(g, 'w', { pieceId: id(g, 3, 1), to: { x: 3, y: 3 }, as: 'P' })
  G.challenge(g, 'b', false)
  G.move(g, 'b', { pieceId: id(g, 3, 6), to: { x: 3, y: 4 }, as: 'P' })
  G.challenge(g, 'w', false)
  assert.equal(G.mark(g, 'w', enemy, 'R'), null)
})

test('view never leaks enemy kinds before the end', () => {
  const g = started()
  const v = G.view(g, 'w')
  assert.ok(v.pieces.filter((p) => p.owner === 'b').every((p) => !('kind' in p)))
  G.resign(g, 'b')
  assert.ok(G.view(g, 'w').pieces.every((p) => 'kind' in p))
})

test('start position and history replay to the final board', () => {
  const g = started()
  G.move(g, 'w', { pieceId: id(g, 4, 1), to: { x: 4, y: 3 }, as: 'P' })
  G.challenge(g, 'b', false)
  G.move(g, 'b', { pieceId: id(g, 3, 6), to: { x: 3, y: 2 }, as: 'Q' }) // bluff, caught
  G.challenge(g, 'w', true)
  const board = new Map(g.start.map((p) => [p.x * 8 + p.y, p.kind + p.owner]))
  for (const h of g.history) {
    const piece = board.get(h.from.x * 8 + h.from.y)!
    board.delete(h.from.x * 8 + h.from.y)
    if (!(h.bluff && h.challenged)) board.set(h.to.x * 8 + h.to.y, (h.promo ?? piece[0]) + piece[1])
  }
  const live = new Map(g.pieces.filter((p) => p.alive).map((p) => [p.x * 8 + p.y, p.kind + p.owner]))
  assert.deepEqual([...board].sort(), [...live].sort())
})

test('elo is zero-sum and favours the underdog', () => {
  assert.equal(G.eloDelta(1200, 1200, 1), 16)
  assert.ok(G.eloDelta(1000, 1400, 1) > 16)
})

test('saved layouts round-trip and stay valid for both colours', () => {
  for (let i = 0; i < 20; i++) {
    const layout = placementLayout('w', randomSetup('w'))
    assert.equal(layoutError(layout), null)
    assert.equal(setupError('b', layoutPlacement('b', layout)), null)
    assert.equal(placementLayout('b', layoutPlacement('b', layout)), layout)
  }
  assert.equal(placementLayout('w', classicSetup('w')), DEFAULT_LAYOUT)
  assert.ok(layoutError('RNBQKBNRPPPPPPP'))
  assert.ok(layoutError('RNBQKNBRPPPPPPPP')) // both bishops on the same colour
})

test('pseudos: format and reserved names', () => {
  for (const ok of ['Egon', 'wolf_xs', 'Robot-42', 'Botanique']) assert.equal(nameError(ok), null, ok)
  for (const bad of ['Admin', 'xX_admin_Xx', '4dm1n', 'SuperModerateur', 'root', 'Bluffbot', 'Support2', 'ab', 'nom avec espace', 'a'.repeat(17)])
    assert.ok(nameError(bad), bad)
})

test('daily quests: 3 distinct per day, same for everyone, change across days', async () => {
  const { dailyQuests, seasonOf } = await import('../shared/rules.ts')
  const a = dailyQuests('2026-11-06'), b = dailyQuests('2026-11-06'), c = dailyQuests('2026-11-07')
  assert.equal(new Set(a.map((q) => q.id)).size, 3)
  assert.deepEqual(a, b)
  assert.ok([...Array(10)].some((_, i) => dailyQuests(`2026-12-${10 + i}`).map((q) => q.id).join() !== a.map((q) => q.id).join()))
  assert.ok(c.length === 3)
  const s = seasonOf(Date.UTC(2026, 10, 15))
  assert.equal(s.label, 'Saison de novembre 2026')
  assert.equal(s.end, Date.UTC(2026, 11, 1))
})
