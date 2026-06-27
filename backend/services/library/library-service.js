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

function isEditableStoredPlaylist(playlist = {}) {
  return normalizeTrackString(playlist.sourceType) === LOCAL_PLAYLIST_SOURCE_TYPE
}

function createPlaylistSourceId(playlistId) {
  return `${LOCAL_PLAYLIST_SOURCE_PREFIX}${playlistId}`
}

function normalizeVisibility(value) {
  return value === 'public' ? 'public' : 'private'
}

function normalizePlaylistSourceType(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return LOCAL_PLAYLIST_SOURCE_TYPE
  }

  return value.trim()
}

function normalizeArtists(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }

        if (item?.name) {
          return String(item.name).trim()
        }

        return ''
      })
      .filter(Boolean)
  }

  if (typeof input !== 'string' || !input.trim()) {
    return []
  }

  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeAlbum(input) {
  if (typeof input === 'string') {
    return input.trim()
  }

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input
  }

  return ''
}

function normalizeTrackString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function normalizeTrackNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null
}

function deriveLocalAudioAssetId(input, sourceType, sourceId) {
  const explicitAssetId =
    normalizeTrackString(input.audio_asset_id) ||
    normalizeTrackString(input.audioAssetId) ||
    normalizeTrackString(input.metadata?.audioAssetId)

  if (explicitAssetId) {
    return explicitAssetId
  }

  if (sourceType === 'local_audio') {
    const rawId = normalizeTrackString(input.id)

    if (rawId) {
      return rawId
    }

    if (sourceId.startsWith('local_audio:')) {
      return sourceId.slice('local_audio:'.length)
    }
  }

  return ''
}

function deriveTrackUri(input, sourceId) {
  const explicitUri =
    normalizeTrackString(input.uri) || normalizeTrackString(input.metadata?.uri)

  if (explicitUri.startsWith('spotify:')) {
    return explicitUri
  }

  return sourceId.startsWith('spotify:') ? sourceId : ''
}

function deriveTrackPlayMode(input, sourceType, audioAssetId, uri, previewUrl) {
  const explicitPlayMode =
    normalizeTrackString(input.play_mode) ||
    normalizeTrackString(input.playMode) ||
    normalizeTrackString(input.metadata?.playMode)

  if (explicitPlayMode) {
    return explicitPlayMode
  }

  if (sourceType === 'local_audio' || audioAssetId) {
    return 'local_audio'
  }

  if (uri) {
    return 'spotify_remote'
  }

  if (previewUrl) {
    return 'preview'
  }

  return 'unavailable'
}

function sanitizeTrackReference(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'track is required')

  const sourceType =
    normalizeTrackString(input.source_type) ||
    normalizeTrackString(input.sourceType) ||
    (normalizeTrackString(input.play_mode) === 'local_audio' ||
    normalizeTrackString(input.playMode) === 'local_audio'
      ? 'local_audio'
      : '')
  const sourceId =
    normalizeTrackString(input.source_id) ||
    normalizeTrackString(input.sourceId) ||
    normalizeTrackString(input.uri) ||
    (sourceType === 'local_audio' && normalizeTrackString(input.id)
      ? `local_audio:${normalizeTrackString(input.id)}`
      : '')

  assert(sourceType, 'source_type is required')
  assert(sourceId, 'source_id is required')

  const artists = normalizeArtists(input.artists || input.artist)
  const album = normalizeAlbum(input.album || input.albumName)
  const imageUrl =
    normalizeTrackString(input.image_url) ||
    normalizeTrackString(input.imageUrl) ||
    normalizeTrackString(input.image)
  const previewUrl =
    normalizeTrackString(input.preview_url) ||
    normalizeTrackString(input.previewUrl)
  const audioAssetId = deriveLocalAudioAssetId(input, sourceType, sourceId)
  const uri = deriveTrackUri(input, sourceId)
  const playMode = deriveTrackPlayMode(input, sourceType, audioAssetId, uri, previewUrl)
  const metadata =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? { ...input.metadata }
      : {}

  return {
    sourceType,
    sourceId,
    audioAssetId,
    playMode,
    uri,
    title:
      normalizeTrackString(input.title) ||
      normalizeTrackString(input.name) ||
      normalizeTrackString(input.trackName),
    artists,
    album,
    imageUrl,
    previewUrl,
    durationMs: normalizeTrackNumber(input.duration_ms ?? input.durationMs),
    metadata: {
      ...metadata,
      provider: input.provider || metadata.provider || null,
      entityType: input.entity_type || input.entityType || metadata.entityType || null,
      playMode,
      uri: uri || null,
      audioAssetId: audioAssetId || null,
    },
  }
}

function resolveStoredTrackField(track = {}, key) {
  if (key in track) {
    return track[key]
  }

  const metadata =
    track.metadata && typeof track.metadata === 'object' && !Array.isArray(track.metadata)
      ? track.metadata
      : {}

  return metadata[key]
}

export function enrichStoredTrackReference(track = {}, options = {}) {
  const sourceType =
    normalizeTrackString(track.sourceType) || normalizeTrackString(track.source_type)
  const sourceId =
    normalizeTrackString(track.sourceId) || normalizeTrackString(track.source_id)
  const audioAssetId =
    normalizeTrackString(track.audioAssetId) ||
    normalizeTrackString(track.audio_asset_id) ||
    normalizeTrackString(resolveStoredTrackField(track, 'audioAssetId')) ||
    deriveLocalAudioAssetId(track, sourceType, sourceId)
  const uri =
    normalizeTrackString(track.uri) ||
    normalizeTrackString(resolveStoredTrackField(track, 'uri')) ||
    (sourceId.startsWith('spotify:') ? sourceId : '')
  const previewUrl =
    normalizeTrackString(track.previewUrl) ||
    normalizeTrackString(track.preview_url)
  const playMode = deriveTrackPlayMode(track, sourceType, audioAssetId, uri, previewUrl)
  const resolveAudioUrl =
    typeof options.resolveAudioUrl === 'function' ? options.resolveAudioUrl : null
  const audioUrl =
    playMode === 'local_audio' && audioAssetId && resolveAudioUrl
      ? normalizeTrackString(resolveAudioUrl(audioAssetId, track))
      : ''

  return {
    ...track,
    sourceType,
    source_type: sourceType,
    sourceId,
    source_id: sourceId,
    name: normalizeTrackString(track.name) || normalizeTrackString(track.title),
    title: normalizeTrackString(track.title) || normalizeTrackString(track.name),
    artists: normalizeArtists(track.artists),
    album: normalizeAlbum(track.album),
    imageUrl:
      normalizeTrackString(track.imageUrl) ||
      normalizeTrackString(track.image_url) ||
      normalizeTrackString(track.image),
    image_url:
      normalizeTrackString(track.image_url) ||
      normalizeTrackString(track.imageUrl) ||
      normalizeTrackString(track.image),
    durationMs: normalizeTrackNumber(track.durationMs ?? track.duration_ms) ?? 0,
    duration_ms: normalizeTrackNumber(track.duration_ms ?? track.durationMs),
    previewUrl,
    preview_url: previewUrl,
    playMode,
    play_mode: playMode,
    uri,
    audioAssetId,
    audio_asset_id: audioAssetId,
    audioUrl,
    audio_url: audioUrl,
    metadata: {
      ...(track.metadata && typeof track.metadata === 'object' && !Array.isArray(track.metadata)
        ? track.metadata
        : {}),
      playMode,
      uri: uri || null,
      audioAssetId: audioAssetId || null,
    },
  }
}

export function enrichStoredPlaylist(playlist = {}, options = {}) {
  return {
    ...playlist,
    canEdit: isEditableStoredPlaylist(playlist),
    canDelete: isEditableStoredPlaylist(playlist),
    items: Array.isArray(playlist.items)
      ? playlist.items.map((item) => enrichStoredTrackReference(item, options))
      : [],
  }
}

export function enrichStoredFavorite(favorite = {}, options = {}) {
  return enrichStoredTrackReference(favorite, options)
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

  const metadata = parseJson(row.metadata_json, {})
  const uri =
    typeof metadata.uri === 'string' && metadata.uri.trim()
      ? metadata.uri.trim()
      : row.source_id?.startsWith('spotify:')
        ? row.source_id
        : ''
  const audioAssetId =
    normalizeTrackString(row.audio_asset_id) ||
    (typeof metadata.audioAssetId === 'string' ? metadata.audioAssetId.trim() : '')
  const playMode =
    typeof metadata.playMode === 'string' && metadata.playMode.trim()
      ? metadata.playMode.trim()
      : row.source_type === 'local_audio' || audioAssetId
        ? 'local_audio'
        : uri
          ? 'spotify_remote'
          : row.preview_url
            ? 'preview'
            : 'unavailable'

  return {
    id: row.id,
    playlistId: row.playlist_id,
    position: row.position,
    itemType: row.item_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    source_type: row.source_type,
    source_id: row.source_id,
    name: row.title || '',
    title: row.title || '',
    artists: parseJson(row.artists_json, []),
    album: parseJson(row.album_json, ''),
    imageUrl: row.image_url || '',
    image_url: row.image_url || '',
    previewUrl: row.preview_url || '',
    preview_url: row.preview_url || '',
    durationMs: row.duration_ms ?? null,
    duration_ms: row.duration_ms ?? null,
    playMode,
    play_mode: playMode,
    uri,
    audioAssetId,
    audio_asset_id: audioAssetId,
    metadata,
    createdAt: row.created_at,
  }
}

function mapFavoriteRow(row) {
  if (!row) {
    return null
  }

  const metadata = parseJson(row.metadata_json, {})
  const uri =
    typeof metadata.uri === 'string' && metadata.uri.trim()
      ? metadata.uri.trim()
      : row.source_id?.startsWith('spotify:')
        ? row.source_id
        : ''
  const audioAssetId =
    normalizeTrackString(row.audio_asset_id) ||
    (typeof metadata.audioAssetId === 'string' ? metadata.audioAssetId.trim() : '')
  const playMode =
    typeof metadata.playMode === 'string' && metadata.playMode.trim()
      ? metadata.playMode.trim()
      : row.source_type === 'local_audio' || audioAssetId
        ? 'local_audio'
        : uri
          ? 'spotify_remote'
          : row.preview_url
            ? 'preview'
            : 'unavailable'

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    favoriteType: row.favorite_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    source_type: row.source_type,
    source_id: row.source_id,
    name: row.title || '',
    title: row.title || '',
    artists: parseJson(row.artists_json, []),
    album: parseJson(row.album_json, ''),
    imageUrl: row.image_url || '',
    image_url: row.image_url || '',
    previewUrl: row.preview_url || '',
    preview_url: row.preview_url || '',
    durationMs: row.duration_ms ?? null,
    duration_ms: row.duration_ms ?? null,
    playMode,
    play_mode: playMode,
    uri,
    audioAssetId,
    audio_asset_id: audioAssetId,
    metadata,
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
  const requestedTitle =
    typeof input.title === 'string'
      ? input.title
      : typeof input.name === 'string'
        ? input.name
        : ''
  const title =
    requestedTitle.trim()
      ? requestedTitle.trim()
      : 'New Playlist'
  const description =
    typeof input.description === 'string' ? input.description.trim() : ''
  const coverImageUrl =
    typeof input.cover_image_url === 'string' ? input.cover_image_url.trim() : null
  const visibility = normalizeVisibility(input.visibility)
  const sourceType = normalizePlaylistSourceType(input.source_type)
  const sourceId =
    typeof input.source_id === 'string' && input.source_id.trim()
      ? input.source_id.trim()
      : sourceType === LOCAL_PLAYLIST_SOURCE_TYPE
        ? createPlaylistSourceId(id)
        : `${sourceType}:playlist:${id}`

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

export function findPlaylistBySource(ownerUserId, sourceType, sourceId) {
  if (!ownerUserId || !sourceType || !sourceId) {
    return null
  }

  const row = db
    .prepare(
      `
        SELECT id
        FROM library_playlists
        WHERE owner_user_id = ?
          AND source_type = ?
          AND source_id = ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
    )
    .get(ownerUserId, sourceType, sourceId)

  return row?.id ? getPlaylist(ownerUserId, row.id) : null
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
    itemCount: itemRows.length,
  }
}

export function updatePlaylist(ownerUserId, playlistId, input = {}) {
  const existing = getPlaylist(ownerUserId, playlistId)

  if (!existing) {
    return null
  }

  const requestedTitle =
    typeof input.title === 'string'
      ? input.title
      : typeof input.name === 'string'
        ? input.name
        : null

  const updated = {
    title:
      typeof requestedTitle === 'string' && requestedTitle.trim()
        ? requestedTitle.trim()
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
        audio_asset_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    playlistId,
    track.audioAssetId || null,
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
        audio_asset_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    ownerUserId,
    track.audioAssetId || null,
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
  findPlaylistBySource,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  addPlaylistItem,
  deletePlaylistItem,
  listFavorites,
  createFavorite,
  deleteFavorite,
  enrichStoredTrackReference,
  enrichStoredPlaylist,
  enrichStoredFavorite,
}
