import { useTranslation } from 'react-i18next'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import PrevPageBtn from '../buttons/PrevPageBtn'
import NextPageBtn from '../buttons/NextPageBtn'
import SearchBox from './SearchBox'
import LibraryTabBtn from './LibraryTabBtn'
import styles from './topnav.module.css'

function Topnav({ search = false, tabButtons = false }) {
  const { t, i18n } = useTranslation()
  const { error, isAuthenticated, login, logout, profile } = useSpotify()

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
          {error && <small className={styles.StatusText}>{error}</small>}
          <button className={styles.LangBtn} onClick={toggleLanguage}>
            {i18n.language === 'zh' ? 'EN' : '中文'}
          </button>
          {isAuthenticated ? (
            <>
              <button className={styles.SecondaryBtn} onClick={logout}>
                {t('logout')}
              </button>
              <button className={styles.ProfileBtn}>
                {profile?.display_name || t('appName')}
              </button>
            </>
          ) : (
            <button className={styles.ProfileBtn} onClick={login}>
              {t('login')}
            </button>
          )}
        </span>
      </div>
    </nav>
  )
}

export default Topnav
