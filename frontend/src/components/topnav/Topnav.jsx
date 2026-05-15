import { useEffect, useRef, useState } from 'react'
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
  const accountMenuRef = useRef(null)
  const [connectHint, setConnectHint] = useState('')
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)

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
  const accountButtonLabel = isAuthenticated ? displayName : t('agent_guest_label')
  const accountAvatarText = String(accountButtonLabel || t('appName'))
    .trim()
    .charAt(0)
    .toUpperCase()
  const accountSubtitle = isAuthenticated
    ? profile?.display_name && profile.display_name !== displayName
      ? profile.display_name
      : user?.email && user.email !== displayName
        ? user.email
        : ''
    : t('mode_guest')
  const accountMenuAriaLabel =
    i18n.language === 'zh' ? '账户菜单' : 'Account menu'
  const languageToggleLabel =
    i18n.language === 'zh' ? 'Switch to English' : '切换中文'

  useEffect(() => {
    if (isAuthenticated || isConnected) {
      setConnectHint('')
    }
  }, [isAuthenticated, isConnected])

  useEffect(() => {
    setIsAccountMenuOpen(false)
  }, [location.hash, location.pathname, location.search])

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return undefined
    }

    function handlePointerDown(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setIsAccountMenuOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAccountMenuOpen])

  function handleConnectSpotify() {
    const returnTo = `${location.pathname}${location.search}${location.hash}` || '/'

    if (!isAuthenticated) {
      setConnectHint(t('spotify_requires_local_account'))
      openAuthDialog('login')
      return
    }

    setConnectHint('')
    connect(returnTo).catch(() => {})
  }

  function handleDisconnectSpotify() {
    setConnectHint('')
    disconnect()
  }

  function closeAccountMenu() {
    setIsAccountMenuOpen(false)
  }

  function handleMenuAction(action) {
    return () => {
      closeAccountMenu()
      action()
    }
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

          <div className={styles.AccountMenuWrapper} ref={accountMenuRef}>
            <button
              type="button"
              className={styles.AccountMenuButton}
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              aria-label={accountMenuAriaLabel}
              onClick={() => setIsAccountMenuOpen((currentValue) => !currentValue)}
              title={accountButtonLabel}
            >
              <span className={styles.AccountAvatar}>{accountAvatarText || 'A'}</span>
              <span className={styles.AccountName}>{accountButtonLabel}</span>
              <span
                className={`${styles.AccountChevron} ${
                  isAccountMenuOpen ? styles.AccountChevronOpen : ''
                }`}
                aria-hidden="true"
              >
                v
              </span>
            </button>

            {isAccountMenuOpen && (
              <div
                className={styles.AccountDropdown}
                role="menu"
                aria-label={accountMenuAriaLabel}
              >
                <div className={styles.AccountMenuStatus} role="none">
                  <span className={styles.AccountMenuLabel}>{t('agent_mode_title')}</span>
                  <span className={styles.AccountMenuValue}>{modeLabel}</span>
                </div>

                <div className={styles.AccountMenuStatus} role="none">
                  <span className={styles.AccountMenuValue}>
                    {isAuthenticated ? displayName : t('agent_guest_label')}
                  </span>
                  {accountSubtitle && (
                    <span className={styles.AccountMenuMeta}>{accountSubtitle}</span>
                  )}
                </div>

                <div className={styles.AccountMenuDivider} role="separator" />

                <button
                  type="button"
                  role="menuitem"
                  className={styles.AccountMenuItem}
                  onClick={handleMenuAction(
                    isConnected ? handleDisconnectSpotify : handleConnectSpotify,
                  )}
                >
                  {isConnected ? t('spotify_disconnect') : t('spotify_connect')}
                </button>

                {!isAuthenticated && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.AccountMenuItem}
                    onClick={handleMenuAction(() => openAuthDialog('register'))}
                  >
                    {t('register')}
                  </button>
                )}

                {!isAuthenticated && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.AccountMenuItem}
                    onClick={handleMenuAction(() => openAuthDialog('login'))}
                  >
                    {t('login')}
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  className={styles.AccountMenuItem}
                  onClick={handleMenuAction(toggleLanguage)}
                >
                  {languageToggleLabel}
                </button>

                {isAuthenticated && (
                  <>
                    <div className={styles.AccountMenuDivider} role="separator" />
                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.AccountMenuItem} ${styles.AccountMenuDanger}`}
                      onClick={handleMenuAction(logout)}
                    >
                      {t('logout')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
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
