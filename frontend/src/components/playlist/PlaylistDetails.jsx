import TitleS from '../text/TitleS'
import TextBoldM from '../text/TextBoldM'
import PlaylistCover from '../library/PlaylistCover.jsx'
import styles from './playlist-details.module.css'

function PlaylistDetails({ data }) {
  return (
    <div className={styles.playlistDetails}>
      <div className={styles.imgBox}>
        <PlaylistCover
          playlist={data}
          imageUrl={data.imgUrl}
          title={data.title}
          size="lg"
          className={styles.CoverMedia}
        />
      </div>
      <div className={styles.textBox}>
        <TitleS>{data.type}</TitleS>
        <h1>{data.title}</h1>
        <div className={styles.Artist}>
          <figure>
            <PlaylistCover
              playlist={data}
              imageUrl={data.imgUrl}
              title={data.artist || data.title}
              size="xs"
              shape="circle"
              className={styles.CoverMedia}
            />
          </figure>
          <TextBoldM>{data.artist}</TextBoldM>
        </div>
      </div>
    </div>
  )
}

export default PlaylistDetails
