import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import AuthDialog from '../auth/AuthDialog.jsx'
import appIcon from '../../assets/topbar-picture.png'
import * as Icons from '../icons/index.jsx'
import SearchBox from './SearchBox'
import LibraryTabBtn from './LibraryTabBtn'
import styles from './topnav.module.css'

function Topnav() {
  const { t, i18n } = useTranslation()
  const {
    error: authError,
    isAuthenticated,
    logout,
    openAuthDialog,
    user,
  } = useAuth()
  const {
    connect,
    disconnect,
    error: spotifyError,
    isConnected,
    notice: spotifyNotice,
    profile,
  } = useSpotify()
  const location = useLocation()
  const [connectHint, setConnectHint] = useState('')

  const toggleLanguage = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(next)
    localStorage.setItem('lng', next)
  }

  const isHome = location.pathname === '/'
  const showLibraryTabs =
    location.pathname === '/library' || location.pathname.startsWith('/library/')
  const isSpotifyEnhanced = isAuthenticated && isConnected
  const statusText =
    connectHint ||
    (spotifyNotice ? t(spotifyNotice) : '') ||
    spotifyError ||
    authError
  const displayName =
    user?.displayName || user?.email || profile?.display_name || t('appName')
  const modeLabel = !isAuthenticated
    ? t('mode_guest')
    : isSpotifyEnhanced
      ? t('mode_spotify_enhanced')
      : t('mode_local')

  useEffect(() => {
    if (isAuthenticated || isConnected) {
      setConnectHint('')
    }
  }, [isAuthenticated, isConnected])

  function handleConnectSpotify() {
    if (!isAuthenticated) {
      setConnectHint(t('spotify_requires_local_account'))
      openAuthDialog('login')
      return
    }

    setConnectHint('')
    connect(location.pathname)
  }

  function handleDisconnectSpotify() {
    setConnectHint('')
    disconnect()
  }

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
          {statusText && <small className={styles.StatusText}>{statusText}</small>}

          <span
            className={`${styles.ModeBadge} ${
              isSpotifyEnhanced
                ? styles.ModeBadgeEnhanced
                : isAuthenticated
                  ? styles.ModeBadgeLocal
                  : styles.ModeBadgeGuest
            }`}
          >
            {modeLabel}
          </span>

          <button className={styles.LangBtn} onClick={toggleLanguage}>
            {i18n.language === 'zh' ? 'EN' : '中文'}
          </button>

          {isAuthenticated ? (
            <>
              <button
                className={styles.SecondaryBtn}
                onClick={isConnected ? handleDisconnectSpotify : handleConnectSpotify}
              >
                {isConnected ? t('spotify_disconnect') : t('spotify_connect')}
              </button>
              <button className={styles.ProfileBtn} title={displayName}>
                {displayName}
              </button>
              <button className={styles.SecondaryBtn} onClick={logout}>
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.SecondaryBtn}
                onClick={handleConnectSpotify}
              >
                {t('spotify_connect')}
              </button>
              <button
                className={styles.SecondaryBtn}
                onClick={() => openAuthDialog('register')}
              >
                {t('register')}
              </button>
              <button
                className={styles.ProfileBtn}
                onClick={() => openAuthDialog('login')}
              >
                {t('login')}
              </button>
            </>
          )}
        </div>
      </div>

      {showLibraryTabs && (
        <div className={styles.SecondaryRow}>
          <LibraryTabBtn />
        </div>
      )}

      <AuthDialog />
    </nav>
  )
}

export default Topnav
