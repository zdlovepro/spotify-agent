import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MENU } from '../../constants/index.jsx'
import TextBoldM from '../text/TextBoldM'
import styles from './navigation.module.css'

function Navigation() {
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <div className={styles.navBtns}>
      {MENU.map((menu) => {
        const selected =
          menu.path === '/'
            ? location.pathname === '/'
            : location.pathname === menu.path ||
              location.pathname.startsWith(`${menu.path}/`)

        return (
          <NavLink
            to={menu.path}
            end={menu.path === '/'}
            className={() => (selected ? 'activeLink' : '')}
            key={menu.title}
          >
            <button className={styles.button}>
              {selected ? menu.iconSelected : menu.icon}
              <TextBoldM>{t(menu.titleKey)}</TextBoldM>
            </button>
          </NavLink>
        )
      })}
    </div>
  )
}

export default Navigation
