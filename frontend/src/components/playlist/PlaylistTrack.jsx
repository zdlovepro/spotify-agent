import { useSelector, useDispatch } from 'react-redux'
import { changePlay } from '../../store/index.js'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import { canStartTrackPlayback } from '../../lib/spotify.js'
import TextBoldL from '../text/TextBoldL'
import TextRegularM from '../text/TextRegularM'
import Playgif from '../../assets/images/now-play.gif'
import * as Icons from '../icons/index.jsx'
import styles from './playlist-track.module.css'

function sameNonEmptyValue(leftValue, rightValue) {
  if (leftValue === null || leftValue === undefined) {
    return false
  }

  if (rightValue === null || rightValue === undefined) {
    return false
  }

  const left = String(leftValue).trim()
  const right = String(rightValue).trim()

  return Boolean(left && right && left === right)
}

function PlaylistTrack({ data }) {
  const dispatch = useDispatch()
  const { isConnected } = useSpotify()
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const trackData = useSelector((state) => state.player.trackData)
  const playable = canStartTrackPlayback(data.song, { allowRemote: isConnected })
  const isAlbumView = data.listType === 'album' || data.listType === 'alb眉m'

  const songIndex = Number.isFinite(Number(data.songIndex))
    ? Number(data.songIndex)
    : Number(data.song.index) - 1
  const trackQueueIndex = Number(trackData.queueIndex)
  const hasPlaylistPosition =
    sameNonEmptyValue(data.playlistId, trackData.playlistId) &&
    Number.isFinite(songIndex) &&
    Number.isFinite(trackQueueIndex)
  const samePlaylistPosition =
    hasPlaylistPosition && songIndex === trackQueueIndex
  const sameTrackIdentity =
    !data.playlistId || !trackData.playlistId
      ? sameNonEmptyValue(data.song.id, trackData.id) ||
        sameNonEmptyValue(
          data.song.sourceId || data.song.source_id,
          trackData.sourceId || trackData.source_id,
        ) ||
        sameNonEmptyValue(data.song.uri, trackData.uri || trackData.remoteUri) ||
        sameNonEmptyValue(
          data.song.audioUrl ||
            data.song.audio_url ||
            data.song.previewUrl ||
            data.song.link,
          trackData.audioUrl || trackData.previewUrl || trackData.track,
        )
      : false
  const thisSong = isPlaying && (samePlaylistPosition || sameTrackIdentity)

  return (
    <div
      className={`${styles.trackDiv} ${thisSong ? 'activeTrack' : ''} ${!playable ? styles.DisabledTrack : ''}`}
      style={isAlbumView ? { gridTemplateColumns: '16px 1fr 38px' } : {}}
    >
      <button
        className={styles.playBtn}
        disabled={!playable}
        onClick={() => dispatch(changePlay(thisSong ? !isPlaying : true))}
      >
        {thisSong ? <Icons.Pause /> : <Icons.Play />}
      </button>

      {thisSong ? (
        <img className={styles.gif} src={Playgif} alt="now playing" />
      ) : (
        <p className={styles.SongIndex}>{data.song.index}</p>
      )}

      {!isAlbumView && <img src={data.song.songimg} alt={data.song.songName} />}

      <span>
        <TextBoldL>{data.song.songName}</TextBoldL>
        <TextRegularM>{data.song.songArtist}</TextRegularM>
      </span>

      <p>{data.song.trackTime}</p>
    </div>
  )
}

export default PlaylistTrack
