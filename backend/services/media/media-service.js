import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { parseFile } from 'music-metadata'
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

const cp1252CodePointToByte = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
])

const knownMojibakeCodePoints = new Set([
  0x8133,
  0x923c,
  0x9231,
  0x9243,
  0x7490,
  0xfe3d,
  0x947f,
  0x9352,
  0x6d93,
  0x95ab,
  0x7d1d,
  0x6ec3,
  0x57db,
  0x5d1f,
  0x6c2c,
  0x9423,
  0x93bb,
  0x6137,
  0x612a,
  0x5bee,
  0x6434,
  0x546c,
  0x51a9,
  0x93c2,
  0x7df1,
  0x6e36,
  0x8e47,
])

const textDecoders = [
  new TextDecoder('utf-8'),
  new TextDecoder('gb18030'),
  new TextDecoder('big5'),
]

function countMatches(value, pattern) {
  return value.match(pattern)?.length || 0
}

function countKnownMojibakeCharacters(value) {
  let count = 0

  for (const character of value) {
    if (knownMojibakeCodePoints.has(character.codePointAt(0))) {
      count += 1
    }
  }

  return count
}

function scorePossibleMojibake(value = '') {
  const normalizedValue = String(value || '')
  const replacementMatches = countMatches(normalizedValue, /\ufffd/g)
  const controlMatches = countMatches(normalizedValue, /[\u0080-\u009f]/g)
  const latinMojibakeMatches = countMatches(
    normalizedValue,
    /[\u00c2\u00c3\u00c5\u00c7\u00d0\u00d1\u00d6\u00de\u00e2-\u00e6\u00f0\u00f1\u00fd\u00fe]/g,
  )
  const knownMojibakeMatches = countKnownMojibakeCharacters(normalizedValue)
  const commonBrokenTextMatches = countMatches(
    normalizedValue,
    /\u951f\u65a4\u62f7/g,
  )

  return (
    replacementMatches * 20 +
    controlMatches * 8 +
    latinMojibakeMatches * 4 +
    knownMojibakeMatches * 4 +
    commonBrokenTextMatches * 12
  )
}

function legacyBytesFromText(value) {
  const bytes = []

  for (const character of value) {
    const codePoint = character.codePointAt(0)

    if (codePoint <= 0xff) {
      bytes.push(codePoint)
      continue
    }

    const cp1252Byte = cp1252CodePointToByte.get(codePoint)

    if (cp1252Byte) {
      bytes.push(cp1252Byte)
      continue
    }

    return null
  }

  return Uint8Array.from(bytes)
}

function chooseBestTextCandidate(candidates) {
  return candidates
    .filter(Boolean)
    .reduce((bestCandidate, candidate) => {
      const bestScore = scorePossibleMojibake(bestCandidate)
      const candidateScore = scorePossibleMojibake(candidate)

      if (candidateScore < bestScore) {
        return candidate
      }

      return bestCandidate
    })
}

function normalizeUploadedText(value = '') {
  const trimmedValue = String(value || '').trim()

  if (!trimmedValue) {
    return ''
  }

  const legacyBytes = legacyBytesFromText(trimmedValue)

  if (!legacyBytes) {
    return trimmedValue
  }

  const decodedCandidates = textDecoders
    .map((decoder) => decoder.decode(legacyBytes).trim())
    .filter((candidate) => candidate && candidate !== trimmedValue)

  return chooseBestTextCandidate([trimmedValue, ...decodedCandidates])
}

function firstStringValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return normalizeUploadedText(value)
    }
  }

  return ''
}

function toMetadataArtistList(commonMetadata = {}) {
  const rawArtists = Array.isArray(commonMetadata.artists)
    ? commonMetadata.artists
    : firstStringValue(commonMetadata.artist)
      ? [commonMetadata.artist]
      : []
  const normalizedArtists = rawArtists
    .flatMap((artist) => String(artist || '').split(/[;,/]/))
    .map((artist) => normalizeUploadedText(artist))
    .filter(Boolean)

  return [...new Set(normalizedArtists)]
}

async function readAudioMetadata(storagePath) {
  try {
    return {
      metadata: await parseFile(storagePath, {
        skipCovers: true,
      }),
      error: null,
    }
  } catch (error) {
    return {
      metadata: null,
      error: error?.message || 'Unable to parse audio metadata',
    }
  }
}

function resolveDurationMs(inputDurationMs, metadata) {
  const parsedInputDuration = Number(inputDurationMs)

  if (Number.isFinite(parsedInputDuration) && parsedInputDuration >= 0) {
    return parsedInputDuration
  }

  const metadataDurationSeconds = Number(metadata?.format?.duration)

  return Number.isFinite(metadataDurationSeconds) && metadataDurationSeconds > 0
    ? Math.round(metadataDurationSeconds * 1000)
    : null
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
  ).map((artist) => normalizeUploadedText(artist))
    .filter(Boolean)
  const sizeBytes = row.size_bytes ?? row.file_size_bytes ?? null

  return {
    id: row.id,
    sourceType: 'local_audio',
    sourceId: row.source_id || `local_audio:${row.id}`,
    originalFilename: normalizeUploadedText(row.original_filename),
    mimeType: row.mime_type,
    fileExtension: row.file_extension || '',
    sizeBytes,
    title: normalizeUploadedText(row.title || ''),
    artists,
    album: normalizeUploadedText(row.album_name || ''),
    durationMs: row.duration_ms ?? null,
    createdAt: row.created_at,
    streamPath: `/api/media/assets/${row.id}/stream`,
  }
}

function normalizeArtists(input) {
  if (Array.isArray(input)) {
    return input.map((item) => normalizeUploadedText(item)).filter(Boolean)
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
      return parsed.map((item) => normalizeUploadedText(item)).filter(Boolean)
    }
  } catch {
    // Fall through to comma-split parsing.
  }

  return trimmed
    .split(',')
    .map((item) => normalizeUploadedText(item))
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

export async function createAudioAsset(userId, file, input = {}) {
  const id = crypto.randomUUID()
  const now = nowIso()
  const storagePath = path.resolve(file.path)
  const { metadata, error: metadataError } = await readAudioMetadata(storagePath)
  const metadataTitle = firstStringValue(metadata?.common?.title)
  const metadataArtists = toMetadataArtistList(metadata?.common)
  const metadataAlbumName = firstStringValue(metadata?.common?.album)
  const originalFilename = normalizeUploadedText(file.originalname || file.filename || '')
  const fallbackTitle = normalizeUploadedText(
    path.parse(originalFilename || file.originalname || file.filename || 'audio').name,
  )
  const inputTitle =
    typeof input.title === 'string' && input.title.trim()
      ? normalizeUploadedText(input.title)
      : ''
  const isInputTitleFromFilename =
    !inputTitle || inputTitle.toLowerCase() === fallbackTitle.toLowerCase()
  const title = isInputTitleFromFilename
    ? metadataTitle || inputTitle || fallbackTitle
    : inputTitle
  const inputArtists = normalizeArtists(input.artists)
  const artists = inputArtists.length ? inputArtists : metadataArtists
  const inputAlbumName =
    typeof input.album === 'string' && input.album.trim()
      ? normalizeUploadedText(input.album)
      : ''
  const albumName =
    inputAlbumName || metadataAlbumName
  const durationMs = resolveDurationMs(input.duration_ms, metadata)
  const sourceType = 'local_audio'
  const sourceId = `local_audio:${id}`
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
      metadataError,
      parsedTags: {
        title: metadataTitle,
        artists: metadataArtists,
        album: metadataAlbumName,
      },
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
