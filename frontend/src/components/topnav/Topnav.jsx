import PrevPageBtn from '../buttons/PrevPageBtn'
import NextPageBtn from '../buttons/NextPageBtn'
import SearchBox from './SearchBox'
import LibraryTabBtn from './LibraryTabBtn'
import styles from './topnav.module.css'

function Topnav({ search = false, tabButtons = false }) {
  return (
    <nav className={styles.Topnav}>
      <div>
        <span>
          <PrevPageBtn />
          <NextPageBtn />
          {search && <SearchBox />}
          {tabButtons && <LibraryTabBtn />}
        </span>
        <span>
          <button className={styles.ProfileBtn}>AgentMusic</button>
        </span>
      </div>
    </nav>
  )
}

export default Topnav
