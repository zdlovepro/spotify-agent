import crypto from 'crypto'
import db from '../../db/index.js'

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

function mapSessionRow(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    userId: row.user_id,
    sessionToken: row.session_token,
    status: row.status,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function generateSessionToken() {
  return `am_st_${crypto.randomBytes(32).toString('hex')}`
}

export function createSession({
  userId,
  ipAddress = null,
  userAgent = null,
  expiresAt = null,
  metadata = {},
}) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const resolvedExpiresAt =
    expiresAt || new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString()
  const sessionToken = generateSessionToken()

  db.prepare(
    `
      INSERT INTO sessions (
        id,
        user_id,
        session_token,
        status,
        ip_address,
        user_agent,
        expires_at,
        last_seen_at,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @user_id,
        @session_token,
        @status,
        @ip_address,
        @user_agent,
        @expires_at,
        @last_seen_at,
        @metadata_json,
        @created_at,
        @updated_at
      )
    `,
  ).run({
    id,
    user_id: userId,
    session_token: sessionToken,
    status: 'active',
    ip_address: ipAddress,
    user_agent: userAgent,
    expires_at: resolvedExpiresAt,
    last_seen_at: now,
    metadata_json: JSON.stringify(metadata),
    created_at: now,
    updated_at: now,
  })

  return getSession(sessionToken)
}

export function getSession(sessionToken) {
  if (!sessionToken) {
    return null
  }

  const row = db
    .prepare(
      `
        SELECT *
        FROM sessions
        WHERE session_token = ?
        LIMIT 1
      `,
    )
    .get(sessionToken)

  if (!row) {
    return null
  }

  if (row.status !== 'active') {
    return null
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession(sessionToken)
    return null
  }

  return mapSessionRow(row)
}

export function touchSession(sessionToken) {
  if (!sessionToken) {
    return null
  }

  const now = new Date().toISOString()
  db.prepare(
    `
      UPDATE sessions
      SET last_seen_at = ?,
          updated_at = ?
      WHERE session_token = ?
    `,
  ).run(now, now, sessionToken)

  return getSession(sessionToken)
}

export function deleteSession(sessionToken) {
  if (!sessionToken) {
    return false
  }

  const result = db
    .prepare(
      `
        DELETE FROM sessions
        WHERE session_token = ?
      `,
    )
    .run(sessionToken)

  return result.changes > 0
}

export default {
  createSession,
  getSession,
  touchSession,
  deleteSession,
}
