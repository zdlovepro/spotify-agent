import crypto from 'crypto'
import { assert } from '../../utils/assert.js'
import { listFavorites, listPlaylists } from '../library/library-service.js'
import { spotifyPublicProvider } from '../provider/spotify-public-provider.js'
import { saveStoredRecommendationRun } from './agent-recommendation-service.js'

function summarizeResult(name, result) {
  switch (name) {
    case 'catalog.search':
      return {
        tracks: result.results?.tracks?.length || 0,
        artists: result.results?.artists?.length || 0,
        albums: result.results?.albums?.length || 0,
        playlists: result.results?.playlists?.length || 0,
      }
    case 'catalog.get_recommendations':
      return {
        tracks: result.tracks?.length || 0,
      }
    case 'catalog.get_playlist':
      return {
        tracks: result.tracks?.length || 0,
        playlistId: result.id,
      }
    case 'library.list_favorites':
      return {
        favorites: result.length || 0,
      }
    case 'library.list_playlists':
      return {
        playlists: result.length || 0,
      }
    case 'history.save_recommendation':
      return {
        recommendationId: result.id,
        temporary: Boolean(result.temporary),
      }
    default:
      return {
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

export function createAgentToolRegistry({
  mode,
  localUserId,
  providerLinks,
  toolCalls,
  conversationId,
}) {
  const tools = {
    'catalog.search': async (args) =>
      spotifyPublicProvider.search({
        q: args.q,
        type: args.type || 'track,artist,playlist,album',
        limit: args.limit || 5,
        offset: args.offset || 0,
        market: args.market,
        include_external: args.include_external,
      }),
    'catalog.get_track': async (args) =>
      spotifyPublicProvider.getTrack(args.trackId, {
        market: args.market,
      }),
    'catalog.get_album': async (args) =>
      spotifyPublicProvider.getAlbum(args.albumId, {
        market: args.market,
      }),
    'catalog.get_artist': async (args) =>
      spotifyPublicProvider.getArtist(args.artistId),
    'catalog.get_playlist': async (args) =>
      spotifyPublicProvider.getPlaylist(args.playlistId, {
        market: args.market,
      }),
    'catalog.get_recommendations': async (args) =>
      spotifyPublicProvider.getRecommendations({
        seed_artists: args.seed_artists || '',
        seed_tracks: args.seed_tracks || '',
        seed_genres: args.seed_genres || '',
        limit: args.limit || 20,
        market: args.market,
      }),
    'library.list_favorites': async (args) => {
      assert(localUserId, 'Local account login is required', 401)
      return listFavorites(localUserId, args.favoriteType || null)
    },
    'library.list_playlists': async () => {
      assert(localUserId, 'Local account login is required', 401)
      return listPlaylists(localUserId)
    },
    'history.save_recommendation': async (args) => {
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
    },
  }

  return {
    async run(name, args) {
      const tool = tools[name]

      if (!tool) {
        throw new Error(`Unknown agent tool: ${name}`)
      }

      const result = await tool(args)

      toolCalls.push({
        name,
        args,
        summary: summarizeResult(name, result),
      })

      return result
    },
  }
}

export default {
  createAgentToolRegistry,
}
