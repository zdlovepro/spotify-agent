import { NavLink } from 'react-router-dom'
import TextBoldM from '../text/TextBoldM'
import { LIBRARYTABS } from '../../constants/index.jsx'
import styles from './library-tab-btn.module.css'

function LibraryTabBtn() {
  return (
    <nav className={styles.TabNav}>
      {LIBRARYTABS.map((item) => (
        <NavLink
          key={item.title}
          className={({ isActive }) =>
            `${styles.tabBtn}${isActive ? ' activeTabBtn' : ''}`
          }
          to={item.path}
          end
        >
          <TextBoldM>{item.title}</TextBoldM>
        </NavLink>
      ))}
    </nav>
  )
}

export default LibraryTabBtn
