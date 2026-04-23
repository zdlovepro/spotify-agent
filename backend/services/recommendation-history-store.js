import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFilePath)
const dataDirectory = path.join(currentDirectory, '..', 'data')
const historyFilePath = path.join(dataDirectory, 'recommendation-history.json')
const maxEntriesPerUser = 50

let writeQueue = Promise.resolve()

async function ensureHistoryFile() {
  await mkdir(dataDirectory, { recursive: true })

  try {
    await readFile(historyFilePath, 'utf8')
  } catch {
    await writeFile(historyFilePath, JSON.stringify({}, null, 2))
  }
}

async function readHistoryData() {
  await ensureHistoryFile()

  const raw = await readFile(historyFilePath, 'utf8')

  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function queueWrite(mutator) {
  writeQueue = writeQueue.then(async () => {
    const data = await readHistoryData()
    const nextData = await mutator(data)
    await writeFile(historyFilePath, JSON.stringify(nextData, null, 2))
    return nextData
  })

  return writeQueue
}

function sanitizeTrack(track = {}) {
  return {
    id: track.id || '',
    name: track.name || 'Unknown track',
    artists: Array.isArray(track.artists) ? track.artists : [],
    album: track.album || '',
    image: track.image || '',
    previewUrl: track.previewUrl || '',
  }
}

export async function listRecommendationHistory(userId, limit = 20) {
  const data = await readHistoryData()
  const entries = Array.isArray(data[userId]) ? data[userId] : []

  return entries.slice(0, limit)
}

export async function saveRecommendationHistory(userId, payload) {
  const entry = {
    id: crypto.randomUUID(),
    title: payload.title || 'Untitled Recommendation',
    prompt: payload.prompt || '',
    description: payload.description || '',
    seeds: payload.seeds || {},
    tracks: Array.isArray(payload.tracks)
      ? payload.tracks.map((track) => sanitizeTrack(track))
      : [],
    createdAt: new Date().toISOString(),
  }

  await queueWrite((data) => {
    const currentEntries = Array.isArray(data[userId]) ? data[userId] : []
    const nextEntries = [entry, ...currentEntries].slice(0, maxEntriesPerUser)

    return {
      ...data,
      [userId]: nextEntries,
    }
  })

  return entry
}

export async function deleteRecommendationHistory(userId, entryId) {
  let removed = false

  await queueWrite((data) => {
    const currentEntries = Array.isArray(data[userId]) ? data[userId] : []
    const nextEntries = currentEntries.filter((entry) => {
      const shouldKeep = entry.id !== entryId

      if (!shouldKeep) {
        removed = true
      }

      return shouldKeep
    })

    return {
      ...data,
      [userId]: nextEntries,
    }
  })

  return removed
}
