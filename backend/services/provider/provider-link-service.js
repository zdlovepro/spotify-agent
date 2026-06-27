import crypto from 'crypto'
import db from '../../db/index.js'
import { assert } from '../../utils/assert.js'
import {
  SPOTIFY_PROVIDER_NAME,
  exchangeSpotifyToken,
} from './spotify-provider-service.js'

function createProviderLinkError(
  message,
  code,
  status = 403,
  extras = undefined,
) {
  const error = new Error(message)
  error.code = code
  error.status = status

  if (extras && typeof extras === 'object') {
    Object.assign(error, extras)
  }

  return error
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function mapProviderLinkRow(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    userId: row.user_id,
    providerName: row.provider_name,
    providerUserId: row.provider_user_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    displayName: row.display_name,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    scopes: parseJson(row.scopes_json, []),
    tokenExpiresAt: row.token_expires_at,
    profile: parseJson(row.profile_json, {}),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function upsertProviderLinkRow(payload) {
  const now = new Date().toISOString()
  const upsertTransaction = db.transaction(() => {
    const existingForUser = db
      .prepare(
        `
          SELECT id
          FROM provider_links
          WHERE user_id = @user_id
            AND provider_name = @provider_name
          LIMIT 1
        `,
      )
      .get({
        user_id: payload.userId,
        provider_name: payload.providerName,
      })

    const existingForSource = db
      .prepare(
        `
          SELECT id
          FROM provider_links
          WHERE source_type = @source_type
            AND source_id = @source_id
          LIMIT 1
        `,
      )
      .get({
        source_type: payload.sourceType,
        source_id: payload.sourceId,
      })

    if (
      existingForUser?.id &&
      existingForSource?.id &&
      existingForUser.id !== existingForSource.id
    ) {
      db.prepare(
        `
          DELETE FROM provider_links
          WHERE id = ?
        `,
      ).run(existingForUser.id)
    }

    const existing = existingForSource || existingForUser
    const id = existing?.id || crypto.randomUUID()

    db.prepare(
      `
        INSERT INTO provider_links (
          id,
          user_id,
          provider_name,
          provider_user_id,
          source_type,
          source_id,
          display_name,
          access_token,
          refresh_token,
          scopes_json,
          token_expires_at,
          profile_json,
          metadata_json,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @user_id,
          @provider_name,
          @provider_user_id,
          @source_type,
          @source_id,
          @display_name,
          @access_token,
          @refresh_token,
          @scopes_json,
          @token_expires_at,
          @profile_json,
          @metadata_json,
          @created_at,
          @updated_at
        )
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          provider_name = excluded.provider_name,
          provider_user_id = excluded.provider_user_id,
          source_type = excluded.source_type,
          source_id = excluded.source_id,
          display_name = excluded.display_name,
          access_token = excluded.access_token,
          refresh_token = COALESCE(excluded.refresh_token, provider_links.refresh_token),
          scopes_json = excluded.scopes_json,
          token_expires_at = excluded.token_expires_at,
          profile_json = excluded.profile_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `,
    ).run({
      id,
      user_id: payload.userId,
      provider_name: payload.providerName,
      provider_user_id: payload.providerUserId || null,
      source_type: payload.sourceType,
      source_id: payload.sourceId,
      display_name: payload.displayName || null,
      access_token: payload.accessToken || null,
      refresh_token: payload.refreshToken || null,
      scopes_json: JSON.stringify(payload.scopes || []),
      token_expires_at: payload.tokenExpiresAt || null,
      profile_json: JSON.stringify(payload.profile || {}),
      metadata_json: JSON.stringify(payload.metadata || {}),
      created_at: now,
      updated_at: now,
    })

    return id
  })

  return upsertTransaction()
}

export function linkProvider(payload) {
  assert(payload?.userId, 'userId is required')
  assert(payload?.providerName, 'providerName is required')
  assert(payload?.sourceType, 'sourceType is required')
  assert(payload?.sourceId, 'sourceId is required')

  const id = upsertProviderLinkRow(payload)
  return getProviderLink(payload.userId, payload.providerName)
}

export function getProviderLink(userId, providerName) {
  if (!userId || !providerName) {
    return null
  }

  const row = db
    .prepare(
      `
        SELECT *
        FROM provider_links
        WHERE user_id = ?
          AND provider_name = ?
        LIMIT 1
      `,
    )
    .get(userId, providerName)

  return mapProviderLinkRow(row)
}

export function listProviderLinks(userId) {
  if (!userId) {
    return []
  }

  const rows = db
    .prepare(
      `
        SELECT *
        FROM provider_links
        WHERE user_id = ?
        ORDER BY provider_name ASC
      `,
    )
    .all(userId)

  return rows.map(mapProviderLinkRow)
}

export async function refreshProviderToken(providerLink) {
  if (!providerLink) {
    return null
  }

  if (providerLink.providerName !== SPOTIFY_PROVIDER_NAME) {
    return providerLink
  }

  const expiresAtMs = providerLink.tokenExpiresAt
    ? new Date(providerLink.tokenExpiresAt).getTime()
    : Number.POSITIVE_INFINITY
  const shouldRefresh =
    Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() <= 60 * 1000

  if (!shouldRefresh) {
    return providerLink
  }

  if (!providerLink.refreshToken) {
    throw createProviderLinkError(
      'Spotify login has expired. Please reconnect Spotify.',
      'spotify_reconnect_required',
      403,
    )
  }

  let tokenData

  try {
    tokenData = await exchangeSpotifyToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: providerLink.refreshToken,
      }),
    )
  } catch (error) {
    const refreshErrorCode = error.response?.data?.error || ''

    if (refreshErrorCode === 'invalid_grant') {
      unlinkProvider(providerLink.userId, providerLink.providerName)
      console.info('[spotify-provider] refresh token invalid, provider link removed', {
        localUserId: providerLink.userId,
        provider: providerLink.providerName,
      })

      throw createProviderLinkError(
        'Spotify login has expired. Please reconnect Spotify.',
        'spotify_reconnect_required',
        403,
      )
    }

    throw createProviderLinkError(
      'Spotify token refresh failed.',
      'spotify_token_refresh_failed',
      error.response?.status || 502,
      {
        details: {
          provider: providerLink.providerName,
          reason:
            error.response?.data?.error_description ||
            error.response?.data?.error ||
            error.message ||
            'spotify_refresh_failed',
        },
      },
    )
  }

  if (!tokenData?.access_token) {
    throw createProviderLinkError(
      'Spotify access token is unavailable.',
      'spotify_token_unavailable',
      503,
    )
  }

  console.info('[spotify-provider] refreshed spotify access token', {
    localUserId: providerLink.userId,
    provider: providerLink.providerName,
    expiresInSeconds:
      Number.isFinite(Number(tokenData.expires_in)) && Number(tokenData.expires_in) > 0
        ? Number(tokenData.expires_in)
        : null,
  })

  return linkProvider({
    userId: providerLink.userId,
    providerName: providerLink.providerName,
    providerUserId: providerLink.providerUserId,
    sourceType: providerLink.sourceType,
    sourceId: providerLink.sourceId,
    displayName: providerLink.displayName,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || providerLink.refreshToken,
    tokenExpiresAt: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : providerLink.tokenExpiresAt,
    scopes: providerLink.scopes,
    profile: providerLink.profile,
    metadata: {
      ...providerLink.metadata,
      refreshedAt: new Date().toISOString(),
    },
  })
}

export function unlinkProvider(userId, providerName) {
  if (!userId || !providerName) {
    return false
  }

  const result = db
    .prepare(
      `
        DELETE FROM provider_links
        WHERE user_id = ?
          AND provider_name = ?
      `,
    )
    .run(userId, providerName)

  return result.changes > 0
}

export default {
  linkProvider,
  getProviderLink,
  listProviderLinks,
  refreshProviderToken,
  unlinkProvider,
}
