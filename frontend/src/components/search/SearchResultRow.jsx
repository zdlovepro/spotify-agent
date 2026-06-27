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
  addMenuTrackId,
  addingTrackId,
  addStatus,
  availablePlaylists = [],
  isLoadingPlaylists = false,
  onAddTrackClick,
  onAddTrackToPlaylist,
  onOpenPlaylist,
  onPlayTrack,
}) {
  const meta = getItemMeta(item, type, t)
  const subtitle = getItemSubtitle(item, type, t)
  const isPlaylist = type === 'playlist'
  const isTrack = type === 'track'
  const isArtist = type === 'artist'
  const isAddMenuOpen = isTrack && addMenuTrackId === item.id
  const isAdding = isTrack && addingTrackId === item.id
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
        ) : isTrack ? (
          <div className={styles.ResultActionWrap}>
            <button
              type="button"
              className={styles.ResultIconBtn}
              disabled={isAdding}
              title={t('search_add_to_playlist')}
              aria-label={t('search_add_to_playlist')}
              onClick={(event) => {
                event.stopPropagation()
                onAddTrackClick?.(item)
              }}
            >
              {isAdding ? '...' : '+'}
            </button>

            {isAddMenuOpen && (
              <div
                className={styles.PlaylistAddMenu}
                role="menu"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <p className={styles.PlaylistAddTitle}>
                  {t('search_add_to_playlist')}
                </p>

                {isLoadingPlaylists ? (
                  <p className={styles.PlaylistAddHint}>
                    {t('search_loading_playlists')}
                  </p>
                ) : availablePlaylists.length ? (
                  <div className={styles.PlaylistAddList}>
                    {availablePlaylists.map((playlist) => (
                      <button
                        key={playlist.id}
                        type="button"
                        className={styles.PlaylistAddItem}
                        role="menuitem"
                        disabled={isAdding}
                        onClick={() => onAddTrackToPlaylist?.(item, playlist)}
                      >
                        <span>{playlist.title}</span>
                        <small>
                          {t('search_playlist_track_count', {
                            count: playlist.itemCount || 0,
                          })}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.PlaylistAddHint}>
                    {t('search_no_editable_playlists')}
                  </p>
                )}

                {addStatus?.trackId === item.id && addStatus.message && (
                  <p
                    className={`${styles.PlaylistAddStatus} ${
                      addStatus.type === 'error' ? styles.PlaylistAddStatusError : ''
                    }`}
                  >
                    {addStatus.message}
                  </p>
                )}
              </div>
            )}
          </div>
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
