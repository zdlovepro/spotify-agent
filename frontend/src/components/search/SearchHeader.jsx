import SearchTabs from './SearchTabs.jsx'
import styles from '../../pages/search.module.css'

function SearchHeader({ query, activeTab, onTabChange, t }) {
  return (
    <header className={styles.SearchHeader}>
      <div className={styles.SearchHeaderCopy}>
        {query ? (
          <>
            <p className={styles.SearchEyebrow}>{t('search_results')}</p>
            <h1 className={styles.SearchTitle}>
              {t('search_results_for', { query })}
            </h1>
          </>
        ) : (
          <>
            <p className={styles.SearchEyebrow}>{t('browseAll')}</p>
            <h1 className={styles.SearchTitle}>{t('search_empty_prompt_title')}</h1>
          </>
        )}
      </div>

      <SearchTabs activeTab={activeTab} onSelect={onTabChange} t={t} />
    </header>
  )
}

export default SearchHeader
