import { asyncHandler } from './async-handler.js'
import {
  listProviderLinks,
  refreshProviderToken,
} from '../services/provider/provider-link-service.js'
import { SPOTIFY_PROVIDER_NAME } from '../services/provider/spotify-provider-service.js'

function indexProviderLinks(providerLinks) {
  return providerLinks.reduce((accumulator, providerLink) => {
    if (!providerLink?.providerName) {
      return accumulator
    }

    return {
      ...accumulator,
      [providerLink.providerName]: providerLink,
    }
  }, {})
}

export const optionalProviderLink = asyncHandler(async (req, res, next) => {
  if (!req.localUserId) {
    req.providerLinkList = []
    req.providerLinks = {}
    req.spotifyProviderLink = null
    req.isSpotifyEnhanced = false
    return next()
  }

  const providerLinks = listProviderLinks(req.localUserId)
  const refreshedProviderLinks = []

  for (const providerLink of providerLinks) {
    if (!providerLink) {
      continue
    }

    if (providerLink.providerName !== SPOTIFY_PROVIDER_NAME) {
      refreshedProviderLinks.push(providerLink)
      continue
    }

    try {
      const activeProviderLink = await refreshProviderToken(providerLink)
      refreshedProviderLinks.push(activeProviderLink || providerLink)
    } catch (error) {
      refreshedProviderLinks.push({
        ...providerLink,
        metadata: {
          ...(providerLink.metadata || {}),
          refreshError: error.message || 'provider_refresh_failed',
        },
      })
    }
  }

  const providerLinkMap = indexProviderLinks(refreshedProviderLinks)

  req.providerLinkList = refreshedProviderLinks
  req.providerLinks = providerLinkMap
  req.spotifyProviderLink = providerLinkMap[SPOTIFY_PROVIDER_NAME] || null
  req.isSpotifyEnhanced = Boolean(req.spotifyProviderLink?.accessToken)

  next()
})

export default optionalProviderLink
