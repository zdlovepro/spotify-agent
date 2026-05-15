import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from '../db/index.js'
import migrateDatabase from '../db/migrate.js'
import { resolveLocalUserId } from '../services/auth/resolve-local-user-id.js'

const AGENT_SOURCE_TYPE = 'agentmusic'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..')
const dataDirectory = path.join(backendRoot, 'data')

const storeFiles = {
  conversations: path.join(dataDirectory, 'conversations.json'),
  recommendationHistory: path.join(dataDirectory, 'recommendation-history.json'),
  feedback: path.join(dataDirectory, 'agent-feedback.json'),
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Failed to parse ${filePath}: ${error.message}`)
  }
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeIsoDate(value, fallback = new Date().toISOString()) {
  const normalized = normalizeString(value)
  return normalized || fallback
}

function normalizeArtists(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((artist) => {
      if (typeof artist === 'string') {
        return artist.trim()
      }

      if (artist?.name) {
        return String(artist.name).trim()
      }

      return ''
    })
    .filter(Boolean)
}

function normalizeTrackIdentifier(track = {}) {
  const sourceType = normalizeString(
    track.source_type || track.sourceType,
    'spotify',
  )
  const id = normalizeString(track.id)
  const sourceId = normalizeString(
    track.source_id || track.sourceId,
    id ? `${sourceType}:track:${id}` : `${sourceType}:track:${crypto.randomUUID()}`,
  )

  return {
    sourceType,
    sourceId,
    id: id || sourceId,
  }
}

function resolveOwnedConversationId(ownerUserId, conversationId) {
  const normalizedConversationId = normalizeString(conversationId)

  if (!normalizedConversationId) {
    return null
  }

  return (
    db
      .prepare(
        `
          SELECT id
          FROM conversations
          WHERE owner_user_id = ?
            AND id = ?
          LIMIT 1
        `,
      )
      .get(ownerUserId, normalizedConversationId)?.id || null
  )
}

function resolveOwnedMessageId(ownerUserId, messageId) {
  const normalizedMessageId = normalizeString(messageId)

  if (!normalizedMessageId) {
    return null
  }

  return (
    db
      .prepare(
        `
          SELECT m.id
          FROM messages m
          INNER JOIN conversations c ON c.id = m.conversation_id
          WHERE c.owner_user_id = ?
            AND m.id = ?
          LIMIT 1
        `,
      )
      .get(ownerUserId, normalizedMessageId)?.id || null
  )
}

function resolveOwnedRecommendationRunId(ownerUserId, recommendationRunId) {
  const normalizedRecommendationRunId = normalizeString(recommendationRunId)

  if (!normalizedRecommendationRunId) {
    return null
  }

  return (
    db
      .prepare(
        `
          SELECT id
          FROM recommendation_runs
          WHERE owner_user_id = ?
            AND id = ?
          LIMIT 1
        `,
      )
      .get(ownerUserId, normalizedRecommendationRunId)?.id || null
  )
}

function resolveOwnerUserId(localUserIdOrLegacyUserId) {
  const ownerUserId = resolveLocalUserId(localUserIdOrLegacyUserId)
  return ownerUserId || null
}

function importConversations(rawData, summary) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return
  }

  const insertConversation = db.prepare(
    `
      INSERT OR IGNORE INTO conversations (
        id,
        owner_user_id,
        title,
        source_type,
        source_id,
        status,
        mode,
        context_json,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
  const updateConversation = db.prepare(
    `
      UPDATE conversations
      SET title = ?,
          updated_at = ?,
          metadata_json = ?
      WHERE owner_user_id = ?
        AND id = ?
    `,
  )
  const insertMessage = db.prepare(
    `
      INSERT OR IGNORE INTO messages (
        id,
        conversation_id,
        role,
        content,
        intent,
        source_type,
        source_id,
        actions_json,
        artifacts_json,
        tool_calls_json,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )

  const runImport = db.transaction(() => {
    for (const [legacyUserId, conversations] of Object.entries(rawData)) {
      const ownerUserId = resolveOwnerUserId(legacyUserId)

      if (!ownerUserId) {
        summary.conversations.skippedUsers.push(legacyUserId)
        continue
      }

      if (!Array.isArray(conversations)) {
        continue
      }

      for (const conversation of conversations) {
        const conversationId = normalizeString(
          conversation?.id,
          crypto.randomUUID(),
        )
        const createdAt = normalizeIsoDate(conversation?.createdAt)
        const updatedAt = normalizeIsoDate(conversation?.updatedAt, createdAt)
        const title = normalizeString(conversation?.title, 'New Conversation')
        const messages = Array.isArray(conversation?.messages)
          ? conversation.messages
          : []

        insertConversation.run(
          conversationId,
          ownerUserId,
          title,
          AGENT_SOURCE_TYPE,
          `${AGENT_SOURCE_TYPE}:conversation:${conversationId}`,
          'active',
          'local_user',
          JSON.stringify({}),
          JSON.stringify({
            migratedFromJsonStore: true,
            legacyOwnerId: legacyUserId,
          }),
          createdAt,
          updatedAt,
        )
        updateConversation.run(
          title,
          updatedAt,
          JSON.stringify({
            migratedFromJsonStore: true,
            legacyOwnerId: legacyUserId,
          }),
          ownerUserId,
          conversationId,
        )
        summary.conversations.imported += 1

        for (const message of messages) {
          const messageId = normalizeString(message?.id, crypto.randomUUID())

          insertMessage.run(
            messageId,
            conversationId,
            normalizeString(message?.role, 'assistant'),
            normalizeString(message?.content),
            normalizeString(message?.intent) || null,
            AGENT_SOURCE_TYPE,
            `${AGENT_SOURCE_TYPE}:message:${messageId}`,
            JSON.stringify(Array.isArray(message?.actions) ? message.actions : []),
            JSON.stringify(
              message?.artifacts && typeof message.artifacts === 'object'
                ? message.artifacts
                : {},
            ),
            JSON.stringify(
              Array.isArray(message?.toolCalls) ? message.toolCalls : [],
            ),
            JSON.stringify({
              migratedFromJsonStore: true,
            }),
            normalizeIsoDate(message?.createdAt, updatedAt),
          )
          summary.conversations.importedMessages += 1
        }
      }
    }
  })

  runImport()
}

function importRecommendationHistory(rawData, summary) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return
  }

  const insertRun = db.prepare(
    `
      INSERT OR IGNORE INTO recommendation_runs (
        id,
        owner_user_id,
        conversation_id,
        title,
        prompt,
        description,
        source_type,
        source_id,
        status,
        seed_summary_json,
        constraints_json,
        result_summary_json,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
  const insertItem = db.prepare(
    `
      INSERT OR IGNORE INTO recommendation_items (
        id,
        recommendation_run_id,
        position,
        source_type,
        source_id,
        title,
        artist_name,
        album_name,
        preview_url,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )

  const runImport = db.transaction(() => {
    for (const [legacyUserId, entries] of Object.entries(rawData)) {
      const ownerUserId = resolveOwnerUserId(legacyUserId)

      if (!ownerUserId) {
        summary.recommendations.skippedUsers.push(legacyUserId)
        continue
      }

      if (!Array.isArray(entries)) {
        continue
      }

      for (const entry of entries) {
        const recommendationRunId = normalizeString(entry?.id, crypto.randomUUID())
        const createdAt = normalizeIsoDate(entry?.createdAt)
        const tracks = Array.isArray(entry?.tracks) ? entry.tracks : []
        const conversationId = resolveOwnedConversationId(
          ownerUserId,
          entry?.conversationId,
        )

        insertRun.run(
          recommendationRunId,
          ownerUserId,
          conversationId,
          normalizeString(entry?.title, 'Untitled Recommendation'),
          normalizeString(entry?.prompt),
          normalizeString(entry?.description),
          AGENT_SOURCE_TYPE,
          `${AGENT_SOURCE_TYPE}:recommendation:${recommendationRunId}`,
          'ready',
          JSON.stringify(entry?.seeds && typeof entry.seeds === 'object' ? entry.seeds : {}),
          JSON.stringify({}),
          JSON.stringify({
            totalTracks: tracks.length,
            playableTracks: tracks.filter((track) =>
              Boolean(normalizeString(track?.previewUrl || track?.preview_url)),
            ).length,
          }),
          JSON.stringify({
            migratedFromJsonStore: true,
            legacyOwnerId: legacyUserId,
          }),
          createdAt,
          createdAt,
        )
        summary.recommendations.imported += 1

        tracks.forEach((track, index) => {
          const identifier = normalizeTrackIdentifier(track)
          const artists = normalizeArtists(track?.artists)
          const albumName =
            typeof track?.album === 'string'
              ? track.album
              : track?.album?.name || ''
          const previewUrl = normalizeString(track?.previewUrl || track?.preview_url)

          insertItem.run(
            crypto.randomUUID(),
            recommendationRunId,
            index,
            identifier.sourceType,
            identifier.sourceId,
            normalizeString(track?.name || track?.title, 'Unknown track'),
            artists.join(', '),
            albumName,
            previewUrl || null,
            JSON.stringify({
              ...track,
              id: identifier.id,
              image: normalizeString(track?.image || track?.image_url),
              durationMs: track?.durationMs ?? track?.duration_ms ?? null,
            }),
            createdAt,
          )
          summary.recommendations.importedItems += 1
        })
      }
    }
  })

  runImport()
}

function importFeedback(rawData, summary) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return
  }

  const insertFeedback = db.prepare(
    `
      INSERT OR IGNORE INTO feedback_events (
        id,
        owner_user_id,
        conversation_id,
        message_id,
        recommendation_run_id,
        event_type,
        source_type,
        source_id,
        note,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )

  const runImport = db.transaction(() => {
    for (const [legacyUserId, entries] of Object.entries(rawData)) {
      const ownerUserId = resolveOwnerUserId(legacyUserId)

      if (!ownerUserId) {
        summary.feedback.skippedUsers.push(legacyUserId)
        continue
      }

      if (!Array.isArray(entries)) {
        continue
      }

      for (const entry of entries) {
        const feedbackId = normalizeString(entry?.id, crypto.randomUUID())
        const originalConversationId = normalizeString(entry?.conversationId)
        const originalMessageId = normalizeString(entry?.messageId)
        const originalRecommendationId = normalizeString(entry?.recommendationId)

        insertFeedback.run(
          feedbackId,
          ownerUserId,
          resolveOwnedConversationId(ownerUserId, originalConversationId),
          resolveOwnedMessageId(ownerUserId, originalMessageId),
          resolveOwnedRecommendationRunId(ownerUserId, originalRecommendationId),
          normalizeString(entry?.feedback, 'like'),
          AGENT_SOURCE_TYPE,
          `${AGENT_SOURCE_TYPE}:feedback:${feedbackId}`,
          normalizeString(entry?.note),
          JSON.stringify({
            ...(entry?.metadata &&
            typeof entry.metadata === 'object' &&
            !Array.isArray(entry.metadata)
              ? entry.metadata
              : {}),
            migratedFromJsonStore: true,
            legacyOwnerId: legacyUserId,
            originalConversationId,
            originalMessageId,
            originalRecommendationId,
          }),
          normalizeIsoDate(entry?.createdAt),
        )
        summary.feedback.imported += 1
      }
    }
  })

  runImport()
}

function buildSummary() {
  return {
    conversations: {
      file: storeFiles.conversations,
      imported: 0,
      importedMessages: 0,
      skippedUsers: [],
    },
    recommendations: {
      file: storeFiles.recommendationHistory,
      imported: 0,
      importedItems: 0,
      skippedUsers: [],
    },
    feedback: {
      file: storeFiles.feedback,
      imported: 0,
      skippedUsers: [],
    },
  }
}

function printSummary(summary) {
  console.log('JSON store migration completed.')
  console.log(JSON.stringify(summary, null, 2))
}

function main() {
  migrateDatabase()

  const summary = buildSummary()
  const conversations = readJsonFile(storeFiles.conversations)
  const recommendationHistory = readJsonFile(storeFiles.recommendationHistory)
  const feedback = readJsonFile(storeFiles.feedback)

  importConversations(conversations, summary)
  importRecommendationHistory(recommendationHistory, summary)
  importFeedback(feedback, summary)

  printSummary(summary)
}

main()
