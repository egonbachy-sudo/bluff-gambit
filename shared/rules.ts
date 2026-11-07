export type Color = 'w' | 'b'
export type Kind = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'
export type Sq = { x: number; y: number }
export type Placement = { x: number; y: number; kind: Kind }[]
/** Which side stands on a square; piece types are deliberately not part of it. */
export type Occ = (x: number, y: number) => Color | null

export const KINDS: Kind[] = ['K', 'Q', 'R', 'B', 'N', 'P']
export const NAMES: Record<Kind, string> = { K: 'Roi', Q: 'Dame', R: 'Tour', B: 'Fou', N: 'Cavalier', P: 'Pion' }
export const LETTER: Record<Kind, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C', P: 'P' }
export const VALUE: Record<Kind, number> = { K: 0, Q: 9, R: 5, B: 3, N: 3, P: 1 }
const BACK: Kind[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
const SET: Kind[] = [...BACK, ...Array<Kind>(8).fill('P')]

export const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w')
export const dir = (c: Color) => (c === 'w' ? 1 : -1)
export const lastRank = (c: Color) => (c === 'w' ? 7 : 0)
/** [back row, front row] */
export const homeRows = (c: Color) => (c === 'w' ? [0, 1] : [7, 6])
export const inBoard = (x: number, y: number) => x >= 0 && x < 8 && y >= 0 && y < 8
export const sqName = (s: Sq) => 'abcdefgh'[s.x] + (s.y + 1)

export function canMove(kind: Kind, c: Color, from: Sq, to: Sq, occ: Occ, moved: boolean): boolean {
  if (!inBoard(to.x, to.y) || (to.x === from.x && to.y === from.y) || occ(to.x, to.y) === c) return false
  const dx = to.x - from.x, dy = to.y - from.y, ax = Math.abs(dx), ay = Math.abs(dy)
  const clear = () => {
    const sx = Math.sign(dx), sy = Math.sign(dy)
    for (let x = from.x + sx, y = from.y + sy; x !== to.x || y !== to.y; x += sx, y += sy) if (occ(x, y)) return false
    return true
  }
  switch (kind) {
    case 'N': return ax * ay === 2
    case 'K': return Math.max(ax, ay) === 1
    case 'R': return (dx === 0 || dy === 0) && clear()
    case 'B': return ax === ay && clear()
    case 'Q': return (dx === 0 || dy === 0 || ax === ay) && clear()
    case 'P': {
      const f = dir(c), target = occ(to.x, to.y)
      if (dx === 0 && !target) return dy === f || (dy === 2 * f && !moved && !occ(from.x, from.y + f))
      return ax === 1 && dy === f && target === opp(c)
    }
  }
}

export function destinations(kind: Kind, c: Color, from: Sq, occ: Occ, moved: boolean): Sq[] {
  const out: Sq[] = []
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) if (canMove(kind, c, from, { x, y }, occ, moved)) out.push({ x, y })
  return out
}

export function classicSetup(c: Color): Placement {
  const [back, front] = homeRows(c)
  return BACK.flatMap((kind, x) => [{ x, y: back, kind }, { x, y: front, kind: 'P' as Kind }])
}

export function randomSetup(c: Color): Placement {
  const squares = classicSetup(c).map(({ x, y }) => ({ x, y }))
  for (;;) {
    const kinds = [...SET].sort(() => Math.random() - 0.5)
    const p = squares.map((s, i) => ({ ...s, kind: kinds[i] }))
    if (!setupError(c, p)) return p
  }
}

/** Validates a placement coming from a client. */
export function setupError(c: Color, p: unknown): string | null {
  if (!Array.isArray(p) || p.length !== 16) return 'Il faut placer 16 pièces'
  const rows = homeRows(c), seen = new Set<number>(), count: Record<string, number> = {}
  for (const e of p) {
    if (typeof e !== 'object' || e === null) return 'Placement invalide'
    const { x, y, kind } = e as Record<string, unknown>
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inBoard(x as number, y as number) || !rows.includes(y as number))
      return 'Les pièces doivent être sur tes 2 premières rangées'
    const key = (x as number) * 8 + (y as number)
    if (seen.has(key)) return 'Deux pièces sur la même case'
    seen.add(key)
    if (!KINDS.includes(kind as Kind)) return 'Pièce inconnue'
    count[kind as Kind] = (count[kind as Kind] ?? 0) + 1
  }
  for (const k of KINDS) if (count[k] !== SET.filter((s) => s === k).length) return 'Composition invalide'
  const [b1, b2] = (p as Placement).filter((e) => e.kind === 'B')
  if ((b1.x + b1.y) % 2 === (b2.x + b2.y) % 2) return 'Il faut 1 fou sur case claire et 1 fou sur case foncée'
  return null
}

/**
 * A saved arrangement: 16 letters, back row then front row, each read from the player's own left.
 * Mirroring for black keeps the bishop-colour rule valid for both sides.
 */
export const DEFAULT_LAYOUT = 'RNBQKBNRPPPPPPPP'
export function layoutPlacement(c: Color, layout: string): Placement {
  const [back, front] = homeRows(c)
  return [...layout].map((kind, i) => ({ x: c === 'w' ? i % 8 : 7 - (i % 8), y: i < 8 ? back : front, kind: kind as Kind }))
}
export function placementLayout(c: Color, p: Placement): string {
  const [back, front] = homeRows(c)
  const at = (col: number, y: number) => p.find((e) => e.y === y && e.x === (c === 'w' ? col : 7 - col))?.kind ?? '?'
  return [back, front].map((y) => [0, 1, 2, 3, 4, 5, 6, 7].map((col) => at(col, y)).join('')).join('')
}
export const layoutError = (layout: unknown) =>
  typeof layout === 'string' && layout.length === 16 ? setupError('w', layoutPlacement('w', layout)) : 'Arrangement invalide'

// Names that could pass for staff or the game itself: blocked, also when hidden in leetspeak (4dm1n…).
const RESERVED_PARTS = ['admin', 'moderat', 'bluffbot', 'bluffgambit', 'staff', 'support', 'officiel', 'official']
const RESERVED_EXACT = ['root', 'system', 'systeme', 'bot', 'owner', 'modo', 'mod', 'moderation', 'claude', 'anthropic']
/** Validates a pseudo; uniqueness is checked by the database (case-insensitive). */
export function nameError(name: unknown): string | null {
  if (typeof name !== 'string' || !/^[\w-]{3,16}$/.test(name)) return 'Pseudo : 3 à 16 lettres, chiffres, _ ou -'
  const plain = name.toLowerCase().replace(/[013457]/g, (d) => 'oieast'['013457'.indexOf(d)]).replace(/[^a-z]/g, '')
  if (RESERVED_PARTS.some((r) => plain.includes(r)) || RESERVED_EXACT.includes(plain)) return 'Ce pseudo est réservé, choisis-en un autre'
  return null
}

export const levelOf = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1
/** Minutes per player; 0 means no clock at all. */
export const TIME_CONTROLS = [3, 5, 10, 20, 0]
export const CHALLENGE_SECONDS = 10
export const EMOTES = ['👍', '😮', '😂', '🤔', '😈', '😅', '🔥', '🤝']
export const PIECE_SKINS: Record<string, string> = { classique: 'Classique', contour: 'Contour', lettres: 'Lettres', neon: 'Néon', or: 'Or' }
export const BOARD_SKINS: Record<string, string> = { bois: 'Bois', marbre: 'Marbre', ocean: 'Océan', amethyste: 'Améthyste' }
export const DEFAULT_UNLOCKS = ['pieces:classique', 'board:bois']
export const QUESTS = [
  { id: 'play5', label: 'Jouer 5 parties', stat: 'games', goal: 5, reward: 'pieces:contour' },
  { id: 'win3', label: 'Gagner 3 parties', stat: 'wins', goal: 3, reward: 'board:marbre' },
  { id: 'detect10', label: 'Réussir 10 contestations', stat: 'correct_challenges', goal: 10, reward: 'pieces:lettres' },
  { id: 'marks20', label: 'Faire 20 marquages justes', stat: 'correct_marks', goal: 20, reward: 'board:ocean' },
  { id: 'bluff15', label: 'Réussir 15 bluffs jamais démasqués', stat: 'uncaught_bluffs', goal: 15, reward: 'pieces:neon' },
  { id: 'flawless', label: 'Gagner une partie avec tes 10 vies', stat: 'best_lives', goal: 10, reward: 'board:amethyste' },
  { id: 'win15', label: 'Gagner 15 parties', stat: 'wins', goal: 15, reward: 'pieces:or' },
  { id: 'play10', label: 'Jouer 10 parties', stat: 'games', goal: 10, reward: 'avatar:masque' },
  { id: 'bluff25', label: 'Réussir 25 bluffs jamais démasqués', stat: 'uncaught_bluffs', goal: 25, reward: 'avatar:joker' },
  { id: 'detect25', label: 'Réussir 25 contestations', stat: 'correct_challenges', goal: 25, reward: 'avatar:oeil' },
  { id: 'marks40', label: 'Faire 40 marquages justes', stat: 'correct_marks', goal: 40, reward: 'avatar:diamant' },
  { id: 'win30', label: 'Gagner 30 parties', stat: 'wins', goal: 30, reward: 'avatar:couronne' },
  { id: 'play50', label: 'Jouer 50 parties', stat: 'games', goal: 50, reward: 'avatar:dragon' },
]

/** Profile pictures: "b:<n>" for the 20 free ones, "s:<key>" for the ones unlocked by quests. */
export const AVATARS_BASE = ['🦊', '🐺', '🐱', '🐼', '🦁', '🐯', '🐸', '🐵', '🦉', '🐙', '🐧', '🐨', '🦖', '🐝', '👻', '🤖', '🎃', '😎', '🧙', '🥷']
export const AVATARS_SPECIAL: Record<string, { emoji: string; label: string }> = {
  masque: { emoji: '🎭', label: 'Masque' }, joker: { emoji: '🃏', label: 'Joker' }, oeil: { emoji: '👁️', label: 'Œil' },
  diamant: { emoji: '💎', label: 'Diamant' }, couronne: { emoji: '👑', label: 'Couronne' }, dragon: { emoji: '🐉', label: 'Dragon' },
  champion: { emoji: '🏆', label: 'Champion' },
  medaille: { emoji: '🏅', label: 'Médaille' }, etoile: { emoji: '🌟', label: 'Étoile' },
}

// ---------- ranks, season points, shop ----------
/** Visible rank from Elo; `min` is the Elo needed for it. */
export const RANKS = [
  { key: 'bronze', label: 'Bronze', min: 0 }, { key: 'argent', label: 'Argent', min: 1100 }, { key: 'or', label: 'Or', min: 1250 },
  { key: 'platine', label: 'Platine', min: 1400 }, { key: 'diamant', label: 'Diamant', min: 1550 }, { key: 'maitre', label: 'Maître', min: 1700 },
]
export const rankOf = (elo: number) => RANKS.findLast((r) => elo >= r.min)!
/** First ranked games move Elo faster so new players reach their level quickly. */
export const PLACEMENT_GAMES = 5
export const kFactor = (rankedGames: number) => (rankedGames < PLACEMENT_GAMES ? 48 : 32)
/** Season points of one ranked game. `streak` = ranked wins in a row before it, `total` = season points so far. */
export function seasonPoints(won: boolean, streak: number, total: number, sameFoeToday: number) {
  if (sameFoeToday >= 3) return 0 // anti-farm: a 4th ranked game against the same player in a day counts for nothing
  return won ? 10 + Math.min(10, 2 * streak) : -Math.min(4, total)
}
/** Avatars earned by the best rank reached during a season. */
export const SEASON_RANK_REWARDS = [{ rank: 'or', reward: 'avatar:medaille' }, { rank: 'diamant', reward: 'avatar:etoile' }]
export const goldOf = (score: number) => Math.floor(score / 10)
/** Quest rewards can also be bought with gold. */
export const SHOP: Record<string, number> = {
  'pieces:contour': 150, 'board:marbre': 200, 'pieces:lettres': 250, 'board:ocean': 250, 'pieces:neon': 350, 'board:amethyste': 400, 'pieces:or': 500,
  'avatar:masque': 300, 'avatar:joker': 400, 'avatar:oeil': 400, 'avatar:diamant': 450, 'avatar:couronne': 600, 'avatar:dragon': 700,
}
export function avatarOf(id: unknown): { emoji: string; special: boolean; key: string } | null {
  if (typeof id !== 'string') return null
  if (id.startsWith('b:')) {
    const e = AVATARS_BASE[Number(id.slice(2))]
    return e ? { emoji: e, special: false, key: id.slice(2) } : null
  }
  const s = id.startsWith('s:') ? AVATARS_SPECIAL[id.slice(2)] : undefined
  return s ? { emoji: s.emoji, special: true, key: id.slice(2) } : null
}

// ---------- daily quests & seasons ----------
export const DAILY_POOL = [
  { id: 'd_play2', label: 'Jouer 2 parties', stat: 'games', goal: 2, xp: 50 },
  { id: 'd_win1', label: 'Gagner 1 partie', stat: 'wins', goal: 1, xp: 80 },
  { id: 'd_detect2', label: 'Réussir 2 contestations', stat: 'correct_challenges', goal: 2, xp: 60 },
  { id: 'd_bluff3', label: 'Réussir 3 bluffs jamais démasqués', stat: 'uncaught_bluffs', goal: 3, xp: 60 },
  { id: 'd_marks3', label: 'Faire 3 marquages justes', stat: 'correct_marks', goal: 3, xp: 60 },
  { id: 'd_ranked1', label: 'Jouer 1 partie classée', stat: 'ranked', goal: 1, xp: 50 },
  { id: 'd_score150', label: 'Marquer 150 points en une partie', stat: 'best_score', goal: 150, xp: 70 },
  { id: 'd_lives8', label: 'Gagner en gardant 8 vies ou plus', stat: 'best_lives', goal: 8, xp: 90 },
]
/** UTC day, e.g. "2026-11-06": everyone gets the same 3 daily quests. */
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10)
export function dailyQuests(day: string) {
  let h = 0
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const pool = [...DAILY_POOL], picked: typeof DAILY_POOL = []
  for (let i = 0; i < 3; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    picked.push(pool.splice(h % pool.length, 1)[0])
  }
  return picked
}
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
/** Seasons are calendar months (UTC). */
export function seasonOf(t = Date.now()) {
  const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth()
  return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `Saison de ${MONTHS[m]} ${y}`, start: Date.UTC(y, m, 1), end: Date.UTC(y, m + 1, 1) }
}
