import {
  createDeepSeekChatCompletion,
  isDeepSeekConfigured,
} from '../llm/deepseek-client.js'

const VALID_INTENTS = new Set([
  'chat',
  'search_music',
  'recommend_music',
  'play_music',
  'play_local_audio',
  'play_spotify',
  'control_player',
  'create_playlist',
  'import_spotify_library',
])

const VALID_PLAYER_ACTIONS = new Set([
  'player.play_local',
  'player.play_spotify',
  'player.play',
  'player.pause',
  'player.next',
  'player.previous',
  'player.append_queue',
  'player.replace_queue',
  'player.unavailable',
])

const TOOL_DESCRIPTIONS = {
  'catalog.search': 'Search public Spotify catalog metadata.',
  'catalog.get_track': 'Fetch track details by id.',
  'catalog.get_artist': 'Fetch artist details by id.',
  'catalog.get_album': 'Fetch album details by id.',
  'catalog.get_playlist': 'Fetch playlist details by id.',
  'catalog.get_recommendations': 'Fetch public Spotify recommendations.',
  'library.list_favorites': 'List local account favorites.',
  'library.list_playlists': 'List local account playlists.',
  'library.search_local_audio': 'Search uploaded local audio assets.',
  'library.create_playlist': 'Create a local playlist.',
  'library.add_playlist_item': 'Add an item to a local playlist.',
  'library.save_favorite': 'Save a track as a local favorite.',
  'memory.get_user_profile': 'Load the local user taste profile.',
  'history.save_recommendation': 'Persist a recommendation run for local users.',
  'provider.spotify.get_top_tracks': 'Load Spotify top tracks for connected users.',
  'provider.spotify.get_top_artists': 'Load Spotify top artists for connected users.',
  'provider.spotify.import_playlists': 'Import all Spotify playlists into AgentMusic.',
  'provider.spotify.import_playlist': 'Import one Spotify playlist into AgentMusic.',
  'provider.spotify.sync_saved_tracks': 'Sync Spotify saved tracks into local favorites.',
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stripCodeFences(input = '') {
  const trimmed = String(input || '').trim()

  if (!trimmed.startsWith('```')) {
    return trimmed
  }

  return trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
}

function extractJsonString(input = '') {
  const cleaned = stripCodeFences(input)

  try {
    JSON.parse(cleaned)
    return cleaned
  } catch {
    const startIndex = cleaned.indexOf('{')
    const endIndex = cleaned.lastIndexOf('}')

    if (startIndex >= 0 && endIndex > startIndex) {
      return cleaned.slice(startIndex, endIndex + 1)
    }

    return cleaned
  }
}

function assertString(value, fieldName, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`)
  }

  const trimmed = value.trim()

  if (!allowEmpty && !trimmed) {
    throw new Error(`${fieldName} must not be empty`)
  }

  return trimmed
}

function sanitizeToolPlan(toolPlan, availableTools) {
  if (!Array.isArray(toolPlan)) {
    throw new Error('toolPlan must be an array')
  }

  return toolPlan.map((step, index) => {
    if (!isPlainObject(step)) {
      throw new Error(`toolPlan[${index}] must be an object`)
    }

    const tool = assertString(step.tool, `toolPlan[${index}].tool`)

    if (!availableTools.has(tool)) {
      throw new Error(`toolPlan[${index}].tool is not allowed: ${tool}`)
    }

    if (!isPlainObject(step.args || {})) {
      throw new Error(`toolPlan[${index}].args must be an object`)
    }

    return {
      tool,
      args: step.args || {},
    }
  })
}

function sanitizePlayerActions(playerActions) {
  if (!Array.isArray(playerActions)) {
    throw new Error('playerActions must be an array')
  }

  return playerActions.map((action, index) => {
    if (!isPlainObject(action)) {
      throw new Error(`playerActions[${index}] must be an object`)
    }

    const type = assertString(action.type, `playerActions[${index}].type`)

    if (!VALID_PLAYER_ACTIONS.has(type)) {
      throw new Error(`playerActions[${index}].type is not allowed: ${type}`)
    }

    if (!isPlainObject(action.payload || {})) {
      throw new Error(`playerActions[${index}].payload must be an object`)
    }

    return {
      type,
      payload: action.payload || {},
    }
  })
}

function sanitizeMemoryWriteback(memoryWriteback) {
  if (!isPlainObject(memoryWriteback || {})) {
    throw new Error('memoryWriteback must be an object')
  }

  const preferences = Array.isArray(memoryWriteback.preferences)
    ? memoryWriteback.preferences
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : []

  return {
    summary:
      typeof memoryWriteback.summary === 'string'
        ? memoryWriteback.summary.trim()
        : '',
    preferences,
  }
}

function validatePlannerOutput(output, availableTools) {
  if (!isPlainObject(output)) {
    throw new Error('planner output must be an object')
  }

  const intent = assertString(output.intent, 'intent')

  if (!VALID_INTENTS.has(intent)) {
    throw new Error(`intent is not allowed: ${intent}`)
  }

  return {
    intent,
    reply: assertString(output.reply, 'reply', { allowEmpty: true }),
    toolPlan: sanitizeToolPlan(output.toolPlan || [], availableTools),
    playerActions: sanitizePlayerActions(output.playerActions || []),
    memoryWriteback: sanitizeMemoryWriteback(output.memoryWriteback || {}),
  }
}

function buildPlannerSystemPrompt() {
  return [
    'You are the DeepSeek planner for AgentMusic.',
    'Return JSON only. Do not wrap it in Markdown.',
    'Choose one intent and a safe tool plan from the allowed tool list.',
    'Never generate SQL, shell commands, filesystem paths, arbitrary URLs, or code execution steps.',
    'Never invent tools that are not listed.',
    'Spotify is an external music platform, not the main account system.',
    'local_audio means uploaded local m4a/mp3 that can be fully played in AgentMusic.',
    'spotify_remote means full playback through Spotify after authorization.',
    'preview is compatibility only and must not be the main playback target.',
    'If the user is not logged in, avoid local library tools.',
    'If Spotify is not connected, avoid provider.spotify.* tools and avoid play_spotify intent.',
    'Reply in the same language as the user when possible.',
  ].join(' ')
}

function buildPlannerUserPrompt(input) {
  return JSON.stringify(
    {
      instructions: {
        outputSchema: {
          intent:
            'chat | search_music | recommend_music | play_music | play_local_audio | play_spotify | control_player | create_playlist | import_spotify_library',
          reply: 'string',
          toolPlan: [{ tool: 'tool.name', args: {} }],
          playerActions: [{ type: 'player.action', payload: {} }],
          memoryWriteback: {
            summary: 'string',
            preferences: ['string'],
          },
        },
        allowedPlayerActionTypes: [...VALID_PLAYER_ACTIONS],
      },
      plannerInput: input,
    },
    null,
    2,
  )
}

function getMessageContent(completion) {
  return completion?.choices?.[0]?.message?.content || ''
}

export async function planAgentWithDeepSeek(plannerInput) {
  if (!isDeepSeekConfigured()) {
    return null
  }

  const availableTools = new Set(
    (Array.isArray(plannerInput?.availableTools) ? plannerInput.availableTools : [])
      .map((tool) => {
        if (typeof tool === 'string') {
          return tool
        }

        return typeof tool?.name === 'string' ? tool.name : ''
      })
      .filter(Boolean),
  )

  const completion = await createDeepSeekChatCompletion(
    [
      {
        role: 'system',
        content: buildPlannerSystemPrompt(),
      },
      {
        role: 'user',
        content: buildPlannerUserPrompt({
          ...plannerInput,
          availableTools: [...availableTools].map((name) => ({
            name,
            description: TOOL_DESCRIPTIONS[name] || '',
          })),
        }),
      },
    ],
    {
      temperature: 0.1,
    },
  )

  const content = getMessageContent(completion)
  const jsonText = extractJsonString(content)
  const parsed = JSON.parse(jsonText)
  const plan = validatePlannerOutput(parsed, availableTools)

  return {
    plan,
    rawContent: content,
    model: completion?.model || '',
    usage: completion?.usage || null,
  }
}

export default {
  isDeepSeekConfigured,
  planAgentWithDeepSeek,
}
