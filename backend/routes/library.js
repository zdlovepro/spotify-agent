import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { requireLocalUser } from '../middleware/require-local-user.js'
import { assert } from '../utils/assert.js'
import {
  addPlaylistItem,
  createFavorite,
  createPlaylist,
  deleteFavorite,
  deletePlaylist,
  deletePlaylistItem,
  enrichStoredFavorite,
  enrichStoredPlaylist,
  enrichStoredTrackReference,
  getPlaylist,
  listFavorites,
  listPlaylists,
  updatePlaylist,
} from '../services/library/library-service.js'

const router = Router()

const LOCAL_LIBRARY_SOURCE_TYPE = 'agentmusic'

function createLocalAudioStreamUrl(req, assetId) {
  if (typeof assetId !== 'string' || !assetId.trim()) {
    return ''
  }

  const origin = `${req.protocol}://${req.get('host')}`
  const baseUrl = `${origin}/api/media/assets/${encodeURIComponent(assetId)}/stream`

  if (!req.localSessionToken) {
    return baseUrl
  }

  return `${baseUrl}?session_token=${encodeURIComponent(req.localSessionToken)}`
}

function enrichPlaylistForResponse(req, playlist) {
  return enrichStoredPlaylist(playlist, {
    resolveAudioUrl(audioAssetId) {
      return createLocalAudioStreamUrl(req, audioAssetId)
    },
  })
}

function enrichFavoriteForResponse(req, favorite) {
  return enrichStoredFavorite(favorite, {
    resolveAudioUrl(audioAssetId) {
      return createLocalAudioStreamUrl(req, audioAssetId)
    },
  })
}

function readPlaylistTitleInput(input = {}) {
  if (typeof input.title === 'string') {
    return input.title.trim()
  }

  if (typeof input.name === 'string') {
    return input.name.trim()
  }

  return null
}

function canManagePlaylist(playlist) {
  return playlist?.sourceType === LOCAL_LIBRARY_SOURCE_TYPE
}

router.use(requireLocalUser)

router.get(
  '/playlists',
  asyncHandler(async (req, res) => {
    const playlists = listPlaylists(req.localUserId)
      .map((playlist) => getPlaylist(req.localUserId, playlist.id))
      .filter(Boolean)
      .map((playlist) => enrichPlaylistForResponse(req, playlist))

    res.json({
      userId: req.localUserId,
      items: playlists,
    })
  }),
)

router.post(
  '/playlists',
  asyncHandler(async (req, res) => {
    const playlist = createPlaylist(req.localUserId, req.body || {})
    res.status(201).json({
      playlist: enrichPlaylistForResponse(req, playlist),
    })
  }),
)

router.get(
  '/playlists/:id',
  asyncHandler(async (req, res) => {
    const playlist = getPlaylist(req.localUserId, req.params.id)

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' })
    }

    res.json({
      playlist: enrichPlaylistForResponse(req, playlist),
    })
  }),
)

router.patch(
  '/playlists/:id',
  asyncHandler(async (req, res) => {
    const existing = getPlaylist(req.localUserId, req.params.id)

    if (!existing) {
      return res.status(404).json({ error: 'Playlist not found' })
    }

    if (!canManagePlaylist(existing)) {
      return res.status(403).json({
        error: 'Only local AgentMusic playlists can be renamed',
      })
    }

    const nextTitle = readPlaylistTitleInput(req.body || {})

    if (nextTitle !== null) {
      if (!nextTitle) {
        return res.status(400).json({ error: 'Playlist name cannot be empty' })
      }

      if (nextTitle.length > 80) {
        return res
          .status(400)
          .json({ error: 'Playlist name cannot exceed 80 characters' })
      }
    }

    const payload = {
      ...(req.body || {}),
      ...(nextTitle !== null ? { title: nextTitle } : {}),
    }
    const playlist = updatePlaylist(req.localUserId, req.params.id, payload)

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' })
    }

    res.json({
      playlist: enrichPlaylistForResponse(req, playlist),
    })
  }),
)

router.delete(
  '/playlists/:id',
  asyncHandler(async (req, res) => {
    const existing = getPlaylist(req.localUserId, req.params.id)

    if (!existing) {
      return res.status(404).json({ error: 'Playlist not found' })
    }

    if (!canManagePlaylist(existing)) {
      return res.status(403).json({
        error: 'Only local AgentMusic playlists can be deleted',
      })
    }

    const removed = deletePlaylist(req.localUserId, req.params.id)

    if (!removed) {
      return res.status(404).json({ error: 'Playlist not found' })
    }

    res.json({ ok: true })
  }),
)

router.post(
  '/playlists/:id/items',
  asyncHandler(async (req, res) => {
    assert(req.body, 'request body is required')

    const item = addPlaylistItem(req.localUserId, req.params.id, req.body)

    if (!item) {
      return res.status(404).json({ error: 'Playlist not found' })
    }

    res.status(201).json({
      item: enrichStoredTrackReference(
        item,
        {
          resolveAudioUrl(audioAssetId) {
            return createLocalAudioStreamUrl(req, audioAssetId)
          },
        },
      ),
    })
  }),
)

router.delete(
  '/playlists/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const removed = deletePlaylistItem(
      req.localUserId,
      req.params.id,
      req.params.itemId,
    )

    if (!removed) {
      return res.status(404).json({ error: 'Playlist item not found' })
    }

    res.status(204).send()
  }),
)

router.get(
  '/favorites',
  asyncHandler(async (req, res) => {
    const favoriteType =
      typeof req.query.favorite_type === 'string' ? req.query.favorite_type : null
    const favorites = listFavorites(req.localUserId, favoriteType)

    res.json({
      userId: req.localUserId,
      items: favorites.map((favorite) => enrichFavoriteForResponse(req, favorite)),
    })
  }),
)

router.post(
  '/favorites',
  asyncHandler(async (req, res) => {
    assert(req.body, 'request body is required')
    const favorite = createFavorite(req.localUserId, req.body)

    res.status(201).json({
      favorite: enrichFavoriteForResponse(req, favorite),
    })
  }),
)

router.delete(
  '/favorites/:favoriteId',
  asyncHandler(async (req, res) => {
    const removed = deleteFavorite(req.localUserId, req.params.favoriteId)

    if (!removed) {
      return res.status(404).json({ error: 'Favorite not found' })
    }

    res.status(204).send()
  }),
)

export default router
