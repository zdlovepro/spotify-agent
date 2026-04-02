import Topnav from '../components/topnav/Topnav'
import TitleL from '../components/text/TitleL'
import TitleM from '../components/text/TitleM'
import PlaylistCardS from '../components/cards/PlaylistCardS'
import PlaylistCardM from '../components/cards/PlaylistCardM'
import { PLAYLIST } from '../data/index.js'
import styles from './home.module.css'

function Home() {
  return (
    <div className={styles.Home}>
      <div className={styles.HoverBg} />
      <div className={styles.Bg} />

      <Topnav />
      <div className={styles.Content}>
        <section>
          <div className={styles.SectionTitle}>
            <TitleL>Good day</TitleL>
          </div>

          <div className={styles.SectionCards}>
            {PLAYLIST.map((item) => (
              <PlaylistCardS key={item.title} data={item} />
            ))}
          </div>
        </section>

        <section>
          <div className={styles.SectionTitle}>
            <TitleM>Recently played</TitleM>
          </div>

          <div className={styles.SectionCardsMedium}>
            {PLAYLIST.slice(0, 6).map((item) => (
              <PlaylistCardM key={item.title} data={item} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default Home
