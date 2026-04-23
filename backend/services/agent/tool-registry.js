import {
  getAlbum,
  getArtist,
  getArtistTopTracks,
  getPlaylist,
  getRecommendations,
  getTrack,
  searchSpotify,
} from '../spotify-api.js'
import { saveRecommendationHistory } from '../recommendation-history-store.js'

function summarizeResult(name, result) {
  switch (name) {
    case 'spotify.search':
      return {
        tracks: result.tracks?.items?.length || 0,
        artists: result.artists?.items?.length || 0,
        albums: result.albums?.items?.length || 0,
        playlists: result.playlists?.items?.length || 0,
      }
    case 'spotify.get_recommendations':
      return {
        tracks: result.tracks?.length || 0,
      }
    case 'spotify.get_artist_top_tracks':
      return {
        tracks: result.tracks?.length || 0,
      }
    case 'spotify.get_playlist':
      return {
        tracks: result.tracks?.items?.length || 0,
        playlistId: result.id,
      }
    case 'history.save_recommendation':
      return {
        recommendationId: result.id,
      }
    default:
      return {
        ok: true,
      }
  }
}

export function createAgentToolRegistry({
  accessToken,
  userId,
  toolCalls,
}) {
  const tools = {
    'spotify.search': async (args) =>
      searchSpotify(accessToken, {
        q: args.q,
        type: args.type || 'track,artist,playlist,album',
        limit: args.limit || 5,
        offset: args.offset || 0,
        market: args.market || 'from_token',
      }),
    'spotify.get_track': async (args) =>
      getTrack(accessToken, args.trackId, {
        market: args.market || 'from_token',
      }),
    'spotify.get_album': async (args) =>
      getAlbum(accessToken, args.albumId, {
        market: args.market || 'from_token',
      }),
    'spotify.get_artist': async (args) => getArtist(accessToken, args.artistId),
    'spotify.get_artist_top_tracks': async (args) =>
      getArtistTopTracks(accessToken, args.artistId, {
        market: args.market || 'from_token',
      }),
    'spotify.get_playlist': async (args) =>
      getPlaylist(accessToken, args.playlistId, {
        market: args.market || 'from_token',
      }),
    'spotify.get_recommendations': async (args) =>
      getRecommendations(accessToken, {
        seed_artists: args.seed_artists || '',
        seed_tracks: args.seed_tracks || '',
        seed_genres: args.seed_genres || '',
        limit: args.limit || 20,
        market: args.market || 'from_token',
      }),
    'history.save_recommendation': async (args) =>
      saveRecommendationHistory(userId, args),
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
