import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import env from '../config/env.js'

const databaseDirectory = path.dirname(env.databasePath)

fs.mkdirSync(databaseDirectory, { recursive: true })

const db = new Database(env.databasePath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('synchronous = NORMAL')
db.pragma('busy_timeout = 5000')

export function getDb() {
  return db
}

export { db, databaseDirectory }
export default db
