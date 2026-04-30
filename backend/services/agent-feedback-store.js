import { assert } from '../utils/assert.js'
import { resolveLocalUserId } from './auth/resolve-local-user-id.js'
import {
  listStoredFeedback,
  saveStoredFeedback,
} from './agent/agent-feedback-service.js'

function sanitizeFeedbackEntry(entry = {}) {
  return {
    id: entry.id || '',
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

function requireLocalUserId(localUserIdOrLegacyUserId) {
  const resolvedLocalUserId = resolveLocalUserId(localUserIdOrLegacyUserId)

  assert(
    resolvedLocalUserId,
    'localUserId is required; legacy spotifyUserId callers must be mapped to a local account first',
    401,
  )

  return resolvedLocalUserId
}

export async function listAgentFeedback(localUserIdOrLegacyUserId, limit = 20) {
  const localUserId = requireLocalUserId(localUserIdOrLegacyUserId)
  const entries = listStoredFeedback(localUserId, limit)

  return entries.map((entry) => sanitizeFeedbackEntry(entry))
}

export async function saveAgentFeedback(localUserIdOrLegacyUserId, payload) {
  const localUserId = requireLocalUserId(localUserIdOrLegacyUserId)
  const entry = saveStoredFeedback(localUserId, payload)

  return sanitizeFeedbackEntry(entry)
}
