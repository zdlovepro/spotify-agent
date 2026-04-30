import crypto from 'crypto'
import { assert } from '../../utils/assert.js'
import { getProviderLink, refreshProviderToken } from './provider-link-service.js'
import { SPOTIFY_PROVIDER_NAME } from './spotify-provider-service.js'
import {
  createFavorite,
  createPlaylist,
  getPlaylist,
  addPlaylistItem,
} from '../library/library-service.js'
import {
  getPlaylist as getSpotifyPlaylist,
  getPlaylistTracks,
  getUserPlaylists,
  getUserSavedTracks,
} from '../spotify-api.js'

const SPOTIFY_IMPORT_SOURCE_TYPE = 'spotify_import'

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

function createImportedPlaylistSourceId(spotifyPlaylistId) {
  return `${SPOTIFY_IMPORT_SOURCE_TYPE}:playlist:${spotifyPlaylistId}:${crypto.randomUUID()}`
}

function getSpotifyTrackReference(track = {}) {
  assert(track?.id, 'Spotify track id is required', 400)

  return {
    source_type: 'spotify',
    source_id: `spotify:track:${track.id}`,
    title: track.name || 'Unknown track',
    artists: normalizeSpotifyArtists(track.artists),
    album: {
      id: track.album?.id || '',
      name: track.album?.name || '',
    },
    image_url: track.album?.images?.[0]?.url || '',
    preview_url: track.preview_url || '',
    duration_ms: track.duration_ms ?? null,
    provider: 'spotify',
    entity_type: 'track',
  }
}

async function getActiveSpotifyProviderLink(localUserId) {
  const providerLink = getProviderLink(localUserId, SPOTIFY_PROVIDER_NAME)

  assert(providerLink, 'Spotify provider is not connected', 403)

  const activeProviderLink = await refreshProviderToken(providerLink)

  assert(activeProviderLink?.accessToken, 'Spotify access token is unavailable', 403)

  return activeProviderLink
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

    playlistTracks.push(...items)

    if (items.length < limit) {
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
  const spotifyPlaylist = await getSpotifyPlaylist(accessToken, spotifyPlaylistId, {
    market: 'from_token',
  })
  const localPlaylist = createPlaylist(localUserId, {
    title: spotifyPlaylist.name || 'Spotify import',
    description: spotifyPlaylist.description || '',
    cover_image_url: spotifyPlaylist.images?.[0]?.url || '',
    visibility: 'private',
    source_type: SPOTIFY_IMPORT_SOURCE_TYPE,
    source_id: createImportedPlaylistSourceId(spotifyPlaylist.id),
    metadata: {
      provider: 'spotify',
      importType: 'playlist',
      spotifyPlaylistId: spotifyPlaylist.id,
      spotifyPlaylistUri: spotifyPlaylist.uri || '',
      spotifyOwnerId: spotifyPlaylist.owner?.id || '',
      spotifyOwnerName:
        spotifyPlaylist.owner?.display_name || spotifyPlaylist.owner?.id || '',
      importedAt: new Date().toISOString(),
    },
  })
  const rawItems = await listAllSpotifyPlaylistTracks(accessToken, spotifyPlaylist.id)
  let importedTrackCount = 0

  for (const item of rawItems) {
    if (!item?.track?.id) {
      continue
    }

    addPlaylistItem(localUserId, localPlaylist.id, getSpotifyTrackReference(item.track))
    importedTrackCount += 1
  }

  return {
    playlist: getPlaylist(localUserId, localPlaylist.id),
    importedTrackCount,
    spotifyPlaylistId: spotifyPlaylist.id,
  }
}

export async function importSpotifyPlaylist(localUserId, spotifyPlaylistId) {
  const providerLink = await getActiveSpotifyProviderLink(localUserId)
  return importSpotifyPlaylistWithAccessToken(
    localUserId,
    providerLink.accessToken,
    spotifyPlaylistId,
  )
}

export async function importAllSpotifyPlaylists(localUserId) {
  const providerLink = await getActiveSpotifyProviderLink(localUserId)
  const spotifyPlaylists = await listAllSpotifyPlaylists(providerLink.accessToken)
  const importedPlaylists = []

  for (const spotifyPlaylist of spotifyPlaylists) {
    if (!spotifyPlaylist?.id) {
      continue
    }

    importedPlaylists.push(
      await importSpotifyPlaylistWithAccessToken(
        localUserId,
        providerLink.accessToken,
        spotifyPlaylist.id,
      ),
    )
  }

  return {
    importedCount: importedPlaylists.length,
    items: importedPlaylists,
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

    createFavorite(localUserId, {
      ...getSpotifyTrackReference(item.track),
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
