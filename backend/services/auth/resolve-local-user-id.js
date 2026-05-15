import db from '../../db/index.js'

const SPOTIFY_PROVIDER_NAME = 'spotify'

function normalizeIdentifier(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveLocalUserId(localUserIdOrLegacyUserId) {
  const identifier = normalizeIdentifier(localUserIdOrLegacyUserId)

  if (!identifier) {
    return null
  }

  const directMatch = db
    .prepare(
      `
        SELECT id
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(identifier)?.id

  if (directMatch) {
    return directMatch
  }

  // TODO: remove this legacy spotifyUserId fallback after all callers send localUserId.
  const spotifySourceId = identifier.startsWith('spotify:')
    ? identifier
    : `spotify:user:${identifier}`
  const linkedUserId = db
    .prepare(
      `
        SELECT user_id
        FROM provider_links
        WHERE provider_name = ?
          AND (
            provider_user_id = ?
            OR source_id = ?
          )
        LIMIT 1
      `,
    )
    .get(SPOTIFY_PROVIDER_NAME, identifier, spotifySourceId)?.user_id

  return linkedUserId || null
}

export default resolveLocalUserId
