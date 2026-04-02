import { useTranslation } from 'react-i18next'
import PrevPageBtn from '../buttons/PrevPageBtn'
import NextPageBtn from '../buttons/NextPageBtn'
import SearchBox from './SearchBox'
import LibraryTabBtn from './LibraryTabBtn'
import styles from './topnav.module.css'

function Topnav({ search = false, tabButtons = false }) {
  const { t, i18n } = useTranslation()

  const toggleLanguage = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(next)
    localStorage.setItem('lng', next)
  }

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
          <button className={styles.LangBtn} onClick={toggleLanguage}>
            {i18n.language === 'zh' ? 'EN' : '中文'}
          </button>
          <button className={styles.ProfileBtn}>{t('appName')}</button>
        </span>
      </div>
    </nav>
  )
}

export default Topnav
