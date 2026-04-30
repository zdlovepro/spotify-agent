import crypto from 'crypto'
import db from '../../db/index.js'
import { assert } from '../../utils/assert.js'

const LOCAL_PLAYLIST_SOURCE_TYPE = 'agentmusic'
const LOCAL_PLAYLIST_SOURCE_PREFIX = 'agentmusic:playlist:'

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

function nowIso() {
  return new Date().toISOString()
}

function createPlaylistSourceId(playlistId) {
  return `${LOCAL_PLAYLIST_SOURCE_PREFIX}${playlistId}`
}

function normalizeVisibility(value) {
  return value === 'public' ? 'public' : 'private'
}

function sanitizeTrackReference(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'track is required')

  const sourceType =
    typeof input.source_type === 'string' ? input.source_type.trim() : ''
  const sourceId = typeof input.source_id === 'string' ? input.source_id.trim() : ''

  assert(sourceType, 'source_type is required')
  assert(sourceId, 'source_id is required')

  const artists = Array.isArray(input.artists) ? input.artists : []
  const album =
    input.album && typeof input.album === 'object' && !Array.isArray(input.album)
      ? input.album
      : {}

  return {
    sourceType,
    sourceId,
    title: typeof input.title === 'string' ? input.title.trim() : '',
    artists,
    album,
    imageUrl: typeof input.image_url === 'string' ? input.image_url.trim() : '',
    previewUrl:
      typeof input.preview_url === 'string' ? input.preview_url.trim() : '',
    durationMs:
      Number.isFinite(Number(input.duration_ms)) && Number(input.duration_ms) >= 0
        ? Number(input.duration_ms)
        : null,
    metadata: {
      provider: input.provider || null,
      entityType: input.entity_type || null,
    },
  }
}

function mapPlaylistRow(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    visibility: row.visibility,
    sourceType: row.source_type,
    sourceId: row.source_id,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPlaylistItemRow(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    playlistId: row.playlist_id,
    position: row.position,
    itemType: row.item_type,
    source_type: row.source_type,
    source_id: row.source_id,
    title: row.title || '',
    artists: parseJson(row.artists_json, []),
    album: parseJson(row.album_json, {}),
    image_url: row.image_url || '',
    preview_url: row.preview_url || '',
    duration_ms: row.duration_ms ?? null,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
  }
}

function mapFavoriteRow(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    favoriteType: row.favorite_type,
    source_type: row.source_type,
    source_id: row.source_id,
    title: row.title || '',
    artists: parseJson(row.artists_json, []),
    album: parseJson(row.album_json, {}),
    image_url: row.image_url || '',
    preview_url: row.preview_url || '',
    duration_ms: row.duration_ms ?? null,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
  }
}

export function listPlaylists(ownerUserId) {
  const rows = db
    .prepare(
      `
        SELECT *
        FROM library_playlists
        WHERE owner_user_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `,
    )
    .all(ownerUserId)

  return rows.map(mapPlaylistRow)
}

export function createPlaylist(ownerUserId, input = {}) {
  const id = crypto.randomUUID()
  const now = nowIso()
  const title =
    typeof input.title === 'string' && input.title.trim()
      ? input.title.trim()
      : 'New Playlist'
  const description =
    typeof input.description === 'string' ? input.description.trim() : ''
  const coverImageUrl =
    typeof input.cover_image_url === 'string' ? input.cover_image_url.trim() : null
  const visibility = normalizeVisibility(input.visibility)
  const sourceType = LOCAL_PLAYLIST_SOURCE_TYPE
  const sourceId = createPlaylistSourceId(id)

  db.prepare(
    `
      INSERT INTO library_playlists (
        id,
        owner_user_id,
        title,
        description,
        cover_image_url,
        visibility,
        source_type,
        source_id,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    ownerUserId,
    title,
    description,
    coverImageUrl,
    visibility,
    sourceType,
    sourceId,
    JSON.stringify(input.metadata || {}),
    now,
    now,
  )

  return getPlaylist(ownerUserId, id)
}

export function getPlaylist(ownerUserId, playlistId) {
  const row = db
    .prepare(
      `
        SELECT *
        FROM library_playlists
        WHERE owner_user_id = ?
          AND id = ?
        LIMIT 1
      `,
    )
    .get(ownerUserId, playlistId)

  if (!row) {
    return null
  }

  const playlist = mapPlaylistRow(row)
  const itemRows = db
    .prepare(
      `
        SELECT *
        FROM library_playlist_items
        WHERE playlist_id = ?
        ORDER BY position ASC, created_at ASC
      `,
    )
    .all(playlistId)

  return {
    ...playlist,
    items: itemRows.map(mapPlaylistItemRow),
  }
}

export function updatePlaylist(ownerUserId, playlistId, input = {}) {
  const existing = getPlaylist(ownerUserId, playlistId)

  if (!existing) {
    return null
  }

  const updated = {
    title:
      typeof input.title === 'string' && input.title.trim()
        ? input.title.trim()
        : existing.title,
    description:
      typeof input.description === 'string'
        ? input.description.trim()
        : existing.description,
    coverImageUrl:
      typeof input.cover_image_url === 'string'
        ? input.cover_image_url.trim()
        : existing.coverImageUrl,
    visibility:
      typeof input.visibility === 'string'
        ? normalizeVisibility(input.visibility)
        : existing.visibility,
    metadata:
      input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
        ? input.metadata
        : existing.metadata,
  }

  db.prepare(
    `
      UPDATE library_playlists
      SET title = ?,
          description = ?,
          cover_image_url = ?,
          visibility = ?,
          metadata_json = ?,
          updated_at = ?
      WHERE owner_user_id = ?
        AND id = ?
    `,
  ).run(
    updated.title,
    updated.description,
    updated.coverImageUrl || null,
    updated.visibility,
    JSON.stringify(updated.metadata),
    nowIso(),
    ownerUserId,
    playlistId,
  )

  return getPlaylist(ownerUserId, playlistId)
}

export function deletePlaylist(ownerUserId, playlistId) {
  const result = db
    .prepare(
      `
        DELETE FROM library_playlists
        WHERE owner_user_id = ?
          AND id = ?
      `,
    )
    .run(ownerUserId, playlistId)

  return result.changes > 0
}

function getNextPlaylistPosition(playlistId) {
  const row = db
    .prepare(
      `
        SELECT COALESCE(MAX(position), -1) AS max_position
        FROM library_playlist_items
        WHERE playlist_id = ?
      `,
    )
    .get(playlistId)

  return (row?.max_position ?? -1) + 1
}

export function addPlaylistItem(ownerUserId, playlistId, input) {
  const existing = getPlaylist(ownerUserId, playlistId)

  if (!existing) {
    return null
  }

  const track = sanitizeTrackReference(input)
  const id = crypto.randomUUID()
  const position = getNextPlaylistPosition(playlistId)

  db.prepare(
    `
      INSERT INTO library_playlist_items (
        id,
        playlist_id,
        added_by_user_id,
        item_type,
        position,
        source_type,
        source_id,
        title,
        artists_json,
        album_json,
        image_url,
        preview_url,
        duration_ms,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    playlistId,
    ownerUserId,
    'track',
    position,
    track.sourceType,
    track.sourceId,
    track.title || null,
    JSON.stringify(track.artists),
    JSON.stringify(track.album),
    track.imageUrl || null,
    track.previewUrl || null,
    track.durationMs,
    JSON.stringify(track.metadata),
    nowIso(),
  )

  db.prepare(
    `
      UPDATE library_playlists
      SET updated_at = ?
      WHERE id = ?
    `,
  ).run(nowIso(), playlistId)

  const row = db
    .prepare(
      `
        SELECT *
        FROM library_playlist_items
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(id)

  return mapPlaylistItemRow(row)
}

export function deletePlaylistItem(ownerUserId, playlistId, itemId) {
  const playlist = getPlaylist(ownerUserId, playlistId)

  if (!playlist) {
    return false
  }

  const result = db
    .prepare(
      `
        DELETE FROM library_playlist_items
        WHERE id = ?
          AND playlist_id = ?
      `,
    )
    .run(itemId, playlistId)

  if (!result.changes) {
    return false
  }

  const remainingRows = db
    .prepare(
      `
        SELECT id
        FROM library_playlist_items
        WHERE playlist_id = ?
        ORDER BY position ASC, created_at ASC
      `,
    )
    .all(playlistId)

  const reorder = db.transaction(() => {
    for (const [index, row] of remainingRows.entries()) {
      db.prepare(
        `
          UPDATE library_playlist_items
          SET position = ?
          WHERE id = ?
        `,
      ).run(index, row.id)
    }

    db.prepare(
      `
        UPDATE library_playlists
        SET updated_at = ?
        WHERE id = ?
      `,
    ).run(nowIso(), playlistId)
  })

  reorder()
  return true
}

export function listFavorites(ownerUserId, favoriteType = null) {
  const rows = favoriteType
    ? db
        .prepare(
          `
            SELECT *
            FROM library_favorites
            WHERE owner_user_id = ?
              AND favorite_type = ?
            ORDER BY created_at DESC
          `,
        )
        .all(ownerUserId, favoriteType)
    : db
        .prepare(
          `
            SELECT *
            FROM library_favorites
            WHERE owner_user_id = ?
            ORDER BY created_at DESC
          `,
        )
        .all(ownerUserId)

  return rows.map(mapFavoriteRow)
}

export function createFavorite(ownerUserId, input = {}) {
  const track = sanitizeTrackReference(input)
  const favoriteType =
    typeof input.favorite_type === 'string' && input.favorite_type.trim()
      ? input.favorite_type.trim()
      : 'track'
  const id = crypto.randomUUID()

  db.prepare(
    `
      INSERT OR REPLACE INTO library_favorites (
        id,
        owner_user_id,
        favorite_type,
        source_type,
        source_id,
        title,
        artists_json,
        album_json,
        image_url,
        preview_url,
        duration_ms,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    ownerUserId,
    favoriteType,
    track.sourceType,
    track.sourceId,
    track.title || null,
    JSON.stringify(track.artists),
    JSON.stringify(track.album),
    track.imageUrl || null,
    track.previewUrl || null,
    track.durationMs,
    JSON.stringify(track.metadata),
    nowIso(),
  )

  const row = db
    .prepare(
      `
        SELECT *
        FROM library_favorites
        WHERE owner_user_id = ?
          AND favorite_type = ?
          AND source_type = ?
          AND source_id = ?
        LIMIT 1
      `,
    )
    .get(ownerUserId, favoriteType, track.sourceType, track.sourceId)

  return mapFavoriteRow(row)
}

export function deleteFavorite(ownerUserId, favoriteId) {
  const result = db
    .prepare(
      `
        DELETE FROM library_favorites
        WHERE owner_user_id = ?
          AND id = ?
      `,
    )
    .run(ownerUserId, favoriteId)

  return result.changes > 0
}

export default {
  listPlaylists,
  createPlaylist,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  addPlaylistItem,
  deletePlaylistItem,
  listFavorites,
  createFavorite,
  deleteFavorite,
}
