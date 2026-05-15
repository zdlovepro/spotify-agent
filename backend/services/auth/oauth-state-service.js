import db from '../../db/index.js'

function nowIso() {
  return new Date().toISOString()
}

export function pruneExpiredOAuthPendingStates(providerName = null) {
  const now = nowIso()

  if (providerName) {
    db.prepare(
      `
        DELETE FROM oauth_pending_states
        WHERE provider_name = ?
          AND expires_at <= ?
      `,
    ).run(providerName, now)
    return
  }

  db.prepare(
    `
      DELETE FROM oauth_pending_states
      WHERE expires_at <= ?
    `,
  ).run(now)
}

export function createOAuthPendingState({
  state,
  providerName,
  localUserId,
  returnTo = '/',
  ttlMs,
}) {
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + Math.max(1, Number(ttlMs) || 0)).toISOString()

  db.prepare(
    `
      INSERT OR REPLACE INTO oauth_pending_states (
        state,
        provider_name,
        local_user_id,
        return_to,
        created_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(state, providerName, localUserId, returnTo, createdAt, expiresAt)

  return {
    state,
    providerName,
    localUserId,
    returnTo,
    createdAt,
    expiresAt,
  }
}

export function consumeOAuthPendingState(state, providerName) {
  pruneExpiredOAuthPendingStates(providerName)

  const row = db
    .prepare(
      `
        SELECT *
        FROM oauth_pending_states
        WHERE state = ?
          AND provider_name = ?
        LIMIT 1
      `,
    )
    .get(state, providerName)

  if (!row) {
    return null
  }

  db.prepare(
    `
      DELETE FROM oauth_pending_states
      WHERE state = ?
        AND provider_name = ?
    `,
  ).run(state, providerName)

  return {
    state: row.state,
    providerName: row.provider_name,
    localUserId: row.local_user_id,
    returnTo: row.return_to || '/',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

export default {
  createOAuthPendingState,
  consumeOAuthPendingState,
  pruneExpiredOAuthPendingStates,
}
