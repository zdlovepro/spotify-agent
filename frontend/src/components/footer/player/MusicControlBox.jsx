import { useSelector, useDispatch } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { changePlay, nextTrack, previousTrack } from '../../../store/index.js'
import { useSpotify } from '../../../context/SpotifyContext.jsx'
import {
  resolveTrackPlaybackMeta,
  TRACK_PLAY_MODES,
} from '../../../lib/spotify.js'
import * as Icons from '../../icons/index.jsx'
import IconButton from '../../buttons/IconButton'
import PlayButton from '../../buttons/PlayButton'
import styles from './music-control-box.module.css'

function canStartQueueTrack(track, isConnected) {
  const playback = resolveTrackPlaybackMeta(track)

  return (
    playback.playable ||
    (
      isConnected &&
      playback.playMode === TRACK_PLAY_MODES.SPOTIFY_REMOTE &&
      Boolean(playback.remoteUri)
    )
  )
}

function hasAdjacentPlayableTrack(queue, currentIndex, direction, isConnected) {
  if (!Array.isArray(queue) || !queue.length) {
    return false
  }

  for (let step = 1; step <= queue.length; step += 1) {
    const candidateIndex =
      (currentIndex + direction * step + queue.length) % queue.length

    if (canStartQueueTrack(queue[candidateIndex], isConnected)) {
      return true
    }
  }

  return false
}

function resolvePlayButtonTitle(playback, isConnected, t) {
  if (playback.playMode === TRACK_PLAY_MODES.SPOTIFY_REMOTE && !isConnected) {
    return t('spotify_playback_status_connect')
  }

  if (playback.playMode === TRACK_PLAY_MODES.UNAVAILABLE) {
    return t('agent_playback_unavailable')
  }

  return ''
}

function MusicControlBox({ onSkip }) {
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const { isConnected } = useSpotify()
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const currentQueue = useSelector((state) => state.player.currentQueue)
  const currentIndex = useSelector((state) => state.player.currentIndex)
  const trackData = useSelector((state) => state.player.trackData)
  const playback = resolveTrackPlaybackMeta(trackData)
  const canTogglePlayback =
    playback.playable ||
    (playback.playMode === TRACK_PLAY_MODES.SPOTIFY_REMOTE && isConnected)
  const canGoPrevious = hasAdjacentPlayableTrack(
    currentQueue,
    currentIndex,
    -1,
    isConnected,
  )
  const canGoNext = hasAdjacentPlayableTrack(
    currentQueue,
    currentIndex,
    1,
    isConnected,
  )

  function togglePlay() {
    if (!canTogglePlayback) {
      return
    }

    dispatch(changePlay(!isPlaying))
  }

  function handlePrevious() {
    if (!canGoPrevious) {
      return
    }

    onSkip?.('previous')
    dispatch(previousTrack())
  }

  function handleNext() {
    if (!canGoNext) {
      return
    }

    onSkip?.('next')
    dispatch(nextTrack())
  }

  return (
    <div className={styles.musicControl}>
      <IconButton icon={<Icons.Mix />} activeicon={<Icons.Mix />} />
      <button
        className={styles.button}
        onClick={handlePrevious}
        disabled={!canGoPrevious}
        title={!canGoPrevious ? t('player_previous_unavailable') : ''}
        type="button"
      >
        <Icons.Prev />
      </button>
      <PlayButton
        isthisplay={true}
        onClick={togglePlay}
        disabled={!canTogglePlayback}
        title={resolvePlayButtonTitle(playback, isConnected, t)}
      />
      <button
        className={styles.button}
        onClick={handleNext}
        disabled={!canGoNext}
        title={!canGoNext ? t('player_next_unavailable') : ''}
        type="button"
      >
        <Icons.Next />
      </button>
      <IconButton icon={<Icons.Loop />} activeicon={<Icons.Loop />} />
    </div>
  )
}

export default MusicControlBox
