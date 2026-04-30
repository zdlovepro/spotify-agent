import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { requireLocalUser } from '../middleware/require-local-user.js'
import { assert } from '../utils/assert.js'
import {
  createUser,
  findUserByEmail,
  sanitizeUser,
} from '../services/auth/user-service.js'
import {
  createSession,
  deleteSession,
} from '../services/auth/session-service.js'
import {
  hashPassword,
  verifyPassword,
} from '../services/auth/password-service.js'

const router = Router()

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function normalizePassword(password) {
  return typeof password === 'string' ? password : ''
}

function normalizeDisplayName(displayName, email) {
  const trimmedDisplayName =
    typeof displayName === 'string' ? displayName.trim() : ''

  if (trimmedDisplayName) {
    return trimmedDisplayName
  }

  const normalizedEmail = normalizeEmail(email)
  const fallback = normalizedEmail.split('@')[0]

  return fallback || 'AgentMusic User'
}

function buildAuthPayload(user, session) {
  return {
    user: sanitizeUser(user),
    session: {
      id: session.id,
      token: session.sessionToken,
      tokenType: 'Bearer',
      expiresAt: session.expiresAt,
    },
  }
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = normalizePassword(req.body?.password)
    const displayName = normalizeDisplayName(req.body?.displayName, email)

    assert(email, 'email is required')
    assert(email.includes('@'), 'email must be valid')
    assert(password, 'password is required')
    assert(password.length >= 8, 'password must be at least 8 characters')

    const existingUser = findUserByEmail(email)
    assert(!existingUser, 'A user with this email already exists', 409)

    const user = createUser({
      email,
      passwordHash: hashPassword(password),
      displayName,
      metadata: {
        authProvider: 'local',
      },
    })

    const session = createSession({
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.header('user-agent') || null,
      metadata: {
        authProvider: 'local',
        reason: 'register',
      },
    })

    res.status(201).json(buildAuthPayload(user, session))
  }),
)

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = normalizePassword(req.body?.password)

    assert(email, 'email is required')
    assert(password, 'password is required')

    const user = findUserByEmail(email)
    assert(user, 'Invalid email or password', 401)
    assert(user.status === 'active', 'User account is not active', 403)
    assert(
      verifyPassword(password, user.passwordHash),
      'Invalid email or password',
      401,
    )

    const session = createSession({
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.header('user-agent') || null,
      metadata: {
        authProvider: 'local',
        reason: 'login',
      },
    })

    res.json(buildAuthPayload(user, session))
  }),
)

router.post(
  '/logout',
  requireLocalUser,
  asyncHandler(async (req, res) => {
    const removed = deleteSession(req.localSessionToken)

    res.json({
      success: removed,
    })
  }),
)

router.get(
  '/me',
  requireLocalUser,
  asyncHandler(async (req, res) => {
    res.json({
      user: sanitizeUser(req.localUser),
      session: {
        id: req.localSession?.id || null,
        expiresAt: req.localSession?.expiresAt || null,
      },
    })
  }),
)

export default router
