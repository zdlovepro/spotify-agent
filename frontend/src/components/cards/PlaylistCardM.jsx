import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { changePlay, changeTrack } from '../../store/index.js'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import { canStartTrackPlayback, createPlaybackQueue } from '../../lib/spotify.js'
import TextBoldL from '../text/TextBoldL'
import TextRegularM from '../text/TextRegularM'
import PlayButton from '../buttons/PlayButton'
import styles from './playlist-card-m.module.css'

function PlaylistCardM({ data }) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const { isConnected } = useSpotify()
  const trackData = useSelector((state) => state.player.trackData)
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const [isthisplay, setIsthisPlay] = useState(false)
  const canPlay = (data.playlistData || []).some((song) =>
    canStartTrackPlayback(song, { allowRemote: isConnected }),
  )

  function handlePlay(event) {
    event.preventDefault()
    event.stopPropagation()

    if (!canPlay) {
      return
    }

    if (trackData.playlistId === data.link) {
      dispatch(changePlay(!isPlaying))
      return
    }

    dispatch(changeTrack({ queue: createPlaybackQueue(data), startIndex: 0 }))
    dispatch(changePlay(true))
  }

  useEffect(() => {
    setIsthisPlay(trackData.playlistId === data.link)
  }, [data.link, trackData.playlistId])

  return (
    <div className={styles.PlaylistCardSBox}>
      <Link to={`/playlist/${data.link}`}>
        <div className={styles.PlaylistCardS}>
          <div className={styles.ImgBox}>
            <img src={data.imgUrl} alt={data.title} />
          </div>
          <div className={styles.Title}>
            {data.sourceLabel && (
              <span className={styles.SourceBadge}>{t(data.sourceLabel)}</span>
            )}
            <TextBoldL>{data.title}</TextBoldL>
            <TextRegularM>{data.artist}</TextRegularM>
          </div>
        </div>
      </Link>
      {canPlay && (
        <div
          onClick={handlePlay}
          className={`${styles.IconBox} ${isthisplay && isPlaying ? styles.ActiveIconBox : ''}`}
        >
          <PlayButton isthisplay={isthisplay} onClick={handlePlay} />
        </div>
      )}
    </div>
  )
}

export default PlaylistCardM
