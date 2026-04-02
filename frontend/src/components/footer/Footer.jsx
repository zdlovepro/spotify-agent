import { useRef, useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { changeTrack, changePlay } from '../../store/index.js'
import useWindowSize from '../../hooks/useWindowSize'
import FooterLeft from './FooterLeft'
import MusicControlBox from './player/MusicControlBox'
import MusicProgressBar from './player/MusicProgressBar'
import FooterRight from './FooterRight'
import Audio from './Audio'
import { PLAYLIST } from '../../data/index.js'
import CONST from '../../constants/index.jsx'
import styles from './footer.module.css'

function Footer() {
  const dispatch = useDispatch()
  const trackData = useSelector((state) => state.player.trackData)
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const size = useWindowSize()

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const audioRef = useRef(null)

  const handleTrackClick = (position) => {
    audioRef.current.currentTime = position
  }

  useEffect(() => {
    if (isPlaying) {
      audioRef.current.play()
    } else {
      audioRef.current.pause()
    }
  }, [isPlaying])

  useEffect(() => {
    audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    const handleEnded = () => {
      const [pIdx, tIdx] = trackData.trackKey
      if (tIdx === PLAYLIST[pIdx].playlistData.length - 1) {
        dispatch(changeTrack([pIdx, 0]))
      } else {
        dispatch(changeTrack([pIdx, tIdx + 1]))
      }
    }
    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [dispatch, trackData.trackKey])

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
          <Audio
            ref={audioRef}
            handleDuration={setDuration}
            handleCurrentTime={setCurrentTime}
            trackData={trackData}
            isPlaying={isPlaying}
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
