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
  getPlaylist,
  listFavorites,
  listPlaylists,
  updatePlaylist,
} from '../services/library/library-service.js'

const router = Router()

router.use(requireLocalUser)

router.get(
  '/playlists',
  asyncHandler(async (req, res) => {
    const playlists = listPlaylists(req.localUserId)
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
      playlist,
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
      playlist,
    })
  }),
)

router.patch(
  '/playlists/:id',
  asyncHandler(async (req, res) => {
    const playlist = updatePlaylist(req.localUserId, req.params.id, req.body || {})

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' })
    }

    res.json({
      playlist,
    })
  }),
)

router.delete(
  '/playlists/:id',
  asyncHandler(async (req, res) => {
    const removed = deletePlaylist(req.localUserId, req.params.id)

    if (!removed) {
      return res.status(404).json({ error: 'Playlist not found' })
    }

    res.status(204).send()
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
      item,
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
      items: favorites,
    })
  }),
)

router.post(
  '/favorites',
  asyncHandler(async (req, res) => {
    assert(req.body, 'request body is required')
    const favorite = createFavorite(req.localUserId, req.body)

    res.status(201).json({
      favorite,
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
