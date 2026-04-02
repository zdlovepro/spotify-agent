import Topnav from '../components/topnav/Topnav'
import TitleM from '../components/text/TitleM'
import SearchPageCard from '../components/cards/SearchPageCard'
import { SEARCHCARDS } from '../data/index.js'
import styles from './search.module.css'

function Search() {
  return (
    <div className={styles.SearchPage}>
      <Topnav search={true} />

      <div className={styles.Search}>
        <TitleM>Browse all</TitleM>
        <div className={styles.SearchCardGrid}>
          {SEARCHCARDS.map((card) => (
            <SearchPageCard
              key={card.title}
              cardData={{
                bgcolor: card.bgcolor,
                title: card.title,
                imgurl: card.imgurl,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default Search
