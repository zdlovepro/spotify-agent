import fallbackArtwork from '../assets/hero.png'

const LOCAL_LIBRARY_ACCENT = '#1ed760'

function formatDuration(durationMs = 0) {
  const safeDuration = Math.max(0, Number(durationMs) || 0)
  const totalSeconds = Math.floor(safeDuration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getImageFromTrack(track = {}) {
  return (
    track.image_url ||
    track.image ||
    track.album?.images?.[0]?.url ||
    track.images?.[0]?.url ||
    fallbackArtwork
  )
}

function getArtistNames(artists = []) {
  if (!Array.isArray(artists)) {
    return ''
  }

  return artists
    .map((artist) => (typeof artist === 'string' ? artist : artist?.name || ''))
    .filter(Boolean)
    .join(', ')
}

function mapTrackToPlaylistSong(track, index) {
  return {
    id: track.id || track.source_id || track.sourceId || `track-${index}`,
    index: String(index + 1),
    songName: track.title || track.name || 'Unknown track',
    songimg: getImageFromTrack(track),
    songArtist: getArtistNames(track.artists) || 'Unknown artist',
    link: track.preview_url || track.previewUrl || '',
    trackTime: formatDuration(track.duration_ms || track.durationMs || 0),
    playable: Boolean(track.preview_url || track.previewUrl),
  }
}

export function mapLocalPlaylistSummary(playlist, index = 0) {
  return {
    index: String(index),
    source: 'agentmusic',
    type: 'playlist',
    title: playlist.title || 'Untitled playlist',
    link: playlist.id,
    imgUrl:
      playlist.coverImageUrl ||
      playlist.items?.[0]?.image_url ||
      playlist.items?.[0]?.image ||
      fallbackArtwork,
    hoverColor: LOCAL_LIBRARY_ACCENT,
    artist: 'AgentMusic Library',
    playlistBg: LOCAL_LIBRARY_ACCENT,
    description: playlist.description || '',
    playlistData: Array.isArray(playlist.items)
      ? playlist.items.map(mapTrackToPlaylistSong)
      : [],
  }
}

export function mapLocalPlaylistDetails(playlist) {
  return {
    ...mapLocalPlaylistSummary(playlist),
    playlistData: Array.isArray(playlist.items)
      ? playlist.items.map(mapTrackToPlaylistSong)
      : [],
  }
}

export function mapCatalogPlaylistDetails(playlist) {
  return {
    index: '0',
    source: playlist.source_type || 'spotify',
    type: 'playlist',
    title: playlist.name || 'Spotify Playlist',
    link: playlist.id,
    imgUrl: playlist.images?.[0]?.url || fallbackArtwork,
    hoverColor: LOCAL_LIBRARY_ACCENT,
    artist: playlist.owner?.display_name || 'Spotify',
    playlistBg: LOCAL_LIBRARY_ACCENT,
    description: playlist.description || '',
    playlistData: Array.isArray(playlist.tracks)
      ? playlist.tracks
          .map((item) => item.track)
          .filter(Boolean)
          .map(mapTrackToPlaylistSong)
      : [],
  }
}
