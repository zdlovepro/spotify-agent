import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as Icons from '../icons/index.jsx'
import styles from './search-box.module.css'

function SearchBox() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const query = useMemo(() => {
    const searchParams = new URLSearchParams(location.search)
    return searchParams.get('q') || ''
  }, [location.search])
  const [value, setValue] = useState(query)

  useEffect(() => {
    setValue(query)
  }, [query])

  function submitSearch(event) {
    event.preventDefault()

    const normalizedValue = value.trim()

    if (!normalizedValue) {
      if (location.pathname === '/search' && query) {
        navigate('/search', { replace: true })
      }

      return
    }

    const nextUrl = `/search?q=${encodeURIComponent(normalizedValue)}`

    if (`${location.pathname}${location.search}` !== nextUrl) {
      navigate(nextUrl)
    }
  }

  function handleClear() {
    setValue('')

    if (location.pathname === '/search' && query) {
      navigate('/search', { replace: true })
    }

    inputRef.current?.focus()
  }

  return (
    <form className={styles.SeachBox} onSubmit={submitSearch}>
      <Icons.Search aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('search_placeholder')}
        maxLength="80"
        aria-label={t('search_placeholder')}
      />
      {(value || query) && (
        <button
          type="button"
          className={styles.ClearBtn}
          onClick={handleClear}
          aria-label={t('search_clear')}
          title={t('search_clear')}
        >
          x
        </button>
      )}
    </form>
  )
}

export default SearchBox
