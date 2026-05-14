import { createAgentToolRegistry } from '../services/agent/tool-registry.js'

function validateTrack(item = {}) {
  return (
    typeof item.name === 'string' &&
    item.name.trim() &&
    Array.isArray(item.artists) &&
    typeof item.uri === 'string' &&
    item.uri.startsWith('spotify:track:') &&
    item.sourceType === 'spotify' &&
    item.playMode === 'spotify_remote'
  )
}

async function main() {
  const query = process.argv[2] || 'sleep calm ambient'
  const toolCalls = []
  const tools = createAgentToolRegistry({
    mode: 'guest',
    localUserId: null,
    localSessionToken: '',
    providerLinks: {},
    toolCalls,
    conversationId: 'debug-spotify-search',
    currentMessage: query,
  })

  const result = await tools.run('spotify.search_tracks', {
    q: query,
    limit: 3,
    intent: 'recommend_music',
    message: query,
  })

  console.log(
    JSON.stringify(
      {
        query: result.query,
        mood: result.mood,
        queries: result.queries,
        queryCounts: result.queryCounts,
        total: result.total,
        items: result.items,
      },
      null,
      2,
    ),
  )

  const invalidItems = (result.items || []).filter((item) => !validateTrack(item))

  if (invalidItems.length > 0) {
    throw new Error(
      `spotify.search_tracks returned ${invalidItems.length} invalid item(s)`,
    )
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
