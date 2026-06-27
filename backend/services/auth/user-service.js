import crypto from 'crypto'
import db from '../../db/index.js'

function mapUserRow(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    avatarUrl: row.avatar_url,
    status: row.status,
    preferences: row.preferences_json ? JSON.parse(row.preferences_json) : {},
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function createUser({
  email,
  passwordHash,
  displayName,
  username = null,
  avatarUrl = null,
  status = 'active',
  preferences = {},
  metadata = {},
}) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const normalizedEmail = normalizeEmail(email)

  db.prepare(
    `
      INSERT INTO users (
        id,
        email,
        username,
        display_name,
        password_hash,
        avatar_url,
        status,
        preferences_json,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @email,
        @username,
        @display_name,
        @password_hash,
        @avatar_url,
        @status,
        @preferences_json,
        @metadata_json,
        @created_at,
        @updated_at
      )
    `,
  ).run({
    id,
    email: normalizedEmail,
    username,
    display_name: displayName,
    password_hash: passwordHash,
    avatar_url: avatarUrl,
    status,
    preferences_json: JSON.stringify(preferences),
    metadata_json: JSON.stringify(metadata),
    created_at: now,
    updated_at: now,
  })

  return findUserById(id)
}

export function findUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedEmail) {
    return null
  }

  const row = db
    .prepare(
      `
        SELECT *
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
    )
    .get(normalizedEmail)

  return mapUserRow(row)
}

export function findUserById(userId) {
  if (!userId) {
    return null
  }

  const row = db
    .prepare(
      `
        SELECT *
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(userId)

  return mapUserRow(row)
}

export function sanitizeUser(user) {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    preferences: user.preferences,
    metadata: user.metadata,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export default {
  createUser,
  findUserByEmail,
  findUserById,
  sanitizeUser,
}
