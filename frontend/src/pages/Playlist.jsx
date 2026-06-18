import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { changePlay, changeTrack } from '../store/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useSpotify } from '../context/SpotifyContext.jsx'
import {
  canStartTrackPlayback,
  createPlaybackQueue,
  getTrackPlaybackStatusKey,
} from '../lib/spotify.js'
import {
  mapCatalogPlaylistDetails,
  mapLocalPlaylistDetails,
} from '../utils/library.js'
import TextRegularM from '../components/text/TextRegularM'
import PlayButton from '../components/buttons/PlayButton'
import IconButton from '../components/buttons/IconButton'
import PlaylistActionsMenu from '../components/library/PlaylistActionsMenu.jsx'
import PlaylistDetails from '../components/playlist/PlaylistDetails'
import PlaylistTrack from '../components/playlist/PlaylistTrack'
import * as Icons from '../components/icons/index.jsx'
import { PLAYLIST } from '../data/index.js'
import { emitLibraryPlaylistsUpdated } from '../utils/library-events.js'
import styles from './playlist.module.css'

function PlaylistPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const trackData = useSelector((state) => state.player.trackData)
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const { path } = useParams()
  const { t } = useTranslation()
  const { isAuthenticated, openAuthDialog, request } = useAuth()
  const { connect, getPlaylistDetails, isConnected } = useSpotify()
  const [playlist, setPlaylist] = useState(null)
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadPlaylist() {
      const mockPlaylist = PLAYLIST.find((item) => item.link === path)

      if (mockPlaylist) {
        setPlaylist(mockPlaylist)
        setIsLoadingPlaylist(false)
        return
      }

      setIsLoadingPlaylist(true)

      try {
        if (isAuthenticated) {
          try {
            const localPlaylist = await request(`/api/library/playlists/${path}`)

            if (!cancelled && localPlaylist?.playlist) {
              setPlaylist(mapLocalPlaylistDetails(localPlaylist.playlist))
              return
            }
          } catch {
            // Ignore and continue to provider fallbacks.
          }
        }

        if (isConnected) {
          try {
            const spotifyPlaylist = await getPlaylistDetails(path)

            if (!cancelled && spotifyPlaylist) {
              setPlaylist(spotifyPlaylist)
              return
            }
          } catch {
            // Ignore and continue to public catalog.
          }
        }

        const publicPlaylist = await request(`/api/catalog/playlists/${path}`)

        if (!cancelled) {
          setPlaylist(publicPlaylist ? mapCatalogPlaylistDetails(publicPlaylist) : null)
        }
      } catch {
        if (!cancelled) {
          setPlaylist(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPlaylist(false)
        }
      }
    }

    loadPlaylist()

    return () => {
      cancelled = true
    }
  }, [getPlaylistDetails, isAuthenticated, isConnected, path, request])

  useEffect(() => {
    if (playlist?.playlistBg) {
      document.documentElement.style.setProperty(
        '--hover-home-bg',
        playlist.playlistBg,
      )
    }
  }, [playlist])

  function startPlaylist(startIndex = 0) {
    if (!playlist) {
      return
    }

    const queue = createPlaybackQueue(playlist)

    if (!queue.some((track) => canStartTrackPlayback(track, { allowRemote: isConnected }))) {
      return
    }

    dispatch(
      changeTrack({
        queue,
        startIndex,
      }),
    )
    dispatch(changePlay(true))
  }

  function handleTrackPlayback(song, songIndex) {
    if (!canStartTrackPlayback(song, { allowRemote: isConnected })) {
      return
    }

    const activeQueueIndex = Number(trackData.queueIndex)
    const isCurrentSong =
      trackData.playlistId === playlist?.link &&
      Number.isFinite(activeQueueIndex) &&
      activeQueueIndex === songIndex

    if (isCurrentSong) {
      dispatch(changePlay(!isPlaying))
      return
    }

    startPlaylist(songIndex)
  }

  function togglePlaylistPlayback(event) {
    event.preventDefault()

    if (!playlist) {
      return
    }

    if (trackData.playlistId === playlist.link) {
      dispatch(changePlay(!isPlaying))
      return
    }

    startPlaylist(0)
  }

  if (isLoadingPlaylist) {
    return (
      <div className={styles.PlaylistPage}>
        <div className={styles.gradientBg} />
        <div className={styles.gradientBgSoft} />
        <div className={styles.Bg} />
        <div className={styles.PlaylistSongs}>
          <TextRegularM>{t('playlist_loading')}</TextRegularM>
        </div>
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className={styles.PlaylistPage}>
        <div className={styles.gradientBg} />
        <div className={styles.gradientBgSoft} />
        <div className={styles.Bg} />
        <div className={styles.PlaylistSongs}>
          <TextRegularM>{t('playlist_unavailable')}</TextRegularM>
        </div>
      </div>
    )
  }

  const isthisplay = trackData.playlistId === playlist.link
  const unavailableTrackCount = (playlist.playlistData || []).filter(
    (song) => !canStartTrackPlayback(song, { allowRemote: isConnected }),
  ).length

  function handleConnectSpotify() {
    if (!isAuthenticated) {
      openAuthDialog('login')
      return
    }

    connect(`/playlist/${path}`).catch(() => {})
  }

  function handleOpenLocalAudio() {
    if (!isAuthenticated) {
      openAuthDialog('login')
      return
    }

    navigate('/library')
  }

  async function handleRenamePlaylist() {
    if (!playlist?.canEdit) {
      window.alert(t('playlist_manage_local_only'))
      return
    }

    // TODO: Replace browser prompt with the shared project modal once the library action dialog exists.
    const nextTitle = window.prompt(
      t('playlist_rename_prompt'),
      playlist.title || t('library_new_playlist'),
    )

    if (nextTitle === null) {
      return
    }

    const normalizedTitle = nextTitle.trim()

    if (!normalizedTitle) {
      window.alert(t('playlist_rename_empty'))
      return
    }

    if (normalizedTitle.length > 80) {
      window.alert(t('playlist_rename_too_long'))
      return
    }

    if (normalizedTitle === playlist.title) {
      return
    }

    try {
      const data = await request(`/api/library/playlists/${path}`, {
        method: 'PATCH',
        body: {
          title: normalizedTitle,
        },
      })

      if (!data?.playlist) {
        return
      }

      const updatedPlaylist = mapLocalPlaylistDetails(data.playlist)
      setPlaylist(updatedPlaylist)
      emitLibraryPlaylistsUpdated({
        type: 'renamed',
        playlistId: path,
        playlist: updatedPlaylist,
      })
    } catch (requestError) {
      window.alert(requestError.message || t('playlist_rename_failed'))
    }
  }

  async function handleDeletePlaylist() {
    if (!playlist?.canDelete) {
      window.alert(t('playlist_manage_local_only'))
      return
    }

    // TODO: Replace browser confirm with a shared danger modal when the project gets one.
    const confirmed = window.confirm(
      t('playlist_delete_confirm', {
        title: playlist.title || t('library_new_playlist'),
      }),
    )

    if (!confirmed) {
      return
    }

    try {
      await request(`/api/library/playlists/${path}`, {
        method: 'DELETE',
      })
      emitLibraryPlaylistsUpdated({
        type: 'deleted',
        playlistId: path,
      })
      navigate('/library')
    } catch (requestError) {
      window.alert(requestError.message || t('playlist_delete_failed'))
    }
  }

  return (
    <div className={styles.PlaylistPage}>
      <div className={styles.gradientBg} />
      <div className={styles.gradientBgSoft} />
      <div className={styles.Bg} />

      <div>
        <PlaylistDetails data={playlist} />

        <div className={styles.PlaylistIcons}>
          <div className={styles.PlayControl}>
            <PlayButton isthisplay={isthisplay} onClick={togglePlaylistPlayback} />
          </div>
          <IconButton icon={<Icons.Like />} activeicon={<Icons.LikeActive />} />
          {(playlist.canEdit || playlist.canDelete) ? (
            <div className={styles.ActionsMenuWrap}>
              <PlaylistActionsMenu
                onRename={playlist.canEdit ? handleRenamePlaylist : null}
                onDelete={playlist.canDelete ? handleDeletePlaylist : null}
              />
            </div>
          ) : (
            <Icons.More className={styles.moreIcon} />
          )}
        </div>

        {unavailableTrackCount > 0 && (
          <div className={styles.AvailabilityBanner}>
            <div>
              <p className={styles.AvailabilityTitle}>
                {t('playlist_partial_playback_title', {
                  count: unavailableTrackCount,
                })}
              </p>
              <p className={styles.AvailabilityText}>
                {t('playlist_partial_playback_body')}
              </p>
            </div>
            <div className={styles.AvailabilityActions}>
              <button
                type="button"
                className={styles.AvailabilityBtn}
                onClick={handleConnectSpotify}
              >
                {t('spotify_connect')}
              </button>
              <button
                type="button"
                className={styles.AvailabilityBtnSecondary}
                onClick={handleOpenLocalAudio}
              >
                {t('library_upload_audio')}
              </button>
            </div>
          </div>
        )}

        <div className={styles.ListHead}>
          <TextRegularM>#</TextRegularM>
          <TextRegularM>{t('playlist_title_col')}</TextRegularM>
          <Icons.Time />
        </div>

        <div className={styles.PlaylistSongs}>
          {playlist.playlistData.map((song, songIndex) => (
            <button
              key={song.id || song.index}
              type="button"
              disabled={!canStartTrackPlayback(song, { allowRemote: isConnected })}
              title={
                !canStartTrackPlayback(song, { allowRemote: isConnected })
                  ? t(getTrackPlaybackStatusKey(song, { allowRemote: isConnected }))
                  : song.songName
              }
              onClick={() => handleTrackPlayback(song, songIndex)}
              className={styles.SongBtn}
            >
              <PlaylistTrack
                data={{
                  listType: playlist.type,
                  playlistId: playlist.link,
                  song,
                  songIndex,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PlaylistPage
