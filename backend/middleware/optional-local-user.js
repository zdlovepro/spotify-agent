import { getSession, touchSession } from '../services/auth/session-service.js'
import { findUserById } from '../services/auth/user-service.js'

function normalizeHeaderValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractBearerToken(authorizationHeader) {
  const value = normalizeHeaderValue(authorizationHeader)

  if (!value.toLowerCase().startsWith('bearer ')) {
    return ''
  }

  return value.slice('bearer '.length).trim()
}

export function resolveLocalUserFromRequest(req) {
  const headerToken = normalizeHeaderValue(req.header('x-session-token'))
  const authorizationToken = extractBearerToken(req.header('authorization'))
  const queryToken =
    typeof req.query?.session_token === 'string'
      ? req.query.session_token.trim()
      : ''
  const sessionToken = headerToken || authorizationToken || queryToken

  if (!sessionToken) {
    return null
  }

  const session = getSession(sessionToken)

  if (!session) {
    return null
  }

  const user = findUserById(session.userId)

  if (!user) {
    return null
  }

  const refreshedSession = touchSession(sessionToken) || session

  return {
    ...user,
    session: refreshedSession,
    sessionToken,
    roles: [],
    providerLinks: [],
    source: 'local-session',
  }
}

export function optionalLocalUser(req, res, next) {
  const localUser = resolveLocalUserFromRequest(req)

  req.localUser = localUser
  req.localUserId = localUser?.id || null
  req.localSessionToken = localUser?.sessionToken || null
  req.localSession = localUser?.session || null
  req.isLocalUserAuthenticated = Boolean(req.localUserId)

  next()
}

export default optionalLocalUser
