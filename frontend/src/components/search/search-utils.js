import fallbackArtwork from '../../assets/hero.png'

export const SEARCH_TABS = [
  { key: 'all', labelKey: 'search_tab_all' },
  { key: 'track', labelKey: 'search_section_tracks' },
  { key: 'artist', labelKey: 'search_section_artists' },
  { key: 'playlist', labelKey: 'search_section_playlists' },
  { key: 'album', labelKey: 'search_section_albums' },
  { key: 'show', labelKey: 'search_tab_shows' },
]

export function normalizeSearchResults(results = {}) {
  return {
    tracks: Array.isArray(results.tracks) ? results.tracks : [],
    artists: Array.isArray(results.artists) ? results.artists : [],
    albums: Array.isArray(results.albums) ? results.albums : [],
    playlists: Array.isArray(results.playlists) ? results.playlists : [],
    shows: Array.isArray(results.shows) ? results.shows : [],
  }
}

export function getArtistNames(artists = []) {
  if (!Array.isArray(artists)) {
    return ''
  }

  return artists.map((artist) => artist?.name || '').filter(Boolean).join(', ')
}

export function getItemTypeLabel(type, t) {
  switch (type) {
    case 'track':
      return t('search_result_track')
    case 'artist':
      return t('search_result_artist')
    case 'album':
      return t('search_result_album')
    case 'playlist':
      return t('search_result_playlist')
    case 'show':
      return t('search_result_show')
    default:
      return t('appName')
  }
}

export function getItemImage(item, type) {
  if (type === 'track') {
    return item.album?.images?.[0]?.url || fallbackArtwork
  }

  return item.images?.[0]?.url || fallbackArtwork
}

export function getItemSubtitle(item, type, t) {
  switch (type) {
    case 'track':
      return getArtistNames(item.artists) || t('appName')
    case 'artist':
      return Array.isArray(item.genres) && item.genres.length > 0
        ? item.genres.slice(0, 2).join(', ')
        : t('search_source_spotify')
    case 'album':
      return getArtistNames(item.artists) || t('albums')
    case 'playlist':
      return item.owner?.display_name || t('playlists')
    case 'show':
      return item.publisher || t('appName')
    default:
      return t('appName')
  }
}

export function getItemMeta(item, type, t) {
  switch (type) {
    case 'track':
      return item.album?.name || ''
    case 'artist':
      return item.followers
        ? t('search_followers', {
            count: Number(item.followers).toLocaleString(),
          })
        : ''
    case 'album':
      return item.release_date || ''
    case 'playlist':
      return item.total_tracks
        ? t('search_tracks_count', {
            count: item.total_tracks,
          })
        : ''
    case 'show':
      return item.total_episodes
        ? t('search_episodes_count', {
            count: item.total_episodes,
          })
        : ''
    default:
      return ''
  }
}

export function getTrackUri(item) {
  if (typeof item?.uri === 'string' && item.uri.trim().startsWith('spotify:')) {
    return item.uri.trim()
  }

  if (item?.id) {
    return `spotify:track:${item.id}`
  }

  return ''
}

export function getResultCount(results = {}) {
  return (
    results.tracks.length +
    results.artists.length +
    results.albums.length +
    results.playlists.length +
    results.shows.length
  )
}

export function getTopResult(results = {}) {
  return (
    (results.tracks[0] ? { item: results.tracks[0], type: 'track' } : null) ||
    (results.playlists[0]
      ? { item: results.playlists[0], type: 'playlist' }
      : null) ||
    (results.albums[0] ? { item: results.albums[0], type: 'album' } : null) ||
    (results.artists[0] ? { item: results.artists[0], type: 'artist' } : null) ||
    (results.shows[0] ? { item: results.shows[0], type: 'show' } : null) ||
    null
  )
}

export function getTabItems(activeTab, results = {}) {
  if (activeTab === 'all') {
    return []
  }

  switch (activeTab) {
    case 'track':
      return results.tracks
    case 'artist':
      return results.artists
    case 'album':
      return results.albums
    case 'playlist':
      return results.playlists
    case 'show':
      return results.shows
    default:
      return []
  }
}

export function buildAllSections(results = {}, t) {
  return [
    {
      key: 'tracks',
      type: 'track',
      title: t('search_section_tracks'),
      items: results.tracks.slice(0, 5),
    },
    {
      key: 'artists',
      type: 'artist',
      title: t('search_section_artists'),
      items: results.artists.slice(0, 5),
    },
    {
      key: 'playlists',
      type: 'playlist',
      title: t('search_section_playlists'),
      items: results.playlists.slice(0, 5),
    },
    {
      key: 'albums',
      type: 'album',
      title: t('search_section_albums'),
      items: results.albums.slice(0, 5),
    },
    {
      key: 'shows',
      type: 'show',
      title: t('search_section_shows'),
      items: results.shows.slice(0, 5),
    },
  ].filter((section) => section.items.length > 0)
}

export function buildAgentPrompt(item, type, { query = '' } = {}) {
  switch (type) {
    case 'track':
      return [
        'I found a Spotify track in search and want to use it as recommendation context.',
        `Track: "${item.name}".`,
        `Artists: ${getArtistNames(item.artists) || 'Unknown artist'}.`,
        `Album: ${item.album?.name || 'Unknown album'}.`,
        `Spotify URI: ${getTrackUri(item) || 'unavailable'}.`,
        query ? `Search query context: "${query}".` : '',
        'Please introduce this track and recommend a few songs with a similar vibe.',
      ]
        .filter(Boolean)
        .join(' ')
    case 'artist':
      return `Introduce the artist ${item.name} and recommend a few essential starting tracks.`
    case 'album':
      return `Break down the album "${item.name}" and tell me which songs I should start with.`
    case 'playlist':
      return `Use the playlist "${item.name}" as a reference and recommend more songs with a similar style.`
    case 'show':
      return `Summarize the show "${item.name}" and recommend related podcast episodes or music context.`
    default:
      return `Help me continue exploring ${item.name}.`
  }
}

export function buildQueryPrompt(query) {
  return `I'm searching for "${query}". Help me decide what to start with and give me a smarter recommendation direction.`
}

export function buildEmptyQueryPrompt(query) {
  return `I couldn't find "${query}" in the public music catalog. Please recommend similar music from a different angle.`
}

export function buildBrowsePrompt() {
  return 'Recommend a set of songs that would be good to start with today.'
}

export function resolveTrackActionState({
  item,
  isConnected,
  isReady,
  isConnecting,
  errorCode,
  t,
}) {
  const previewUrl =
    typeof item?.preview_url === 'string' && item.preview_url.trim()
      ? item.preview_url.trim()
      : ''
  const remoteUri = getTrackUri(item)

  if (!isConnected && previewUrl) {
    return {
      mode: 'preview',
      label: t('search_play_preview'),
      hint: t('search_preview_secondary_hint'),
      disabled: false,
    }
  }

  if (!remoteUri) {
    if (previewUrl) {
      return {
        mode: 'preview',
        label: t('search_play_preview'),
        hint: t('search_preview_secondary_hint'),
        disabled: false,
      }
    }

    return {
      mode: 'disabled',
      label: t('agent_playback_unavailable'),
      hint: t('player_unavailable_hint'),
      disabled: true,
    }
  }

  if (!isConnected) {
    return {
      mode: 'connect',
      label: t('spotify_connect'),
      hint: t('player_spotify_connect_hint'),
      disabled: false,
    }
  }

  if (errorCode === 'spotify_premium_required') {
    return {
      mode: 'disabled',
      label: t('spotify_playback_status_premium'),
      hint: t('search_spotify_premium_hint'),
      disabled: true,
    }
  }

  if (isConnecting) {
    return {
      mode: 'waiting',
      label: t('spotify_playback_status_connecting'),
      hint: t('player_spotify_activate_hint'),
      disabled: true,
    }
  }

  if (!isReady) {
    return {
      mode: 'activate',
      label: t('spotify_playback_activate'),
      hint: t('player_spotify_activate_hint'),
      disabled: false,
    }
  }

  return {
    mode: 'play',
    label: t('search_play_on_spotify'),
    hint: t('search_spotify_full_playback_hint'),
    disabled: false,
  }
}
