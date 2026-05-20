import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAuth } from './AuthContext.jsx'

const AgentContext = createContext(null)
const DEFAULT_CONVERSATION_TITLE = 'New Conversation'

function createEmptyConversation() {
  return {
    id: '',
    title: '',
    createdAt: '',
    updatedAt: '',
    messages: [],
  }
}

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString()
}

function createLocalId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${prefix}-${crypto.randomUUID()}`
  }

  return `local-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeMessage(message = {}, index = 0) {
  const status =
    message.status === 'loading' || message.status === 'error'
      ? message.status
      : 'sent'

  return {
    id: normalizeString(message.id) || createLocalId(`message-${index}`),
    role: message.role === 'user' ? 'user' : 'assistant',
    content: normalizeString(message.content),
    intent: normalizeString(message.intent) || null,
    actions: Array.isArray(message.actions) ? message.actions : [],
    artifacts:
      message.artifacts && typeof message.artifacts === 'object'
        ? message.artifacts
        : {},
    toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
    createdAt: normalizeString(message.createdAt),
    status,
    error: normalizeString(message.error),
    metadata:
      message.metadata && typeof message.metadata === 'object'
        ? message.metadata
        : {},
    localOnly: message.localOnly === true,
  }
}

function normalizeMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((message, index) => ({
      ...normalizeMessage(message, index),
      _index: index,
    }))
    .sort((left, right) => {
      if (left.createdAt && right.createdAt) {
        const timestampComparison = left.createdAt.localeCompare(right.createdAt)

        if (timestampComparison !== 0) {
          return timestampComparison
        }
      }

      return left._index - right._index
    })
    .map(({ _index, ...message }) => message)
}

function normalizeConversation(conversation = {}) {
  const messages = normalizeMessages(conversation.messages)
  const createdAt = normalizeString(conversation.createdAt) || messages[0]?.createdAt || ''
  const updatedAt =
    normalizeString(conversation.updatedAt) || messages.at(-1)?.createdAt || createdAt

  return {
    id: normalizeString(conversation.id),
    title: normalizeString(conversation.title),
    createdAt,
    updatedAt,
    messages,
    temporary: conversation.temporary === true,
  }
}

function getFeedbackKey(entry = {}) {
  return entry.recommendationId || entry.messageId || ''
}

function getConversationPreview(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]

    if (message?.content) {
      return message.content.slice(0, 120)
    }

    if (message?.status === 'error' && message.error) {
      return message.error.slice(0, 120)
    }
  }

  return ''
}

function createConversationTitleFallback(message = '') {
  const trimmedMessage = normalizeString(message).trim()

  if (!trimmedMessage) {
    return DEFAULT_CONVERSATION_TITLE
  }

  return trimmedMessage.slice(0, 48)
}

function mapConversationSummary(conversation) {
  const normalizedConversation = normalizeConversation(conversation)

  return {
    id: normalizedConversation.id,
    title: normalizedConversation.title || DEFAULT_CONVERSATION_TITLE,
    createdAt: normalizedConversation.createdAt || '',
    updatedAt: normalizedConversation.updatedAt || '',
    messageCount: normalizedConversation.messages.length,
    lastMessagePreview: getConversationPreview(normalizedConversation.messages),
  }
}

function upsertConversationSummary(list, conversation) {
  const summary = mapConversationSummary(conversation)

  if (!summary.id) {
    return list
  }

  const nextItems = [summary, ...list.filter((item) => item.id !== summary.id)]

  return nextItems.sort((left, right) =>
    (right.updatedAt || '').localeCompare(left.updatedAt || ''),
  )
}

function mapFeedbackItems(items = []) {
  return items.reduce((accumulator, item) => {
    const key = getFeedbackKey(item)

    if (!key) {
      return accumulator
    }

    return {
      ...accumulator,
      [key]: item.feedback,
    }
  }, {})
}

export function AgentProvider({ children }) {
  const { isAuthenticated, request } = useAuth()
  const [conversations, setConversations] = useState([])
  const [currentConversation, setCurrentConversation] = useState(
    createEmptyConversation(),
  )
  const [feedbackMap, setFeedbackMap] = useState({})
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [error, setError] = useState('')

  const loadConversation = useCallback(
    async (conversationId) => {
      if (!conversationId) {
        setCurrentConversation(createEmptyConversation())
        return null
      }

      const data = await request(`/api/agent/conversations/${conversationId}`)
      const normalizedConversation = normalizeConversation(data.conversation)

      setCurrentConversation(normalizedConversation)
      setConversations((currentList) =>
        upsertConversationSummary(currentList, normalizedConversation),
      )

      return normalizedConversation
    },
    [request],
  )

  const startNewConversation = useCallback(() => {
    setCurrentConversation(createEmptyConversation())
    setError('')
  }, [])

  const refreshAgentState = useCallback(async () => {
    if (!isAuthenticated) {
      setConversations([])
      setFeedbackMap({})
      setCurrentConversation(createEmptyConversation())
      setIsBootstrapping(false)
      setError('')
      return
    }

    setIsBootstrapping(true)

    try {
      const [conversationData, feedbackData] = await Promise.all([
        request('/api/agent/conversations?limit=12'),
        request('/api/agent/feedback?limit=50'),
      ])

      const nextConversations = Array.isArray(conversationData.items)
        ? conversationData.items
        : []

      setConversations(nextConversations)
      setFeedbackMap(mapFeedbackItems(feedbackData.items || []))

      if (nextConversations[0]?.id) {
        await loadConversation(nextConversations[0].id)
      } else {
        setCurrentConversation(createEmptyConversation())
      }

      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsBootstrapping(false)
    }
  }, [isAuthenticated, loadConversation, request])

  const sendMessage = useCallback(
    async ({ message, context }) => {
      const trimmedMessage = String(message || '').trim()

      if (!trimmedMessage) {
        return null
      }

      const conversationId =
        currentConversation.id || createLocalId('conversation')
      const userMessage = normalizeMessage({
        id: createLocalId('user'),
        role: 'user',
        content: trimmedMessage,
        createdAt: nowIso(0),
        status: 'sent',
        localOnly: true,
      })
      const assistantPlaceholder = normalizeMessage({
        id: createLocalId('assistant'),
        role: 'assistant',
        content: '',
        createdAt: nowIso(1),
        status: 'loading',
        localOnly: true,
        metadata: {
          retryMessage: trimmedMessage,
        },
      })
      const optimisticConversation = normalizeConversation({
        ...currentConversation,
        id: conversationId,
        title:
          currentConversation.title &&
          currentConversation.title !== DEFAULT_CONVERSATION_TITLE
            ? currentConversation.title
            : createConversationTitleFallback(trimmedMessage),
        updatedAt: assistantPlaceholder.createdAt,
        messages: [
          ...normalizeMessages(currentConversation.messages),
          userMessage,
          assistantPlaceholder,
        ],
        temporary: !isAuthenticated,
      })

      setCurrentConversation(optimisticConversation)
      setConversations((currentList) =>
        isAuthenticated
          ? upsertConversationSummary(currentList, optimisticConversation)
          : currentList,
      )
      setError('')
      setIsSending(true)

      try {
        const data = await request('/api/agent/chat', {
          method: 'POST',
          body: {
            conversationId,
            title: optimisticConversation.title || undefined,
            message: trimmedMessage,
            context,
          },
        })
        const nextConversation = normalizeConversation(data.conversation)

        setCurrentConversation((activeConversation) =>
          activeConversation.id === conversationId
            ? nextConversation
            : activeConversation,
        )
        setConversations((currentList) =>
          isAuthenticated
            ? upsertConversationSummary(currentList, nextConversation)
            : currentList,
        )
        setError('')

        return {
          ...data,
          conversation: nextConversation,
        }
      } catch (err) {
        const failedConversation = normalizeConversation({
          ...optimisticConversation,
          messages: optimisticConversation.messages.map((messageItem) =>
            messageItem.id === assistantPlaceholder.id
              ? {
                  ...messageItem,
                  status: 'error',
                  error:
                    err.message || 'Agent response failed. Please try again later.',
                }
              : messageItem,
          ),
        })

        setCurrentConversation((activeConversation) =>
          activeConversation.id === conversationId
            ? failedConversation
            : activeConversation,
        )
        setConversations((currentList) =>
          isAuthenticated
            ? upsertConversationSummary(currentList, failedConversation)
            : currentList,
        )
        setError(err.message)
        throw err
      } finally {
        setIsSending(false)
      }
    },
    [currentConversation, isAuthenticated, request],
  )

  const submitFeedback = useCallback(
    async (payload) => {
      setIsSubmittingFeedback(true)

      try {
        const savedFeedback = await request('/api/agent/feedback', {
          method: 'POST',
          body: payload,
        })
        const key = getFeedbackKey(savedFeedback)

        if (key) {
          setFeedbackMap((currentMap) => ({
            ...currentMap,
            [key]: savedFeedback.feedback,
          }))
        }

        setError('')
        return savedFeedback
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setIsSubmittingFeedback(false)
      }
    },
    [request],
  )

  useEffect(() => {
    refreshAgentState()
  }, [refreshAgentState])

  const value = useMemo(
    () => ({
      conversations,
      currentConversation,
      error,
      feedbackMap,
      isBootstrapping,
      isSending,
      isSubmittingFeedback,
      loadConversation,
      refreshAgentState,
      sendMessage,
      startNewConversation,
      submitFeedback,
    }),
    [
      conversations,
      currentConversation,
      error,
      feedbackMap,
      isBootstrapping,
      isSending,
      isSubmittingFeedback,
      loadConversation,
      refreshAgentState,
      sendMessage,
      startNewConversation,
      submitFeedback,
    ],
  )

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

export function useAgent() {
  return useContext(AgentContext)
}
