import defaultPlaylistCover from '../assets/default-playlist-cover.png'
import { resolveTrackPlaybackMeta } from '../lib/spotify.js'

const LOCAL_LIBRARY_ACCENT = '#1c372a'
const DEFAULT_PLAYLIST_TITLE = 'Untitled playlist'

export function getPlaylistCoverUrl(playlist = {}) {
  return (
    playlist.coverUrl ||
    playlist.coverImageUrl ||
    playlist.cover_image_url ||
    playlist.imageUrl ||
    playlist.image_url ||
    playlist.imgUrl ||
    playlist.images?.[0]?.url ||
    playlist.items?.[0]?.image_url ||
    playlist.items?.[0]?.image ||
    playlist.playlistData?.[0]?.songImg ||
    playlist.playlistData?.[0]?.songimg ||
    ''
  )
}

export function canManageLocalPlaylist(playlist = {}) {
  if (playlist?.canEdit || playlist?.canDelete) {
    return true
  }

  const sourceType = String(
    playlist.sourceType || playlist.source || playlist.source_type || '',
  ).toLowerCase()

  return sourceType === 'agentmusic'
}

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
    defaultPlaylistCover
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
  const playback = resolveTrackPlaybackMeta(track)
  const durationMs = track.duration_ms || track.durationMs || 0
  const songImage = getImageFromTrack(track)
  const songName = track.title || track.name || 'Unknown track'
  const songArtist = getArtistNames(track.artists) || 'Unknown artist'

  return {
    id: track.id || track.source_id || track.sourceId || `track-${index}`,
    index: String(index + 1),
    songName,
    songImg: songImage,
    songimg: songImage,
    songArtist,
    link: playback.streamUrl,
    audioUrl: playback.audioUrl,
    previewUrl: playback.previewUrl,
    remoteUri: playback.remoteUri,
    sourceType:
      track.source_type ||
      track.sourceType ||
      (playback.isLocalAudio ? 'local_audio' : playback.isSpotifyRemote ? 'spotify' : ''),
    playMode: playback.playMode,
    duration: durationMs,
    durationMs,
    trackTime: formatDuration(durationMs),
    playable: playback.playable,
    sourceId: track.source_id || track.sourceId || '',
    uri: track.uri || playback.remoteUri,
    title: songName,
    name: songName,
  }
}

export function mapLocalPlaylistSummary(playlist, index = 0) {
  const isSpotifyImport = playlist.sourceType === 'spotify_import'
  const itemCount = Number.isFinite(Number(playlist.itemCount))
    ? Number(playlist.itemCount)
    : Array.isArray(playlist.items)
      ? playlist.items.length
      : 0
  const coverUrl = getPlaylistCoverUrl(playlist)

  return {
    id: playlist.id || playlist.link || '',
    index: String(index),
    source: playlist.sourceType || 'agentmusic',
    sourceType: playlist.sourceType || 'agentmusic',
    sourceId: playlist.sourceId || '',
    type: 'playlist',
    title: playlist.title || playlist.name || DEFAULT_PLAYLIST_TITLE,
    link: playlist.id,
    imgUrl: coverUrl,
    imageUrl: coverUrl,
    coverUrl,
    hoverColor: LOCAL_LIBRARY_ACCENT,
    artist: isSpotifyImport
      ? playlist.metadata?.spotifyOwnerName || 'Spotify import'
      : 'AgentMusic Library',
    playlistBg: LOCAL_LIBRARY_ACCENT,
    description: playlist.description || '',
    sourceLabel: isSpotifyImport ? 'spotify_import' : 'local_library',
    itemCount,
    canEdit: Boolean(playlist.canEdit ?? (!isSpotifyImport && playlist.sourceType === 'agentmusic')),
    canDelete: Boolean(playlist.canDelete ?? (!isSpotifyImport && playlist.sourceType === 'agentmusic')),
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
  const coverUrl = getPlaylistCoverUrl(playlist)

  return {
    index: '0',
    source: playlist.source_type || 'spotify',
    sourceType: playlist.source_type || 'spotify',
    type: 'playlist',
    title: playlist.name || 'Spotify Playlist',
    link: playlist.id,
    imgUrl: coverUrl,
    imageUrl: coverUrl,
    coverUrl,
    hoverColor: LOCAL_LIBRARY_ACCENT,
    artist: playlist.owner?.display_name || 'Spotify',
    playlistBg: LOCAL_LIBRARY_ACCENT,
    description: playlist.description || '',
    canEdit: false,
    canDelete: false,
    playlistData: Array.isArray(playlist.tracks)
      ? playlist.tracks
          .map((item) => item.track)
          .filter(Boolean)
          .map(mapTrackToPlaylistSong)
      : [],
  }
}
