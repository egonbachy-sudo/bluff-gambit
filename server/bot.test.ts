import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomSetup } from '../shared/rules.ts'
import type { Color } from '../shared/rules.ts'
import * as G from './game.ts'
import * as Bot from './bot.ts'

/** Bot vs bot: every decision must be accepted by the engine. */
function selfPlay(maxPlies = 600) {
  const g = G.newGame(), mem = { w: Bot.newMem(), b: Bot.newMem() }
  for (const c of ['w', 'b'] as Color[]) assert.equal(G.setup(g, c, randomSetup(c)), null)
  for (let i = 0; i < maxPlies && g.phase !== 'over'; i++) {
    const c = g.turn
    if (g.phase === 'challenge') {
      const t = Bot.challengeTurn(mem[c], G.view(g, c))
      assert.equal(G.challenge(g, c, t.contest), null)
      t.learn(G.view(g, c))
    } else {
      const mk = Bot.decideMark(mem[c], G.view(g, c))
      if (mk) assert.equal(G.mark(g, c, mk.pieceId, mk.kind), null)
      assert.equal(G.move(g, c, Bot.decideMove(mem[c], G.view(g, c))), null)
    }
  }
  return g
}

test('bot self-play only makes legal decisions and games finish', () => {
  let ended = 0, contested = 0
  for (let i = 0; i < 30; i++) {
    const g = selfPlay()
    if (g.phase === 'over') ended++
    contested += g.players.w.correctChallenges + g.players.w.wrongChallenges + g.players.b.correctChallenges + g.players.b.wrongChallenges
  }
  assert.ok(ended >= 25, `only ${ended}/30 games ended`)
  assert.ok(contested > 0, 'bots never contest')
})

test('bot contests a move that contradicts what the piece already showed', () => {
  const g = G.newGame()
  for (const c of ['w', 'b'] as Color[]) G.setup(g, c, randomSetup(c))
  const mem = Bot.newMem()
  const knight = g.pieces.find((p) => p.owner === 'w' && p.y === 0 && p.x === 1)!
  mem.possible.set(knight.id, new Set(['N']))
  mem.moved.add(knight.id)
  // move it straight up two squares: impossible for a knight
  Object.assign(knight, { x: 3, y: 3 })
  g.pieces.filter((p) => p.owner === 'w' && p.x === 3 && p.y === 1).forEach((p) => (p.alive = false))
  const r = G.move(g, 'w', { pieceId: knight.id, to: { x: 3, y: 5 }, as: 'R' })
  assert.equal(r, null)
  assert.ok(Bot.challengeTurn(mem, G.view(g, 'b'), () => 0.99).contest)
})
