import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { attachSpotifyProfile } from '../middleware/attach-spotify-profile.js'
import { requireSpotifyAccessToken } from '../middleware/require-spotify-access-token.js'
import { assert } from '../utils/assert.js'
import { runAgent } from '../services/agent/agent-service.js'
import {
  listAgentFeedback,
  saveAgentFeedback,
} from '../services/agent-feedback-store.js'
import {
  appendConversationMessages,
  createConversation,
  getConversation,
  listConversations,
} from '../services/conversation-store.js'
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

function mapConversationSummary(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: Array.isArray(conversation.messages)
      ? conversation.messages.length
      : 0,
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

router.use(requireSpotifyAccessToken)
router.use(attachSpotifyProfile)

router.get(
  '/feedback',
  asyncHandler(async (req, res) => {
    const limit = parseInteger(req.query.limit, 20, { min: 1, max: 50 })
    const feedbackItems = await listAgentFeedback(req.spotifyUserId, limit)

    res.json({
      userId: req.spotifyUserId,
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

    const entry = await saveAgentFeedback(req.spotifyUserId, {
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
    const conversations = await listConversations(req.spotifyUserId, limit)

    res.json({
      userId: req.spotifyUserId,
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

    const conversation = await createConversation(req.spotifyUserId, {
      title,
    })

    res.status(201).json({
      conversation: mapConversationSummary(conversation),
    })
  }),
)

router.get(
  '/conversations/:conversationId',
  asyncHandler(async (req, res) => {
    const conversation = await getConversation(
      req.spotifyUserId,
      req.params.conversationId,
    )

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

    assert(message, 'message is required')
    assert(
      !req.body?.context ||
        (typeof req.body.context === 'object' && !Array.isArray(req.body.context)),
      'context must be an object when provided',
    )

    let conversation =
      requestedConversationId
        ? await getConversation(req.spotifyUserId, requestedConversationId)
        : null

    if (!conversation) {
      conversation = await createConversation(req.spotifyUserId, {
        id: requestedConversationId || undefined,
        title: requestedTitle,
      })
    }

    const agentResult = await runAgent({
      accessToken: req.accessToken,
      userId: req.spotifyUserId,
      message,
      context: sanitizeContext(req.body?.context),
    })

    const updatedConversation = await appendConversationMessages(
      req.spotifyUserId,
      conversation.id,
      [buildUserMessage(message), buildAssistantMessage(agentResult)],
      {
        title: requestedTitle || agentResult.conversationTitle,
      },
    )

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
      user: {
        id: req.spotifyUserId,
        displayName: req.spotifyProfile?.display_name || '',
      },
    })
  }),
)

export default router
