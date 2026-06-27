import { SEARCH_TABS } from './search-utils.js'
import styles from '../../pages/search.module.css'

function SearchTabs({ activeTab, onSelect, t }) {
  return (
    <div className={styles.SearchTabs} role="tablist" aria-label={t('search_results')}>
      {SEARCH_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`${styles.SearchTab} ${
            activeTab === tab.key ? styles.SearchTabActive : ''
          }`}
          onClick={() => onSelect(tab.key)}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  )
}

export default SearchTabs
