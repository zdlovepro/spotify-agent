import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { attachSpotifyProfile } from '../middleware/attach-spotify-profile.js'
import { requireSpotifyAccessToken } from '../middleware/require-spotify-access-token.js'
import { assert } from '../utils/assert.js'
import { parseInteger } from '../services/spotify-api.js'
import {
  deleteRecommendationHistory,
  listRecommendationHistory,
  saveRecommendationHistory,
} from '../services/recommendation-history-store.js'

const router = Router()

router.use(requireSpotifyAccessToken)
router.use(attachSpotifyProfile)

router.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const limit = parseInteger(req.query.limit, 20, { min: 1, max: 50 })
    const entries = await listRecommendationHistory(req.spotifyUserId, limit)

    res.json({
      userId: req.spotifyUserId,
      total: entries.length,
      items: entries,
    })
  }),
)

router.post(
  '/recommendations',
  asyncHandler(async (req, res) => {
    assert(req.body?.title || req.body?.prompt, 'title or prompt is required')
    assert(
      !req.body?.tracks || Array.isArray(req.body.tracks),
      'tracks must be an array when provided',
    )

    const entry = await saveRecommendationHistory(req.spotifyUserId, {
      title: req.body.title,
      prompt: req.body.prompt,
      description: req.body.description,
      seeds: req.body.seeds,
      tracks: req.body.tracks,
    })

    res.status(201).json(entry)
  }),
)

router.delete(
  '/recommendations/:entryId',
  asyncHandler(async (req, res) => {
    const removed = await deleteRecommendationHistory(
      req.spotifyUserId,
      req.params.entryId,
    )

    if (!removed) {
      return res.status(404).json({ error: 'Recommendation history entry not found' })
    }

    res.status(204).send()
  }),
)

export default router
