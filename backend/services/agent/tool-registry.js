import crypto from 'crypto'
import env from '../../config/env.js'
import { assert } from '../../utils/assert.js'
import {
  addPlaylistItem,
  createFavorite,
  createPlaylist,
  getPlaylist,
  listFavorites,
  listPlaylists,
} from '../library/library-service.js'
import {
  getAudioAsset,
  listAudioAssets,
} from '../media/media-service.js'
import {
  importAllSpotifyPlaylists,
  importSpotifyPlaylist,
  syncSpotifySavedTracks,
} from '../provider/spotify-library-import-service.js'
import { spotifyPublicProvider } from '../provider/spotify-public-provider.js'
import {
  getArtistTopTracks,
  getAvailableDevices,
  getCurrentPlaybackState,
  getUserPlaylists,
  getUserTopItems,
  parseInteger,
  pausePlayback,
  skipToNextPlayback,
  skipToPreviousPlayback,
  startOrResumePlayback,
  transferPlayback,
} from '../spotify-api.js'
import {
  listStoredRecommendationRuns,
  saveStoredRecommendationRun,
} from './agent-recommendation-service.js'
import { listStoredFeedback, saveStoredFeedback } from './agent-feedback-service.js'
import {
  buildLocalTasteProfile,
  buildSpotifyEnhancedProfile,
  buildUserTasteProfile,
  mergeSpotifyEnhancement,
} from './memory-service.js'
import { createTrackArtifact, createTrackArtifacts } from './track-artifact.js'

function getToolLayer(name) {
  return String(name || '').split('.')[0] || 'unknown'
}

function summarizeResult(name, result) {
  switch (name) {
    case 'library.list_audio_assets':
      return {
        layer: getToolLayer(name),
        items: result.items?.length || 0,
      }
    case 'library.get_audio_asset':
      return {
        layer: getToolLayer(name),
        assetId: result.id || '',
      }
    case 'library.favorite_track':
      return {
        layer: getToolLayer(name),
        favoriteId: result.id || '',
      }
    case 'library.add_track_to_playlist':
      return {
        layer: getToolLayer(name),
        itemId: result.id || '',
        playlistId: result.playlistId || '',
      }
    case 'spotify.search_tracks':
      return {
        layer: getToolLayer(name),
        tracks: result.items?.length || 0,
        query: result.query || '',
      }
    case 'spotify.search_artists':
      return {
        layer: getToolLayer(name),
        artists: result.items?.length || 0,
        query: result.query || '',
      }
    case 'spotify.get_artist_top_tracks':
      return {
        layer: getToolLayer(name),
        tracks: result.items?.length || 0,
        artistId: result.artistId || '',
      }
    case 'spotify.get_user_playlists':
      return {
        layer: getToolLayer(name),
        playlists: result.items?.length || 0,
      }
    case 'spotify.get_devices':
      return {
        layer: getToolLayer(name),
        devices: result.items?.length || 0,
      }
    case 'spotify.play_uri':
    case 'spotify.play_uris':
    case 'spotify.pause':
    case 'spotify.next':
    case 'spotify.previous':
    case 'player.play_local':
    case 'player.play_spotify_uri':
    case 'player.play_spotify_uris':
    case 'player.replace_queue':
    case 'player.append_queue':
    case 'player.pause':
    case 'player.resume':
    case 'player.next':
    case 'player.previous':
      return {
        layer: getToolLayer(name),
        actionType: result.type || '',
        ok: Boolean(result.ok),
      }
    case 'recommendation.save_run':
      return {
        layer: getToolLayer(name),
        recommendationId: result.id || '',
        temporary: Boolean(result.temporary),
      }
    case 'recommendation.list_recent':
      return {
        layer: getToolLayer(name),
        items: result.items?.length || 0,
      }
    case 'feedback.save':
      return {
        layer: getToolLayer(name),
        feedbackId: result.id || '',
      }
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
        playlists: result.items?.length || 0,
      }
    case 'library.search_local_audio':
      return {
        layer: getToolLayer(name),
        assets: result.items?.length || 0,
        query: result.query || '',
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
    case 'provider.spotify.import_playlists':
      return {
        layer: getToolLayer(name),
        importedCount: result.importedCount || 0,
      }
    case 'provider.spotify.import_playlist':
      return {
        layer: getToolLayer(name),
        importedTrackCount: result.importedTrackCount || 0,
        playlistId: result.playlist?.id || '',
      }
    case 'provider.spotify.sync_saved_tracks':
      return {
        layer: getToolLayer(name),
        importedCount: result.importedCount || 0,
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

function getBackendOrigin() {
  try {
    return new URL(env.spotifyRedirectUri).origin
  } catch {
    return `http://127.0.0.1:${env.port}`
  }
}

function createLocalAudioStreamUrl(asset = {}, localSessionToken = '') {
  const streamPath =
    typeof asset.streamPath === 'string' ? asset.streamPath.trim() : ''

  if (!streamPath) {
    return ''
  }

  const baseUrl =
    streamPath.startsWith('http://') || streamPath.startsWith('https://')
      ? streamPath
      : `${getBackendOrigin()}${streamPath}`

  if (!localSessionToken) {
    return baseUrl
  }

  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}session_token=${encodeURIComponent(localSessionToken)}`
}

function mapLocalAudioAssetToTrack(asset = {}, localSessionToken = '') {
  return {
    id: asset.id,
    sourceType: 'local_audio',
    sourceId: asset.sourceId || `local_audio:${asset.id}`,
    name: asset.title || asset.originalFilename || 'Local audio',
    artists: Array.isArray(asset.artists) ? asset.artists : [],
    album: asset.album || '',
    image: '',
    mimeType: asset.mimeType || '',
    fileExtension: asset.fileExtension || '',
    sizeBytes: asset.sizeBytes || 0,
    durationMs: asset.durationMs ?? null,
    streamPath: asset.streamPath || '',
    audioUrl: createLocalAudioStreamUrl(asset, localSessionToken),
    playMode: 'local_audio',
    playable: true,
  }
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function mapArtistResult(artist = {}) {
  return {
    id: artist.id || '',
    sourceType: artist.sourceType || artist.source_type || 'spotify',
    sourceId:
      artist.sourceId ||
      artist.source_id ||
      (artist.id ? `spotify:artist:${artist.id}` : ''),
    name: artist.name || '',
    genres: Array.isArray(artist.genres) ? artist.genres : [],
    popularity: artist.popularity ?? 0,
    followers:
      artist.followers?.total ??
      artist.followers ??
      0,
    image:
      artist.image ||
      artist.images?.[0]?.url ||
      '',
  }
}

function mapPlaylistResult(playlist = {}) {
  return {
    id: playlist.id || '',
    sourceType: playlist.sourceType || playlist.source_type || 'spotify',
    sourceId:
      playlist.sourceId ||
      playlist.source_id ||
      (playlist.id ? `spotify:playlist:${playlist.id}` : ''),
    name: playlist.name || playlist.title || 'Playlist',
    description: playlist.description || '',
    image:
      playlist.image ||
      playlist.images?.[0]?.url ||
      playlist.coverImageUrl ||
      '',
    owner:
      playlist.owner?.display_name ||
      playlist.owner?.id ||
      playlist.metadata?.spotifyOwnerName ||
      '',
    trackCount:
      playlist.tracks?.total ??
      playlist.items?.length ??
      0,
  }
}

function mapLibraryPlaylistResult(playlist = {}) {
  return {
    id: playlist.id || '',
    sourceType: playlist.sourceType || playlist.source_type || 'agentmusic',
    sourceId:
      playlist.sourceId ||
      playlist.source_id ||
      (playlist.id ? `agentmusic:playlist:${playlist.id}` : ''),
    name: playlist.title || playlist.name || 'Playlist',
    description: playlist.description || '',
    image:
      playlist.coverImageUrl ||
      playlist.cover_image_url ||
      playlist.image ||
      '',
    visibility: playlist.visibility || 'private',
    itemCount: Array.isArray(playlist.items) ? playlist.items.length : 0,
    createdAt: playlist.createdAt || playlist.created_at || '',
    updatedAt: playlist.updatedAt || playlist.updated_at || '',
  }
}

function mapLibraryPlaylistItemResult(item = {}) {
  return {
    id: item.id || '',
    playlistId: item.playlistId || item.playlist_id || '',
    position: Number.isFinite(Number(item.position)) ? Number(item.position) : 0,
    createdAt: item.createdAt || item.created_at || '',
    track: createTrackArtifact(item),
  }
}

function mapFavoriteTrackResult(favorite = {}) {
  return {
    id: favorite.id || '',
    favoriteType: favorite.favoriteType || favorite.favorite_type || 'track',
    createdAt: favorite.createdAt || favorite.created_at || '',
    track: createTrackArtifact(favorite),
  }
}

function mapRecommendationRunResult(run = {}) {
  return {
    id: run.id || '',
    title: run.title || 'Untitled Recommendation',
    prompt: run.prompt || '',
    description: run.description || '',
    createdAt: run.createdAt || '',
    seeds: run.seeds || {},
    trackCount: Array.isArray(run.tracks) ? run.tracks.length : 0,
  }
}

function mapDeviceResult(device = {}) {
  return {
    id: device.id || '',
    name: device.name || '',
    type: device.type || '',
    isActive: Boolean(device.is_active),
    isPrivateSession: Boolean(device.is_private_session),
    isRestricted: Boolean(device.is_restricted),
    volumePercent: device.volume_percent ?? null,
  }
}

function ensureSpotifyUri(uri, { allowContext = true } = {}) {
  const normalizedUri = normalizeString(uri)

  assert(normalizedUri, 'Spotify URI is required', 400)
  assert(
    normalizedUri.startsWith('spotify:track:') ||
      (allowContext &&
        (normalizedUri.startsWith('spotify:album:') ||
          normalizedUri.startsWith('spotify:playlist:'))),
    'Only Spotify track, album, or playlist URIs are allowed',
    400,
  )

  return normalizedUri
}

async function selectPlaybackDevice(accessToken, preferredDeviceId = '') {
  const deviceData = await getAvailableDevices(accessToken)
  const devices = Array.isArray(deviceData?.devices)
    ? deviceData.devices.filter((device) => !device?.is_restricted)
    : []

  if (!devices.length) {
    return {
      device: null,
      devices: [],
    }
  }

  const preferred = preferredDeviceId
    ? devices.find((device) => device.id === preferredDeviceId)
    : null
  const active = devices.find((device) => device.is_active)
  const fallback = preferred || active || devices[0]

  return {
    device: fallback || null,
    devices,
  }
}

async function ensureSpotifyPlaybackDevice(accessToken, preferredDeviceId = '') {
  const { device, devices } = await selectPlaybackDevice(accessToken, preferredDeviceId)

  assert(
    device?.id,
    'No available Spotify playback device found. Open Spotify and try again.',
    409,
  )

  return {
    device,
    devices,
  }
}

function buildPlayerActionResult(type, payload = {}, meta = {}) {
  return {
    ok: true,
    type,
    payload,
    meta,
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

function getSpotifyAccessToken(mode, providerLinks) {
  ensureSpotifyEnhanced(mode, providerLinks)
  return providerLinks.spotify.accessToken
}

export function createAgentToolRegistry({
  mode,
  localUserId,
  localSessionToken = '',
  providerLinks,
  toolCalls,
  conversationId,
}) {
  const tools = new Map()
  const visibleTools = []

  function register(name, handler, { exposed = true } = {}) {
    tools.set(name, handler)

    if (exposed && !visibleTools.includes(name)) {
      visibleTools.push(name)
    }
  }

  async function executeTool(name, args) {
    const tool = tools.get(name)

    if (!tool) {
      toolCalls.push({
        name,
        layer: getToolLayer(name),
        args,
        summary: {
          layer: getToolLayer(name),
          ok: false,
          error: `Unknown agent tool: ${name}`,
          status: 400,
        },
      })

      const error = new Error(`Unknown agent tool: ${name}`)
      error.status = 400
      throw error
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

  function extractLocalAssetId(input = {}) {
    const explicitAssetId = normalizeString(input.assetId || input.id)

    if (explicitAssetId) {
      return explicitAssetId
    }

    const sourceId = normalizeString(input.sourceId || input.source_id)

    if (sourceId.startsWith('local_audio:')) {
      return sourceId.slice('local_audio:'.length)
    }

    return ''
  }

  function resolveLocalAudioTrack(input = {}) {
    ensureLocalUser(localUserId)

    const assetId = extractLocalAssetId(input)

    assert(assetId, 'assetId is required', 400)

    const asset = getAudioAsset(localUserId, assetId)

    assert(asset, 'Audio asset not found', 404)

    return mapLocalAudioAssetToTrack(asset, localSessionToken)
  }

function createSpotifyRemoteTrack(input = {}) {
    const inputSourceId = normalizeString(input.sourceId || input.source_id)
    const inputUri = normalizeString(input.uri)
    const derivedUri = inputUri || inputSourceId
    const uri = derivedUri
      ? ensureSpotifyUri(derivedUri, { allowContext: false })
      : ''
    const trackId =
      normalizeString(input.trackId || input.id) ||
      (inputSourceId.startsWith('spotify:track:')
        ? inputSourceId.split(':').slice(2).join(':')
        : uri.startsWith('spotify:track:')
          ? uri.split(':').slice(2).join(':')
          : '')
    const sourceId = inputSourceId || (trackId ? `spotify:track:${trackId}` : uri)

    assert(sourceId, 'Spotify track sourceId or uri is required', 400)

    return createTrackArtifact({
      id: trackId || sourceId,
      sourceType: 'spotify',
      sourceId,
      uri: uri || sourceId,
      name: normalizeString(input.name || input.title, 'Spotify track'),
      artists: Array.isArray(input.artists) ? input.artists : [],
      album:
        typeof input.album === 'string'
          ? input.album
          : normalizeString(input.album?.name),
      image: normalizeString(input.image || input.image_url),
      durationMs:
        Number.isFinite(Number(input.durationMs)) && Number(input.durationMs) >= 0
          ? Number(input.durationMs)
          : Number.isFinite(Number(input.duration_ms)) && Number(input.duration_ms) >= 0
            ? Number(input.duration_ms)
            : 0,
      previewUrl: '',
      audioUrl: '',
      playMode: 'spotify_remote',
      playable: false,
    })
  }

  function normalizeQueueTrack(input = {}) {
    assert(
      input && typeof input === 'object' && !Array.isArray(input),
      'track must be an object',
      400,
    )

    const sourceType = normalizeString(input.sourceType || input.source_type)
    const sourceId = normalizeString(input.sourceId || input.source_id)

    if (
      sourceType === 'local_audio' ||
      sourceId.startsWith('local_audio:') ||
      normalizeString(input.assetId)
    ) {
      return resolveLocalAudioTrack(input)
    }

    if (
      sourceType === 'spotify' ||
      sourceId.startsWith('spotify:') ||
      normalizeString(input.uri).startsWith('spotify:')
    ) {
      return createSpotifyRemoteTrack(input)
    }

    throw Object.assign(
      new Error('Only local_audio and spotify tracks are supported'),
      { status: 400 },
    )
  }

  function resolveQueueTracks(inputTracks = []) {
    const tracks = Array.isArray(inputTracks) ? inputTracks : []
    return tracks.map((track) => normalizeQueueTrack(track))
  }

  function createSpotifyActionTracks(args = {}) {
    const inputTracks = Array.isArray(args.tracks) ? args.tracks : []

    if (inputTracks.length > 0) {
      const tracks = resolveQueueTracks(inputTracks)

      assert(
        tracks.every((track) => track.playMode === 'spotify_remote' && track.uri),
        'Only Spotify track URIs are supported',
        400,
      )

      return tracks
    }

    const uris = Array.isArray(args.uris)
      ? args.uris.map((uri) => ensureSpotifyUri(uri, { allowContext: false }))
      : []

    if (uris.length > 0) {
      return uris.map((uri, index) =>
        createSpotifyRemoteTrack({
          ...args,
          id: `${normalizeString(args.id || args.trackId || 'spotify-track')}-${index}`,
          uri,
        }),
      )
    }

    const uri = ensureSpotifyUri(args.uri, { allowContext: false })

    return [
      createSpotifyRemoteTrack({
        ...args,
        uri,
      }),
    ]
  }

  function resolveStartIndex(value, tracks = []) {
    if (!tracks.length) {
      return 0
    }

    return parseInteger(value, 0, {
      min: 0,
      max: Math.max(0, tracks.length - 1),
    })
  }

  register(
    'catalog.search',
    (args = {}) =>
      spotifyPublicProvider.search({
        q: args.q,
        type: args.type || 'track,artist,playlist,album',
        limit: args.limit || 5,
        offset: args.offset || 0,
        market: args.market,
        include_external: args.include_external,
      }),
    { exposed: false },
  )
  register(
    'catalog.get_track',
    (args = {}) =>
      spotifyPublicProvider.getTrack(args.trackId, {
        market: args.market,
      }),
    { exposed: false },
  )
  register(
    'catalog.get_artist',
    (args = {}) => spotifyPublicProvider.getArtist(args.artistId),
    { exposed: false },
  )
  register(
    'catalog.get_album',
    (args = {}) =>
      spotifyPublicProvider.getAlbum(args.albumId, {
        market: args.market,
      }),
    { exposed: false },
  )
  register(
    'catalog.get_playlist',
    (args = {}) =>
      spotifyPublicProvider.getPlaylist(args.playlistId, {
        market: args.market,
      }),
    { exposed: false },
  )
  register(
    'catalog.get_recommendations',
    (args = {}) =>
      spotifyPublicProvider.getRecommendations({
        seed_artists: args.seed_artists || '',
        seed_tracks: args.seed_tracks || '',
        seed_genres: args.seed_genres || '',
        limit: args.limit || 20,
        market: args.market,
      }),
    { exposed: false },
  )

  register('spotify.search_tracks', async (args = {}) => {
    const data = await spotifyPublicProvider.search({
      q: args.q,
      type: 'track',
      limit: parseInteger(args.limit, 10, { min: 1, max: 50 }),
      offset: parseInteger(args.offset, 0, { min: 0, max: 1000 }),
      market: args.market,
    })

    return {
      query: args.q || '',
      total: data.results?.tracks?.length || 0,
      items: createTrackArtifacts(data.results?.tracks || []),
    }
  })

  register('spotify.search_artists', async (args = {}) => {
    const data = await spotifyPublicProvider.search({
      q: args.q,
      type: 'artist',
      limit: parseInteger(args.limit, 10, { min: 1, max: 50 }),
      offset: parseInteger(args.offset, 0, { min: 0, max: 1000 }),
      market: args.market,
    })

    return {
      query: args.q || '',
      total: data.results?.artists?.length || 0,
      items: (data.results?.artists || []).map((artist) => mapArtistResult(artist)),
    }
  })

  register('spotify.get_track', async (args = {}) =>
    createTrackArtifact(
      await spotifyPublicProvider.getTrack(args.trackId, {
        market: args.market,
      }),
    ),
  )

  register('spotify.get_artist', async (args = {}) =>
    mapArtistResult(await spotifyPublicProvider.getArtist(args.artistId)),
  )

  register('spotify.get_artist_top_tracks', async (args = {}) => {
    assert(args.artistId, 'artistId is required', 400)
    const limit = parseInteger(args.limit, 10, { min: 1, max: 20 })

    if (mode === 'spotify_enhanced' && providerLinks?.spotify?.accessToken) {
      const data = await getArtistTopTracks(
        getSpotifyAccessToken(mode, providerLinks),
        args.artistId,
        {
          market: args.market || 'from_token',
        },
      )

      return {
        artistId: args.artistId,
        total: data.tracks?.length || 0,
        items: createTrackArtifacts((data.tracks || []).slice(0, limit)),
      }
    }

    const artist = await spotifyPublicProvider.getArtist(args.artistId)
    const search = await spotifyPublicProvider.search({
      q: artist.name || '',
      type: 'track',
      limit: Math.max(limit * 2, 10),
      market: args.market,
    })
    const artistName = normalizeString(artist.name).toLowerCase()
    const items = (search.results?.tracks || [])
      .filter((track) =>
        (track.artists || []).some(
          (trackArtist) =>
            trackArtist.id === args.artistId ||
            normalizeString(trackArtist.name).toLowerCase() === artistName,
        ),
      )
      .slice(0, limit)

    return {
      artistId: args.artistId,
      total: items.length,
      items: createTrackArtifacts(items),
    }
  })

  register(
    'history.save_recommendation',
    async (args = {}) => {
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
    { exposed: false },
  )

  register('recommendation.save_run', async (args = {}) => {
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

  register(
    'recommendation.list_recent',
    async (args = {}) => {
      ensureLocalUser(localUserId)
      const limit = parseInteger(args.limit, 10, { min: 1, max: 50 })
      const items = listStoredRecommendationRuns(localUserId, limit).map((run) =>
        mapRecommendationRunResult(run),
      )

      return {
        total: items.length,
        items,
      }
    },
    { exposed: mode !== 'guest' },
  )

  register(
    'feedback.save',
    async (args = {}) => {
      ensureLocalUser(localUserId)
      return saveStoredFeedback(localUserId, {
        feedback: args.feedback,
        conversationId: args.conversationId || '',
        messageId: args.messageId || '',
        recommendationId: args.recommendationId || '',
        note: args.note || '',
        metadata:
          args.metadata && typeof args.metadata === 'object' ? args.metadata : {},
      })
    },
    { exposed: mode !== 'guest' },
  )

  if (mode !== 'guest') {
    register(
      'library.list_favorites',
      (args = {}) => {
        ensureLocalUser(localUserId)
        return listFavorites(localUserId, args.favoriteType || null)
      },
      { exposed: false },
    )

    register('library.list_audio_assets', () => {
      ensureLocalUser(localUserId)
      const items = listAudioAssets(localUserId).map((asset) =>
        mapLocalAudioAssetToTrack(asset, localSessionToken),
      )

      return {
        total: items.length,
        items,
      }
    })

    register('library.search_local_audio', (args = {}) => {
      ensureLocalUser(localUserId)
      const query = typeof args.q === 'string' ? args.q.trim().toLowerCase() : ''
      const limit = parseInteger(args.limit, 10, { min: 1, max: 50 })
      const items = listAudioAssets(localUserId)
        .map((asset) => mapLocalAudioAssetToTrack(asset, localSessionToken))
        .filter((asset) => {
          if (!query) {
            return true
          }

          const haystack = [
            asset.name,
            ...(Array.isArray(asset.artists) ? asset.artists : []),
            asset.album,
            asset.fileExtension,
          ]
            .join(' ')
            .toLowerCase()

          return haystack.includes(query)
        })
        .slice(0, limit)

      return {
        query,
        total: items.length,
        items,
      }
    })

    register('library.get_audio_asset', (args = {}) => {
      ensureLocalUser(localUserId)
      return resolveLocalAudioTrack({
        assetId: args.assetId,
      })
    })

    register('library.list_playlists', () => {
      ensureLocalUser(localUserId)
      const items = listPlaylists(localUserId).map((playlist) =>
        mapLibraryPlaylistResult(playlist),
      )

      return {
        total: items.length,
        items,
      }
    })

    register('library.create_playlist', (args = {}) => {
      ensureLocalUser(localUserId)
      return mapLibraryPlaylistResult(createPlaylist(localUserId, args))
    })

    register('library.add_track_to_playlist', (args = {}) => {
      ensureLocalUser(localUserId)
      assert(args.playlistId, 'playlistId is required', 400)
      assert(args.track, 'track is required', 400)

      const item = addPlaylistItem(localUserId, args.playlistId, args.track)

      assert(item, 'Playlist not found', 404)

      return mapLibraryPlaylistItemResult(item)
    })

    register(
      'library.add_playlist_item',
      (args = {}) => {
        ensureLocalUser(localUserId)
        assert(args.playlistId, 'playlistId is required', 400)
        assert(args.track, 'track is required', 400)

        const item = addPlaylistItem(localUserId, args.playlistId, args.track)

        assert(item, 'Playlist not found', 404)

        return item
      },
      { exposed: false },
    )

    register('library.favorite_track', (args = {}) => {
      ensureLocalUser(localUserId)
      assert(args.track, 'track is required', 400)

      return mapFavoriteTrackResult(
        createFavorite(localUserId, {
          ...(args.track || {}),
          favorite_type: args.favoriteType || 'track',
        }),
      )
    })

    register(
      'library.save_favorite',
      (args = {}) => {
        ensureLocalUser(localUserId)
        assert(args.track, 'track is required', 400)

        return createFavorite(localUserId, {
          ...(args.track || {}),
          favorite_type: args.favoriteType || 'track',
        })
      },
      { exposed: false },
    )

    register(
      'memory.get_user_profile',
      async (args = {}) => {
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
      },
      { exposed: false },
    )
  }

  register(
    'player.play_local',
    (args = {}) => {
      const track = resolveLocalAudioTrack(args)

      return buildPlayerActionResult('player.play_local', {
        tracks: [track],
        startIndex: 0,
      })
    },
    { exposed: mode !== 'guest' },
  )

  register(
    'player.play_spotify_uri',
    (args = {}) => {
      ensureSpotifyEnhanced(mode, providerLinks)
      const tracks = createSpotifyActionTracks(args)

      return buildPlayerActionResult('player.play_spotify_uri', {
        tracks: tracks.slice(0, 1),
        startIndex: 0,
      })
    },
    { exposed: mode === 'spotify_enhanced' },
  )

  register(
    'player.play_spotify_uris',
    (args = {}) => {
      ensureSpotifyEnhanced(mode, providerLinks)
      const tracks = createSpotifyActionTracks(args)

      assert(tracks.length > 0, 'Spotify tracks are required', 400)

      return buildPlayerActionResult('player.play_spotify_uris', {
        tracks,
        startIndex: resolveStartIndex(args.startIndex, tracks),
      })
    },
    { exposed: mode === 'spotify_enhanced' },
  )

  register(
    'player.play_spotify',
    (args = {}) => {
      ensureSpotifyEnhanced(mode, providerLinks)
      const tracks = createSpotifyActionTracks(args)

      return buildPlayerActionResult('player.play_spotify_uris', {
        tracks,
        startIndex: resolveStartIndex(args.startIndex, tracks),
      })
    },
    { exposed: false },
  )

  register('player.replace_queue', (args = {}) => {
    const tracks = resolveQueueTracks(args.tracks)

    assert(tracks.length > 0, 'tracks are required', 400)

    return buildPlayerActionResult('player.replace_queue', {
      tracks,
      startIndex: resolveStartIndex(args.startIndex, tracks),
    })
  })

  register('player.append_queue', (args = {}) => {
    const tracks = resolveQueueTracks(args.tracks)

    assert(tracks.length > 0, 'tracks are required', 400)

    return buildPlayerActionResult('player.append_queue', {
      tracks,
    })
  })

  register('player.pause', () => buildPlayerActionResult('player.pause'))
  register('player.resume', () => buildPlayerActionResult('player.resume'))
  register('player.next', () => buildPlayerActionResult('player.next'))
  register('player.previous', () => buildPlayerActionResult('player.previous'))

  if (mode === 'spotify_enhanced') {
    register('spotify.get_user_top_tracks', async (args = {}) => {
      const accessToken = getSpotifyAccessToken(mode, providerLinks)
      const data = await getUserTopItems(accessToken, 'tracks', {
        time_range: args.timeRange || 'medium_term',
        limit: parseInteger(args.limit, 5, { min: 1, max: 10 }),
        offset: parseInteger(args.offset, 0, { min: 0, max: 50 }),
      })

      return {
        timeRange: args.timeRange || 'medium_term',
        total: data.items?.length || 0,
        items: createTrackArtifacts(data.items || []),
      }
    })

    register(
      'provider.spotify.get_top_tracks',
      async (args = {}) => {
        const accessToken = getSpotifyAccessToken(mode, providerLinks)
        return getUserTopItems(accessToken, 'tracks', {
          time_range: args.timeRange || 'medium_term',
          limit: parseInteger(args.limit, 5, { min: 1, max: 10 }),
          offset: parseInteger(args.offset, 0, { min: 0, max: 50 }),
        })
      },
      { exposed: false },
    )

    register('spotify.get_user_top_artists', async (args = {}) => {
      const accessToken = getSpotifyAccessToken(mode, providerLinks)
      const data = await getUserTopItems(accessToken, 'artists', {
        time_range: args.timeRange || 'medium_term',
        limit: parseInteger(args.limit, 5, { min: 1, max: 10 }),
        offset: parseInteger(args.offset, 0, { min: 0, max: 50 }),
      })

      return {
        timeRange: args.timeRange || 'medium_term',
        total: data.items?.length || 0,
        items: (data.items || []).map((artist) => mapArtistResult(artist)),
      }
    })

    register(
      'provider.spotify.get_top_artists',
      async (args = {}) => {
        const accessToken = getSpotifyAccessToken(mode, providerLinks)
        return getUserTopItems(accessToken, 'artists', {
          time_range: args.timeRange || 'medium_term',
          limit: parseInteger(args.limit, 5, { min: 1, max: 10 }),
          offset: parseInteger(args.offset, 0, { min: 0, max: 50 }),
        })
      },
      { exposed: false },
    )

    register('spotify.get_user_playlists', async (args = {}) => {
      const accessToken = getSpotifyAccessToken(mode, providerLinks)
      const data = await getUserPlaylists(accessToken, {
        limit: parseInteger(args.limit, 20, { min: 1, max: 50 }),
        offset: parseInteger(args.offset, 0, { min: 0, max: 1000 }),
      })

      return {
        total: data.items?.length || 0,
        items: (data.items || []).map((playlist) => mapPlaylistResult(playlist)),
      }
    })

    register('spotify.get_devices', async () => {
      const accessToken = getSpotifyAccessToken(mode, providerLinks)
      const data = await getAvailableDevices(accessToken)

      return {
        total: data.devices?.length || 0,
        items: (data.devices || []).map((device) => mapDeviceResult(device)),
      }
    })

    register('spotify.play_uri', async (args = {}) => {
      const accessToken = getSpotifyAccessToken(mode, providerLinks)
      const uri = ensureSpotifyUri(args.uri, { allowContext: true })
      const { device } = await ensureSpotifyPlaybackDevice(
        accessToken,
        normalizeString(args.deviceId),
      )

      if (!device.is_active) {
        await transferPlayback(accessToken, {
          deviceId: device.id,
          play: false,
        })
      }

      if (uri.startsWith('spotify:track:')) {
        await startOrResumePlayback(accessToken, {
          deviceId: device.id,
          uris: [uri],
        })
      } else {
        await startOrResumePlayback(accessToken, {
          deviceId: device.id,
          contextUri: uri,
          offset:
            args.offset && typeof args.offset === 'object' ? args.offset : null,
        })
      }

      return buildPlayerActionResult(
        'spotify.play_uri',
        { uri, deviceId: device.id },
        { device: mapDeviceResult(device) },
      )
    })

    register('spotify.play_uris', async (args = {}) => {
      const accessToken = getSpotifyAccessToken(mode, providerLinks)
      const uris = Array.isArray(args.uris)
        ? args.uris.map((uri) => ensureSpotifyUri(uri, { allowContext: false }))
        : []

      assert(uris.length > 0, 'uris is required', 400)

      const { device } = await ensureSpotifyPlaybackDevice(
        accessToken,
        normalizeString(args.deviceId),
      )

      if (!device.is_active) {
        await transferPlayback(accessToken, {
          deviceId: device.id,
          play: false,
        })
      }

      await startOrResumePlayback(accessToken, {
        deviceId: device.id,
        uris,
      })

      return buildPlayerActionResult(
        'spotify.play_uris',
        { uris, deviceId: device.id },
        { device: mapDeviceResult(device) },
      )
    })

    register('spotify.pause', async (args = {}) => {
      const accessToken = getSpotifyAccessToken(mode, providerLinks)
      const { device } = await ensureSpotifyPlaybackDevice(
        accessToken,
        normalizeString(args.deviceId),
      )

      await pausePlayback(accessToken, {
        deviceId: device.id,
      })

      return buildPlayerActionResult(
        'spotify.pause',
        { deviceId: device.id },
        { device: mapDeviceResult(device) },
      )
    })

    register('spotify.next', async (args = {}) => {
      const accessToken = getSpotifyAccessToken(mode, providerLinks)
      const { device } = await ensureSpotifyPlaybackDevice(
        accessToken,
        normalizeString(args.deviceId),
      )

      await skipToNextPlayback(accessToken, {
        deviceId: device.id,
      })

      return buildPlayerActionResult(
        'spotify.next',
        { deviceId: device.id },
        { device: mapDeviceResult(device) },
      )
    })

    register('spotify.previous', async (args = {}) => {
      const accessToken = getSpotifyAccessToken(mode, providerLinks)
      const { device } = await ensureSpotifyPlaybackDevice(
        accessToken,
        normalizeString(args.deviceId),
      )

      await skipToPreviousPlayback(accessToken, {
        deviceId: device.id,
      })

      return buildPlayerActionResult(
        'spotify.previous',
        { deviceId: device.id },
        { device: mapDeviceResult(device) },
      )
    })

    register(
      'provider.spotify.import_playlists',
      async () => {
        ensureLocalUser(localUserId)
        return importAllSpotifyPlaylists(localUserId)
      },
      { exposed: false },
    )

    register(
      'provider.spotify.import_playlist',
      async (args = {}) => {
        ensureLocalUser(localUserId)
        assert(args.playlistId, 'playlistId is required', 400)
        return importSpotifyPlaylist(localUserId, args.playlistId)
      },
      { exposed: false },
    )

    register(
      'provider.spotify.sync_saved_tracks',
      async () => {
        ensureLocalUser(localUserId)
        return syncSpotifySavedTracks(localUserId)
      },
      { exposed: false },
    )
  }

  register(
    'spotify.search',
    (args = {}) => executeTool('catalog.search', args),
    { exposed: false },
  )
  register(
    'spotify.get_album',
    (args = {}) => executeTool('catalog.get_album', args),
    { exposed: false },
  )
  register(
    'spotify.get_playlist',
    (args = {}) => executeTool('catalog.get_playlist', args),
    { exposed: false },
  )
  register(
    'spotify.get_recommendations',
    (args = {}) => executeTool('catalog.get_recommendations', args),
    { exposed: false },
  )

  return {
    async run(name, args) {
      return executeTool(name, args)
    },
    listAvailableTools() {
      return [...visibleTools]
    },
  }
}

export default {
  createAgentToolRegistry,
}
