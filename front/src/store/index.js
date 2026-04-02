import { configureStore, createSlice } from '@reduxjs/toolkit'
import { PLAYLIST } from '../data/index.js'

const playerSlice = createSlice({
  name: 'player',
  initialState: {
    trackData: {
      trackKey: [0, 0],
      track: PLAYLIST[0].playlistData[0].link,
      trackName: PLAYLIST[0].playlistData[0].songName,
      trackImg: PLAYLIST[0].playlistData[0].songimg,
      trackArtist: PLAYLIST[0].playlistData[0].songArtist,
    },
    isPlaying: false,
  },
  reducers: {
    changePlay(state, action) {
      state.isPlaying = action.payload
    },
    changeTrack(state, action) {
      const [pIdx, tIdx] = action.payload
      const song = PLAYLIST[pIdx].playlistData[tIdx]
      state.trackData = {
        trackKey: action.payload,
        track: song.link,
        trackName: song.songName,
        trackImg: song.songimg,
        trackArtist: song.songArtist,
      }
    },
  },
})

export const { changePlay, changeTrack } = playerSlice.actions

export const store = configureStore({
  reducer: {
    player: playerSlice.reducer,
  },
})
