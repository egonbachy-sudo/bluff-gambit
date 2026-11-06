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
export const TIME_CONTROLS = [3, 5, 10, 20]
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
]
