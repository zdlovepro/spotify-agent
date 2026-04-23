import { configureStore, createSlice } from '@reduxjs/toolkit'
import { PLAYLIST } from '../data/index.js'
import { createPlaybackQueue } from '../lib/spotify.js'

const initialQueue = createPlaybackQueue(PLAYLIST[0])

const playerSlice = createSlice({
  name: 'player',
  initialState: {
    currentQueue: initialQueue,
    currentIndex: 0,
    trackData: initialQueue[0],
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
        const queue = action.payload.queue.filter((track) => track.playable)

        if (!queue.length) {
          return
        }

        const startIndex = Math.max(
          0,
          Math.min(action.payload.startIndex || 0, queue.length - 1),
        )

        state.currentQueue = queue
        state.currentIndex = startIndex
        state.trackData = queue[startIndex]
        return
      }

      if (action.payload?.track) {
        state.trackData = action.payload.track
      }
    },
    nextTrack(state) {
      if (!state.currentQueue.length) {
        return
      }

      const nextIndex = (state.currentIndex + 1) % state.currentQueue.length
      state.currentIndex = nextIndex
      state.trackData = state.currentQueue[nextIndex]
    },
    previousTrack(state) {
      if (!state.currentQueue.length) {
        return
      }

      const nextIndex =
        (state.currentIndex - 1 + state.currentQueue.length) %
        state.currentQueue.length

      state.currentIndex = nextIndex
      state.trackData = state.currentQueue[nextIndex]
    },
  },
})

export const { changePlay, changeTrack, nextTrack, previousTrack } =
  playerSlice.actions

export const store = configureStore({
  reducer: {
    player: playerSlice.reducer,
  },
})
