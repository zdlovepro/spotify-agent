import TitleS from '../text/TitleS'
import TextBoldM from '../text/TextBoldM'
import styles from './playlist-details.module.css'

function PlaylistDetails({ data }) {
  return (
    <div className={styles.playlistDetails}>
      <div className={styles.imgBox}>
        <img src={data.imgUrl} alt={data.title} />
      </div>
      <div className={styles.textBox}>
        <TitleS>{data.type}</TitleS>
        <h1>{data.title}</h1>
        <div className={styles.Artist}>
          <figure>
            <img src={data.imgUrl} alt={data.artist} />
          </figure>
          <TextBoldM>{data.artist}</TextBoldM>
        </div>
      </div>
    </div>
  )
}

export default PlaylistDetails
