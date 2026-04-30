import crypto from 'crypto'
import db from '../../db/index.js'
import { assert } from '../../utils/assert.js'

const AGENT_SOURCE_TYPE = 'agentmusic'
const DEFAULT_CONVERSATION_TITLE = 'New Conversation'
const MAX_MESSAGES_PER_CONVERSATION = 100
const GUEST_CONVERSATION_TTL_MS = 60 * 60 * 1000

const guestConversationStore = new Map()

function nowIso() {
  return new Date().toISOString()
}

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

function createConversationSourceId(conversationId) {
  return `${AGENT_SOURCE_TYPE}:conversation:${conversationId}`
}

function createMessageSourceId(messageId) {
  return `${AGENT_SOURCE_TYPE}:message:${messageId}`
}

function normalizeTitle(title) {
  return typeof title === 'string' && title.trim()
    ? title.trim()
    : DEFAULT_CONVERSATION_TITLE
}

function sanitizeMessage(message = {}) {
  return {
    id: message.id || crypto.randomUUID(),
    role: message.role === 'user' ? 'user' : 'assistant',
    content: typeof message.content === 'string' ? message.content : '',
    intent: typeof message.intent === 'string' ? message.intent : null,
    actions: Array.isArray(message.actions) ? message.actions : [],
    artifacts:
      message.artifacts && typeof message.artifacts === 'object'
        ? message.artifacts
        : {},
    toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
    createdAt:
      typeof message.createdAt === 'string' && message.createdAt
        ? message.createdAt
        : nowIso(),
  }
}

function mapMessageRow(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    role: row.role,
    content: row.content,
    intent: row.intent,
    actions: parseJson(row.actions_json, []),
    artifacts: parseJson(row.artifacts_json, {}),
    toolCalls: parseJson(row.tool_calls_json, []),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
  }
}

function mapConversationRow(row, messages = []) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    sourceType: row.source_type,
    sourceId: row.source_id,
    status: row.status,
    mode: row.mode,
    context: parseJson(row.context_json, {}),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  }
}

function loadConversationMessages(conversationId) {
  const rows = db
    .prepare(
      `
        SELECT *
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC, id ASC
      `,
    )
    .all(conversationId)

  return rows.map(mapMessageRow)
}

function pruneGuestConversations() {
  const now = Date.now()

  for (const [conversationId, entry] of guestConversationStore.entries()) {
    if (entry.expiresAt <= now) {
      guestConversationStore.delete(conversationId)
    }
  }
}

function mapGuestConversation(conversation) {
  return {
    ...conversation,
    temporary: true,
  }
}

export function createStoredConversation(ownerUserId, payload = {}) {
  assert(ownerUserId, 'local user is required', 401)

  const existingConversation =
    payload.id && getStoredConversation(ownerUserId, payload.id)

  if (existingConversation) {
    return existingConversation
  }

  const id = payload.id || crypto.randomUUID()
  const now = nowIso()

  db.prepare(
    `
      INSERT INTO conversations (
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
  ).run(
    id,
    ownerUserId,
    normalizeTitle(payload.title),
    AGENT_SOURCE_TYPE,
    createConversationSourceId(id),
    'active',
    payload.mode || 'local_user',
    JSON.stringify(payload.context || {}),
    JSON.stringify(payload.metadata || {}),
    now,
    now,
  )

  return getStoredConversation(ownerUserId, id)
}

export function listStoredConversations(ownerUserId, limit = 20) {
  assert(ownerUserId, 'local user is required', 401)

  const rows = db
    .prepare(
      `
        SELECT
          c.*,
          (
            SELECT COUNT(1)
            FROM messages m
            WHERE m.conversation_id = c.id
          ) AS message_count,
          (
            SELECT m.content
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT 1
          ) AS last_message_content
        FROM conversations c
        WHERE c.owner_user_id = ?
        ORDER BY c.updated_at DESC, c.created_at DESC
        LIMIT ?
      `,
    )
    .all(ownerUserId, limit)

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count || 0,
    lastMessagePreview: (row.last_message_content || '').slice(0, 120),
    mode: row.mode,
  }))
}

export function getStoredConversation(ownerUserId, conversationId) {
  assert(ownerUserId, 'local user is required', 401)

  const row = db
    .prepare(
      `
        SELECT *
        FROM conversations
        WHERE owner_user_id = ?
          AND id = ?
        LIMIT 1
      `,
    )
    .get(ownerUserId, conversationId)

  if (!row) {
    return null
  }

  return mapConversationRow(row, loadConversationMessages(conversationId))
}

export function appendStoredConversationMessages(
  ownerUserId,
  conversationId,
  messages,
  options = {},
) {
  assert(ownerUserId, 'local user is required', 401)

  const existingConversation =
    getStoredConversation(ownerUserId, conversationId) ||
    createStoredConversation(ownerUserId, {
      id: conversationId,
      title: options.title,
      mode: options.mode,
      context: options.context,
      metadata: options.metadata,
    })

  const messageBatch = Array.isArray(messages)
    ? messages.map((message) => sanitizeMessage(message))
    : []
  const nextTitle =
    options.title &&
    (!existingConversation.title ||
      existingConversation.title === DEFAULT_CONVERSATION_TITLE ||
      existingConversation.messages.length === 0)
      ? options.title
      : existingConversation.title
  const nextContext =
    options.context && typeof options.context === 'object' ? options.context : existingConversation.context
  const nextMetadata =
    options.metadata && typeof options.metadata === 'object'
      ? { ...(existingConversation.metadata || {}), ...options.metadata }
      : existingConversation.metadata
  const nextMode = options.mode || existingConversation.mode || 'local_user'
  const updatedAt = nowIso()

  const writeBatch = db.transaction(() => {
    for (const message of messageBatch) {
      db.prepare(
        `
          INSERT INTO messages (
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
      ).run(
        message.id,
        conversationId,
        message.role,
        message.content,
        message.intent,
        AGENT_SOURCE_TYPE,
        createMessageSourceId(message.id),
        JSON.stringify(message.actions),
        JSON.stringify(message.artifacts || {}),
        JSON.stringify(message.toolCalls || []),
        JSON.stringify(message.metadata || {}),
        message.createdAt,
      )
    }

    db.prepare(
      `
        UPDATE conversations
        SET title = ?,
            mode = ?,
            context_json = ?,
            metadata_json = ?,
            updated_at = ?
        WHERE owner_user_id = ?
          AND id = ?
      `,
    ).run(
      normalizeTitle(nextTitle),
      nextMode,
      JSON.stringify(nextContext || {}),
      JSON.stringify(nextMetadata || {}),
      updatedAt,
      ownerUserId,
      conversationId,
    )

    const overflowRows = db
      .prepare(
        `
          SELECT id
          FROM messages
          WHERE conversation_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT -1 OFFSET ?
        `,
      )
      .all(conversationId, MAX_MESSAGES_PER_CONVERSATION)

    if (overflowRows.length > 0) {
      const deleteStatement = db.prepare(
        `
          DELETE FROM messages
          WHERE id = ?
        `,
      )

      for (const row of overflowRows) {
        deleteStatement.run(row.id)
      }
    }
  })

  writeBatch()
  return getStoredConversation(ownerUserId, conversationId)
}

export function createGuestConversation(payload = {}) {
  pruneGuestConversations()

  const id = payload.id || `guest-${crypto.randomUUID()}`
  const conversation = {
    id,
    ownerUserId: null,
    title: normalizeTitle(payload.title),
    sourceType: AGENT_SOURCE_TYPE,
    sourceId: createConversationSourceId(id),
    status: 'active',
    mode: 'guest',
    context:
      payload.context && typeof payload.context === 'object' ? payload.context : {},
    metadata:
      payload.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [],
  }

  guestConversationStore.set(id, {
    conversation,
    expiresAt: Date.now() + GUEST_CONVERSATION_TTL_MS,
  })

  return mapGuestConversation(conversation)
}

export function getGuestConversation(conversationId) {
  pruneGuestConversations()

  const entry = guestConversationStore.get(conversationId)

  if (!entry) {
    return null
  }

  return mapGuestConversation(entry.conversation)
}

export function appendGuestConversationMessages(
  conversationId,
  messages,
  options = {},
) {
  pruneGuestConversations()

  const existingConversation =
    getGuestConversation(conversationId) ||
    createGuestConversation({
      id: conversationId,
      title: options.title,
      context: options.context,
      metadata: options.metadata,
    })
  const messageBatch = Array.isArray(messages)
    ? messages.map((message) => sanitizeMessage(message))
    : []
  const nextTitle =
    options.title &&
    (!existingConversation.title ||
      existingConversation.title === DEFAULT_CONVERSATION_TITLE ||
      existingConversation.messages.length === 0)
      ? options.title
      : existingConversation.title
  const nextConversation = {
    ...existingConversation,
    title: normalizeTitle(nextTitle),
    mode: 'guest',
    context:
      options.context && typeof options.context === 'object'
        ? options.context
        : existingConversation.context,
    metadata:
      options.metadata && typeof options.metadata === 'object'
        ? { ...(existingConversation.metadata || {}), ...options.metadata }
        : existingConversation.metadata,
    updatedAt: nowIso(),
    messages: [...existingConversation.messages, ...messageBatch].slice(
      -MAX_MESSAGES_PER_CONVERSATION,
    ),
  }

  guestConversationStore.set(nextConversation.id, {
    conversation: nextConversation,
    expiresAt: Date.now() + GUEST_CONVERSATION_TTL_MS,
  })

  return mapGuestConversation(nextConversation)
}

export default {
  createStoredConversation,
  listStoredConversations,
  getStoredConversation,
  appendStoredConversationMessages,
  createGuestConversation,
  getGuestConversation,
  appendGuestConversationMessages,
}
