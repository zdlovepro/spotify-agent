import crypto from 'crypto'
import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { optionalLocalUser } from '../middleware/optional-local-user.js'
import { optionalProviderLink } from '../middleware/optional-provider-link.js'
import { assert } from '../utils/assert.js'
import { runAgent } from '../services/agent/agent-service.js'
import {
  appendGuestConversationMessages,
  appendStoredConversationMessages,
  createGuestConversation,
  createStoredConversation,
  getGuestConversation,
  getStoredConversation,
  listStoredConversations,
} from '../services/agent/agent-conversation-service.js'
import {
  listStoredFeedback,
  saveStoredFeedback,
} from '../services/agent/agent-feedback-service.js'
import { parseInteger } from '../services/spotify-api.js'

const router = Router()

function sanitizeContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return {}
  }

  return {
    currentTrackId:
      typeof context.currentTrackId === 'string' ? context.currentTrackId : '',
    currentPlaylistId:
      typeof context.currentPlaylistId === 'string' ? context.currentPlaylistId : '',
    playerState: typeof context.playerState === 'string' ? context.playerState : '',
  }
}

function buildUserMessage(content) {
  return {
    role: 'user',
    content,
  }
}

function buildAssistantMessage(result) {
  return {
    role: 'assistant',
    content: result.reply,
    intent: result.intent,
    actions: result.actions,
    artifacts: result.artifacts,
    toolCalls: result.toolCalls,
  }
}

function resolveAgentMode(req) {
  if (req.localUserId && req.isSpotifyEnhanced) {
    return 'spotify_enhanced'
  }

  if (req.localUserId) {
    return 'local_user'
  }

  return 'guest'
}

function buildGuestFeedbackEntry(payload = {}) {
  return {
    id: `guest-feedback-${crypto.randomUUID()}`,
    feedback: payload.feedback,
    conversationId: payload.conversationId || '',
    messageId: payload.messageId || '',
    recommendationId: payload.recommendationId || '',
    note: payload.note || '',
    metadata:
      payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    createdAt: new Date().toISOString(),
    temporary: true,
  }
}

function buildGuestUser() {
  return {
    id: 'guest',
    displayName: 'Guest',
  }
}

router.use(optionalLocalUser)
router.use(optionalProviderLink)

router.get(
  '/feedback',
  asyncHandler(async (req, res) => {
    const limit = parseInteger(req.query.limit, 20, { min: 1, max: 50 })

    if (!req.localUserId) {
      return res.json({
        mode: 'guest',
        userId: null,
        total: 0,
        items: [],
      })
    }

    const feedbackItems = listStoredFeedback(req.localUserId, limit)

    res.json({
      mode: resolveAgentMode(req),
      userId: req.localUserId,
      total: feedbackItems.length,
      items: feedbackItems,
    })
  }),
)

router.post(
  '/feedback',
  asyncHandler(async (req, res) => {
    const feedback =
      typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : ''
    const conversationId =
      typeof req.body?.conversationId === 'string'
        ? req.body.conversationId.trim()
        : ''
    const messageId =
      typeof req.body?.messageId === 'string' ? req.body.messageId.trim() : ''
    const recommendationId =
      typeof req.body?.recommendationId === 'string'
        ? req.body.recommendationId.trim()
        : ''
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : ''

    assert(feedback === 'like' || feedback === 'dislike', 'feedback must be like or dislike')
    assert(
      recommendationId || messageId,
      'recommendationId or messageId is required',
    )
    assert(
      !req.body?.metadata ||
        (typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)),
      'metadata must be an object when provided',
    )

    if (!req.localUserId) {
      return res.status(201).json(
        buildGuestFeedbackEntry({
          feedback,
          conversationId,
          messageId,
          recommendationId,
          note,
          metadata: req.body?.metadata || {},
        }),
      )
    }

    const entry = saveStoredFeedback(req.localUserId, {
      feedback,
      conversationId,
      messageId,
      recommendationId,
      note,
      metadata: req.body?.metadata || {},
    })

    res.status(201).json(entry)
  }),
)

router.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const limit = parseInteger(req.query.limit, 20, { min: 1, max: 50 })

    if (!req.localUserId) {
      return res.json({
        mode: 'guest',
        userId: null,
        total: 0,
        items: [],
      })
    }

    const conversations = listStoredConversations(req.localUserId, limit)

    res.json({
      mode: resolveAgentMode(req),
      userId: req.localUserId,
      total: conversations.length,
      items: conversations,
    })
  }),
)

router.post(
  '/conversations',
  asyncHandler(async (req, res) => {
    const title =
      typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const mode = resolveAgentMode(req)

    if (!req.localUserId) {
      const conversation = createGuestConversation({
        title,
        context: sanitizeContext(req.body?.context),
        metadata: {
          mode,
        },
      })

      return res.status(201).json({
        conversation,
      })
    }

    const conversation = createStoredConversation(req.localUserId, {
      title,
      mode,
      context: sanitizeContext(req.body?.context),
      metadata: {
        providerNames: Object.keys(req.providerLinks || {}),
      },
    })

    res.status(201).json({
      conversation,
    })
  }),
)

router.get(
  '/conversations/:conversationId',
  asyncHandler(async (req, res) => {
    const conversation = req.localUserId
      ? getStoredConversation(req.localUserId, req.params.conversationId)
      : getGuestConversation(req.params.conversationId)

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    res.json({
      conversation,
    })
  }),
)

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const message =
      typeof req.body?.message === 'string' ? req.body.message.trim() : ''
    const requestedConversationId =
      typeof req.body?.conversationId === 'string'
        ? req.body.conversationId.trim()
        : ''
    const requestedTitle =
      typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const context = sanitizeContext(req.body?.context)
    const mode = resolveAgentMode(req)

    assert(message, 'message is required')
    assert(
      !req.body?.context ||
        (typeof req.body.context === 'object' && !Array.isArray(req.body.context)),
      'context must be an object when provided',
    )

    let conversation = req.localUserId
      ? requestedConversationId
        ? getStoredConversation(req.localUserId, requestedConversationId)
        : null
      : requestedConversationId
        ? getGuestConversation(requestedConversationId)
        : null

    if (!conversation) {
      conversation = req.localUserId
        ? createStoredConversation(req.localUserId, {
            id: requestedConversationId || undefined,
            title: requestedTitle,
            mode,
            context,
            metadata: {
              providerNames: Object.keys(req.providerLinks || {}),
            },
          })
        : createGuestConversation({
            id: requestedConversationId || undefined,
            title: requestedTitle,
            context,
            metadata: {
              mode,
            },
          })
    }

    const agentResult = await runAgent({
      mode,
      localUserId: req.localUserId,
      localSessionToken: req.localSessionToken || '',
      providerLinks: req.providerLinks || {},
      message,
      context,
      conversationId: conversation.id,
      conversation,
    })

    const nextMessages = [buildUserMessage(message), buildAssistantMessage(agentResult)]
    const updatedConversation = req.localUserId
      ? appendStoredConversationMessages(
          req.localUserId,
          conversation.id,
          nextMessages,
          {
            title: requestedTitle || agentResult.conversationTitle,
            mode,
            context,
            metadata: {
              providerNames: Object.keys(req.providerLinks || {}),
            },
          },
        )
      : appendGuestConversationMessages(conversation.id, nextMessages, {
          title: requestedTitle || agentResult.conversationTitle,
          context,
          metadata: {
            mode,
          },
        })

    res.json({
      conversation: updatedConversation,
      assistant: {
        reply: agentResult.reply,
        intent: agentResult.intent,
        confidence: agentResult.confidence,
        actions: agentResult.actions,
        artifacts: agentResult.artifacts,
        toolCalls: agentResult.toolCalls,
        memoryProfile: agentResult.memoryProfile,
      },
      user: req.localUser
        ? {
            id: req.localUser.id,
            displayName: req.localUser.displayName || req.localUser.email || '',
          }
        : buildGuestUser(),
      mode,
    })
  }),
)

export default router
