import { configureStore, createSlice } from '@reduxjs/toolkit'
import { PLAYLIST } from '../data/index.js'
import {
  createAgentPlaybackQueue,
  createPlaybackQueue,
  resolveTrackPlaybackMeta,
  TRACK_PLAY_MODES,
} from '../lib/spotify.js'

const initialQueue = createPlaybackQueue(PLAYLIST[0])

function normalizeArtistNames(artists = []) {
  if (Array.isArray(artists)) {
    return artists
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

  if (typeof artists === 'string' && artists.trim()) {
    return artists
      .split(',')
      .map((artist) => artist.trim())
      .filter(Boolean)
  }

  return []
}

function getTrackDurationMs(track = {}) {
  const durationMs = track.durationMs ?? track.duration_ms ?? 0

  return Number.isFinite(Number(durationMs)) && Number(durationMs) >= 0
    ? Number(durationMs)
    : 0
}

function normalizeQueueTrackEntry(track = {}, index = 0) {
  const playback = resolveTrackPlaybackMeta(track)
  const artists = normalizeArtistNames(
    track.artists || track.artist || track.trackArtist || track.songArtist,
  )
  const sourceType =
    track.sourceType ||
    track.source_type ||
    (playback.isLocalAudio
      ? 'local_audio'
      : playback.isSpotifyRemote
        ? 'spotify'
        : track.source || 'agent')
  const sourceId =
    track.sourceId ||
    track.source_id ||
    playback.remoteUri ||
    `${sourceType}:track:${track.id || index}`
  const name =
    track.name ||
    track.title ||
    track.trackName ||
    track.songName ||
    'Unknown track'
  const image =
    track.image ||
    track.image_url ||
    track.trackImg ||
    track.songimg ||
    track.album?.images?.[0]?.url ||
    ''
  const artistLabel =
    track.trackArtist ||
    track.songArtist ||
    artists.join(', ') ||
    'Unknown artist'

  return {
    ...track,
    id: track.id || `${sourceId || 'queue-track'}-${index}`,
    source: track.source || sourceType,
    sourceType,
    sourceId,
    name,
    artists,
    album:
      typeof track.album === 'string'
        ? track.album
        : track.album?.name || track.albumName || '',
    image,
    durationMs: getTrackDurationMs(track),
    track: playback.audioUrl,
    audioUrl: playback.audioUrl,
    previewUrl: playback.previewUrl,
    remoteUri: playback.remoteUri,
    uri: track.uri || playback.remoteUri,
    playMode: playback.playMode,
    playable: playback.playable,
    trackName: track.trackName || track.songName || name,
    trackImg: image,
    trackArtist: artistLabel,
    trackTime: track.trackTime || '',
    queueIndex: Number.isFinite(Number(track.queueIndex))
      ? Number(track.queueIndex)
      : index,
  }
}

function normalizeQueue(queue = []) {
  return (Array.isArray(queue) ? queue : []).map((track, index) =>
    normalizeQueueTrackEntry(track, index),
  )
}

function createSpotifyActionTrack(uri = '', index = 0) {
  return {
    id: `spotify-action-${index}`,
    source: 'spotify',
    sourceType: 'spotify',
    sourceId: uri,
    name: 'Spotify track',
    artists: [],
    album: '',
    image: '',
    durationMs: 0,
    audioUrl: '',
    uri,
    playMode: TRACK_PLAY_MODES.SPOTIFY_REMOTE,
    playable: false,
  }
}

function extractActionTracks(payload = {}) {
  if (Array.isArray(payload.tracks) && payload.tracks.length) {
    return payload.tracks
  }

  if (payload.track && typeof payload.track === 'object') {
    return [payload.track]
  }

  if (Array.isArray(payload.uris) && payload.uris.length) {
    return payload.uris
      .filter((uri) => typeof uri === 'string' && uri.trim())
      .map((uri, index) => createSpotifyActionTrack(uri.trim(), index))
  }

  if (typeof payload.uri === 'string' && payload.uri.trim()) {
    return [createSpotifyActionTrack(payload.uri.trim(), 0)]
  }

  return []
}

function canQueueTrackStart(track) {
  const playback = resolveTrackPlaybackMeta(track)

  return (
    playback.playable ||
    (playback.playMode === TRACK_PLAY_MODES.SPOTIFY_REMOTE &&
      Boolean(playback.remoteUri))
  )
}

function findPlayableIndex(queue, preferredIndex = 0) {
  if (!Array.isArray(queue) || !queue.length) {
    return -1
  }

  const clampedIndex = Math.max(0, Math.min(preferredIndex, queue.length - 1))

  if (canQueueTrackStart(queue[clampedIndex])) {
    return clampedIndex
  }

  const forwardIndex = queue.findIndex(
    (track, index) => index >= clampedIndex && canQueueTrackStart(track),
  )

  if (forwardIndex >= 0) {
    return forwardIndex
  }

  return queue.findIndex((track) => canQueueTrackStart(track))
}

function getAdjacentPlayableIndex(queue, currentIndex, direction) {
  if (!Array.isArray(queue) || !queue.length) {
    return -1
  }

  for (let step = 1; step <= queue.length; step += 1) {
    const candidateIndex =
      (currentIndex + direction * step + queue.length) % queue.length

    if (canQueueTrackStart(queue[candidateIndex])) {
      return candidateIndex
    }
  }

  return -1
}

const playerSlice = createSlice({
  name: 'player',
  initialState: {
    currentQueue: initialQueue,
    currentIndex: 0,
    trackData: initialQueue[0] || {},
    isPlaying: false,
  },
  reducers: {
    changePlay(state, action) {
      state.isPlaying = action.payload
    },
    changeTrack(state, action) {
      if (Array.isArray(action.payload)) {
        const [playlistIndex, trackIndex] = action.payload
        const queue = createPlaybackQueue(PLAYLIST[playlistIndex] || PLAYLIST[0])
        const nextIndex = Math.max(0, Math.min(trackIndex, queue.length - 1))

        state.currentQueue = queue
        state.currentIndex = nextIndex
        state.trackData = queue[nextIndex]
        return
      }

      if (typeof action.payload === 'number') {
        const nextTrack = state.currentQueue[action.payload]

        if (!nextTrack) {
          return
        }

        state.currentIndex = action.payload
        state.trackData = nextTrack
        return
      }

      if (action.payload?.queue) {
        const queue = normalizeQueue(action.payload.queue)

        if (!queue.length) {
          return
        }

        const startIndex = findPlayableIndex(queue, action.payload.startIndex || 0)

        if (startIndex < 0) {
          state.currentQueue = queue
          state.currentIndex = 0
          state.trackData = queue[0]
          state.isPlaying = false
          return
        }

        state.currentQueue = queue
        state.currentIndex = startIndex
        state.trackData = queue[startIndex]
        return
      }

      if (action.payload?.track) {
        state.trackData = normalizeQueueTrackEntry(action.payload.track, state.currentIndex)
      }
    },
    nextTrack(state) {
      if (!state.currentQueue.length) {
        return
      }

      const nextIndex = getAdjacentPlayableIndex(
        state.currentQueue,
        state.currentIndex,
        1,
      )

      if (nextIndex < 0) {
        state.isPlaying = false
        return
      }

      state.currentIndex = nextIndex
      state.trackData = state.currentQueue[nextIndex]
    },
    previousTrack(state) {
      if (!state.currentQueue.length) {
        return
      }

      const nextIndex = getAdjacentPlayableIndex(
        state.currentQueue,
        state.currentIndex,
        -1,
      )

      if (nextIndex < 0) {
        state.isPlaying = false
        return
      }

      state.currentIndex = nextIndex
      state.trackData = state.currentQueue[nextIndex]
    },
  },
})

export const { changePlay, changeTrack, nextTrack, previousTrack } =
  playerSlice.actions

export function startAgentPlayback({
  tracks,
  startIndex = 0,
  playlistId = `agent-${Date.now()}`,
  playlistTitle = 'Agent Queue',
}) {
  return (dispatch) => {
    const queue = createAgentPlaybackQueue(tracks, {
      playlistId,
      playlistTitle,
    })

    if (!queue.some((track) => canQueueTrackStart(track))) {
      return
    }

    dispatch(
      changeTrack({
        queue,
        startIndex,
      }),
    )
    dispatch(changePlay(true))
  }
}

function dispatchPlayerQueueAction(dispatch, payload = {}) {
  const tracks = extractActionTracks(payload)

  if (!tracks.length) {
    return false
  }

  dispatch(
    startAgentPlayback({
      tracks,
      startIndex: payload.startIndex || 0,
      playlistId: payload.playlistId || `agent-${Date.now()}`,
      playlistTitle: payload.playlistTitle || 'Agent Queue',
    }),
  )

  return true
}

export function executePlayerActions(actions = []) {
  return (dispatch) => {
    for (const action of actions) {
      switch (action?.type) {
        case 'player.replace_queue':
          dispatch(
            startAgentPlayback({
              tracks: action.payload?.tracks || [],
              startIndex: action.payload?.startIndex || 0,
              playlistId:
                action.payload?.playlistId || `agent-${Date.now()}`,
              playlistTitle: action.payload?.playlistTitle || 'Agent Queue',
            }),
          )
          break
        case 'player.append_queue': {
          const queue = createAgentPlaybackQueue(action.payload?.tracks || [], {
            playlistId: action.payload?.playlistId || `agent-${Date.now()}`,
            playlistTitle: action.payload?.playlistTitle || 'Agent Queue',
          })

          if (!queue.length) {
            break
          }

          const currentQueue = store.getState().player.currentQueue || []
          const nextQueue = [...currentQueue, ...queue]

          dispatch(
            changeTrack({
              queue: nextQueue,
              startIndex: store.getState().player.currentIndex || 0,
            }),
          )
          break
        }
        case 'player.play_local':
        case 'player.play_spotify_uri':
        case 'player.play_spotify_uris':
          if (dispatchPlayerQueueAction(dispatch, action.payload || {})) {
            break
          }
          dispatch(changePlay(true))
          break
        case 'player.play':
          if (
            Array.isArray(action.payload?.tracks) &&
            action.payload.tracks.length
          ) {
            dispatch(
              startAgentPlayback({
                tracks: action.payload.tracks,
                startIndex: action.payload?.startIndex || 0,
                playlistId:
                  action.payload?.playlistId || `agent-${Date.now()}`,
                playlistTitle: action.payload?.playlistTitle || 'Agent Queue',
              }),
            )
            break
          }
          dispatch(changePlay(true))
          break
        case 'player.next':
          dispatch(nextTrack())
          dispatch(changePlay(true))
          break
        case 'player.previous':
          dispatch(previousTrack())
          dispatch(changePlay(true))
          break
        case 'player.pause':
          dispatch(changePlay(false))
          break
        case 'player.resume':
          dispatch(changePlay(true))
          break
        default:
          break
      }
    }
  }
}

export const store = configureStore({
  reducer: {
    player: playerSlice.reducer,
  },
})
