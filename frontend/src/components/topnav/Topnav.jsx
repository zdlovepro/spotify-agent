import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import appIcon from '../../assets/topbar-picture.png'
import * as Icons from '../icons/index.jsx'
import SearchBox from './SearchBox'
import LibraryTabBtn from './LibraryTabBtn'
import styles from './topnav.module.css'

function Topnav() {
  const { t, i18n } = useTranslation()
  const { error, isAuthenticated, login, logout, profile } = useSpotify()
  const location = useLocation()

  const toggleLanguage = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(next)
    localStorage.setItem('lng', next)
  }

  const isHome = location.pathname === '/'
  const showLibraryTabs =
    location.pathname === '/library' || location.pathname.startsWith('/library/')

  return (
    <nav className={styles.Topnav}>
      <div className={styles.Inner}>
        <div className={styles.LeftGroup}>
          <NavLink to="/" className={styles.BrandLink} aria-label={t('appName')}>
            <img src={appIcon} alt={t('appName')} className={styles.BrandIcon} />
            <span className={styles.BrandText}>{t('appName')}</span>
          </NavLink>

          <NavLink to="/" className={styles.IconLink} aria-label={t('nav_home')}>
            <span className={`${styles.HomeButton} ${isHome ? styles.HomeButtonActive : ''}`}>
              {isHome ? <Icons.HomeActive /> : <Icons.Home />}
            </span>
          </NavLink>

          <SearchBox />

          <NavLink
            to="/agent"
            className={({ isActive }) =>
              `${styles.AgentButton} ${isActive ? styles.AgentButtonActive : ''}`
            }
          >
            <Icons.Agent />
            <span>{t('nav_agent')}</span>
          </NavLink>
        </div>

        <div className={styles.RightGroup}>
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
        </div>
      </div>

      {showLibraryTabs && (
        <div className={styles.SecondaryRow}>
          <LibraryTabBtn />
        </div>
      )}
    </nav>
  )
}

export default Topnav
