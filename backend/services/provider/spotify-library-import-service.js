import { getProviderLink, refreshProviderToken } from './provider-link-service.js'
import {
  SPOTIFY_PLAYLIST_IMPORT_SCOPES,
  SPOTIFY_PROVIDER_NAME,
} from './spotify-provider-service.js'
import {
  addPlaylistItem,
  createFavorite,
  createPlaylist,
  deletePlaylist,
  findPlaylistBySource,
  getPlaylist,
  listPlaylists,
  updatePlaylist,
} from '../library/library-service.js'
import {
  getPlaylist as getSpotifyPlaylist,
  getPlaylistTracks,
  getUserPlaylists,
  getUserSavedTracks,
} from '../spotify-api.js'

const SPOTIFY_IMPORT_SOURCE_TYPE = 'spotify_import'

function createSpotifyImportError(
  message,
  code,
  status = 403,
  extras = undefined,
) {
  const error = new Error(message)
  error.code = code
  error.status = status

  if (extras && typeof extras === 'object') {
    Object.assign(error, extras)
  }

  return error
}

function normalizeSpotifyArtists(artists = []) {
  return (Array.isArray(artists) ? artists : [])
    .map((artist) => {
      if (typeof artist === 'string') {
        return artist.trim()
      }

      if (artist?.name) {
        return String(artist.name).trim()
      }

      return ''
    })
    .filter(Boolean)
}

function normalizeSpotifyTrackString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function createImportedPlaylistSourceId(spotifyPlaylistId) {
  return `${SPOTIFY_IMPORT_SOURCE_TYPE}:playlist:${spotifyPlaylistId}`
}

function buildSpotifyPlaylistImportMetadata(spotifyPlaylist = {}, extra = {}) {
  return {
    provider: 'spotify',
    importType: 'playlist',
    spotifyPlaylistId: spotifyPlaylist.id || '',
    spotifyPlaylistUri: spotifyPlaylist.uri || '',
    spotifyOwnerId: spotifyPlaylist.owner?.id || '',
    spotifyOwnerName:
      spotifyPlaylist.owner?.display_name || spotifyPlaylist.owner?.id || '',
    importedAt: new Date().toISOString(),
    ...extra,
  }
}

function getSpotifyTrackReference(track = {}) {
  if (!track?.id) {
    return null
  }

  if (track.type && track.type !== 'track') {
    return null
  }

  const title = normalizeSpotifyTrackString(track.name)
  const fallbackUri = track.id ? `spotify:track:${track.id}` : ''
  const rawUri = normalizeSpotifyTrackString(track.uri || fallbackUri)
  const uri = rawUri.startsWith('spotify:track:') ? rawUri : fallbackUri
  const albumId = normalizeSpotifyTrackString(track.album?.id)
  const album = {
    id: albumId,
    name: normalizeSpotifyTrackString(track.album?.name),
  }

  if (!title || !uri) {
    return null
  }

  return {
    sourceType: 'spotify',
    source_type: 'spotify',
    sourceId: uri,
    source_id: uri,
    uri,
    title,
    name: title,
    artists: normalizeSpotifyArtists(track.artists),
    album,
    imageUrl: track.album?.images?.[0]?.url || '',
    image_url: track.album?.images?.[0]?.url || '',
    previewUrl: track.preview_url || '',
    preview_url: track.preview_url || '',
    durationMs: track.duration_ms ?? null,
    duration_ms: track.duration_ms ?? null,
    playMode: 'spotify_remote',
    play_mode: 'spotify_remote',
    playable: false,
    provider: 'spotify',
    entity_type: 'track',
    metadata: {
      provider: 'spotify',
      entityType: 'track',
      playMode: 'spotify_remote',
      uri,
      spotifyTrackId: track.id,
      spotifyAlbumId: albumId || null,
    },
  }
}

async function getActiveSpotifyProviderLink(
  localUserId,
  { requiredScopes = [] } = {},
) {
  const providerLink = getProviderLink(localUserId, SPOTIFY_PROVIDER_NAME)

  console.info('[spotify-import] provider link lookup', {
    localUserId,
    providerConnected: Boolean(providerLink),
  })

  if (!providerLink) {
    throw createSpotifyImportError(
      'Spotify provider is not connected.',
      'spotify_not_connected',
      403,
    )
  }

  const normalizedScopes = Array.isArray(providerLink.scopes)
    ? providerLink.scopes
    : typeof providerLink.scopes === 'string'
      ? providerLink.scopes.split(' ').filter(Boolean)
      : []
  const normalizedRequiredScopes = Array.isArray(requiredScopes)
    ? requiredScopes
    : []
  const missingScopes = normalizedRequiredScopes.filter(
    (scope) => !normalizedScopes.includes(scope),
  )

  console.info('[spotify-import] playlist scope check', {
    localUserId,
    hasRequiredScopes: missingScopes.length === 0,
    missingScopes,
  })

  if (missingScopes.length) {
    throw createSpotifyImportError(
      'Spotify authorization is missing playlist scopes. Please reconnect Spotify.',
      'spotify_scope_required',
      403,
      {
        missingScopes,
      },
    )
  }

  const activeProviderLink = await refreshProviderToken(providerLink)

  if (!activeProviderLink?.accessToken) {
    throw createSpotifyImportError(
      'Spotify access token is unavailable.',
      'spotify_token_unavailable',
      503,
    )
  }

  return activeProviderLink
}

function countPlaylistItems(playlist = {}) {
  if (Number.isFinite(Number(playlist?.itemCount))) {
    return Number(playlist.itemCount)
  }

  return Array.isArray(playlist?.items) ? playlist.items.length : 0
}

function findLegacyImportedPlaylist(localUserId, spotifyPlaylistId) {
  if (!spotifyPlaylistId) {
    return null
  }

  const legacyPlaylist = listPlaylists(localUserId).find(
    (playlist) =>
      playlist.sourceType === SPOTIFY_IMPORT_SOURCE_TYPE &&
      playlist.metadata?.spotifyPlaylistId === spotifyPlaylistId,
  )

  if (!legacyPlaylist) {
    return null
  }

  return getPlaylist(localUserId, legacyPlaylist.id) || {
    ...legacyPlaylist,
    items: [],
    itemCount: 0,
  }
}

function findImportedPlaylist(localUserId, spotifyPlaylistId) {
  const stableSourceId = createImportedPlaylistSourceId(spotifyPlaylistId)

  return (
    findPlaylistBySource(
      localUserId,
      SPOTIFY_IMPORT_SOURCE_TYPE,
      stableSourceId,
    ) || findLegacyImportedPlaylist(localUserId, spotifyPlaylistId)
  )
}

function formatPlaylistImportError(error) {
  if (error?.spotifyError?.path) {
    return `${error.spotifyError.path}: ${error.spotifyError.message || error.message}`
  }

  if (error?.message) {
    return error.message
  }

  if (error?.spotifyError?.message) {
    return error.spotifyError.message
  }

  return 'Spotify playlist import failed.'
}

function createPlaylistFailureResult(spotifyPlaylist = {}, error) {
  return {
    spotifyPlaylistId:
      spotifyPlaylist.id || error?.details?.spotifyPlaylistId || '',
    name:
      spotifyPlaylist.name ||
      error?.details?.spotifyPlaylistName ||
      'Spotify playlist',
    stage: error?.stage || 'import_playlist',
    status: error?.status || error?.spotifyError?.status || 400,
    code: error?.code || 'spotify_playlist_import_failed',
    message: formatPlaylistImportError(error),
    ...(error?.spotifyError ? { spotifyError: error.spotifyError } : {}),
  }
}

function shouldAbortImport(error) {
  return (
    [
      'spotify_not_connected',
      'spotify_scope_required',
      'spotify_reconnect_required',
      'spotify_token_unavailable',
      'spotify_token_refresh_failed',
    ].includes(error?.code) ||
    error?.status === 401
  )
}

async function listAllSpotifyPlaylists(accessToken) {
  const playlists = []
  const limit = 50
  let offset = 0

  while (true) {
    const response = await getUserPlaylists(accessToken, {
      limit,
      offset,
    })
    const items = Array.isArray(response?.items) ? response.items : []

    playlists.push(...items)

    if (items.length < limit) {
      break
    }

    offset += limit
  }

  return playlists
}

async function listAllSpotifySavedTracks(accessToken) {
  const savedTracks = []
  const limit = 50
  let offset = 0

  while (true) {
    const response = await getUserSavedTracks(accessToken, {
      limit,
      offset,
      market: 'from_token',
    })
    const items = Array.isArray(response?.items) ? response.items : []

    savedTracks.push(...items)

    if (items.length < limit) {
      break
    }

    offset += limit
  }

  return savedTracks
}

async function listAllSpotifyPlaylistTracks(accessToken, spotifyPlaylistId) {
  const playlistTracks = []
  const limit = 100
  let offset = 0

  while (true) {
    const response = await getPlaylistTracks(accessToken, spotifyPlaylistId, {
      limit,
      offset,
      market: 'from_token',
    })
    const items = Array.isArray(response?.items) ? response.items : []
    const total =
      Number.isFinite(Number(response?.total)) && Number(response.total) >= 0
        ? Number(response.total)
        : null

    console.info('[spotify-import] fetched spotify playlist track page', {
      spotifyPlaylistId,
      offset,
      pageItemCount: items.length,
      total,
    })

    playlistTracks.push(...items)

    if (!response?.next || items.length === 0) {
      break
    }

    offset += limit
  }

  return playlistTracks
}

async function importSpotifyPlaylistWithAccessToken(
  localUserId,
  accessToken,
  spotifyPlaylistId,
) {
  const existingImportedPlaylist = findImportedPlaylist(
    localUserId,
    spotifyPlaylistId,
  )
  const existingItemCount = countPlaylistItems(existingImportedPlaylist)

  if (existingImportedPlaylist && existingItemCount > 0) {
    return {
      skipped: true,
      spotifyPlaylistId,
      spotifyPlaylistName:
        existingImportedPlaylist.title || 'Spotify playlist',
      name: existingImportedPlaylist.title || 'Spotify playlist',
      reason: 'already_imported',
      playlistId: existingImportedPlaylist.id,
    }
  }

  if (existingImportedPlaylist && existingItemCount === 0) {
    console.info(
      '[spotify-import] removing empty imported spotify playlist before reimport',
      {
        localUserId,
        spotifyPlaylistId,
        playlistId: existingImportedPlaylist.id,
        name: existingImportedPlaylist.title || 'Spotify playlist',
      },
    )
    deletePlaylist(localUserId, existingImportedPlaylist.id)
  }

  const spotifyPlaylist = await getSpotifyPlaylist(accessToken, spotifyPlaylistId, {
    market: 'from_token',
  })
  let rawItems = []

  try {
    rawItems = await listAllSpotifyPlaylistTracks(accessToken, spotifyPlaylist.id)
  } catch (error) {
    throw createSpotifyImportError(
      'Spotify playlist tracks could not be fetched.',
      Number(error?.status) === 403
        ? 'spotify_playlist_tracks_forbidden'
        : 'spotify_playlist_tracks_fetch_failed',
      error?.status || error?.spotifyError?.status || 502,
      {
        stage: 'fetch_playlist_tracks',
        spotifyError: error?.spotifyError,
        details: {
          spotifyPlaylistId: spotifyPlaylist.id,
          spotifyPlaylistName: spotifyPlaylist.name || 'Spotify playlist',
        },
      },
    )
  }

  console.info('[spotify-import] fetched raw spotify playlist tracks', {
    localUserId,
    spotifyPlaylistId: spotifyPlaylist.id,
    name: spotifyPlaylist.name || 'Spotify playlist',
    rawItemsLength: rawItems.length,
  })

  const localPlaylist = createPlaylist(localUserId, {
    title: spotifyPlaylist.name || 'Spotify import',
    description: spotifyPlaylist.description || '',
    cover_image_url: spotifyPlaylist.images?.[0]?.url || '',
    visibility: 'private',
    source_type: SPOTIFY_IMPORT_SOURCE_TYPE,
    source_id: createImportedPlaylistSourceId(spotifyPlaylist.id),
    metadata: buildSpotifyPlaylistImportMetadata(spotifyPlaylist, {
      fetchedTrackItemCount: rawItems.length,
      importedTrackCount: 0,
      skippedTrackCount: 0,
      failedTrackCount: 0,
    }),
  })

  let importedTrackCount = 0
  let skippedTrackCount = 0
  let failedTrackCount = 0

  for (const item of rawItems) {
    const trackReference = getSpotifyTrackReference(item?.track)

    if (!trackReference) {
      skippedTrackCount += 1
      continue
    }

    try {
      const createdItem = addPlaylistItem(
        localUserId,
        localPlaylist.id,
        trackReference,
      )

      if (!createdItem) {
        failedTrackCount += 1
        console.info(
          '[spotify-import] addPlaylistItem returned null for spotify track',
          {
            localUserId,
            spotifyPlaylistId: spotifyPlaylist.id,
            playlistId: localPlaylist.id,
            spotifyTrackId: item.track.id,
            trackName: trackReference.title,
          },
        )
        continue
      }

      importedTrackCount += 1
    } catch (error) {
      failedTrackCount += 1
      console.info(
        '[spotify-import] failed to store spotify track in local playlist',
        {
          localUserId,
          spotifyPlaylistId: spotifyPlaylist.id,
          playlistId: localPlaylist.id,
          spotifyTrackId: item.track.id,
          trackName: trackReference.title,
          error: error.message || 'playlist_item_insert_failed',
        },
      )
    }
  }

  if (importedTrackCount === 0 && failedTrackCount > 0) {
    deletePlaylist(localUserId, localPlaylist.id)
    throw createSpotifyImportError(
      'Spotify playlist tracks could not be saved to the local library.',
      'spotify_playlist_tracks_insert_failed',
      500,
      {
        stage: 'insert_playlist_tracks',
        details: {
          spotifyPlaylistId: spotifyPlaylist.id,
          spotifyPlaylistName: spotifyPlaylist.name || 'Spotify playlist',
          failedTrackCount,
          skippedTrackCount,
        },
      },
    )
  }

  const completedPlaylist =
    updatePlaylist(localUserId, localPlaylist.id, {
      metadata: buildSpotifyPlaylistImportMetadata(spotifyPlaylist, {
        fetchedTrackItemCount: rawItems.length,
        importedTrackCount,
        skippedTrackCount,
        failedTrackCount,
      }),
    }) || getPlaylist(localUserId, localPlaylist.id)
  const playlistItemCount = countPlaylistItems(completedPlaylist)

  console.info('[spotify-import] completed spotify playlist import', {
    localUserId,
    spotifyPlaylistId: spotifyPlaylist.id,
    playlistId: localPlaylist.id,
    name: spotifyPlaylist.name || 'Spotify playlist',
    rawItemsLength: rawItems.length,
    importedTrackCount,
    skippedTrackCount,
    failedTrackCount,
    playlistItemCount,
  })

  if (importedTrackCount > 0 && playlistItemCount === 0) {
    deletePlaylist(localUserId, localPlaylist.id)
    throw createSpotifyImportError(
      'Local playlist items could not be reloaded after Spotify import.',
      'local_playlist_items_reload_failed',
      500,
      {
        stage: 'reload_local_playlist',
        details: {
          spotifyPlaylistId: spotifyPlaylist.id,
          spotifyPlaylistName: spotifyPlaylist.name || 'Spotify playlist',
          playlistId: localPlaylist.id,
          importedTrackCount,
        },
      },
    )
  }

  return {
    playlist: completedPlaylist,
    importedTrackCount,
    skippedTrackCount,
    failedTrackCount,
    spotifyPlaylistId: spotifyPlaylist.id,
    spotifyPlaylistName: spotifyPlaylist.name || 'Spotify playlist',
  }
}

export async function importSpotifyPlaylist(localUserId, spotifyPlaylistId) {
  const providerLink = await getActiveSpotifyProviderLink(localUserId, {
    requiredScopes: SPOTIFY_PLAYLIST_IMPORT_SCOPES,
  })

  return importSpotifyPlaylistWithAccessToken(
    localUserId,
    providerLink.accessToken,
    spotifyPlaylistId,
  )
}

export async function importAllSpotifyPlaylists(localUserId) {
  const providerLink = await getActiveSpotifyProviderLink(localUserId, {
    requiredScopes: SPOTIFY_PLAYLIST_IMPORT_SCOPES,
  })
  const spotifyPlaylists = await listAllSpotifyPlaylists(providerLink.accessToken)

  console.info('[spotify-import] fetched spotify playlists', {
    localUserId,
    playlistCount: spotifyPlaylists.length,
  })

  const importedPlaylists = []
  const failedPlaylists = []
  const skippedPlaylists = []
  let importedTrackCount = 0

  for (const spotifyPlaylist of spotifyPlaylists) {
    if (!spotifyPlaylist?.id) {
      continue
    }

    try {
      const importedPlaylist = await importSpotifyPlaylistWithAccessToken(
        localUserId,
        providerLink.accessToken,
        spotifyPlaylist.id,
      )

      if (importedPlaylist?.skipped) {
        skippedPlaylists.push({
          spotifyPlaylistId: importedPlaylist.spotifyPlaylistId,
          spotifyPlaylistName: importedPlaylist.spotifyPlaylistName,
          name:
            importedPlaylist.spotifyPlaylistName ||
            spotifyPlaylist.name ||
            'Spotify playlist',
          reason: importedPlaylist.reason || 'already_imported',
        })
        console.info('[spotify-import] skipped spotify playlist import', {
          localUserId,
          spotifyPlaylistId: importedPlaylist.spotifyPlaylistId,
          name:
            importedPlaylist.spotifyPlaylistName ||
            spotifyPlaylist.name ||
            'Spotify playlist',
        })
        continue
      }

      importedPlaylists.push(importedPlaylist)
      importedTrackCount += Number(importedPlaylist.importedTrackCount) || 0
      console.info('[spotify-import] imported spotify playlist', {
        localUserId,
        spotifyPlaylistId: spotifyPlaylist.id,
        name:
          importedPlaylist.playlist?.title ||
          importedPlaylist.spotifyPlaylistName ||
          spotifyPlaylist.name ||
          'Spotify playlist',
        importedTrackCount: importedPlaylist.importedTrackCount,
        skippedTrackCount: importedPlaylist.skippedTrackCount,
        failedTrackCount: importedPlaylist.failedTrackCount,
      })
    } catch (error) {
      if (shouldAbortImport(error)) {
        throw error
      }

      const failure = createPlaylistFailureResult(spotifyPlaylist, error)
      failedPlaylists.push(failure)
      console.info('[spotify-import] failed spotify playlist import', {
        localUserId,
        spotifyPlaylistId: failure.spotifyPlaylistId,
        name: failure.name,
        stage: failure.stage,
        status: failure.status,
        code: failure.code,
        message: failure.message,
      })
    }
  }

  console.info('[spotify-import] import summary', {
    localUserId,
    importedCount: importedPlaylists.length,
    importedTrackCount,
    failedCount: failedPlaylists.length,
    skippedCount: skippedPlaylists.length,
  })

  return {
    importedCount: importedPlaylists.length,
    importedTrackCount,
    failedCount: failedPlaylists.length,
    skippedCount: skippedPlaylists.length,
    items: importedPlaylists,
    failures: failedPlaylists,
    skipped: skippedPlaylists,
  }
}

export async function syncSpotifySavedTracks(localUserId) {
  const providerLink = await getActiveSpotifyProviderLink(localUserId)
  const savedTracks = await listAllSpotifySavedTracks(providerLink.accessToken)
  let importedCount = 0

  for (const item of savedTracks) {
    if (!item?.track?.id) {
      continue
    }

    const trackReference = getSpotifyTrackReference(item.track)

    if (!trackReference) {
      continue
    }

    createFavorite(localUserId, {
      ...trackReference,
      favorite_type: 'track',
    })
    importedCount += 1
  }

  return {
    importedCount,
    total: savedTracks.length,
  }
}

export default {
  importAllSpotifyPlaylists,
  importSpotifyPlaylist,
  syncSpotifySavedTracks,
}
