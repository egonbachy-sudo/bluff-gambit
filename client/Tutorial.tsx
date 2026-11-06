// Guided tutorial: scripted positions played locally with the shared move rules, no server involved.
import { useState } from 'react'
import { call } from './net.ts'
import { PieceIcon, glyph } from './Game.tsx'
import type { Skins } from './Game.tsx'
import { canMove, destinations, sqName, KINDS, LETTER, NAMES } from '../shared/rules.ts'
import type { Color, Kind, Sq } from '../shared/rules.ts'

type TP = { id: string; owner: Color; kind: Kind; x: number; y: number; moved?: boolean; claim?: Kind }
type Try = { p: TP; to: Sq; as: Kind; bluff: boolean; target?: TP }
type Step = {
  title: string; text: string; pieces: string[]
  last?: [string, string]; marks?: Record<string, Kind>
  move?: (t: Try) => string | null // null = goal reached, otherwise a hint
  contest?: boolean // expected answer to the enemy move
  mark?: boolean
  win?: string; fail?: string
}

const F = 'abcdefgh'
const sq = (n: string): Sq => ({ x: F.indexOf(n[0]), y: Number(n[1]) - 1 })
/** "wNg1" = white knight on g1. */
const parse = (specs: string[]): TP[] => specs.map((s) => ({ id: s, owner: s[0] as Color, kind: s[1] as Kind, ...sq(s.slice(2)), moved: s[0] === 'b' && !'78'.includes(s[3]) }))
const army = (c: Color) => [
  ...[...'RNBQKBNR'].map((k, i) => `${c}${k}${F[i]}${c === 'w' ? 1 : 8}`),
  ...[...F].map((f) => `${c}P${f}${c === 'w' ? 2 : 7}`),
]
const swap = (list: string[], from: string, to: string) => list.map((s) => (s === from ? to : s))

const STEPS: Step[] = [
  {
    title: 'Bienvenue',
    text: "Tu vois où sont les pièces adverses, jamais ce qu'elles sont. Chaque pièce peut se faire passer pour une autre… mais l'adversaire peut te contester.",
    pieces: [...army('w'), ...army('b')],
  },
  {
    title: 'Un vrai coup',
    text: 'Touche ton cavalier en g1 et joue-le normalement, en L.',
    pieces: [...army('w'), ...army('b')],
    move: (t) => (t.p.kind !== 'N' ? 'Touche le cavalier en g1.' : t.bluff ? 'Ça, c’est un bluff ! Garde « Cavalier » et joue en L.' : null),
    win: 'Parfait. Un vrai coup ne risque rien. La petite lettre en haut à gauche te rappelle comment tu as joué la pièce.',
  },
  {
    title: 'Ton premier bluff',
    text: 'Touche le pion en e2, choisis « Dame » au-dessus du plateau, puis va en e5 : trois cases tout droit, impossible pour un pion.',
    pieces: [...army('w'), ...army('b')],
    move: (t) => (t.bluff ? null : 'Ce coup est légal pour cette pièce : choisis « Dame » et va plus loin, en e5.'),
    win: "Bluff joué ! La lettre D te rappelle que tu l'as joué en Dame. Si l'adversaire conteste, tu perds 1 vie et la pièce.",
  },
  {
    title: 'Démasquer un bluff',
    text: "Plus tôt, la pièce en f6 a sauté en L, comme un cavalier (tu l'as marquée C). Elle vient d'aller tout droit de f6 en f3. Contester ?",
    pieces: [...army('w'), ...swap(army('b'), 'bNg8', 'bNf3')],
    last: ['f6', 'f3'],
    marks: { bNf3: 'N' },
    contest: true,
    win: "Bluff démasqué ! C'était bien un cavalier : l'adversaire perd 1 vie et la pièce part au cimetière.",
    fail: 'Un cavalier ne va jamais tout droit… c’était un bluff. Réessaie.',
  },
  {
    title: 'Attention aux fausses alertes',
    text: "La pièce en e7 avance d'une case. Contester ?",
    pieces: [...army('w'), ...swap(army('b'), 'bPe7', 'bPe6')],
    last: ['e7', 'e6'],
    contest: false,
    win: 'Bien vu. Un pion, une tour, une dame ou un roi peuvent faire ce coup : conteste seulement quand tu as un indice.',
    fail: 'Raté : c’était un vrai pion. Contester à tort te coûte 1 vie. Réessaie.',
  },
  {
    title: 'Marquer',
    text: 'Un tour sur deux, avant de jouer, tu peux marquer une pièce adverse pour t’en souvenir. Touche « Marquer », puis une pièce adverse, puis un type.',
    pieces: [...army('w'), ...army('b')],
    mark: true,
    win: 'Marqué ! Les marquages justes rapportent +5 points en fin de partie.',
  },
  {
    title: 'Capturer le roi',
    text: 'Pas d’échec ni de mat : on gagne en prenant le roi. Pour l’exercice, la pièce en a8 est le roi. Prends-la avec un vrai coup.',
    pieces: ['wKe1', 'wRa1', 'wNc6', 'wPf2', 'wPg2', 'bKa8', 'bPg7', 'bPh7', 'bRh8'],
    move: (t) =>
      t.target?.kind !== 'K' ? 'Prends la pièce en a8.'
      : t.bluff ? 'Un bluff sur le roi est démasqué automatiquement : tu perdrais ta pièce et 1 vie. Prends-le avec un vrai coup, avec ta tour.'
      : null,
    win: 'Victoire ! Tu peux aussi gagner si l’adversaire n’a plus de vies, ou au temps.',
  },
  {
    title: 'À toi de jouer',
    text: 'Tu connais les bases. Entraîne-toi contre Bluffbot : il bluffe et conteste lui aussi.',
    pieces: [...army('w'), ...army('b')],
  },
]

export function Tutorial({ skins, loggedIn }: { skins: Skins; loggedIn: boolean }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const [pieces, setPieces] = useState(() => parse(step.pieces))
  const [last, setLast] = useState<Sq[] | null>(null)
  const [marks, setMarks] = useState<Record<string, Kind>>({})
  const [sel, setSel] = useState<string | null>(null)
  const [as, setAs] = useState<Kind>('P')
  const [marking, setMarking] = useState(false)
  const [markTarget, setMarkTarget] = useState<string | null>(null)
  const [lives, setLives] = useState({ w: 10, b: 10 })
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)

  function load(n: number) {
    const s = STEPS[n]
    setI(n)
    setPieces(parse(s.pieces))
    setLast(s.last ? s.last.map(sq) : null)
    setMarks(s.marks ?? {})
    setSel(null)
    setMarking(false)
    setMarkTarget(null)
    setLives({ w: 10, b: 10 })
    setMsg('')
    setDone(false)
  }

  const occ = (x: number, y: number) => pieces.find((p) => p.x === x && p.y === y)?.owner ?? null
  const selected = pieces.find((p) => p.id === sel)
  const dests = selected && step.move && !done ? destinations(as, 'w', selected, occ, !!selected.moved) : []
  const win = (text = step.win ?? '') => {
    setDone(true)
    setMsg(text)
    setSel(null)
  }

  function click(x: number, y: number) {
    const p = pieces.find((q) => q.x === x && q.y === y)
    if (step.mark && marking && !done) {
      if (p?.owner === 'b') setMarkTarget(p.id)
      return
    }
    if (!step.move || done) return
    if (p?.owner === 'w') {
      setSel(p.id)
      setAs(p.kind)
      setMsg('')
      return
    }
    if (!selected || !dests.some((d) => d.x === x && d.y === y)) return setSel(null)
    const t: Try = { p: selected, to: { x, y }, as, bluff: !canMove(selected.kind, 'w', selected, { x, y }, occ, !!selected.moved), target: p }
    const hint = step.move(t)
    if (hint) {
      setMsg(hint)
      return setSel(null)
    }
    setPieces(pieces.filter((q) => q !== p).map((q) => (q === selected ? { ...q, x, y, moved: true, claim: as } : q)))
    setLast([{ x: selected.x, y: selected.y }, { x, y }])
    win()
  }

  function answer(contest: boolean) {
    if (contest !== step.contest) {
      if (contest) setLives({ ...lives, w: lives.w - 1 })
      return setMsg(step.fail ?? '')
    }
    if (contest) {
      setPieces(pieces.filter((p) => !(last && p.x === last[1].x && p.y === last[1].y)))
      setLives({ ...lives, b: lives.b - 1 })
    }
    win()
  }

  const picker = (cur: Kind | null, pick: (k: Kind) => void, real?: Kind) => (
    <div className="picker">
      {KINDS.map((k) => (
        <button key={k} className={k === cur ? 'on' : ''} onClick={() => pick(k)}>
          <PieceIcon kind={k} owner="w" skin={skins.pieces} /> {NAMES[k]}
          {k === real && <small> (vraie)</small>}
        </button>
      ))}
    </div>
  )
  const free = !step.move && step.contest === undefined && !step.mark

  return (
    <main className="game tutorial">
      <div className="board-col">
        {step.contest !== undefined && <div className="bar"><div className="who"><b>Adversaire</b></div><div className="lives">❤ {lives.b}</div></div>}
        <div className={`board board-${skins.board}`}>
          {[7, 6, 5, 4, 3, 2, 1, 0].map((y) =>
            [0, 1, 2, 3, 4, 5, 6, 7].map((x) => {
              const p = pieces.find((q) => q.x === x && q.y === y)
              const isDest = dests.some((d) => d.x === x && d.y === y)
              const isLast = last?.some((s) => s.x === x && s.y === y)
              const cls = ['sq', (x + y) % 2 ? 'light' : 'dark', isLast && 'last', selected === p && p && 'sel', isDest && (p ? 'dest cap' : 'dest')].filter(Boolean).join(' ')
              return (
                <button key={`${x}${y}`} className={cls} onClick={() => click(x, y)} aria-label={sqName({ x, y })}>
                  {x === 0 && <span className="rank">{y + 1}</span>}
                  {y === 0 && <span className="file">{F[x]}</span>}
                  {p?.owner === 'w' && <PieceIcon kind={p.kind} owner="w" skin={skins.pieces} />}
                  {p?.owner === 'w' && p.claim && <span className="claim">{LETTER[p.claim]}</span>}
                  {p?.owner === 'b' && <span className={`token b ${marks[p.id] ? 'marked' : ''}`}>{marks[p.id] ? glyph(marks[p.id], skins.pieces) : '?'}</span>}
                </button>
              )
            }),
          )}
        </div>
        {step.contest !== undefined && <div className="bar"><div className="who"><b>Toi</b></div><div className="lives">❤ {lives.w}</div></div>}
      </div>

      <aside className="panel">
        <div className="card controls">
          <p className="muted">Étape {i + 1} / {STEPS.length}</p>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
          {step.move && selected && !done && (
            <>
              <p>Jouer cette pièce comme :</p>
              {picker(as, setAs, selected.kind)}
            </>
          )}
          {step.contest !== undefined && !done && (
            <div className="row challenge">
              <button className="danger" onClick={() => answer(true)}>Contester</button>
              <button onClick={() => answer(false)}>Laisser passer</button>
            </div>
          )}
          {step.mark && !done && (markTarget ? (
            <>
              <p>Marquer cette pièce comme…</p>
              {picker(null, (k) => { setMarks({ ...marks, [markTarget]: k }); win() })}
            </>
          ) : marking ? <p>Touche une pièce adverse.</p> : <button onClick={() => setMarking(true)}>🏷 Marquer une pièce</button>)}
          {msg && <p className={done ? 'success' : 'warn'} role="status">{msg}</p>}
          <div className="row">
            <button disabled={i === 0} onClick={() => load(i - 1)}>Précédent</button>
            {i < STEPS.length - 1 ? (
              <button className="primary" disabled={!done && !free} onClick={() => load(i + 1)}>Suivant</button>
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
