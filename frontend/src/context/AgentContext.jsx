import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useSpotify } from './SpotifyContext.jsx'

const AgentContext = createContext(null)

function createEmptyConversation() {
  return {
    id: '',
    title: '',
    createdAt: '',
    updatedAt: '',
    messages: [],
  }
}

function getFeedbackKey(entry = {}) {
  return entry.recommendationId || entry.messageId || ''
}

function mapConversationSummary(conversation) {
  const lastMessage = conversation.messages?.at(-1)

  return {
    id: conversation.id,
    title: conversation.title || 'New Conversation',
    createdAt: conversation.createdAt || '',
    updatedAt: conversation.updatedAt || '',
    messageCount: Array.isArray(conversation.messages)
      ? conversation.messages.length
      : conversation.messageCount || 0,
    lastMessagePreview:
      lastMessage?.content?.slice(0, 120) || conversation.lastMessagePreview || '',
  }
}

function upsertConversationSummary(list, conversation) {
  const summary = mapConversationSummary(conversation)
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
  const { isAuthenticated, request } = useSpotify()
  const [conversations, setConversations] = useState([])
  const [currentConversation, setCurrentConversation] = useState(
    createEmptyConversation(),
  )
  const [feedbackMap, setFeedbackMap] = useState({})
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [error, setError] = useState('')

  const resetState = useCallback(() => {
    setConversations([])
    setCurrentConversation(createEmptyConversation())
    setFeedbackMap({})
    setIsBootstrapping(false)
    setIsSending(false)
    setIsSubmittingFeedback(false)
    setError('')
  }, [])

  const loadConversation = useCallback(
    async (conversationId) => {
      if (!conversationId) {
        setCurrentConversation(createEmptyConversation())
        return null
      }

      const data = await request(`/api/agent/conversations/${conversationId}`)

      setCurrentConversation(data.conversation)
      setConversations((currentList) =>
        upsertConversationSummary(currentList, data.conversation),
      )

      return data.conversation
    },
    [request],
  )

  const startNewConversation = useCallback(() => {
    setCurrentConversation(createEmptyConversation())
    setError('')
  }, [])

  const refreshAgentState = useCallback(async () => {
    if (!isAuthenticated) {
      resetState()
      return
    }

    setIsBootstrapping(true)

    try {
      const [conversationData, feedbackData] = await Promise.all([
        request('/api/agent/conversations?limit=12'),
        request('/api/agent/feedback?limit=50'),
      ])

      const nextConversations = conversationData.items || []

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
  }, [isAuthenticated, loadConversation, request, resetState])

  const sendMessage = useCallback(
    async ({ message, context }) => {
      const trimmedMessage = String(message || '').trim()

      if (!trimmedMessage) {
        return null
      }

      setIsSending(true)

      try {
        const data = await request('/api/agent/chat', {
          method: 'POST',
          body: {
            conversationId: currentConversation.id || undefined,
            message: trimmedMessage,
            context,
          },
        })

        setCurrentConversation(data.conversation)
        setConversations((currentList) =>
          upsertConversationSummary(currentList, data.conversation),
        )
        setError('')

        return data
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setIsSending(false)
      }
    },
    [currentConversation.id, request],
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
