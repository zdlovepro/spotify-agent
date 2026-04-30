import crypto from 'crypto'
import { assert } from '../../utils/assert.js'
import {
  addPlaylistItem,
  createFavorite,
  createPlaylist,
  listFavorites,
  listPlaylists,
} from '../library/library-service.js'
import { spotifyPublicProvider } from '../provider/spotify-public-provider.js'
import { getUserTopItems, parseInteger } from '../spotify-api.js'
import { saveStoredRecommendationRun } from './agent-recommendation-service.js'
import {
  buildLocalTasteProfile,
  buildSpotifyEnhancedProfile,
  buildUserTasteProfile,
  mergeSpotifyEnhancement,
} from './memory-service.js'

function getToolLayer(name) {
  return String(name || '').split('.')[0] || 'unknown'
}

function summarizeResult(name, result) {
  switch (name) {
    case 'catalog.search':
    case 'spotify.search':
      return {
        layer: getToolLayer(name),
        tracks: result.results?.tracks?.length || 0,
        artists: result.results?.artists?.length || 0,
        albums: result.results?.albums?.length || 0,
        playlists: result.results?.playlists?.length || 0,
      }
    case 'catalog.get_recommendations':
    case 'spotify.get_recommendations':
      return {
        layer: getToolLayer(name),
        tracks: result.tracks?.length || 0,
      }
    case 'catalog.get_playlist':
    case 'spotify.get_playlist':
      return {
        layer: getToolLayer(name),
        tracks: result.tracks?.length || 0,
        playlistId: result.id,
      }
    case 'library.list_favorites':
      return {
        layer: getToolLayer(name),
        favorites: result.length || 0,
      }
    case 'library.list_playlists':
      return {
        layer: getToolLayer(name),
        playlists: result.length || 0,
      }
    case 'memory.get_user_profile':
      return {
        layer: getToolLayer(name),
        topTracks: result.topTracks?.length || 0,
        topArtists: result.topArtists?.length || 0,
        recentRecommendations: result.recentRecommendations?.length || 0,
      }
    case 'provider.spotify.get_top_tracks':
      return {
        layer: getToolLayer(name),
        tracks: result.items?.length || 0,
      }
    case 'provider.spotify.get_top_artists':
      return {
        layer: getToolLayer(name),
        artists: result.items?.length || 0,
      }
    case 'library.create_playlist':
      return {
        layer: getToolLayer(name),
        playlistId: result.id,
      }
    case 'library.add_playlist_item':
      return {
        layer: getToolLayer(name),
        itemId: result.id,
        playlistId: result.playlistId,
      }
    case 'library.save_favorite':
      return {
        layer: getToolLayer(name),
        favoriteId: result.id,
      }
    case 'history.save_recommendation':
      return {
        layer: getToolLayer(name),
        recommendationId: result.id,
        temporary: Boolean(result.temporary),
      }
    default:
      return {
        layer: getToolLayer(name),
        ok: true,
      }
  }
}

function createTemporaryRecommendation(args = {}) {
  return {
    id: `guest-rec-${crypto.randomUUID()}`,
    title: args.title || 'Temporary Recommendation',
    prompt: args.prompt || '',
    description: args.description || '',
    seeds: args.seeds || {},
    tracks: Array.isArray(args.tracks) ? args.tracks : [],
    createdAt: new Date().toISOString(),
    temporary: true,
  }
}

function ensureLocalUser(localUserId) {
  assert(localUserId, 'Local account login is required', 401)
}

function ensureSpotifyEnhanced(mode, providerLinks) {
  assert(mode === 'spotify_enhanced', 'Spotify enhanced mode is required', 403)
  assert(
    providerLinks?.spotify?.accessToken,
    'Spotify provider is not connected',
    403,
  )
}

export function createAgentToolRegistry({
  mode,
  localUserId,
  providerLinks,
  toolCalls,
  conversationId,
}) {
  const tools = new Map()

  function register(name, handler) {
    tools.set(name, handler)
  }

  async function executeTool(name, args) {
    const tool = tools.get(name)

    if (!tool) {
      throw new Error(`Unknown agent tool: ${name}`)
    }

    try {
      const result = await tool(args || {})

      toolCalls.push({
        name,
        layer: getToolLayer(name),
        args,
        summary: summarizeResult(name, result),
      })

      return result
    } catch (error) {
      toolCalls.push({
        name,
        layer: getToolLayer(name),
        args,
        summary: {
          layer: getToolLayer(name),
          ok: false,
          error: error.message || 'tool_failed',
          status: error.status || 500,
        },
      })

      throw error
    }
  }

  register('catalog.search', (args = {}) =>
    spotifyPublicProvider.search({
      q: args.q,
      type: args.type || 'track,artist,playlist,album',
      limit: args.limit || 5,
      offset: args.offset || 0,
      market: args.market,
      include_external: args.include_external,
    }),
  )
  register('catalog.get_track', (args = {}) =>
    spotifyPublicProvider.getTrack(args.trackId, {
      market: args.market,
    }),
  )
  register('catalog.get_artist', (args = {}) =>
    spotifyPublicProvider.getArtist(args.artistId),
  )
  register('catalog.get_album', (args = {}) =>
    spotifyPublicProvider.getAlbum(args.albumId, {
      market: args.market,
    }),
  )
  register('catalog.get_playlist', (args = {}) =>
    spotifyPublicProvider.getPlaylist(args.playlistId, {
      market: args.market,
    }),
  )
  register('catalog.get_recommendations', (args = {}) =>
    spotifyPublicProvider.getRecommendations({
      seed_artists: args.seed_artists || '',
      seed_tracks: args.seed_tracks || '',
      seed_genres: args.seed_genres || '',
      limit: args.limit || 20,
      market: args.market,
    }),
  )

  register('history.save_recommendation', async (args = {}) => {
    if (!localUserId) {
      return createTemporaryRecommendation(args)
    }

    return saveStoredRecommendationRun(localUserId, {
      ...args,
      conversationId,
      metadata: {
        mode,
        providerNames: Object.keys(providerLinks || {}),
      },
    })
  })

  if (mode !== 'guest') {
    register('library.list_favorites', (args = {}) => {
      ensureLocalUser(localUserId)
      return listFavorites(localUserId, args.favoriteType || null)
    })
    register('library.list_playlists', () => {
      ensureLocalUser(localUserId)
      return listPlaylists(localUserId)
    })
    register('library.create_playlist', (args = {}) => {
      ensureLocalUser(localUserId)
      return createPlaylist(localUserId, args)
    })
    register('library.add_playlist_item', (args = {}) => {
      ensureLocalUser(localUserId)
      return addPlaylistItem(localUserId, args.playlistId, args.track)
    })
    register('library.save_favorite', (args = {}) => {
      ensureLocalUser(localUserId)
      return createFavorite(localUserId, {
        ...(args.track || {}),
        favorite_type: args.favoriteType || 'track',
      })
    })
    register('memory.get_user_profile', async (args = {}) => {
      ensureLocalUser(localUserId)

      const safeTopLimit = parseInteger(args.topLimit, 5, { min: 1, max: 10 })
      const localProfile = buildLocalTasteProfile(localUserId, {
        recommendationLimit: args.recommendationLimit,
        topLimit: safeTopLimit,
        feedbackLimit: args.feedbackLimit,
      })

      if (mode !== 'spotify_enhanced') {
        return buildUserTasteProfile({
          mode,
          localUserId,
          providerLinks,
          recommendationLimit: args.recommendationLimit,
          topLimit: safeTopLimit,
          feedbackLimit: args.feedbackLimit,
        })
      }

      const [topTracksResult, topArtistsResult] = await Promise.allSettled([
        executeTool('provider.spotify.get_top_tracks', {
          timeRange: args.timeRange,
          limit: safeTopLimit,
          offset: args.offset,
        }),
        executeTool('provider.spotify.get_top_artists', {
          timeRange: args.timeRange,
          limit: safeTopLimit,
          offset: args.offset,
        }),
      ])

      const spotifyProfile = await buildSpotifyEnhancedProfile(providerLinks.spotify, {
        topLimit: safeTopLimit,
        topTracksResponse:
          topTracksResult.status === 'fulfilled' ? topTracksResult.value : null,
        topArtistsResponse:
          topArtistsResult.status === 'fulfilled' ? topArtistsResult.value : null,
      })

      return mergeSpotifyEnhancement(localProfile, spotifyProfile, {
        topLimit: safeTopLimit,
      })
    })
  }

  if (mode === 'spotify_enhanced') {
    register('provider.spotify.get_top_tracks', async (args = {}) => {
      ensureSpotifyEnhanced(mode, providerLinks)

      return getUserTopItems(providerLinks.spotify.accessToken, 'tracks', {
        time_range: args.timeRange || 'medium_term',
        limit: parseInteger(args.limit, 5, { min: 1, max: 10 }),
        offset: parseInteger(args.offset, 0, { min: 0, max: 50 }),
      })
    })
    register('provider.spotify.get_top_artists', async (args = {}) => {
      ensureSpotifyEnhanced(mode, providerLinks)

      return getUserTopItems(providerLinks.spotify.accessToken, 'artists', {
        time_range: args.timeRange || 'medium_term',
        limit: parseInteger(args.limit, 5, { min: 1, max: 10 }),
        offset: parseInteger(args.offset, 0, { min: 0, max: 50 }),
      })
    })
  }

  register('spotify.search', (args = {}) => executeTool('catalog.search', args))
  register('spotify.get_track', (args = {}) =>
    executeTool('catalog.get_track', args),
  )
  register('spotify.get_artist', (args = {}) =>
    executeTool('catalog.get_artist', args),
  )
  register('spotify.get_album', (args = {}) =>
    executeTool('catalog.get_album', args),
  )
  register('spotify.get_playlist', (args = {}) =>
    executeTool('catalog.get_playlist', args),
  )
  register('spotify.get_recommendations', (args = {}) =>
    executeTool('catalog.get_recommendations', args),
  )

  return {
    async run(name, args) {
      return executeTool(name, args)
    },
    listAvailableTools() {
      return [...tools.keys()]
    },
  }
}

export default {
  createAgentToolRegistry,
}
