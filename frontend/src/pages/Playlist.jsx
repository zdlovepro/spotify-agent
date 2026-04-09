import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { changeTrack } from '../store/index.js'
import Topnav from '../components/topnav/Topnav'
import TextRegularM from '../components/text/TextRegularM'
import PlayButton from '../components/buttons/PlayButton'
import IconButton from '../components/buttons/IconButton'
import PlaylistDetails from '../components/playlist/PlaylistDetails'
import PlaylistTrack from '../components/playlist/PlaylistTrack'
import * as Icons from '../components/icons/index.jsx'
import { PLAYLIST } from '../data/index.js'
import styles from './playlist.module.css'

function PlaylistPage() {
  const dispatch = useDispatch()
  const trackData = useSelector((state) => state.player.trackData)
  const { path } = useParams()
  const [playlistIndex, setPlaylistIndex] = useState(undefined)
  const [isthisplay, setIsthisPlay] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    setIsthisPlay(playlistIndex === trackData.trackKey[0])
  }, [playlistIndex, trackData.trackKey])

  function changeBg(color) {
    document.documentElement.style.setProperty('--hover-home-bg', color)
  }

  return (
    <div className={styles.PlaylistPage}>
      <div className={styles.gradientBg} />
      <div className={styles.gradientBgSoft} />
      <div className={styles.Bg} />

      <Topnav />

      {PLAYLIST.map((item) => {
        if (item.link !== path) return null
        const idx = PLAYLIST.indexOf(item)
        return (
          <div
            key={item.title}
            onLoad={() => {
              changeBg(item.playlistBg)
              setPlaylistIndex(idx)
            }}
          >
            <PlaylistDetails data={item} />

            <div className={styles.PlaylistIcons}>
              <button onClick={() => dispatch(changeTrack([idx, 0]))}>
                <PlayButton isthisplay={isthisplay} />
              </button>
              <IconButton icon={<Icons.Like />} activeicon={<Icons.LikeActive />} />
              <Icons.More className={styles.moreIcon} />
            </div>

            <div className={styles.ListHead}>
              <TextRegularM>#</TextRegularM>
              <TextRegularM>{t('playlist_title_col')}</TextRegularM>
              <Icons.Time />
            </div>

            <div className={styles.PlaylistSongs}>
              {item.playlistData.map((song) => (
                <button
                  key={song.index}
                  onClick={() =>
                    dispatch(
                      changeTrack([idx, item.playlistData.indexOf(song)]),
                    )
                  }
                  className={styles.SongBtn}
                >
                  <PlaylistTrack
                    data={{
                      listType: item.type,
                      song,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default PlaylistPage
