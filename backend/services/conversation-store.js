import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFilePath)
const dataDirectory = path.join(currentDirectory, '..', 'data')
const conversationsFilePath = path.join(dataDirectory, 'conversations.json')
const maxMessagesPerConversation = 100

let writeQueue = Promise.resolve()

async function ensureConversationsFile() {
  await mkdir(dataDirectory, { recursive: true })

  try {
    await readFile(conversationsFilePath, 'utf8')
  } catch {
    await writeFile(conversationsFilePath, JSON.stringify({}, null, 2))
  }
}

async function readConversationData() {
  await ensureConversationsFile()

  const raw = await readFile(conversationsFilePath, 'utf8')

  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function queueWrite(mutator) {
  writeQueue = writeQueue.then(async () => {
    const data = await readConversationData()
    const nextData = await mutator(data)
    await writeFile(conversationsFilePath, JSON.stringify(nextData, null, 2))
    return nextData
  })

  return writeQueue
}

function sanitizeMessage(message = {}) {
  return {
    id: message.id || crypto.randomUUID(),
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
    id: conversation.id || crypto.randomUUID(),
    title: conversation.title || 'New Conversation',
    createdAt: conversation.createdAt || new Date().toISOString(),
    updatedAt: conversation.updatedAt || new Date().toISOString(),
    messages: Array.isArray(conversation.messages)
      ? conversation.messages.map((message) => sanitizeMessage(message))
      : [],
  }
}

function getUserConversations(data, userId) {
  return Array.isArray(data[userId]) ? data[userId] : []
}

function sortConversations(conversations) {
  return [...conversations].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
}

export async function createConversation(userId, payload = {}) {
  const conversation = sanitizeConversation({
    id: payload.id,
    title: payload.title,
  })

  await queueWrite((data) => {
    const current = getUserConversations(data, userId)

    return {
      ...data,
      [userId]: sortConversations([conversation, ...current]),
    }
  })

  return conversation
}

export async function listConversations(userId, limit = 20) {
  const data = await readConversationData()
  const conversations = getUserConversations(data, userId)

  return sortConversations(conversations)
    .slice(0, limit)
    .map((conversation) => {
      const lastMessage = conversation.messages.at(-1)

      return {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
        lastMessagePreview: lastMessage?.content?.slice(0, 120) || '',
      }
    })
}

export async function getConversation(userId, conversationId) {
  const data = await readConversationData()
  const conversations = getUserConversations(data, userId)

  return conversations.find((conversation) => conversation.id === conversationId) || null
}

export async function appendConversationMessages(
  userId,
  conversationId,
  messages,
  options = {},
) {
  let updatedConversation = null

  await queueWrite((data) => {
    const current = getUserConversations(data, userId)
    const now = new Date().toISOString()
    const messageBatch = messages.map((message) => sanitizeMessage(message))
    const nextConversations = current.map((conversation) => sanitizeConversation(conversation))
    let target = nextConversations.find(
      (conversation) => conversation.id === conversationId,
    )

    if (!target) {
      target = sanitizeConversation({
        id: conversationId,
        title: options.title,
      })
      nextConversations.unshift(target)
    }

    if (
      options.title &&
      (!target.title ||
        target.title === 'New Conversation' ||
        target.messages.length === 0)
    ) {
      target.title = options.title
    }

    target.messages = [...target.messages, ...messageBatch].slice(
      -maxMessagesPerConversation,
    )
    target.updatedAt = now
    updatedConversation = target

    return {
      ...data,
      [userId]: sortConversations(nextConversations),
    }
  })

  return updatedConversation
}
