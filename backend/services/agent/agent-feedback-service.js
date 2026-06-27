import crypto from 'crypto'
import db from '../../db/index.js'
import { assert } from '../../utils/assert.js'

const AGENT_SOURCE_TYPE = 'agentmusic'

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

function createFeedbackSourceId(feedbackId) {
  return `${AGENT_SOURCE_TYPE}:feedback:${feedbackId}`
}

function resolveConversationId(ownerUserId, conversationId) {
  if (!conversationId) {
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
      .get(ownerUserId, conversationId)?.id || null
  )
}

function resolveMessageId(ownerUserId, messageId) {
  if (!messageId) {
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
      .get(ownerUserId, messageId)?.id || null
  )
}

function resolveRecommendationRunId(ownerUserId, recommendationRunId) {
  if (!recommendationRunId) {
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
      .get(ownerUserId, recommendationRunId)?.id || null
  )
}

function mapFeedbackRow(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    feedback: row.event_type,
    conversationId: row.conversation_id || '',
    messageId: row.message_id || '',
    recommendationId: row.recommendation_run_id || '',
    note: row.note || '',
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
  }
}

export function listStoredFeedback(ownerUserId, limit = 20) {
  assert(ownerUserId, 'local user is required', 401)

  const rows = db
    .prepare(
      `
        SELECT *
        FROM feedback_events
        WHERE owner_user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `,
    )
    .all(ownerUserId, limit)

  return rows.map(mapFeedbackRow)
}

export function saveStoredFeedback(ownerUserId, payload = {}) {
  assert(ownerUserId, 'local user is required', 401)
  assert(
    payload.feedback === 'like' || payload.feedback === 'dislike',
    'feedback must be like or dislike',
  )

  const id = crypto.randomUUID()
  const conversationId = resolveConversationId(ownerUserId, payload.conversationId)
  const messageId = resolveMessageId(ownerUserId, payload.messageId)
  const recommendationRunId = resolveRecommendationRunId(
    ownerUserId,
    payload.recommendationId,
  )
  const metadata =
    payload.metadata && typeof payload.metadata === 'object'
      ? {
          ...payload.metadata,
          originalConversationId: payload.conversationId || '',
          originalMessageId: payload.messageId || '',
          originalRecommendationId: payload.recommendationId || '',
        }
      : {
          originalConversationId: payload.conversationId || '',
          originalMessageId: payload.messageId || '',
          originalRecommendationId: payload.recommendationId || '',
        }

  db.prepare(
    `
      INSERT INTO feedback_events (
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
  ).run(
    id,
    ownerUserId,
    conversationId,
    messageId,
    recommendationRunId,
    payload.feedback,
    AGENT_SOURCE_TYPE,
    createFeedbackSourceId(id),
    typeof payload.note === 'string' ? payload.note.trim() : '',
    JSON.stringify(metadata),
    new Date().toISOString(),
  )

  const row = db
    .prepare(
      `
        SELECT *
        FROM feedback_events
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(id)

  return mapFeedbackRow(row)
}

export default {
  listStoredFeedback,
  saveStoredFeedback,
}
