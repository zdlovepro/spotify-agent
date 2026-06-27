import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { assert } from '../utils/assert.js'
import { parseInteger } from '../services/spotify-api.js'
import spotifyPublicProvider from '../services/provider/spotify-public-provider.js'

const router = Router()

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    assert(req.query.q, 'q is required')

    const data = await spotifyPublicProvider.search({
      q: String(req.query.q).trim(),
      type: req.query.type || 'track,artist,playlist,album',
      limit: parseInteger(req.query.limit, 10),
      offset: parseInteger(req.query.offset, 0, { min: 0, max: 1000 }),
      market: req.query.market || undefined,
      include_external: req.query.include_external || undefined,
    })

    res.json(data)
  }),
)

router.get(
  '/tracks/:id',
  asyncHandler(async (req, res) => {
    const data = await spotifyPublicProvider.getTrack(req.params.id, {
      market: req.query.market || undefined,
    })

    res.json(data)
  }),
)

router.get(
  '/albums/:id',
  asyncHandler(async (req, res) => {
    const data = await spotifyPublicProvider.getAlbum(req.params.id, {
      market: req.query.market || undefined,
    })

    res.json(data)
  }),
)

router.get(
  '/artists/:id',
  asyncHandler(async (req, res) => {
    const data = await spotifyPublicProvider.getArtist(req.params.id)
    res.json(data)
  }),
)

router.get(
  '/playlists/:id',
  asyncHandler(async (req, res) => {
    const data = await spotifyPublicProvider.getPlaylist(req.params.id, {
      market: req.query.market || undefined,
    })

    res.json(data)
  }),
)

export default router
