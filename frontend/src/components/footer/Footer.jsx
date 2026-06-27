import { useRef, useEffect, useState, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { changePlay, nextTrack } from '../../store/index.js'
import useWindowSize from '../../hooks/useWindowSize'
import usePlayerEventReporter from '../../hooks/usePlayerEventReporter.js'
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
  const reportPlayerEvent = usePlayerEventReporter()
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
  const previousLocalKeyRef = useRef('')
  const previousLocalPlayingRef = useRef(false)
  const previousPlaybackChannelRef = useRef('')
  const suppressNextLocalPauseEventRef = useRef(false)

  const playback = resolveTrackPlaybackMeta(trackData)
  const isSpotifyTrack = playback.isSpotifyRemote && Boolean(playback.remoteUri)
  const isHtmlAudioTrack = playback.isLocalAudio || playback.isPreview
  const shouldUseRemotePlayback = isSpotifyTrack
  const playbackTrackKey = `${trackData.playlistId || 'queue'}:${currentIndex}:${
    trackData.id || trackData.sourceId || trackData.source_id || playback.remoteUri || ''
  }`

  const getTrackDurationMs = useCallback(
    (fallbackSeconds = duration) => {
      const explicitDurationMs = Number(trackData.durationMs ?? trackData.duration_ms)

      if (Number.isFinite(explicitDurationMs) && explicitDurationMs >= 0) {
        return Math.round(explicitDurationMs)
      }

      const seconds = Number(fallbackSeconds) || 0
      return Math.max(0, Math.round(seconds * 1000))
    },
    [duration, trackData.durationMs, trackData.duration_ms],
  )

  const getTrackPositionMs = useCallback((fallbackSeconds = currentTime) => {
    const seconds = Number(fallbackSeconds) || 0
    return Math.max(0, Math.round(seconds * 1000))
  }, [currentTime])

  const handleTrackClick = (position) => {
    if (!audioRef.current || shouldUseRemotePlayback || !playback.audioUrl) {
      return
    }

    audioRef.current.currentTime = position
    setCurrentTime(position)

    void reportPlayerEvent({
      eventType: 'seek',
      track: trackData,
      positionMs: getTrackPositionMs(position),
      durationMs: getTrackDurationMs(),
      metadata: {
        channel: 'html_audio',
      },
    }).catch(() => {})
  }

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    const previousTrackKey = previousLocalKeyRef.current
    const previousPlaying = previousLocalPlayingRef.current
    const trackChanged = previousTrackKey !== playbackTrackKey
    let cancelled = false

    if (shouldUseRemotePlayback || !playback.audioUrl) {
      if (!audio.paused) {
        suppressNextLocalPauseEventRef.current = true
        audio.pause()
      }

      if (shouldUseRemotePlayback) {
        audio.currentTime = 0
        setCurrentTime(0)
        setDuration(0)
      }

      previousLocalKeyRef.current = ''
      previousLocalPlayingRef.current = false
      return
    }

    if (trackChanged) {
      audio.currentTime = 0
      audio.load()
      setCurrentTime(0)
      setDuration(0)
    }

    if (isPlaying) {
      audio
        .play()
        .then(() => {
          if (cancelled) {
            return
          }

          const eventType = trackChanged
            ? 'play'
            : !previousPlaying
              ? audio.currentTime > 0
                ? 'resume'
                : 'play'
              : ''

          if (!eventType) {
            return
          }

          void reportPlayerEvent({
            eventType,
            track: trackData,
            positionMs: getTrackPositionMs(audio.currentTime),
            durationMs: getTrackDurationMs(),
            metadata: {
              channel: 'html_audio',
            },
          }).catch(() => {})
        })
        .catch((error) => {
          if (cancelled) {
            return
          }

          suppressNextLocalPauseEventRef.current = true

          void reportPlayerEvent({
            eventType: 'error',
            track: trackData,
            positionMs: getTrackPositionMs(audio.currentTime),
            durationMs: getTrackDurationMs(),
            metadata: {
              channel: 'html_audio',
              error: {
                message: error?.message || 'html_audio_play_failed',
              },
            },
          }).catch(() => {})

          dispatch(changePlay(false))
        })
    } else {
      if (previousPlaying && !trackChanged && !suppressNextLocalPauseEventRef.current) {
        void reportPlayerEvent({
          eventType: 'pause',
          track: trackData,
          positionMs: getTrackPositionMs(audio.currentTime),
          durationMs: getTrackDurationMs(),
          metadata: {
            channel: 'html_audio',
          },
        }).catch(() => {})
      }

      if (suppressNextLocalPauseEventRef.current) {
        suppressNextLocalPauseEventRef.current = false
      }

      audio.pause()
    }

    previousLocalKeyRef.current = playbackTrackKey
    previousLocalPlayingRef.current = isPlaying

    return () => {
      cancelled = true
    }
  }, [
    dispatch,
    getTrackDurationMs,
    getTrackPositionMs,
    isPlaying,
    playback.audioUrl,
    playbackTrackKey,
    reportPlayerEvent,
    shouldUseRemotePlayback,
    trackData,
  ])

  useEffect(() => {
    const nextPlaybackChannel = shouldUseRemotePlayback
      ? 'spotify_remote'
      : isHtmlAudioTrack
        ? 'html_audio'
        : 'idle'

    if (
      previousPlaybackChannelRef.current === 'spotify_remote' &&
      nextPlaybackChannel !== 'spotify_remote'
    ) {
      pauseRemotePlayback({
        deviceId: deviceId || undefined,
      }).catch(() => {})
    }

    previousPlaybackChannelRef.current = nextPlaybackChannel
  }, [
    deviceId,
    isHtmlAudioTrack,
    pauseRemotePlayback,
    shouldUseRemotePlayback,
    trackData.id,
  ])

  useEffect(() => {
    if (!shouldUseRemotePlayback) {
      previousRemoteKeyRef.current = ''
      previousRemotePlayingRef.current = false
      return
    }

    const remoteKey = `${trackData.playlistId || 'queue'}:${currentIndex}:${trackData.id || ''}`
    const remoteChanged = previousRemoteKeyRef.current !== remoteKey
    const playingChanged = previousRemotePlayingRef.current !== isPlaying
    let cancelled = false

    async function syncRemotePlayback() {
      if (!isConnected) {
        dispatch(changePlay(false))
        return
      }

      try {
        if (remoteChanged && isPlaying) {
          const activated = await activatePlayer()

          if (!activated) {
            dispatch(changePlay(false))
            return
          }

          if (!deviceId && !isReady) {
            return
          }

          await playRemoteQueue(currentQueue, currentIndex, {
            deviceId: deviceId || undefined,
          })

          if (!cancelled) {
            void reportPlayerEvent({
              eventType: 'play',
              track: trackData,
              positionMs: 0,
              durationMs: getTrackDurationMs(),
              metadata: {
                channel: 'spotify_remote',
              },
            }).catch(() => {})
          }
        } else if (playingChanged && isPlaying) {
          const activated = await activatePlayer()

          if (!activated) {
            dispatch(changePlay(false))
            return
          }

          if (!deviceId && !isReady) {
            return
          }

          await resumeRemotePlayback({
            deviceId: deviceId || undefined,
          })

          if (!cancelled) {
            void reportPlayerEvent({
              eventType: 'resume',
              track: trackData,
              positionMs: getTrackPositionMs(0),
              durationMs: getTrackDurationMs(),
              metadata: {
                channel: 'spotify_remote',
              },
            }).catch(() => {})
          }
        } else if (playingChanged && !isPlaying) {
          await pauseRemotePlayback({
            deviceId: deviceId || undefined,
          })

          if (!cancelled) {
            void reportPlayerEvent({
              eventType: 'pause',
              track: trackData,
              positionMs: getTrackPositionMs(0),
              durationMs: getTrackDurationMs(),
              metadata: {
                channel: 'spotify_remote',
              },
            }).catch(() => {})
          }
        }

        if (cancelled) {
          return
        }

        previousRemoteKeyRef.current = remoteKey
        previousRemotePlayingRef.current = isPlaying
      } catch (error) {
        if (cancelled) {
          return
        }

        void reportPlayerEvent({
          eventType: 'error',
          track: trackData,
          positionMs: getTrackPositionMs(0),
          durationMs: getTrackDurationMs(),
          metadata: {
            channel: 'spotify_remote',
            error: {
              code: error?.payload?.code || error?.code || '',
              message: error?.message || 'spotify_remote_playback_failed',
            },
          },
        }).catch(() => {})

        dispatch(changePlay(false))
      }
    }

    syncRemotePlayback()

    return () => {
      cancelled = true
    }
  }, [
    currentIndex,
    currentQueue,
    deviceId,
    dispatch,
    getTrackDurationMs,
    getTrackPositionMs,
    isConnected,
    isPlaying,
    isReady,
    activatePlayer,
    pauseRemotePlayback,
    playRemoteQueue,
    reportPlayerEvent,
    resumeRemotePlayback,
    shouldUseRemotePlayback,
    trackData.id,
    trackData,
    trackData.playlistId,
  ])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  const handleSkip = useCallback(
    (direction) => {
      void reportPlayerEvent({
        eventType: 'skip',
        track: trackData,
        positionMs: getTrackPositionMs(),
        durationMs: getTrackDurationMs(),
        metadata: {
          channel: shouldUseRemotePlayback ? 'spotify_remote' : 'html_audio',
          direction,
        },
      }).catch(() => {})
    },
    [
      getTrackDurationMs,
      getTrackPositionMs,
      reportPlayerEvent,
      shouldUseRemotePlayback,
      trackData,
    ],
  )

  const handleAudioEnded = useCallback(() => {
    void reportPlayerEvent({
      eventType: 'complete',
      track: trackData,
      positionMs: getTrackDurationMs(),
      durationMs: getTrackDurationMs(),
      metadata: {
        channel: 'html_audio',
      },
    }).catch(() => {})

    dispatch(nextTrack())
  }, [dispatch, getTrackDurationMs, reportPlayerEvent, trackData])

  const handleAudioError = useCallback(
    (event) => {
      const mediaError = event?.currentTarget?.error
      suppressNextLocalPauseEventRef.current = true

      void reportPlayerEvent({
        eventType: 'error',
        track: trackData,
        positionMs: getTrackPositionMs(event?.currentTarget?.currentTime || 0),
        durationMs: getTrackDurationMs(),
        metadata: {
          channel: 'html_audio',
          error: {
            code: mediaError?.code || '',
            message: mediaError?.message || 'html_audio_error',
          },
        },
      }).catch(() => {})

      dispatch(changePlay(false))
    },
    [dispatch, getTrackDurationMs, getTrackPositionMs, reportPlayerEvent, trackData],
  )

  return (
    <footer className={styles.footer}>
      <div className={styles.nowplayingbar}>
        <FooterLeft />
        <div className={styles.footerMid}>
          <MusicControlBox onSkip={handleSkip} />
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
            onEnded={handleAudioEnded}
            onError={handleAudioError}
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
