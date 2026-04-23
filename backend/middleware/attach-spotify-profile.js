import { asyncHandler } from './async-handler.js'
import { getCurrentUserProfile } from '../services/spotify-api.js'

export const attachSpotifyProfile = asyncHandler(async (req, res, next) => {
  const profile = await getCurrentUserProfile(req.accessToken)

  req.spotifyProfile = profile
  req.spotifyUserId = profile.id
  next()
})
