import * as Icons from '../icons/index.jsx'
import {
  getItemImage,
  getItemSubtitle,
  getItemTypeLabel,
} from './search-utils.js'
import styles from '../../pages/search.module.css'

function SearchTopResult({
  result,
  t,
  onPrimaryAction,
}) {
  if (!result?.item || !result?.type) {
    return null
  }

  const { item, type } = result
  const canPlay = type === 'track' || type === 'playlist'
  const primaryLabel =
    type === 'track' ? t('search_play_on_spotify') : t('search_open_playlist')

  return (
    <section className={styles.SearchSection}>
      <div className={styles.SearchSectionHeader}>
        <h2 className={styles.SearchSectionTitle}>{t('search_top_result')}</h2>
      </div>

      <article className={styles.TopResultCard}>
        <div className={styles.TopResultMain}>
          <img
            src={getItemImage(item, type)}
            alt={item.name}
            className={`${styles.TopResultImage} ${
              type === 'artist' ? styles.TopResultImageRound : ''
            }`}
          />

          <div className={styles.TopResultCopy}>
            <span className={styles.TopResultType}>{getItemTypeLabel(type, t)}</span>
            <h3 className={styles.TopResultTitle}>{item.name}</h3>
            <p className={styles.TopResultSubtitle}>{getItemSubtitle(item, type, t)}</p>
          </div>
        </div>

        <button
          type="button"
          className={styles.TopResultPlayBtn}
          onClick={onPrimaryAction}
          disabled={!canPlay}
          aria-label={primaryLabel}
          title={primaryLabel}
        >
          <Icons.Play aria-hidden="true" />
        </button>
      </article>
    </section>
  )
}

export default SearchTopResult
