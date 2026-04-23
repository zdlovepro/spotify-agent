import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFilePath)
const dataDirectory = path.join(currentDirectory, '..', 'data')
const feedbackFilePath = path.join(dataDirectory, 'agent-feedback.json')
const maxEntriesPerUser = 100

let writeQueue = Promise.resolve()

async function ensureFeedbackFile() {
  await mkdir(dataDirectory, { recursive: true })

  try {
    await readFile(feedbackFilePath, 'utf8')
  } catch {
    await writeFile(feedbackFilePath, JSON.stringify({}, null, 2))
  }
}

async function readFeedbackData() {
  await ensureFeedbackFile()

  const raw = await readFile(feedbackFilePath, 'utf8')

  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function queueWrite(mutator) {
  writeQueue = writeQueue.then(async () => {
    const data = await readFeedbackData()
    const nextData = await mutator(data)
    await writeFile(feedbackFilePath, JSON.stringify(nextData, null, 2))
    return nextData
  })

  return writeQueue
}

function sanitizeFeedbackEntry(entry = {}) {
  return {
    id: entry.id || crypto.randomUUID(),
    feedback: entry.feedback || 'like',
    conversationId: entry.conversationId || '',
    messageId: entry.messageId || '',
    recommendationId: entry.recommendationId || '',
    note: entry.note || '',
    metadata:
      entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
        ? entry.metadata
        : {},
    createdAt: entry.createdAt || new Date().toISOString(),
  }
}

export async function listAgentFeedback(userId, limit = 20) {
  const data = await readFeedbackData()
  const entries = Array.isArray(data[userId]) ? data[userId] : []

  return entries.slice(0, limit)
}

export async function saveAgentFeedback(userId, payload) {
  const entry = sanitizeFeedbackEntry(payload)

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
