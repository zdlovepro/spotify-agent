function normalizeHeaderValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveLocalUserFromRequest(req) {
  const localUserId = normalizeHeaderValue(req.header('x-local-user-id'))
  const sessionToken = normalizeHeaderValue(req.header('x-session-token'))

  if (!localUserId && !sessionToken) {
    return null
  }

  return {
    id: localUserId || null,
    sessionToken: sessionToken || null,
    roles: [],
    providerLinks: [],
    source: 'placeholder-local-auth',
  }
}

export function optionalLocalUser(req, res, next) {
  const localUser = resolveLocalUserFromRequest(req)

  req.localUser = localUser
  req.localUserId = localUser?.id || null
  req.localSessionToken = localUser?.sessionToken || null
  req.isLocalUserAuthenticated = Boolean(req.localUserId)

  next()
}

export default optionalLocalUser
