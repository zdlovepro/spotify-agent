import {
  getItemImage,
  getItemMeta,
  getItemSubtitle,
  getItemTypeLabel,
} from './search-utils.js'
import styles from '../../pages/search.module.css'

function SearchResultRow({
  item,
  type,
  t,
  onOpenPlaylist,
  onPlayTrack,
}) {
  const meta = getItemMeta(item, type, t)
  const subtitle = getItemSubtitle(item, type, t)
  const isPlaylist = type === 'playlist'
  const isTrack = type === 'track'
  const isArtist = type === 'artist'
  const rowAction = isTrack
    ? () => onPlayTrack(item)
    : isPlaylist
      ? () => onOpenPlaylist(item)
      : null
  const interactiveProps = rowAction
    ? {
        role: 'button',
        tabIndex: 0,
        onClick: rowAction,
        onKeyDown(event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            rowAction()
          }
        },
        title: item.name,
        'aria-label': item.name,
      }
    : {}

  return (
    <div
      className={`${styles.ResultRow} ${rowAction ? styles.ResultRowInteractive : ''}`}
      {...interactiveProps}
    >
      <div className={styles.ResultRowMain}>
        <img
          src={getItemImage(item, type)}
          alt={item.name}
          className={`${styles.ResultRowImage} ${
            isArtist ? styles.ResultRowImageRound : ''
          }`}
        />

        <div className={styles.ResultRowCopy}>
          <p className={styles.ResultRowTitle}>{item.name}</p>
          <p className={styles.ResultRowSubtitle}>
            {getItemTypeLabel(type, t)}
            {subtitle ? ` / ${subtitle}` : ''}
          </p>
        </div>
      </div>

      <div className={styles.ResultRowActions}>
        {meta && <span className={styles.ResultRowMeta}>{meta}</span>}

        {isArtist ? (
          <button
            type="button"
            className={styles.ResultGhostBtn}
            disabled
            title={t('search_coming_soon')}
          >
            {t('search_follow')}
          </button>
        ) : (
          <button
            type="button"
            className={styles.ResultIconBtn}
            disabled
            title={t('search_coming_soon')}
            aria-label={t('search_add')}
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}

export default SearchResultRow
