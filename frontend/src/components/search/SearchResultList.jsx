import SearchResultRow from './SearchResultRow.jsx'
import styles from '../../pages/search.module.css'

function SearchResultList({
  title,
  items,
  type,
  t,
  addMenuTrackId,
  addingTrackId,
  addStatus,
  availablePlaylists,
  isLoadingPlaylists,
  onAddTrackClick,
  onAddTrackToPlaylist,
  onOpenPlaylist,
  onPlayTrack,
}) {
  if (!items.length) {
    return null
  }

  return (
    <section className={styles.SearchSection}>
      <div className={styles.SearchSectionHeader}>
        <h2 className={styles.SearchSectionTitle}>{title}</h2>
        <span className={styles.SearchSectionCount}>{items.length}</span>
      </div>

      <div className={styles.ResultList}>
        {items.map((item) => (
          <SearchResultRow
            key={`${type}-${item.id}`}
            item={item}
            type={type}
            t={t}
            addMenuTrackId={addMenuTrackId}
            addingTrackId={addingTrackId}
            addStatus={addStatus}
            availablePlaylists={availablePlaylists}
            isLoadingPlaylists={isLoadingPlaylists}
            onAddTrackClick={onAddTrackClick}
            onAddTrackToPlaylist={onAddTrackToPlaylist}
            onOpenPlaylist={onOpenPlaylist}
            onPlayTrack={onPlayTrack}
          />
        ))}
      </div>
    </section>
  )
}

export default SearchResultList
