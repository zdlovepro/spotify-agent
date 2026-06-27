import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { requireLocalUser } from '../middleware/require-local-user.js'
import { assert } from '../utils/assert.js'
import { createListeningEvent } from '../services/player/listening-event-service.js'

const router = Router()

router.use(requireLocalUser)

router.post(
  '/events',
  asyncHandler(async (req, res) => {
    assert(req.body && typeof req.body === 'object', 'request body is required')

    const event = createListeningEvent({
      ...(req.body || {}),
      ownerUserId: req.localUserId,
      sessionId: req.localSession?.id || '',
    })

    res.status(201).json({
      event,
    })
  }),
)

export default router
