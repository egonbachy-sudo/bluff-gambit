import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import * as webpush from 'web-push'
import { Server } from 'socket.io'
import { all, get, run } from './db.ts'
import type { Row } from './db.ts'
import * as G from './game.ts'
import * as Bot from './bot.ts'
import { avatarOf, goldOf, kFactor, rankOf, seasonPoints, RANKS, SEASON_RANK_REWARDS, SHOP, dailyQuests, dayKey, seasonOf, nameError, layoutError, layoutPlacement, opp, randomSetup, levelOf, DEFAULT_LAYOUT, CHALLENGE_SECONDS, DEFAULT_UNLOCKS, EMOTES, QUESTS, TIME_CONTROLS } from '../shared/rules.ts'
import type { Color, Kind } from '../shared/rules.ts'

const PORT = Number(process.env.PORT ?? 3000)
const SETUP_MS = 120_000
const server = http.createServer()

if (process.argv.includes('--prod')) server.on('request', serveStatic)
else {
  const { createServer } = await import('vite')
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'spa' })
  server.on('request', vite.middlewares)
}
const io = new Server(server)

// ---------- static files (production) ----------
const DIST = 'client/dist'
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.url?.startsWith('/socket.io')) return
  let file = join(DIST, normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^[/\\]+/, ''))
  let body: Buffer
  try { body = await readFile(file) } catch { body = await readFile((file = join(DIST, 'index.html'))) }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(body)
}

// ---------- accounts ----------
const hashPw = (pw: string) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`
}
const checkPw = (pw: string, stored: string) => {
  const [salt, h = ''] = stored.split(':')
  const a = Buffer.from(h, 'hex'), b = scryptSync(pw, salt, 64)
  return a.length === b.length && timingSafeEqual(a, b)
}
/** Sessions expire after 30 days without use; each use (at most once a day) pushes the deadline back. */
const SESSION_MS = 30 * 86_400_000
await run('DELETE FROM sessions WHERE created_at < ?', Date.now() - SESSION_MS)
async function newSession(userId: number) {
  const token = randomBytes(32).toString('hex')
  await run('INSERT INTO sessions VALUES (?, ?, ?)', token, userId, Date.now())
  return token
}
async function userByToken(t: unknown) {
  if (typeof t !== 'string') return undefined
  const s = await get('SELECT user_id, created_at FROM sessions WHERE token = ?', t)
  if (!s) return undefined
  const age = Date.now() - s.created_at
  if (age > SESSION_MS) {
    await run('DELETE FROM sessions WHERE token = ?', t)
    return undefined
  }
  if (age > 86_400_000) await run('UPDATE sessions SET created_at = ? WHERE token = ?', Date.now(), t)
  return s.user_id as number
}

async function stats(id: number) {
  return (await get(`SELECT COUNT(*) games, COALESCE(SUM(won), 0) wins,
    COALESCE(SUM(score), 0) + (SELECT COALESCE(SUM(xp), 0) FROM rewards WHERE user_id = ?) xp,
    COALESCE(SUM(correct_challenges), 0) correct_challenges, COALESCE(SUM(wrong_challenges), 0) wrong_challenges,
    COALESCE(SUM(correct_marks), 0) correct_marks, COALESCE(SUM(uncaught_bluffs), 0) uncaught_bluffs,
    COALESCE(MAX(CASE WHEN won = 1 THEN lives END), 0) best_lives,
    (SELECT COUNT(*) FROM game_players p JOIN games g ON g.id = p.game_id WHERE p.user_id = ? AND g.ranked = 1) ranked
    FROM game_players WHERE user_id = ?`, id, id, id))!
}
/** Today's quests with progress; finished ones are rewarded once (their XP joins the total). */
async function daily(id: number) {
  const day = dayKey(), since = Date.parse(day)
  const st = (await get(`SELECT COUNT(*) games, COALESCE(SUM(gp.won), 0) wins, COALESCE(SUM(gp.correct_challenges), 0) correct_challenges,
    COALESCE(SUM(gp.uncaught_bluffs), 0) uncaught_bluffs, COALESCE(SUM(gp.correct_marks), 0) correct_marks,
    COALESCE(SUM(g.ranked), 0) ranked, COALESCE(MAX(gp.score), 0) best_score, COALESCE(MAX(CASE WHEN gp.won = 1 THEN gp.lives END), 0) best_lives
    FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE gp.user_id = ? AND gp.ended_at >= ?`, id, since))!
  const quests = dailyQuests(day).map((q) => ({ ...q, progress: Math.min(st[q.stat] ?? 0, q.goal), done: (st[q.stat] ?? 0) >= q.goal }))
  for (const q of quests) if (q.done) await run('INSERT OR IGNORE INTO rewards VALUES (?, ?, ?, ?)', id, day, q.id, q.xp)
  return { quests, resetAt: since + 86_400_000 }
}
const seasonLabel = (key: string) => seasonOf(Date.parse(`${key}-15`)).label
async function awardsOf(id: number) {
  const rows = await all('SELECT season, rank FROM season_awards WHERE user_id = ? AND rank > 0 ORDER BY season DESC', id)
  return rows.map((r) => ({ season: r.season as string, rank: r.rank as number, label: seasonLabel(r.season) }))
}
/** Best rank reached in each finished season. */
async function seasonRanksOf(id: number) {
  const rows = await all('SELECT season, rank FROM season_ranks WHERE user_id = ? ORDER BY season DESC', id)
  return rows.map((r) => ({ season: r.season as string, rank: r.rank as string, label: seasonLabel(r.season) }))
}
const atLeast = (rank: string, min: string) => RANKS.findIndex((r) => r.key === rank) >= RANKS.findIndex((r) => r.key === min)
/** Everything unlocked: quests, a top-3 season finish, ranks reached in past seasons, and gold purchases. */
async function unlockedFor(id: number, st?: Row) {
  const [s, awards, ranks, bought] = await Promise.all([st ?? stats(id), awardsOf(id), seasonRanksOf(id), all('SELECT item FROM purchases WHERE user_id = ?', id)])
  return [...new Set([
    ...DEFAULT_UNLOCKS, ...QUESTS.filter((q) => s[q.stat] >= q.goal).map((q) => q.reward), ...(awards.length ? ['avatar:champion'] : []),
    ...SEASON_RANK_REWARDS.filter((r) => ranks.some((x) => atLeast(x.rank, r.rank))).map((r) => r.reward), ...bought.map((b) => b.item as string),
  ])]
}
async function profile(id: number) {
  const u = (await get('SELECT id, name, email, elo, gold, piece_skin, board_skin, layout, avatar, google_sub, hash FROM users WHERE id = ?', id))!
  const dq = await daily(id) // first: it may grant XP that stats() then counts
  const st = await stats(id)
  const { google_sub, hash, ...pub } = u
  const [awards, seasonRanks, unlocked, sp] = await Promise.all([awardsOf(id), seasonRanksOf(id), unlockedFor(id, st),
    get('SELECT COALESCE(SUM(season_pts), 0) n FROM game_players WHERE user_id = ? AND ended_at >= ?', id, seasonOf().start)])
  return {
    ...pub, layout: u.layout ?? DEFAULT_LAYOUT, google: !!google_sub, hasPassword: hash !== '!', seasonPoints: sp!.n as number,
    stats: st, level: levelOf(st.xp), unlocked, inGame: roomOf.has(id), daily: dq, season: seasonOf(), awards, seasonRanks,
  }
}
// The training bot is a regular user row whose hash can never match a password.
const BOT_EMAIL = 'bot@bluff.local'
await run("INSERT OR IGNORE INTO users (name, email, hash, created_at) VALUES ('Bluffbot 🤖', ?, '!', ?)", BOT_EMAIL, Date.now())
const BOT_ID = (await get('SELECT id FROM users WHERE email = ?', BOT_EMAIL))!.id as number
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// ---------- rooms ----------
type Room = {
  players: Record<Color, number>; names: Record<Color, string>; elo: Record<Color, number>
  ranked: boolean; minutes: number; g: G.Game; clock: Record<Color, number>; since: number
  layouts: Record<Color, string>
  avatars: Record<Color, string | null>
  /** Ranked games played before this one (placement K); missing in rooms saved before it existed. */
  placed?: Record<Color, number>
  timer?: NodeJS.Timeout; windowEnd?: number; setupEnd: number; eloDelta?: Record<Color, number>; done?: boolean
  bot?: Color; mem?: Bot.Mem; botTimer?: NodeJS.Timeout
  id: string; private: boolean
  /** Deadline after which a disconnected player loses the game. */
  away: Partial<Record<Color, number>>; awayTimers: Partial<Record<Color, NodeJS.Timeout>>
}
const roomOf = new Map<number, Room>()
const rooms = new Map<string, Room>() // live games by id, for spectators and persistence
const AWAY_MS = Number(process.env.AWAY_MS ?? 90_000)
const starting = new Set<number>() // players matched while their room is being created
const loginFails = new Map<string, number[]>() // shortcut: in-memory, resets on restart

// ---------- Google sign-in ----------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
/** First Google sign-in: identity verified, waiting for the player to pick a pseudo. */
const googleTickets = new Map<string, { sub: string; email: string; exp: number }>()
async function verifyGoogle(credential: unknown) {
  if (!GOOGLE_CLIENT_ID) throw new Error('Connexion Google pas encore configurée')
  if (typeof credential !== 'string' || credential.length > 4096) throw new Error('Jeton Google invalide')
  // shortcut: Google's tokeninfo endpoint checks the signature for us; verify JWTs locally if traffic grows
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`)
  const t = (await r.json().catch(() => ({}))) as Row
  const valid = r.ok && t.aud === GOOGLE_CLIENT_ID && ['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)
    && t.email_verified === 'true' && Number(t.exp) * 1000 > Date.now()
  if (!valid) throw new Error('Jeton Google invalide')
  return { sub: String(t.sub), email: String(t.email) }
}
async function nameTaken(name: string) {
  return !!(await get('SELECT 1 FROM users WHERE name = ?', name))
}
const queues = new Map<number, number[]>()
const privates = new Map<string, { host: number; minutes: number }>()
const colorOf = (r: Room, id: number): Color => (r.players.w === id ? 'w' : 'b')

function leaveQueues(id: number) {
  for (const [m, q] of queues) queues.set(m, q.filter((u) => u !== id))
  for (const [code, p] of privates) if (p.host === id) privates.delete(code)
}

async function startRoom(a: number, b: number, minutes: number, ranked: boolean, level: Bot.Level = 'normal', isPrivate = false) {
  leaveQueues(a)
  leaveQueues(b)
  starting.add(a).add(b)
  const [w, bl] = Math.random() < 0.5 ? [a, b] : [b, a]
  const user = (id: number) => get(`SELECT name, elo, layout, avatar, (SELECT COUNT(*) FROM game_players p JOIN games g ON g.id = p.game_id
    WHERE p.user_id = users.id AND g.ranked = 1) placed FROM users WHERE id = ?`, id) as Promise<Row>
  const [uw, ub] = await Promise.all([user(w), user(bl)]).finally(() => { starting.delete(a); starting.delete(b) })
  const room: Room = {
    players: { w, b: bl }, names: { w: uw.name, b: ub.name }, elo: { w: uw.elo, b: ub.elo }, placed: { w: uw.placed, b: ub.placed },
    layouts: { w: uw.layout ?? DEFAULT_LAYOUT, b: ub.layout ?? DEFAULT_LAYOUT },
    avatars: { w: w === BOT_ID ? 'b:15' : uw.avatar, b: bl === BOT_ID ? 'b:15' : ub.avatar },
    ranked, minutes, g: G.newGame(), clock: { w: minutes * 60_000, b: minutes * 60_000 },
    since: Date.now(), setupEnd: Date.now() + SETUP_MS,
    id: randomBytes(8).toString('hex'), private: isPrivate, away: {}, awayTimers: {},
  }
  if (b === BOT_ID) {
    room.bot = w === BOT_ID ? 'w' : 'b'
    room.mem = Bot.newMem(level)
    room.names[room.bot] = `Bluffbot (${level})`
  }
  for (const id of [w, bl]) if (id !== BOT_ID) roomOf.set(id, room)
  rooms.set(room.id, room)
  after(room)
}

const running = (r: Room) => r.g.phase === 'move' || r.g.phase === 'challenge'
/** Bills the elapsed time to the side that has to act. */
function charge(r: Room) {
  const now = Date.now()
  if (running(r) && r.minutes) r.clock[r.g.turn] -= now - r.since
  r.since = now
}

function schedule(r: Room) {
  clearTimeout(r.timer)
  r.windowEnd = undefined
  const g = r.g, now = Date.now()
  if (g.phase === 'over') return finish(r)
  if (g.phase === 'setup') {
    r.timer = setTimeout(() => {
      for (const c of ['w', 'b'] as Color[]) if (!g.players[c].ready) G.setup(g, c, layoutPlacement(c, r.layouts[c]))
      after(r)
    }, r.setupEnd - now)
    return
  }
  const left = r.minutes ? r.clock[g.turn] : Infinity // 0 minutes = untimed game
  if (g.phase === 'challenge' && CHALLENGE_SECONDS * 1000 < left) {
    r.windowEnd = now + CHALLENGE_SECONDS * 1000
    r.timer = setTimeout(() => { charge(r); G.challenge(g, g.turn, false); after(r) }, CHALLENGE_SECONDS * 1000)
  } else if (r.minutes) r.timer = setTimeout(() => { charge(r); G.timeout(g, g.turn); after(r) }, Math.max(0, left))
}

function after(r: Room) {
  r.since = Date.now()
  schedule(r)
  send(r)
  saveRoom(r)
  notifyTurn(r)
  if (r.bot) botTurn(r)
}

// ---------- persistence: live games survive a restart ----------
let saveChain: Promise<unknown> = Promise.resolve()
const queueWrite = (fn: () => Promise<unknown>) => (saveChain = saveChain.then(fn).catch((e) => console.error('live game', e)))
function saveRoom(r: Room) {
  if (r.done) return
  const { timer, botTimer, awayTimers, mem, ...rest } = r
  const data = JSON.stringify({
    ...rest, mem: mem && { level: mem.level, moved: [...mem.moved], possible: [...mem.possible].map(([k, s]) => [k, [...s]]) },
  })
  queueWrite(() => run('INSERT OR REPLACE INTO live_games VALUES (?, ?, ?)', r.id, data, Date.now()))
}
async function restoreRooms() {
  for (const row of await all('SELECT id, data FROM live_games')) {
    try {
      const d = JSON.parse(row.data)
      const g: G.Game = d.g
      // JSON loses object identity: the pending capture must point at the real piece again.
      if (g.last?.captured) g.last.captured = g.pieces.find((p) => p.id === g.last!.captured!.id) ?? null
      const r: Room = {
        ...d, g, since: Date.now(), setupEnd: Date.now() + SETUP_MS, awayTimers: {}, away: {}, done: false,
        mem: d.mem && { level: d.mem.level, moved: new Set(d.mem.moved), possible: new Map(d.mem.possible.map(([k, a]: [string, Kind[]]) => [k, new Set(a)])) },
      }
      rooms.set(r.id, r)
      for (const c of ['w', 'b'] as Color[]) if (r.players[c] !== BOT_ID) {
        roomOf.set(r.players[c], r)
        markAway(r, c, AWAY_MS * 2) // nobody is connected yet right after a restart
      }
      after(r)
    } catch (e) {
      console.error('restore', row.id, e)
      await run('DELETE FROM live_games WHERE id = ?', row.id)
    }
  }
}

// ---------- disconnection: a player who stays away loses ----------
function markAway(r: Room, c: Color, ms = AWAY_MS) {
  if (r.done || r.away[c]) return
  r.away[c] = Date.now() + ms
  r.awayTimers[c] = setTimeout(() => {
    if (r.done || !r.away[c]) return
    try { act(r, () => G.resign(r.g, c, 'abandon (déconnexion)')) } catch {}
  }, ms)
  send(r)
}
function markBack(r: Room, c: Color) {
  if (!r.away[c]) return
  clearTimeout(r.awayTimers[c])
  delete r.away[c]
  delete r.awayTimers[c]
  send(r)
}
const isOnline = (id: number) => !!io.sockets.adapter.rooms.get(`u${id}`)?.size

// ---------- push notifications: "your turn" when the player has no open tab ----------
let vapidPublic = ''
{
  let keys = (await get("SELECT value FROM settings WHERE key = 'vapid'"))?.value
  if (!keys) {
    keys = JSON.stringify(webpush.generateVAPIDKeys())
    await run("INSERT INTO settings VALUES ('vapid', ?)", keys)
  }
  const k = JSON.parse(keys)
  webpush.setVapidDetails(`mailto:${process.env.CONTACT_EMAIL || 'admin@bluff-gambit.local'}`, k.publicKey, k.privateKey)
  vapidPublic = k.publicKey
}
const lastPush = new Map<number, number>()
async function pushTo(id: number, title: string, body: string) {
  if (Date.now() - (lastPush.get(id) ?? 0) < 60_000) return
  lastPush.set(id, Date.now())
  for (const s of await all('SELECT endpoint, data FROM push_subs WHERE user_id = ?', id))
    await webpush.sendNotification(JSON.parse(s.data), JSON.stringify({ title, body })).catch(async (e) => {
      if (e.statusCode === 404 || e.statusCode === 410) await run('DELETE FROM push_subs WHERE endpoint = ?', s.endpoint)
    })
}
function notifyTurn(r: Room) {
  if (r.done || !running(r)) return
  const uid = r.players[r.g.turn]
  if (uid === BOT_ID || isOnline(uid)) return
  const foe = r.names[r.g.turn === 'w' ? 'b' : 'w']
  pushTo(uid, 'Bluff Gambit', r.g.phase === 'challenge' ? `${foe} vient de jouer : contester ?` : `À toi de jouer contre ${foe}`).catch(() => {})
}

function botTurn(r: Room) {
  clearTimeout(r.botTimer)
  const g = r.g, c = r.bot!
  if (g.phase === 'over' || (g.phase === 'setup' ? g.players[c].ready : g.turn !== c)) return
  r.botTimer = setTimeout(() => {
    try {
      const v = G.view(g, c)
      if (g.phase === 'setup') act(r, () => G.setup(g, c, randomSetup(c)))
      else if (g.phase === 'challenge') {
        const t = Bot.challengeTurn(r.mem!, v)
        act(r, () => G.challenge(g, c, t.contest))
        t.learn(G.view(g, c))
      } else {
        const mk = Bot.decideMark(r.mem!, v)
        if (mk) G.mark(g, c, mk.pieceId, mk.kind)
        act(r, () => G.move(g, c, Bot.decideMove(r.mem!, v)))
      }
    } catch (e) {
      console.error('bot', e) // never leave the human facing a frozen bot
      if (g.phase !== 'over') try { act(r, () => G.resign(g, c)) } catch {}
    }
  }, 600 + Math.random() * 900)
}

function act(r: Room, fn: () => string | null) {
  charge(r)
  if (running(r) && r.minutes && r.clock[r.g.turn] <= 0) {
    G.timeout(r.g, r.g.turn)
    after(r)
    throw new Error('Temps écoulé')
  }
  const err = fn()
  if (err) throw new Error(err)
  after(r)
}

function send(r: Room) {
  const now = Date.now(), elapsed = running(r) ? now - r.since : 0
  const clock = { ...r.clock }
  if (running(r)) clock[r.g.turn] -= elapsed
  for (const c of ['w', 'b'] as Color[])
    io.to(`u${r.players[c]}`).emit('game', {
      ...G.view(r.g, c), names: r.names, avatars: r.avatars, elo: r.elo, ranked: r.ranked, minutes: r.minutes, clock,
      windowLeft: r.windowEnd ? r.windowEnd - now : 0,
      setupLeft: r.g.phase === 'setup' ? r.setupEnd - now : 0,
      eloDelta: r.eloDelta, away: awayLeft(r), spectators: spectatorsOf(r),
    })
  io.to(`spec:${r.id}`).emit('spec', {
    ...G.spectatorView(r.g), id: r.id, names: r.names, avatars: r.avatars, elo: r.elo, ranked: r.ranked, minutes: r.minutes, clock,
    windowLeft: r.windowEnd ? r.windowEnd - now : 0, setupLeft: r.g.phase === 'setup' ? r.setupEnd - now : 0, away: awayLeft(r), spectators: spectatorsOf(r),
  })
}
const awayLeft = (r: Room) => ({ w: r.away.w ? r.away.w - Date.now() : 0, b: r.away.b ? r.away.b - Date.now() : 0 })
const spectatorsOf = (r: Room) => io.sockets.adapter.rooms.get(`spec:${r.id}`)?.size ?? 0

function finish(r: Room) {
  if (r.done) return
  r.done = true
  rooms.delete(r.id)
  for (const c of ['w', 'b'] as Color[]) clearTimeout(r.awayTimers[c])
  queueWrite(() => run('DELETE FROM live_games WHERE id = ?', r.id))
  if (r.bot) {
    // Training games are not saved: no Elo, no stats, no quest farming.
    r.eloDelta = { w: 0, b: 0 }
    roomOf.delete(r.players[opp(r.bot)])
    return
  }
  const g = r.g, now = Date.now()
  // Each side has its own K (placement games move faster), so the two changes need not cancel out.
  const elo = (c: Color) => r.ranked && g.winner ? G.eloDelta(r.elo[c], r.elo[opp(c)], g.winner === c ? 1 : 0, kFactor(r.placed?.[c] ?? 99)) : 0
  const delta = (r.eloDelta = { w: elo('w'), b: elo('b') })
  for (const c of ['w', 'b'] as Color[]) roomOf.delete(r.players[c])
  ;(async () => {
    const gameId = await run('INSERT INTO games (white, black, winner, reason, ranked, minutes, history, start, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      r.players.w, r.players.b, g.winner, g.reason, r.ranked ? 1 : 0, r.minutes, JSON.stringify(g.history), JSON.stringify(g.start), now)
    const season = seasonOf(now).start, today = Date.parse(dayKey(now))
    for (const c of ['w', 'b'] as Color[]) {
      const s = G.stats(g, c), uid = r.players[c], foe = r.players[opp(c)], won = g.winner === c
      let pts = 0
      if (r.ranked && g.winner) {
        const recent = await all(`SELECT p.won FROM game_players p JOIN games g ON g.id = p.game_id
          WHERE p.user_id = ? AND g.ranked = 1 AND p.ended_at >= ? AND g.id <> ? ORDER BY p.ended_at DESC LIMIT 5`, uid, season, gameId)
        const lost = recent.findIndex((x) => !x.won)
        const total = (await get('SELECT COALESCE(SUM(season_pts), 0) n FROM game_players WHERE user_id = ? AND ended_at >= ?', uid, season))!.n
        const vsFoe = (await get(`SELECT COUNT(*) n FROM games WHERE ranked = 1 AND ended_at >= ? AND id <> ?
          AND ((white = ? AND black = ?) OR (white = ? AND black = ?))`, today, gameId, uid, foe, foe, uid))!.n
        pts = seasonPoints(won, lost === -1 ? recent.length : lost, total, vsFoe)
      }
      await run(`INSERT INTO game_players (game_id, user_id, color, won, score, lives, correct_challenges, wrong_challenges,
        correct_marks, uncaught_bluffs, elo_before, elo_after, ended_at, season_pts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        gameId, uid, c, won ? 1 : 0, s.total, s.lives, s.correctChallenges, s.wrongChallenges,
        s.correctMarks, s.uncaughtBluffs, r.elo[c], r.elo[c] + delta[c], now, pts)
      await run('UPDATE users SET elo = elo + ?, gold = gold + ? WHERE id = ?', delta[c], goldOf(s.total), uid)
      // First win of the day doubles its XP (the primary key keeps it to one per day).
      if (won) await run("INSERT OR IGNORE INTO rewards VALUES (?, ?, 'firstwin', ?)", uid, dayKey(now), s.total)
    }
    for (const c of ['w', 'b'] as Color[]) io.to(`u${r.players[c]}`).emit('saved', gameId)
  })().catch((e) => console.error('save game', e))
}

// ---------- leaderboards ----------
const sumBoard = (col: string) => `SELECT u.name, u.avatar, SUM(g.${col}) value FROM game_players g JOIN users u ON u.id = g.user_id
  WHERE g.ended_at > ? AND u.email NOT LIKE 'deleted-%' GROUP BY u.id HAVING value > 0 ORDER BY value DESC LIMIT 50`
const BOARDS: Record<string, string> = {
  elo: `SELECT name, avatar, elo value FROM users WHERE ? >= 0 AND email NOT LIKE 'deleted-%' AND EXISTS (SELECT 1 FROM game_players g WHERE g.user_id = users.id) ORDER BY elo DESC LIMIT 50`,
  week: sumBoard('season_pts'), season: sumBoard('season_pts'), wins: sumBoard('won'), bluff: sumBoard('uncaught_bluffs'), detect: sumBoard('correct_challenges'),
}

// ---------- mail (password reset) ----------
const BREVO_KEY = process.env.BREVO_API_KEY ?? '', MAIL_FROM = process.env.MAIL_FROM ?? ''
const resetAsks = new Map<string, number[]>()
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
async function sendMail(to: string, subject: string, html: string) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: MAIL_FROM, name: 'Bluff Gambit' }, to: [{ email: to }], subject, htmlContent: html }),
  })
  if (!r.ok) {
    console.error('mail', r.status, await r.text().catch(() => ''))
    throw new Error('L’e-mail n’a pas pu partir, réessaie plus tard')
  }
}

// ---------- friends & invitations ----------
const invites = new Map<string, { from: number; to: number; minutes: number; exp: number }>()
const friendsChanged = (...ids: number[]) => { for (const id of ids) io.to(`u${id}`).emit('friends') }

// ---------- end-of-season awards: top 3 of last month ----------
async function awardSeasons() {
  const prev = seasonOf(seasonOf().start - 1)
  if (await get('SELECT 1 FROM season_awards WHERE season = ?', prev.key)) return
  // Best rank reached during the season, from the Elo after each ranked game.
  const peaks = await all(`SELECT p.user_id, MAX(p.elo_after) peak FROM game_players p JOIN games g ON g.id = p.game_id
    WHERE g.ranked = 1 AND p.ended_at >= ? AND p.ended_at < ? AND p.user_id <> ? GROUP BY p.user_id`, prev.start, prev.end, BOT_ID)
  for (const p of peaks) await run('INSERT OR IGNORE INTO season_ranks VALUES (?, ?, ?)', prev.key, p.user_id, rankOf(p.peak).key)
  const top = await all(`SELECT g.user_id, SUM(g.season_pts) s FROM game_players g JOIN users u ON u.id = g.user_id
    WHERE g.ended_at >= ? AND g.ended_at < ? AND u.email NOT LIKE 'deleted-%' AND u.id <> ? GROUP BY g.user_id HAVING s > 0 ORDER BY s DESC LIMIT 3`,
    prev.start, prev.end, BOT_ID)
  // rank 0 = "season processed, nobody qualified", so it is not computed again
  if (!top.length) return void (await run('INSERT OR IGNORE INTO season_awards VALUES (?, 0, 0)', prev.key))
  for (const [i, t] of top.entries()) await run('INSERT OR IGNORE INTO season_awards VALUES (?, ?, ?)', prev.key, i + 1, t.user_id)
}
await awardSeasons()
setInterval(() => awardSeasons().catch((e) => console.error('awards', e)), 3_600_000)

// ---------- sockets ----------
/** Distinct signed-in players, plus open tabs that are not signed in. */
function online() {
  const players = new Set<number>()
  let visitors = 0
  for (const s of io.sockets.sockets.values()) s.data.userId ? players.add(s.data.userId) : visitors++
  return { players: players.size, visitors }
}
let onlineTimer: NodeJS.Timeout | undefined
const pushOnline = () => {
  clearTimeout(onlineTimer)
  onlineTimer = setTimeout(() => io.emit('online', online()), 300)
}

io.on('connection', (socket) => {
  pushOnline()
  const login = (id: number) => {
    socket.data.userId = id
    socket.join(`u${id}`)
    pushOnline()
    const r = roomOf.get(id)
    if (r) {
      markBack(r, colorOf(r, id))
      send(r)
    }
    io.to(`u${id}`).emit('friends')
  }
  // Hosts put a proxy in front: take the client address it forwards.
  const clientIp = () => String(socket.handshake.headers['fly-client-ip'] ?? socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address).split(',')[0].trim()
  userByToken(socket.handshake.auth?.token).then((id) => id && login(id)).catch(() => {})

  const on = (ev: string, fn: (data: Row, id: number) => unknown, needAuth = true) =>
    socket.on(ev, async (data: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return
      try {
        if (needAuth && !socket.data.userId) throw new Error("Connecte-toi d'abord")
        ack({ ok: (await fn(typeof data === 'object' && data ? (data as Row) : {}, socket.data.userId)) ?? true })
      } catch (e) {
        ack({ error: (e as Error).message })
      }
    })
  const room = (id: number) => {
    const r = roomOf.get(id)
    if (!r) throw new Error('Aucune partie en cours')
    return r
  }

  on('register', async (d) => {
    const name = str(d.name), email = str(d.email), password = typeof d.password === 'string' ? d.password : ''
    const bad = nameError(name)
    if (bad) throw new Error(bad)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail invalide')
    if (password.length < 8) throw new Error('Mot de passe : 8 caractères minimum')
    if (await nameTaken(name)) throw new Error('Ce pseudo est déjà pris')
    let id: number
    try {
      id = await run('INSERT INTO users (name, email, hash, created_at) VALUES (?, ?, ?, ?)', name, email, hashPw(password), Date.now())
    } catch {
      throw new Error('Pseudo ou e-mail déjà utilisé')
    }
    login(id)
    return { token: await newSession(id), profile: await profile(id) }
  }, false)

  on('login', async (d) => {
    const ip = clientIp()
    const fails = (loginFails.get(ip) ?? []).filter((t) => t > Date.now() - 15 * 60_000)
    if (fails.length >= 10) throw new Error('Trop de tentatives, réessaie dans 15 minutes')
    const u = await get('SELECT id, hash FROM users WHERE name = ? OR email = ?', str(d.login), str(d.login))
    if (!u || typeof d.password !== 'string' || !checkPw(d.password, u.hash)) {
      loginFails.set(ip, [...fails, Date.now()])
      throw new Error('Identifiants incorrects')
    }
    login(u.id)
    return { token: await newSession(u.id), profile: await profile(u.id) }
  }, false)

  on('google', async (d) => {
    const g = await verifyGoogle(d.credential)
    const u = await get('SELECT id FROM users WHERE google_sub = ?', g.sub)
    if (u) {
      login(u.id)
      return { token: await newSession(u.id), profile: await profile(u.id) }
    }
    // Never attach Google to an existing password account: its e-mail was never verified.
    if (await get('SELECT 1 FROM users WHERE email = ?', g.email))
      throw new Error('Un compte existe déjà avec cet e-mail : connecte-toi avec ton pseudo et ton mot de passe.')
    const ticket = randomBytes(24).toString('hex')
    googleTickets.set(ticket, { ...g, exp: Date.now() + 10 * 60_000 })
    return { needName: true, ticket, suggestion: g.email.split('@')[0].replace(/[^\w-]/g, '').slice(0, 16) }
  }, false)

  on('google:register', async (d) => {
    const t = googleTickets.get(str(d.ticket))
    if (!t || t.exp < Date.now()) throw new Error('Connexion Google expirée, recommence')
    const name = str(d.name), bad = nameError(name)
    if (bad) throw new Error(bad)
    if (await nameTaken(name)) throw new Error('Ce pseudo est déjà pris')
    let id: number
    try {
      // '!' can never match a password: this account signs in with Google only.
      id = await run("INSERT INTO users (name, email, hash, google_sub, created_at) VALUES (?, ?, '!', ?, ?)", name, t.email, t.sub, Date.now())
    } catch {
      throw new Error('Ce pseudo est déjà pris')
    }
    googleTickets.delete(str(d.ticket))
    login(id)
    return { token: await newSession(id), profile: await profile(id) }
  }, false)

  on('google:link', async (d, id) => {
    const g = await verifyGoogle(d.credential)
    const other = await get('SELECT id FROM users WHERE google_sub = ?', g.sub)
    if (other && other.id !== id) throw new Error('Ce compte Google est déjà relié à un autre joueur')
    await run('UPDATE users SET google_sub = ? WHERE id = ?', g.sub, id)
    return profile(id)
  })

  on('replay', async (d, id) => {
    const g = await get(`SELECT g.*, w.name white_name, b.name black_name FROM games g
      JOIN users w ON w.id = g.white JOIN users b ON b.id = g.black WHERE g.id = ? AND (g.white = ? OR g.black = ?)`, Number(d.id), id, id)
    if (!g) throw new Error('Partie introuvable')
    if (!g.start) throw new Error('Cette partie a été jouée avant l’arrivée des replays')
    return {
      start: JSON.parse(g.start), history: JSON.parse(g.history), names: { w: g.white_name, b: g.black_name },
      me: g.white === id ? 'w' : 'b', winner: g.winner, reason: g.reason, ended_at: g.ended_at,
    }
  })

  on('logout', async (d, id) => {
    await run('DELETE FROM sessions WHERE token = ?', str(d.token))
    leaveQueues(id)
    socket.leave(`u${id}`)
    socket.data.userId = undefined
    pushOnline()
  })

  on('me', async (_, id) => ({
    profile: id ? await profile(id) : null, online: online(), googleClientId: GOOGLE_CLIENT_ID,
    mail: !!(BREVO_KEY && MAIL_FROM), contact: process.env.CONTACT_EMAIL ?? '', vapid: vapidPublic,
  }), false)

  // ---- account deletion (GDPR): anonymised so opponents' history stays consistent ----
  on('account:delete', async (d, id) => {
    const u = (await get('SELECT name FROM users WHERE id = ?', id))!
    if (str(d.name).toLowerCase() !== String(u.name).toLowerCase()) throw new Error('Tape exactement ton pseudo pour confirmer')
    const r = roomOf.get(id)
    if (r && r.g.phase !== 'over') try { act(r, () => G.resign(r.g, colorOf(r, id))) } catch {}
    leaveQueues(id)
    await run("UPDATE users SET name = ?, email = ?, hash = '!', google_sub = NULL, avatar = NULL, layout = NULL WHERE id = ?", `supprimé-${id}`, `deleted-${id}@invalid`, id)
    for (const sql of ['DELETE FROM sessions WHERE user_id = ?', 'DELETE FROM rewards WHERE user_id = ?', 'DELETE FROM purchases WHERE user_id = ?', 'DELETE FROM push_subs WHERE user_id = ?', 'DELETE FROM password_resets WHERE user_id = ?'])
      await run(sql, id)
    await run('DELETE FROM friends WHERE user_id = ? OR friend_id = ?', id, id)
    socket.leave(`u${id}`)
    socket.data.userId = undefined
    pushOnline()
  })

  // ---- forgotten password ----
  on('password:forgot', async (d) => {
    if (!BREVO_KEY || !MAIL_FROM) throw new Error('La réinitialisation par e-mail n’est pas encore activée')
    const ip = clientIp(), recent = (resetAsks.get(ip) ?? []).filter((t) => t > Date.now() - 3_600_000)
    if (recent.length >= 5) throw new Error('Trop de demandes, réessaie dans une heure')
    resetAsks.set(ip, [...recent, Date.now()])
    const u = await get("SELECT id, name, email FROM users WHERE email = ? AND email NOT LIKE 'deleted-%'", str(d.email))
    if (u) {
      const token = randomBytes(32).toString('hex')
      await run('INSERT INTO password_resets VALUES (?, ?, ?)', sha256(token), u.id, Date.now() + 3_600_000)
      const host = socket.handshake.headers['x-forwarded-host'] ?? socket.handshake.headers.host
      const base = process.env.PUBLIC_URL || `${host?.toString().startsWith('localhost') ? 'http' : 'https'}://${host}`
      await sendMail(u.email, 'Bluff Gambit : nouveau mot de passe',
        `<p>Bonjour ${escapeHtml(u.name)},</p><p>Pour choisir un nouveau mot de passe, clique sur ce lien (valable 1 heure) :</p>
        <p><a href="${base}/#/reset/${token}">${base}/#/reset/${token}</a></p><p>Si tu n'as rien demandé, ignore ce message.</p>`)
    }
    // Same answer either way: the form must not reveal which e-mails have an account.
    return { sent: true }
  }, false)

  on('password:reset', async (d) => {
    const row = await get('SELECT user_id, expires FROM password_resets WHERE token_hash = ?', sha256(str(d.token)))
    if (!row || row.expires < Date.now()) throw new Error('Lien expiré ou déjà utilisé, refais une demande')
    if (typeof d.password !== 'string' || d.password.length < 8) throw new Error('Mot de passe : 8 caractères minimum')
    await run('UPDATE users SET hash = ? WHERE id = ?', hashPw(d.password), row.user_id)
    await run('DELETE FROM password_resets WHERE user_id = ?', row.user_id)
    await run('DELETE FROM sessions WHERE user_id = ?', row.user_id) // log out everywhere
  }, false)

  // ---- push subscriptions ----
  on('push:subscribe', async (d, id) => {
    const sub = d.sub as Row | undefined
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || sub.endpoint.length > 1000) throw new Error('Abonnement invalide')
    await run('INSERT OR REPLACE INTO push_subs VALUES (?, ?, ?)', sub.endpoint, id, JSON.stringify(sub))
  })
  on('push:unsubscribe', async (d, id) => { await run('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?', str(d.endpoint), id) })

  // ---- friends ----
  on('friends:list', async (_, id) => {
    const rows = await all(`SELECT f.friend_id id, f.status, u.name, u.avatar, 'out' dir FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?
      UNION ALL SELECT f.user_id id, f.status, u.name, u.avatar, 'in' dir FROM friends f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'pending'`, id, id)
    const decorate = (r: Row) => ({ id: r.id, name: r.name, avatar: r.avatar, online: isOnline(r.id), inGame: roomOf.has(r.id), live: roomOf.get(r.id)?.id ?? null })
    return {
      friends: rows.filter((r) => r.status === 'accepted').map(decorate),
      incoming: rows.filter((r) => r.dir === 'in').map(decorate),
      outgoing: rows.filter((r) => r.dir === 'out' && r.status === 'pending').map(decorate),
    }
  })
  on('friends:add', async (d, id) => {
    const u = await get("SELECT id FROM users WHERE name = ? AND email NOT LIKE 'deleted-%'", str(d.name))
    if (!u || u.id === BOT_ID) throw new Error('Aucun joueur avec ce pseudo')
    if (u.id === id) throw new Error('Tu ne peux pas t’ajouter toi-même')
    const theirs = await get('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', u.id, id)
    if (theirs) {
      // They already asked us: adding them back accepts.
      await run("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", u.id, id)
      await run("INSERT OR REPLACE INTO friends VALUES (?, ?, 'accepted', ?)", id, u.id, Date.now())
    } else await run("INSERT OR IGNORE INTO friends VALUES (?, ?, 'pending', ?)", id, u.id, Date.now())
    friendsChanged(id, u.id)
  })
  on('friends:accept', async (d, id) => {
    const from = Number(d.id)
    if (!(await get("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'", from, id))) throw new Error('Demande introuvable')
    await run("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", from, id)
    await run("INSERT OR REPLACE INTO friends VALUES (?, ?, 'accepted', ?)", id, from, Date.now())
    friendsChanged(id, from)
  })
  on('friends:remove', async (d, id) => {
    const other = Number(d.id)
    await run('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', id, other, other, id)
    friendsChanged(id, other)
  })
  on('friends:invite', async (d, id) => {
    const to = Number(d.id), m = minutesOf(d)
    if (!(await get("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'", id, to))) throw new Error('Ce joueur n’est pas dans tes amis')
    notInGame(id)
    if (!isOnline(to)) throw new Error('Ton ami n’est pas connecté')
    if (roomOf.has(to)) throw new Error('Ton ami est déjà en partie')
    const inviteId = randomBytes(8).toString('hex'), me = (await get('SELECT name, avatar FROM users WHERE id = ?', id))!
    invites.set(inviteId, { from: id, to, minutes: m, exp: Date.now() + 60_000 })
    io.to(`u${to}`).emit('invite', { id: inviteId, from: me.name, avatar: me.avatar, minutes: m })
  })
  on('invite:answer', async (d, id) => {
    const inv = invites.get(str(d.id))
    if (!inv || inv.to !== id || inv.exp < Date.now()) throw new Error('Invitation expirée')
    invites.delete(str(d.id))
    if (!d.accept) return void io.to(`u${inv.from}`).emit('invite:declined')
    notInGame(id)
    if (roomOf.has(inv.from)) throw new Error('Ton ami a déjà commencé une autre partie')
    await startRoom(inv.from, id, inv.minutes, false, 'normal', true)
  })

  // ---- spectators ----
  on('live:list', () => [...rooms.values()].filter((r) => !r.private && !r.done).map((r) => ({
    id: r.id, names: r.names, avatars: r.avatars, minutes: r.minutes, ranked: r.ranked, bot: !!r.bot, phase: r.g.phase, spectators: spectatorsOf(r),
  })), false)
  on('spectate', (d) => {
    const r = rooms.get(str(d.id))
    if (!r || r.private) throw new Error('Cette partie n’est plus en cours')
    for (const room of socket.rooms) if (room.startsWith('spec:')) socket.leave(room)
    socket.join(`spec:${r.id}`)
    send(r)
  }, false)
  on('unspectate', () => { for (const room of socket.rooms) if (room.startsWith('spec:')) socket.leave(room) }, false)

  on('password', async (d, id) => {
    const u = (await get('SELECT hash FROM users WHERE id = ?', id))!
    // Google-only accounts have no password yet: they may set one without the old one.
    if (u.hash !== '!' && (typeof d.old !== 'string' || !checkPw(d.old, u.hash))) throw new Error('Ancien mot de passe incorrect')
    if (typeof d.new !== 'string' || d.new.length < 8) throw new Error('Mot de passe : 8 caractères minimum')
    await run('UPDATE users SET hash = ? WHERE id = ?', hashPw(d.new), id)
  })

  on('avatar', async (d, id) => {
    const a = avatarOf(d.avatar)
    if (!a) throw new Error('Photo inconnue')
    if (a.special && !(await unlockedFor(id)).includes(`avatar:${a.key}`)) throw new Error('Photo pas encore débloquée')
    await run('UPDATE users SET avatar = ? WHERE id = ?', d.avatar, id)
    return profile(id)
  })

  on('skin', async (d, id) => {
    const type = d.type === 'board' ? 'board' : 'pieces', skin = str(d.skin)
    if (!(await unlockedFor(id)).includes(`${type}:${skin}`)) throw new Error('Skin pas encore débloqué')
    await run(`UPDATE users SET ${type === 'board' ? 'board_skin' : 'piece_skin'} = ? WHERE id = ?`, skin, id)
    return profile(id)
  })

  on('shop:buy', async (d, id) => {
    const item = str(d.item), price = SHOP[item]
    if (!price) throw new Error('Article inconnu')
    if ((await unlockedFor(id)).includes(item)) throw new Error('Tu l’as déjà')
    // The WHERE clause makes the debit atomic: gold never goes below zero, even with two clicks at once.
    if (!(await get('UPDATE users SET gold = gold - ? WHERE id = ? AND gold >= ? RETURNING id', price, id, price))) throw new Error('Pas assez d’or')
    await run('INSERT OR IGNORE INTO purchases VALUES (?, ?)', id, item)
    return profile(id)
  })

  on('layout', async (d, id) => {
    const err = layoutError(d.layout)
    if (err) throw new Error(err)
    await run('UPDATE users SET layout = ? WHERE id = ?', d.layout, id)
    return profile(id)
  })

  on('leaderboard', (d) => {
    const sql = BOARDS[str(d.kind)] ?? BOARDS.elo
    return all(sql, d.kind === 'week' ? Date.now() - 7 * 86_400_000 : d.kind === 'season' ? seasonOf().start : 0)
  }, false)

  on('history', async (_, id) => ({
    games: await all(`SELECT gp.game_id, g.start IS NOT NULL replayable, gp.won, gp.score, gp.elo_before, gp.elo_after, gp.ended_at, u.name opponent, g.reason, g.ranked
      FROM game_players gp JOIN game_players o ON o.game_id = gp.game_id AND o.user_id <> gp.user_id
      JOIN users u ON u.id = o.user_id JOIN games g ON g.id = gp.game_id
      WHERE gp.user_id = ? ORDER BY gp.ended_at DESC LIMIT 15`, id),
    rivals: await all(`SELECT u.name, COUNT(*) games, SUM(gp.won) wins
      FROM game_players gp JOIN game_players o ON o.game_id = gp.game_id AND o.user_id <> gp.user_id
      JOIN users u ON u.id = o.user_id WHERE gp.user_id = ? GROUP BY o.user_id ORDER BY games DESC LIMIT 10`, id),
  }))

  // ---- matchmaking ----
  const minutesOf = (d: Row) => {
    const m = Number(d.minutes)
    if (!TIME_CONTROLS.includes(m)) throw new Error('Temps invalide')
    return m
  }
  const notInGame = (id: number) => {
    if (roomOf.has(id) || starting.has(id)) throw new Error('Tu es déjà en partie')
  }
  on('queue:join', async (d, id) => {
    notInGame(id)
    const m = minutesOf(d)
    leaveQueues(id)
    const q = queues.get(m) ?? []
    const other = q[0]
    if (other === undefined) queues.set(m, [id])
    else await startRoom(other, id, m, true)
    return { waiting: other === undefined }
  })
  on('bot:start', async (d, id) => {
    notInGame(id)
    const level = Bot.LEVELS.includes(d.level) ? (d.level as Bot.Level) : 'normal'
    await startRoom(id, BOT_ID, minutesOf(d), false, level)
  })
  on('queue:leave', (_, id) => leaveQueues(id))
  on('private:create', (d, id) => {
    notInGame(id)
    const m = minutesOf(d)
    leaveQueues(id)
    let code: string
    do code = Array.from(randomBytes(5), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
    while (privates.has(code))
    privates.set(code, { host: id, minutes: m })
    return { code }
  })
  on('private:join', async (d, id) => {
    notInGame(id)
    const code = str(d.code).toUpperCase(), p = privates.get(code)
    if (!p) throw new Error('Code introuvable')
    if (p.host === id) throw new Error('Partage ce code à un ami')
    privates.delete(code)
    await startRoom(p.host, id, p.minutes, false, 'normal', true)
  })

  // ---- game ----
  on('game:state', (_, id) => send(room(id)))
  on('game:setup', (d, id) => { const r = room(id); act(r, () => G.setup(r.g, colorOf(r, id), d.placement)) })
  on('game:move', (d, id) => { const r = room(id); act(r, () => G.move(r.g, colorOf(r, id), d as G.Move)) })
  on('game:challenge', (d, id) => { const r = room(id); act(r, () => G.challenge(r.g, colorOf(r, id), d.contest === true)) })
  on('game:mark', (d, id) => { const r = room(id); act(r, () => G.mark(r.g, colorOf(r, id), d.pieceId, d.kind)) })
  on('game:resign', (_, id) => { const r = room(id); act(r, () => G.resign(r.g, colorOf(r, id))) })
  on('game:emote', (d, id) => {
    const r = room(id)
    if (!EMOTES.includes(str(d.emoji))) throw new Error('Emote inconnue')
    const c = colorOf(r, id)
    io.to(`u${r.players[c === 'w' ? 'b' : 'w']}`).emit('emote', str(d.emoji))
  })

  socket.on('disconnect', () => {
    pushOnline()
    const id = socket.data.userId
    if (id && !isOnline(id)) {
      leaveQueues(id)
      const r = roomOf.get(id)
      if (r && r.g.phase !== 'over') markAway(r, colorOf(r, id))
      friendsChanged(id)
    }
  })
})

await restoreRooms()
server.listen(PORT, () => console.log(`Bluff Gambit : http://localhost:${PORT}`))
