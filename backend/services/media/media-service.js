import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import db from '../../db/index.js'
import env from '../../config/env.js'

fs.mkdirSync(env.uploadsDir, { recursive: true })

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

function scorePossibleMojibake(value = '') {
  const mojibakeMatches =
    value.match(/[ÃÂâÐÑæåçéèêëîïôöûüœŸ¤¢£�]/g) || []
  const controlMatches =
    value.match(/[\u0080-\u009f]/g) || []

  return mojibakeMatches.length * 2 + controlMatches.length * 3
}

function normalizeUploadedText(value = '') {
  const trimmedValue = String(value || '').trim()

  if (!trimmedValue) {
    return ''
  }

  if (!/[^\u0000-\u007f]/.test(trimmedValue)) {
    return trimmedValue
  }

  const decodedValue = Buffer.from(trimmedValue, 'latin1').toString('utf8').trim()

  if (!decodedValue || decodedValue === trimmedValue) {
    return trimmedValue
  }

  return scorePossibleMojibake(decodedValue) < scorePossibleMojibake(trimmedValue)
    ? decodedValue
    : trimmedValue
}

function resolveFileExtension(file = {}) {
  const originalNameExtension = path.extname(file.originalname || '').toLowerCase()

  if (originalNameExtension) {
    return originalNameExtension
  }

  const storedNameExtension = path.extname(file.filename || '').toLowerCase()

  if (storedNameExtension) {
    return storedNameExtension
  }

  const mimeType = String(file.mimetype || '').toLowerCase()

  if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
    return '.mp3'
  }

  if (mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') {
    return '.m4a'
  }

  return ''
}

function toPublicAsset(row) {
  if (!row) {
    return null
  }

  const artists = parseJson(
    row.artists_json,
    row.artist_name ? [row.artist_name] : [],
  )
  const sizeBytes = row.size_bytes ?? row.file_size_bytes ?? null

  return {
    id: row.id,
    sourceType: 'local_audio',
    sourceId: row.source_id || `local_audio:${row.id}`,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileExtension: row.file_extension || '',
    sizeBytes,
    title: row.title || '',
    artists,
    album: row.album_name || '',
    durationMs: row.duration_ms ?? null,
    createdAt: row.created_at,
    streamPath: `/api/media/assets/${row.id}/stream`,
  }
}

function normalizeArtists(input) {
  if (Array.isArray(input)) {
    return input.map((item) => String(item || '').trim()).filter(Boolean)
  }

  if (typeof input !== 'string') {
    return []
  }

  const trimmed = input.trim()

  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)

    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    }
  } catch {
    // Fall through to comma-split parsing.
  }

  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolveAssetRow(userId, assetId) {
  return db
    .prepare(
      `
        SELECT *
        FROM audio_assets
        WHERE id = ?
          AND (owner_user_id = ? OR user_id = ?)
        LIMIT 1
      `,
    )
    .get(assetId, userId, userId)
}

export function createAudioAsset(userId, file, input = {}) {
  const id = crypto.randomUUID()
  const now = nowIso()
  const originalFilename = normalizeUploadedText(file.originalname || file.filename || '')
  const fallbackTitleSource = originalFilename || file.originalname || file.filename || 'audio'
  const title =
    typeof input.title === 'string' && input.title.trim()
      ? normalizeUploadedText(input.title)
      : path.parse(fallbackTitleSource).name
  const artists = normalizeArtists(input.artists)
  const albumName =
    typeof input.album === 'string' && input.album.trim()
      ? input.album.trim()
      : ''
  const durationMs =
    Number.isFinite(Number(input.duration_ms)) && Number(input.duration_ms) >= 0
      ? Number(input.duration_ms)
      : null
  const sourceType = 'local_audio'
  const sourceId = `local_audio:${id}`
  const storagePath = path.resolve(file.path)
  const sizeBytes = Number(file.size) || 0
  const fileExtension = resolveFileExtension(file)

  db.prepare(
    `
      INSERT INTO audio_assets (
        id,
        owner_user_id,
        user_id,
        source_type,
        source_id,
        storage_type,
        storage_path,
        original_filename,
        mime_type,
        file_extension,
        title,
        artist_name,
        album_name,
        artists_json,
        duration_ms,
        file_size_bytes,
        size_bytes,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    userId,
    userId,
    sourceType,
    sourceId,
    'local',
    storagePath,
    originalFilename,
    file.mimetype,
    fileExtension,
    title,
    artists[0] || null,
    albumName,
    JSON.stringify(artists),
    durationMs,
    sizeBytes,
    sizeBytes,
    JSON.stringify({
      uploadField: file.fieldname,
    }),
    now,
    now,
  )

  return getAudioAsset(userId, id)
}

export function listAudioAssets(userId) {
  const rows = db
    .prepare(
      `
        SELECT *
        FROM audio_assets
        WHERE owner_user_id = ? OR user_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(userId, userId)

  return rows.map(toPublicAsset)
}

export function getAudioAsset(userId, assetId) {
  return toPublicAsset(resolveAssetRow(userId, assetId))
}

export function getAudioAssetStorageRecord(userId, assetId) {
  return resolveAssetRow(userId, assetId)
}

export function deleteAudioAsset(userId, assetId) {
  const row = resolveAssetRow(userId, assetId)

  if (!row) {
    return null
  }

  db.prepare(
    `
      DELETE FROM audio_assets
      WHERE id = ?
        AND (owner_user_id = ? OR user_id = ?)
    `,
  ).run(assetId, userId, userId)

  try {
    fs.unlinkSync(row.storage_path)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  return toPublicAsset(row)
}

export default {
  createAudioAsset,
  deleteAudioAsset,
  getAudioAsset,
  getAudioAssetStorageRecord,
  listAudioAssets,
}
