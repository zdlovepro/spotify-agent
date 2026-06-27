import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { attachSpotifyProfile } from '../middleware/attach-spotify-profile.js'
import { optionalLocalUser } from '../middleware/optional-local-user.js'
import { requireSpotifyAccessToken } from '../middleware/require-spotify-access-token.js'
import { assert } from '../utils/assert.js'
import { parseInteger } from '../services/spotify-api.js'
import {
  deleteRecommendationHistory,
  listRecommendationHistory,
  saveRecommendationHistory,
} from '../services/recommendation-history-store.js'

const router = Router()

// TODO: remove req.spotifyUserId fallback after all history callers send local session tokens.
function resolveHistoryOwnerId(req) {
  return req.localUserId || req.spotifyUserId
}

router.use(optionalLocalUser)
router.use(requireSpotifyAccessToken)
router.use(attachSpotifyProfile)

router.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const limit = parseInteger(req.query.limit, 20, { min: 1, max: 50 })
    const ownerUserId = resolveHistoryOwnerId(req)
    const entries = await listRecommendationHistory(ownerUserId, limit)

    res.json({
      userId: ownerUserId,
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
    const ownerUserId = resolveHistoryOwnerId(req)

    const entry = await saveRecommendationHistory(ownerUserId, {
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
    const ownerUserId = resolveHistoryOwnerId(req)
    const removed = await deleteRecommendationHistory(
      ownerUserId,
      req.params.entryId,
    )

    if (!removed) {
      return res.status(404).json({ error: 'Recommendation history entry not found' })
    }

    res.status(204).send()
  }),
)

export default router
