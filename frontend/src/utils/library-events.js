export const LIBRARY_PLAYLISTS_UPDATED_EVENT = 'agentmusic:library-playlists-updated'

export function emitLibraryPlaylistsUpdated(detail = {}) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent(LIBRARY_PLAYLISTS_UPDATED_EVENT, {
      detail,
    }),
  )
}

export function subscribeLibraryPlaylistsUpdated(handler) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const listener = (event) => {
    handler(event.detail || {})
  }

  window.addEventListener(LIBRARY_PLAYLISTS_UPDATED_EVENT, listener)

  return () => {
    window.removeEventListener(LIBRARY_PLAYLISTS_UPDATED_EVENT, listener)
  }
}
