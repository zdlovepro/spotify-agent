import styles from '../../pages/search.module.css'

function SearchSkeleton() {
  return (
    <div className={styles.SearchSkeleton}>
      <div className={styles.SearchSkeletonTabs}>
        <span className={styles.SkeletonPill} />
        <span className={styles.SkeletonPill} />
        <span className={styles.SkeletonPill} />
        <span className={styles.SkeletonPill} />
      </div>

      <section className={styles.SearchSection}>
        <div className={styles.TopResultSkeleton}>
          <span className={styles.SkeletonCover} />
          <div className={styles.TopResultSkeletonCopy}>
            <span className={styles.SkeletonLineShort} />
            <span className={styles.SkeletonLineLong} />
            <span className={styles.SkeletonLineMid} />
          </div>
          <span className={styles.SkeletonPlay} />
        </div>
      </section>

      <section className={styles.SearchSection}>
        <div className={styles.SearchSectionHeader}>
          <span className={styles.SkeletonLineShort} />
        </div>

        <div className={styles.ResultList}>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className={styles.ResultRowSkeleton}>
              <span className={styles.SkeletonThumb} />
              <div className={styles.ResultRowSkeletonCopy}>
                <span className={styles.SkeletonLineMid} />
                <span className={styles.SkeletonLineShort} />
              </div>
              <span className={styles.SkeletonMiniBtn} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default SearchSkeleton
