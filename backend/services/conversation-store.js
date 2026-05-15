import { assert } from '../utils/assert.js'
import { resolveLocalUserId } from './auth/resolve-local-user-id.js'
import {
  appendStoredConversationMessages,
  createStoredConversation,
  getStoredConversation,
  listStoredConversations,
} from './agent/agent-conversation-service.js'

function sanitizeMessage(message = {}) {
  return {
    id: message.id || '',
    role: message.role || 'assistant',
    content: message.content || '',
    intent: message.intent || null,
    actions: Array.isArray(message.actions) ? message.actions : [],
    artifacts: message.artifacts || null,
    toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
    createdAt: message.createdAt || new Date().toISOString(),
  }
}

function sanitizeConversation(conversation = {}) {
  return {
    id: conversation.id || '',
    title: conversation.title || 'New Conversation',
    createdAt: conversation.createdAt || '',
    updatedAt: conversation.updatedAt || '',
    messages: Array.isArray(conversation.messages)
      ? conversation.messages.map((message) => sanitizeMessage(message))
      : [],
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

function mapLegacyConversation(conversation) {
  if (!conversation) {
    return null
  }

  const normalizedConversation = sanitizeConversation(conversation)

  return {
    id: normalizedConversation.id,
    title: normalizedConversation.title,
    createdAt: normalizedConversation.createdAt,
    updatedAt: normalizedConversation.updatedAt,
    messages: normalizedConversation.messages,
  }
}

export async function createConversation(localUserIdOrLegacyUserId, payload = {}) {
  const localUserId = requireLocalUserId(localUserIdOrLegacyUserId)
  const conversation = createStoredConversation(localUserId, {
    id: payload.id,
    title: payload.title,
    mode: payload.mode,
    context: payload.context,
    metadata: payload.metadata,
  })

  return mapLegacyConversation(conversation)
}

export async function listConversations(localUserIdOrLegacyUserId, limit = 20) {
  const localUserId = requireLocalUserId(localUserIdOrLegacyUserId)
  return listStoredConversations(localUserId, limit)
}

export async function getConversation(
  localUserIdOrLegacyUserId,
  conversationId,
) {
  const localUserId = requireLocalUserId(localUserIdOrLegacyUserId)
  const conversation = getStoredConversation(localUserId, conversationId)

  return mapLegacyConversation(conversation)
}

export async function appendConversationMessages(
  localUserIdOrLegacyUserId,
  conversationId,
  messages,
  options = {},
) {
  const localUserId = requireLocalUserId(localUserIdOrLegacyUserId)
  const conversation = appendStoredConversationMessages(
    localUserId,
    conversationId,
    Array.isArray(messages) ? messages : [],
    options,
  )

  return mapLegacyConversation(conversation)
}
