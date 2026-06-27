import styles from '../../pages/search.module.css'

function SearchEmptyState({
  title,
  body,
  actionLabel = '',
  onAction = null,
  tone = 'default',
  children = null,
}) {
  return (
    <section
      className={`${styles.SearchEmptyState} ${
        tone === 'error' ? styles.SearchEmptyStateError : ''
      }`}
    >
      <div className={styles.SearchEmptyCopy}>
        <h2 className={styles.SearchEmptyTitle}>{title}</h2>
        {body ? <p className={styles.SearchEmptyBody}>{body}</p> : null}
      </div>

      {actionLabel && typeof onAction === 'function' && (
        <button
          type="button"
          className={styles.SearchPrimaryBtn}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}

      {children}
    </section>
  )
}

export default SearchEmptyState
