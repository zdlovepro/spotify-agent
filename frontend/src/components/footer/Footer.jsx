import { useRef, useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { changePlay, nextTrack } from '../../store/index.js'
import useWindowSize from '../../hooks/useWindowSize'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import { useSpotifyPlayback } from '../../context/SpotifyPlaybackContext.jsx'
import { resolveTrackPlaybackMeta } from '../../lib/spotify.js'
import FooterLeft from './FooterLeft'
import MusicControlBox from './player/MusicControlBox'
import MusicProgressBar from './player/MusicProgressBar'
import FooterRight from './FooterRight'
import Audio from './Audio'
import SpotifyPlaybackStatus from './SpotifyPlaybackStatus.jsx'
import CONST from '../../constants/index.jsx'
import styles from './footer.module.css'

function Footer() {
  const dispatch = useDispatch()
  const { isConnected, pauseRemotePlayback, playRemoteQueue, resumeRemotePlayback } =
    useSpotify()
  const { activatePlayer, deviceId, isReady } = useSpotifyPlayback()
  const trackData = useSelector((state) => state.player.trackData)
  const currentQueue = useSelector((state) => state.player.currentQueue)
  const currentIndex = useSelector((state) => state.player.currentIndex)
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const size = useWindowSize()

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const audioRef = useRef(null)
  const previousRemoteKeyRef = useRef('')
  const previousRemotePlayingRef = useRef(false)

  const playback = resolveTrackPlaybackMeta(trackData)
  const shouldUseRemotePlayback =
    isConnected &&
    Boolean(playback.remoteUri) &&
    trackData.source !== 'local_audio' &&
    trackData.playMode !== 'local'

  const handleTrackClick = (position) => {
    if (audioRef.current) {
      audioRef.current.currentTime = position
    }
  }

  useEffect(() => {
    if (!audioRef.current) {
      return
    }

    if (shouldUseRemotePlayback) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setCurrentTime(0)
      setDuration(0)
      return
    }

    if (isPlaying) {
      audioRef.current.play().catch(() => {})
    } else {
      audioRef.current.pause()
    }
  }, [isPlaying, shouldUseRemotePlayback, trackData.track])

  useEffect(() => {
    if (!shouldUseRemotePlayback) {
      previousRemoteKeyRef.current = ''
      previousRemotePlayingRef.current = false
      return
    }

    const remoteKey = `${trackData.playlistId || 'queue'}:${currentIndex}:${trackData.id || ''}`
    const remoteChanged = previousRemoteKeyRef.current !== remoteKey
    const playingChanged = previousRemotePlayingRef.current !== isPlaying

    async function syncRemotePlayback() {
      try {
        if (remoteChanged && isPlaying) {
          await activatePlayer()

          if (!deviceId && !isReady) {
            return
          }

          await playRemoteQueue(currentQueue, currentIndex, {
            deviceId: deviceId || undefined,
          })
        } else if (playingChanged && isPlaying) {
          await activatePlayer()

          if (!deviceId && !isReady) {
            return
          }

          await resumeRemotePlayback({
            deviceId: deviceId || undefined,
          })
        } else if (playingChanged && !isPlaying) {
          await pauseRemotePlayback({
            deviceId: deviceId || undefined,
          })
        }

        previousRemoteKeyRef.current = remoteKey
        previousRemotePlayingRef.current = isPlaying
      } catch {
        dispatch(changePlay(false))
      }
    }

    syncRemotePlayback()
  }, [
    currentIndex,
    currentQueue,
    deviceId,
    dispatch,
    isPlaying,
    isReady,
    activatePlayer,
    pauseRemotePlayback,
    playRemoteQueue,
    resumeRemotePlayback,
    shouldUseRemotePlayback,
    trackData.id,
    trackData.playlistId,
  ])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio || shouldUseRemotePlayback) {
      return
    }

    const handleEnded = () => dispatch(nextTrack())

    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [dispatch, shouldUseRemotePlayback])

  return (
    <footer className={styles.footer}>
      <div className={styles.nowplayingbar}>
        <FooterLeft />
        <div className={styles.footerMid}>
          <MusicControlBox />
          <MusicProgressBar
            currentTime={currentTime}
            duration={duration}
            handleTrackClick={handleTrackClick}
          />
          <SpotifyPlaybackStatus />
          <Audio
            ref={audioRef}
            handleDuration={setDuration}
            handleCurrentTime={setCurrentTime}
            trackData={trackData}
            isPlaying={isPlaying}
            isRemotePlayback={shouldUseRemotePlayback}
          />
        </div>
        {size.width > CONST.MOBILE_SIZE && (
          <FooterRight volume={volume} setVolume={setVolume} />
        )}
      </div>
    </footer>
  )
}

export default Footer
