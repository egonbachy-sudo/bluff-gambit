// Guided tutorial: scripted positions played locally with the shared move rules, no server involved.
// Every rule of the game has a step; pulsing rings show where to tap.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { call } from './net.ts'
import { Board, KindPicker, PieceIcon } from './Board.tsx'
import type { Skins } from './Board.tsx'
import { canMove, destinations, lastRank, setupError } from '../shared/rules.ts'
import type { Color, Kind, Sq } from '../shared/rules.ts'

type TP = { id: string; owner: Color; kind: Kind; x: number; y: number; moved?: boolean; claim?: Kind }
type Try = { p: TP; to: Sq; as: Kind; bluff: boolean; target?: TP }
type Step = {
  title: string; text: string; list?: string[]; pieces: string[]
  type: 'read' | 'swap' | 'move' | 'contest' | 'mark'
  last?: [string, string]; marks?: Record<string, Kind>; grave?: Kind[]
  guide?: { pick?: string; to?: string; as?: Kind; mark?: string }
  move?: (t: Try) => string | null // null = goal reached, otherwise a hint
  contest?: boolean // expected answer to the enemy move
  restore?: string // own piece that comes back when the enemy bluff-capture is caught
  win?: string; fail?: string
}

const F = 'abcdefgh'
const sq = (n: string): Sq => ({ x: F.indexOf(n[0]), y: Number(n[1]) - 1 })
/** "wNg1" = white knight on g1. Enemy pieces off their start rows count as already moved. */
const parse = (specs: string[]): TP[] => specs.map((s) => ({ id: s, owner: s[0] as Color, kind: s[1] as Kind, ...sq(s.slice(2)), moved: s[0] === 'b' ? !'78'.includes(s[3]) : !'12'.includes(s[3]) }))
const army = (c: Color) => [
  ...[...'RNBQKBNR'].map((k, i) => `${c}${k}${F[i]}${c === 'w' ? 1 : 8}`),
  ...[...F].map((f) => `${c}P${f}${c === 'w' ? 2 : 7}`),
]
const swap = (list: string[], from: string, to: string) => list.map((s) => (s === from ? to : s))
const BOTH = [...army('w'), ...army('b')]

const STEPS: Step[] = [
  {
    type: 'read', title: 'Bienvenue',
    text: "Bluff Gambit, ce sont les échecs… avec des cartes cachées. Tu vois où sont les pièces adverses, jamais ce qu'elles sont. Et chaque pièce peut se faire passer pour une autre.",
    pieces: BOTH,
  },
  {
    type: 'swap', title: 'Placer ses pièces',
    text: 'Au début de la partie, tu as 2 minutes pour placer tes 16 pièces comme tu veux sur tes 2 rangées. Touche ton roi (e1) puis ta tour (h1) pour les échanger.',
    pieces: army('w'), guide: { pick: 'e1', to: 'h1' },
    win: 'Échangé ! Seule règle : un fou sur case claire, l’autre sur case foncée. Ton arrangement préféré s’enregistre dans Personnalisation et revient à chaque partie.',
  },
  {
    type: 'move', title: 'Un vrai coup',
    text: 'Touche ton cavalier en g1. Au-dessus de lui, laisse « Cavalier » choisi, puis joue-le en L, en f3.',
    pieces: BOTH, guide: { pick: 'g1', to: 'f3', as: 'N' },
    move: (t) => (t.p.kind !== 'N' ? 'Touche le cavalier en g1.' : t.bluff ? 'Ça, c’est un bluff ! Garde « Cavalier » et joue en L.' : null),
    win: 'Parfait. Un vrai coup ne risque rien. La petite icône en haut à gauche de la pièce te rappelle comment tu l’as jouée (ici : cavalier).',
  },
  {
    type: 'move', title: 'Ton premier bluff',
    text: 'Touche le pion e2. Au-dessus de lui, choisis « Dame », puis va en e5 : trois cases tout droit, impossible pour un pion.',
    pieces: BOTH, guide: { pick: 'e2', to: 'e5', as: 'Q' },
    move: (t) => (t.bluff ? null : 'Ce coup est légal pour un pion : choisis « Dame » au-dessus de la pièce, puis va en e5.'),
    win: 'Bluff joué ! L’icône de dame te rappelle ton mensonge. Si l’adversaire conteste, tu perds 1 vie et la pièce. S’il ne dit rien, tu as gagné ton pari.',
  },
  {
    type: 'contest', title: 'Démasquer un bluff',
    text: "Après chaque coup adverse, une fenêtre te demande si tu veux contester (10 secondes). Ici, la pièce marquée « cavalier » (elle a sauté en L avant) vient d'aller tout droit de f6 en f3.",
    pieces: [...army('w'), ...swap(army('b'), 'bNg8', 'bNf3')], last: ['f6', 'f3'], marks: { bNf3: 'N' }, guide: { pick: 'f3' },
    contest: true,
    win: "Bluff démasqué ! C'était bien un cavalier : l'adversaire perd 1 vie et la pièce part au cimetière, révélée.",
    fail: 'Un cavalier ne va jamais tout droit… c’était un bluff. Réessaie.',
  },
  {
    type: 'contest', title: 'Attention aux fausses alertes',
    text: "La pièce en e7 avance d'une case. Tu contestes ?",
    pieces: [...army('w'), ...swap(army('b'), 'bPe7', 'bPe6')], last: ['e7', 'e6'], guide: { pick: 'e6' },
    contest: false,
    win: 'Bien vu. Un pion, une tour, une dame ou un roi peuvent faire ce coup : conteste seulement quand tu as un indice. Contester à tort te coûte 1 vie.',
    fail: 'Raté : c’était un vrai pion. Contester à tort te coûte 1 vie. Réessaie.',
  },
  {
    type: 'contest', title: 'Un bluff qui prend une pièce',
    text: 'La pièce marquée « cavalier » vient d’aller tout droit de b5 en b2… en prenant ton pion (il est dans ton cimetière). Contester ?',
    pieces: [...army('w').filter((s) => s !== 'wPb2'), ...swap(army('b'), 'bNb8', 'bNb2')], last: ['b5', 'b2'], marks: { bNb2: 'N' },
    grave: ['P'], guide: { pick: 'b2' }, contest: true, restore: 'wPb2',
    win: 'Démasqué ! Quand un bluff est démasqué, sa prise est annulée : ton pion revient sur le plateau.',
    fail: 'Une pièce qui saute en L n’a pas pu aller tout droit… Réessaie.',
  },
  {
    type: 'mark', title: 'Marquer une pièce',
    text: 'Un tour sur deux, avant de jouer, on te propose de marquer une pièce adverse. Réponds « Oui », touche la pièce en d8, puis choisis ce que tu soupçonnes.',
    pieces: BOTH, guide: { mark: 'd8' },
    win: 'Marqué ! La marque n’est visible que par toi. En fin de partie, chaque marquage juste rapporte +5 points.',
  },
  {
    type: 'move', title: 'La promotion',
    text: 'Un vrai pion qui atteint la dernière rangée devient une des pièces qu’on t’a prises (ton cimetière). Avance le pion b7 en b8, puis choisis.',
    pieces: ['wKe1', 'wPb7', 'bKh8', 'bPg7', 'bPh7'], grave: ['Q', 'R'], guide: { pick: 'b7', to: 'b8' },
    move: (t) => (t.p.kind !== 'P' ? 'Touche le pion en b7.' : t.bluff ? 'Joue-le comme un vrai pion, d’une case.' : null),
    win: 'Promu ! La pièce quitte ton cimetière. S’il est vide, ton pion reste un pion.',
  },
  {
    type: 'move', title: 'Capturer le roi',
    text: 'Pas d’échec ni de mat : on gagne en prenant le roi. Pour l’exercice, la pièce en a8 est le roi. Prends-la avec ta tour, en vrai coup.',
    pieces: ['wKe1', 'wRa1', 'wNc6', 'wPf2', 'wPg2', 'bKa8', 'bPg7', 'bPh7', 'bRh8'], guide: { pick: 'a1', to: 'a8', as: 'R' },
    move: (t) =>
      t.target?.kind !== 'K' ? 'Prends la pièce en a8.'
      : t.bluff ? 'Un bluff sur le roi est démasqué automatiquement : tu perdrais ta pièce et 1 vie. Prends-le avec un vrai coup, avec ta tour.'
      : null,
    win: 'Victoire ! Un roi ne se prend qu’avec un vrai coup : un bluff sur le roi est démasqué tout de suite.',
  },
  {
    type: 'read', title: 'Vies, temps et fin de partie',
    text: 'Chaque joueur a 10 vies.', pieces: BOTH,
    list: [
      'Tu perds 1 vie quand ton bluff est démasqué, ou quand tu contestes à tort.',
      'La partie se termine si un roi est pris, si un joueur n’a plus de vies, si sa pendule tombe à zéro, ou s’il abandonne.',
      'L’hôte choisit le temps de chaque joueur : 3, 5, 10 ou 20 minutes. Tu as 10 secondes pour contester.',
      'Les pièces prises sont révélées dans les cimetières, à côté du plateau. En fin de partie, tout le plateau est révélé.',
      'Pas d’échec, de mat, de pat, de roque, de prise en passant ni de règle des 50 coups.',
    ],
  },
  {
    type: 'read', title: 'Les points', text: 'À la fin de chaque partie, ton score se calcule ainsi :', pieces: BOTH,
    list: [
      'Victoire : +100.',
      'Pièces restantes : leur valeur × 3 (pion 1, cavalier et fou 3, tour 5, dame 9).',
      'Vies restantes : +5 chacune.',
      'Contestation juste : +15. Marquage juste : +5. Bluff jamais démasqué : +4.',
      'Le score donne de l’XP (ton niveau) et fait avancer les quêtes, qui débloquent des skins.',
      'L’Elo ne bouge qu’en partie classée. Les parties contre Bluffbot ne comptent pas.',
    ],
  },
  {
    type: 'read', title: 'À toi de jouer', text: 'Tu connais toutes les règles. Entraîne-toi contre Bluffbot : il bluffe et conteste lui aussi.',
    pieces: BOTH,
  },
]

export function Tutorial({ skins, loggedIn }: { skins: Skins; loggedIn: boolean }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const [pieces, setPieces] = useState(() => parse(step.pieces))
  const [last, setLast] = useState<Sq[] | null>(null)
  const [marks, setMarks] = useState<Record<string, Kind>>({})
  const [grave, setGrave] = useState<Kind[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [as, setAs] = useState<Kind>('P')
  const [promo, setPromo] = useState<Sq | null>(null)
  const [markStage, setMarkStage] = useState<'ask' | 'pick' | string>('ask') // or the id of the piece being marked
  const [lives, setLives] = useState({ w: 10, b: 10 })
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)

  function load(n: number) {
    const s = STEPS[n]
    setI(n)
    setPieces(parse(s.pieces))
    setLast(s.last ? s.last.map(sq) : null)
    setMarks(s.marks ?? {})
    setGrave(s.grave ?? [])
    setSel(null)
    setPromo(null)
    setMarkStage('ask')
    setLives({ w: 10, b: 10 })
    setMsg('')
    setDone(false)
  }

  const occ = (x: number, y: number) => pieces.find((p) => p.x === x && p.y === y)?.owner ?? null
  const selected = pieces.find((p) => p.id === sel)
  const dests = selected && step.type === 'move' && !done && !promo ? destinations(as, 'w', selected, occ, !!selected.moved) : []
  const win = (text = step.win ?? '') => {
    setDone(true)
    setMsg(text)
    setSel(null)
  }

  function finishMove(p: TP, to: Sq, promoKind?: Kind) {
    const target = pieces.find((q) => q.x === to.x && q.y === to.y)
    setPieces(pieces.filter((q) => q !== target).map((q) => (q === p ? { ...q, ...to, moved: true, claim: as, kind: promoKind ?? q.kind } : q)))
    if (promoKind) setGrave(grave.filter((k, n) => n !== grave.indexOf(promoKind)))
    setLast([{ x: p.x, y: p.y }, to])
    setPromo(null)
    win()
  }

  function click(x: number, y: number) {
    const p = pieces.find((q) => q.x === x && q.y === y)
    if (done) return
    if (step.type === 'swap') {
      if (y > 1) return
      if (!sel) return p && setSel(p.id)
      const a = pieces.find((q) => q.id === sel)!
      setSel(null)
      if (!p || p === a) return
      const next = pieces.map((q) => (q === a ? { ...q, x: p.x, y: p.y } : q === p ? { ...q, x: a.x, y: a.y } : q))
      setPieces(next)
      const err = setupError('w', next)
      return err ? setMsg(err + ' : échange encore deux pièces.') : win()
    }
    if (step.type === 'mark') {
      if (markStage === 'pick' && p?.owner === 'b') setMarkStage(p.id)
      return
    }
    if (step.type !== 'move' || promo) return
    if (p?.owner === 'w') {
      setSel(p.id === sel ? null : p.id)
      setAs(p.kind)
      setMsg('')
      return
    }
    if (!selected || !dests.some((d) => d.x === x && d.y === y)) return setSel(null)
    const t: Try = { p: selected, to: { x, y }, as, bluff: !canMove(selected.kind, 'w', selected, { x, y }, occ, !!selected.moved), target: p }
    const hint = step.move!(t)
    if (hint) {
      setMsg(hint)
      return setSel(null)
    }
    if (selected.kind === 'P' && y === lastRank('w') && grave.some((k) => k !== 'P')) return setPromo({ x, y })
    finishMove(selected, { x, y })
  }

  function answer(contest: boolean) {
    if (contest !== step.contest) {
      if (contest) setLives({ ...lives, w: lives.w - 1 })
      return setMsg(step.fail ?? '')
    }
    if (contest) {
      const kept = pieces.filter((p) => !(last && p.x === last[1].x && p.y === last[1].y))
      setPieces(step.restore ? [...kept, ...parse([step.restore])] : kept)
      if (step.restore) setGrave([])
      setLives({ ...lives, b: lives.b - 1 })
    }
    win()
  }

  // On-screen help: pulsing rings on what to touch next.
  const g = step.guide
  const guide: Sq[] = done || !g ? []
    : step.type === 'mark' ? (markStage === 'pick' && g.mark ? [sq(g.mark)] : [])
    : step.type === 'contest' ? (g.pick ? [sq(g.pick)] : [])
    : sel ? (g.to && (!g.as || as === g.as) ? [sq(g.to)] : [])
    : g.pick ? [sq(g.pick)] : []

  let popover: { at: Sq; content: ReactNode } | null = null
  if (promo && selected)
    popover = {
      at: promo,
      content: (
        <>
          <p className="pop-title">Promotion</p>
          <KindPicker kinds={grave.filter((k) => k !== 'P')} owner="w" skin={skins.pieces} guide="Q" onPick={(k) => finishMove(selected, promo, k)} />
        </>
      ),
    }
  else if (selected && step.type === 'move' && !done)
    popover = {
      at: selected,
      content: (
        <>
          <p className="pop-title">Jouer comme…</p>
          <KindPicker owner="w" skin={skins.pieces} cur={as} real={selected.kind} guide={g?.as !== as ? g?.as : undefined} onPick={setAs} />
        </>
      ),
    }
  else if (step.type === 'mark' && markStage !== 'ask' && markStage !== 'pick') {
    const target = pieces.find((p) => p.id === markStage)!
    popover = {
      at: target,
      content: (
        <>
          <p className="pop-title">Marquer comme…</p>
          <KindPicker owner="b" skin={skins.pieces} onPick={(k) => { setMarks({ ...marks, [target.id]: k }); setMarkStage('ask'); win() }} />
        </>
      ),
    }
  }

  let overlay: ReactNode = null
  if (step.type === 'contest' && !done)
    overlay = (
      <div className="prompt">
        <p className="prompt-title">Veux-tu contester ?</p>
        <p>L'adversaire a joué <b>{step.last?.join(' → ')}</b>.</p>
        <div className="row">
          <button className="danger-fill" onClick={() => answer(true)}>Oui, contester</button>
          <button onClick={() => answer(false)}>Non</button>
        </div>
      </div>
    )
  else if (step.type === 'mark' && markStage === 'ask' && !done)
    overlay = (
      <div className="prompt">
        <p className="prompt-title">Marquer une pièce adverse ?</p>
        <p className="muted">Possible 1 tour sur 2.</p>
        <div className="row">
          <button className="primary guide-btn" onClick={() => setMarkStage('pick')}>Oui, marquer</button>
          <button onClick={() => setMsg('Réponds « Oui » pour essayer.')}>Non</button>
        </div>
      </div>
    )

  const free = step.type === 'read'
  return (
    <main className="game tutorial">
      <div className="board-col">
        <div className="bar"><div className="who"><span className="avatar" aria-hidden="true">A</span><b>Adversaire</b></div><div className="lives">❤ {lives.b}</div></div>
        <Board
          me="w" skins={skins} onSquare={click} sel={step.type === 'swap' ? pieces.find((p) => p.id === sel) : selected}
          dests={dests} last={last} guide={guide} popover={popover} overlay={overlay}
          home={step.type === 'swap' ? [0, 1] : undefined}
          pieces={pieces.map((p) => ({ ...p, kind: p.owner === 'w' ? p.kind : undefined, mark: marks[p.id] }))}
        />
        <div className="bar">
          <div className="who"><span className="avatar" aria-hidden="true">T</span><b>Toi</b></div>
          <div className="lives">❤ {lives.w}</div>
          <div className="grave">{grave.map((k, n) => <PieceIcon key={n} kind={k} owner="w" skin={skins.pieces} />)}</div>
        </div>
      </div>

      <aside className="panel">
        <div className="card controls tuto-card" key={i}>
          <div className="tuto-progress" aria-hidden="true">{STEPS.map((_, n) => <span key={n} className={n < i ? 'past' : n === i ? 'now' : ''} />)}</div>
          <p className="muted">Étape {i + 1} / {STEPS.length}</p>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
          {step.list && <ul className="tuto-list">{step.list.map((l) => <li key={l}>{l}</li>)}</ul>}
          {msg && <p className={done ? 'success' : 'warn'} role="status">{msg}</p>}
          <div className="row">
            <button disabled={i === 0} onClick={() => load(i - 1)}>Précédent</button>
            {i < STEPS.length - 1 ? (
              <button className={`primary ${done ? 'pulse' : ''}`} disabled={!done && !free} onClick={() => load(i + 1)}>Suivant</button>
            ) : loggedIn ? (
              <button className="primary" onClick={() => call('bot:start', { minutes: 5 }).catch(() => {})}>Jouer contre le bot</button>
            ) : (
              <a className="btn primary" href="#/compte">Créer un compte pour jouer</a>
            )}
          </div>
        </div>
      </aside>
    </main>
  )
}
