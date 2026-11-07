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
// Columns added after launch: ALTER fails harmlessly when the column already exists.
await client.execute('ALTER TABLE users ADD COLUMN layout TEXT').catch(() => {})
await client.execute('ALTER TABLE users ADD COLUMN google_sub TEXT').catch(() => {})
await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(google_sub)')
await client.execute('ALTER TABLE games ADD COLUMN start TEXT').catch(() => {})
await client.execute('ALTER TABLE users ADD COLUMN avatar TEXT').catch(() => {})
await client.executeMultiple(`
CREATE TABLE IF NOT EXISTS live_games (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS friends (user_id INTEGER NOT NULL, friend_id INTEGER NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, friend_id));
CREATE TABLE IF NOT EXISTS season_awards (season TEXT NOT NULL, rank INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (season, rank));
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`)
await client.execute('ALTER TABLE game_players ADD COLUMN season_pts INTEGER NOT NULL DEFAULT 0').catch(() => {})
await client.execute('ALTER TABLE users ADD COLUMN gold INTEGER NOT NULL DEFAULT 0').catch(() => {})
await client.execute('CREATE TABLE IF NOT EXISTS purchases (user_id INTEGER NOT NULL, item TEXT NOT NULL, PRIMARY KEY (user_id, item))')
await client.execute('CREATE TABLE IF NOT EXISTS season_ranks (season TEXT NOT NULL, user_id INTEGER NOT NULL, rank TEXT NOT NULL, PRIMARY KEY (season, user_id))')
await client.execute('CREATE TABLE IF NOT EXISTS rewards (user_id INTEGER NOT NULL, day TEXT NOT NULL, quest TEXT NOT NULL, xp INTEGER NOT NULL, PRIMARY KEY (user_id, day, quest))')
