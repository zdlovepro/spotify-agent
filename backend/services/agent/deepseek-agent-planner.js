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
  'player.play_spotify_uri',
  'player.play_spotify_uris',
  'player.pause',
  'player.resume',
  'player.next',
  'player.previous',
  'player.append_queue',
  'player.replace_queue',
  'player.unavailable',
  'player.play_spotify',
  'player.play',
])

const TOOL_DESCRIPTIONS = {
  'spotify.search_tracks': 'Search Spotify catalog tracks by query.',
  'spotify.search_artists': 'Search Spotify catalog artists by query.',
  'spotify.get_track': 'Fetch Spotify track details by track id.',
  'spotify.get_artist': 'Fetch Spotify artist details by artist id.',
  'spotify.get_artist_top_tracks': 'Get an artist top tracks summary from Spotify metadata.',
  'spotify.get_user_top_tracks': 'Get the connected user Spotify top tracks.',
  'spotify.get_user_top_artists': 'Get the connected user Spotify top artists.',
  'spotify.get_user_playlists': 'List the connected user Spotify playlists.',
  'spotify.get_devices': 'List available Spotify playback devices for the connected user.',
  'spotify.play_uri': 'Start full Spotify playback for a Spotify track, album, or playlist URI.',
  'spotify.play_uris': 'Start full Spotify playback for a list of Spotify track URIs.',
  'spotify.pause': 'Pause current Spotify playback on the selected device.',
  'spotify.next': 'Skip to the next Spotify track on the selected device.',
  'spotify.previous': 'Go back to the previous Spotify track on the selected device.',
  'library.list_audio_assets': 'List uploaded local audio files for the logged-in user.',
  'library.search_local_audio': 'Search uploaded local audio assets for the logged-in user.',
  'library.get_audio_asset': 'Load one uploaded local audio asset by asset id.',
  'library.list_playlists': 'List local AgentMusic playlists for the logged-in user.',
  'library.create_playlist': 'Create a new local AgentMusic playlist.',
  'library.add_track_to_playlist': 'Add one track to a local AgentMusic playlist.',
  'library.favorite_track': 'Save one track as a local favorite.',
  'recommendation.save_run': 'Persist a recommendation result set for the logged-in user, or temporary guest history.',
  'recommendation.list_recent': 'List recent saved recommendation runs for the logged-in user.',
  'feedback.save': 'Save like or dislike feedback for the logged-in user.',
  'player.play_local': 'Prepare local audio for full playback in the AgentMusic player.',
  'player.play_spotify_uri': 'Prepare one Spotify track for full remote playback in the AgentMusic player.',
  'player.play_spotify_uris': 'Prepare one or more Spotify tracks for full remote playback in the AgentMusic player.',
  'player.replace_queue': 'Replace the current player queue with validated local or Spotify tracks.',
  'player.append_queue': 'Append validated local or Spotify tracks to the current player queue.',
  'player.pause': 'Pause the current AgentMusic player session.',
  'player.resume': 'Resume the current AgentMusic player session.',
  'player.next': 'Skip to the next track in the AgentMusic player queue.',
  'player.previous': 'Go back to the previous track in the AgentMusic player queue.',
  'catalog.search': 'Search public Spotify catalog metadata.',
  'catalog.get_track': 'Fetch track details by id.',
  'catalog.get_artist': 'Fetch artist details by id.',
  'catalog.get_album': 'Fetch album details by id.',
  'catalog.get_playlist': 'Fetch playlist details by id.',
  'catalog.get_recommendations': 'Fetch public Spotify recommendations.',
  'provider.spotify.get_top_tracks': 'Compatibility tool for Spotify top tracks.',
  'provider.spotify.get_top_artists': 'Compatibility tool for Spotify top artists.',
  'provider.spotify.import_playlists': 'Compatibility tool to import all Spotify playlists.',
  'provider.spotify.import_playlist': 'Compatibility tool to import one Spotify playlist.',
  'provider.spotify.sync_saved_tracks': 'Compatibility tool to sync Spotify saved tracks.',
  'memory.get_user_profile': 'Load the local user taste profile.',
  'history.save_recommendation': 'Compatibility tool to persist a recommendation run.',
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
    'Focus on full playback only. Never use preview as the primary playback route.',
    'Never generate SQL, shell commands, filesystem paths, arbitrary URLs, or code execution steps.',
    'Never invent tools that are not listed.',
    'Spotify is an external music platform, not the main account system.',
    'local_audio means uploaded local m4a/mp3 that can be fully played in AgentMusic.',
    'spotify_remote means full playback through Spotify after authorization.',
    'preview is compatibility only and must not be the main playback target.',
    'If the user is not logged in, avoid local library tools.',
    'If Spotify is not connected, avoid spotify.get_user_* and spotify.play_* tools, and avoid player.play_spotify_uri or player.play_spotify_uris.',
    'Use the plannerInput.capabilities object to decide playback source.',
    'If the user says local, uploaded, my audio, m4a, or mp3, prefer local library tools and local playback tools.',
    'If the user asks for a specific song, artist, or album and Spotify is connected, prefer spotify.search_tracks plus Spotify playback.',
    'If Spotify is not connected and local audio matches, play local audio.',
    'If Spotify is not connected and local audio does not match, reply that Spotify must be connected first, or the user can upload local audio.',
    'If Spotify is connected but spotifyPlaybackReady is false and currentDeviceId is empty, do not pretend playback already started. Reply that the Spotify player or device must be activated first.',
    'When the goal is playback, prefer spotify.search_tracks over catalog.search for Spotify songs, and prefer library.* tools for local audio.',
    'For local queues, use player.play_local, player.replace_queue, or player.append_queue with local_audio tracks only.',
    'For Spotify full playback, prefer spotify.play_uri or spotify.play_uris when a device is ready; otherwise prepare a reply that explains the device is not ready.',
    'For recommendation requests, decide whether the scope should be local audio only, Spotify only, or a hybrid result set.',
    'If the user explicitly asks for local, uploaded, my audio, m4a, or mp3 recommendations, prefer library.list_audio_assets or library.search_local_audio first.',
    'If the user does not limit the source and Spotify is connected, combine local audio tools with spotify.get_user_top_tracks, spotify.get_user_top_artists, and spotify.search_tracks.',
    'If Spotify is not connected, recommendations must stay in the local audio library and the reply should mention that connecting Spotify enables more recommendations.',
    'Recommendation results should be saved with recommendation.save_run or history.save_recommendation.',
    'If the user asks to directly play recommendation results, return player.replace_queue with the recommended tracks.',
    'Mixed recommendation queues may contain both local_audio and spotify_remote tracks.',
    'Tool args may reference previous tool results with $step0.items[0].id, $step0.items[0].uri, or $step0.items.',
    'Tool args may also reference planner input capabilities with $capabilities.currentDeviceId.',
    'Example: user "播放我上传的第一首歌" -> library.list_audio_assets({}) then player.play_local({ assetId: "$step0.items[0].id" }).',
    'Example: user "播放周杰伦晴天" with Spotify connected and playback ready -> spotify.search_tracks({ q: "周杰伦 晴天", limit: 5 }) then spotify.play_uri({ uri: "$step0.items[0].uri", deviceId: "$capabilities.currentDeviceId" }).',
    'Example: user "来点我的本地歌" -> library.search_local_audio({ q: "", limit: 10 }) then player.replace_queue({ tracks: "$step0.items", startIndex: 0 }).',
    'Example: user "播放 Anti-Hero" without Spotify connection and without a local match -> reply that Spotify must be connected first, or the user can upload local audio, with no playback tool call.',
    'Example: user "来点晚上写代码听的歌" with Spotify connected -> library.list_audio_assets({}) then spotify.get_user_top_tracks({ limit: 6 }) then spotify.get_user_top_artists({ limit: 4 }) then spotify.search_tracks({ q: "focus coding instrumental", limit: 6 }) then recommendation.save_run({ tracks: "$step1.items", prompt: "来点晚上写代码听的歌" }).',
    'Example: user "来点我上传过的歌里比较放松的" -> library.search_local_audio({ q: "放松", limit: 10 }) then recommendation.save_run({ tracks: "$step0.items", prompt: "来点我上传过的歌里比较放松的" }).',
    'Example: user "结合我的本地歌和 Spotify 推荐一组，直接播放" -> library.list_audio_assets({}) then spotify.get_user_top_tracks({ limit: 6 }) then spotify.search_tracks({ q: "mix mood query", limit: 6 }) then recommendation.save_run({ tracks: "$step0.items", prompt: "结合我的本地歌和 Spotify 推荐一组，直接播放" }) then player.replace_queue({ tracks: "$step0.items", startIndex: 0 }).',
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
          playerActions: [
            {
              type:
                'player.play_local | player.play_spotify_uri | player.play_spotify_uris | player.pause | player.resume | player.next | player.previous | player.replace_queue | player.append_queue',
              payload: {},
            },
          ],
          memoryWriteback: {
            summary: 'string',
            preferences: ['string'],
          },
        },
        allowedPlayerActionTypes: [...VALID_PLAYER_ACTIONS],
        toolArgReferenceExamples: [
          '$step0.items[0].id',
          '$step0.items[0].uri',
          '$step0.items',
          '$capabilities.currentDeviceId',
        ],
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
