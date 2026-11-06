// SQLite through libSQL: a local file in dev, a Turso database online (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
import { createClient } from '@libsql/client'
import type { InValue } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type Row = Record<string, any>
const file = process.env.DB_PATH ?? 'data/bluff.db'
const url = process.env.TURSO_DATABASE_URL ?? `file:${file}`
if (url.startsWith('file:')) mkdirSync(dirname(file), { recursive: true })
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

export async function all(sql: string, ...args: InValue[]): Promise<Row[]> {
  const rs = await client.execute({ sql, args })
  return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])))
}
export const get = async (sql: string, ...args: InValue[]): Promise<Row | undefined> => (await all(sql, ...args))[0]
/** Runs a write and returns the inserted row id. */
export const run = async (sql: string, ...args: InValue[]) => Number((await client.execute({ sql, args })).lastInsertRowid ?? 0)

if (url.startsWith('file:')) await client.execute('PRAGMA journal_mode = WAL')
await client.executeMultiple(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  hash TEXT NOT NULL,
  elo INTEGER NOT NULL DEFAULT 1200,
  piece_skin TEXT NOT NULL DEFAULT 'classique',
  board_skin TEXT NOT NULL DEFAULT 'bois',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  white INTEGER NOT NULL, black INTEGER NOT NULL,
  winner TEXT, reason TEXT, ranked INTEGER NOT NULL, minutes INTEGER NOT NULL,
  history TEXT NOT NULL, ended_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS game_players (
  game_id INTEGER NOT NULL REFERENCES games(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  color TEXT NOT NULL, won INTEGER NOT NULL, score INTEGER NOT NULL, lives INTEGER NOT NULL,
  correct_challenges INTEGER NOT NULL, wrong_challenges INTEGER NOT NULL,
  correct_marks INTEGER NOT NULL, uncaught_bluffs INTEGER NOT NULL,
  elo_before INTEGER NOT NULL, elo_after INTEGER NOT NULL, ended_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS game_players_user ON game_players(user_id, ended_at);
`)
