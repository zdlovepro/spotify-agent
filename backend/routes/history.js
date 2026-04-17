import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { requireSpotifyAccessToken } from '../middleware/require-spotify-access-token.js'
import { getCurrentUserProfile, parseInteger } from '../services/spotify-api.js'
import {
  deleteRecommendationHistory,
  listRecommendationHistory,
  saveRecommendationHistory,
} from '../services/recommendation-history-store.js'

const router = Router()

function assert(condition, message, status = 400, details = undefined) {
  if (condition) {
    return
  }

  const error = new Error(message)
  error.status = status
  error.details = details
  throw error
}

router.use(requireSpotifyAccessToken)

router.use(
  asyncHandler(async (req, res, next) => {
    const profile = await getCurrentUserProfile(req.accessToken)

    req.spotifyProfile = profile
    req.spotifyUserId = profile.id
    next()
  }),
)

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
