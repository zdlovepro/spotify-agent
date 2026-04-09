import { useTranslation } from 'react-i18next'
import * as Icons from '../icons/index.jsx'
import styles from './search-box.module.css'

function SearchBox() {
  const { t } = useTranslation()

  return (
    <div className={styles.SeachBox}>
      <Icons.Search />
      <input
        placeholder={t('search_placeholder')}
        maxLength="80"
      />
    </div>
  )
}

export default SearchBox
