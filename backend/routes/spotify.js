import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { requireSpotifyAccessToken } from '../middleware/require-spotify-access-token.js'
import {
  getCategories,
  getAlbum,
  getArtist,
  getArtistTopTracks,
  getAvailableGenreSeeds,
  getCurrentUserProfile,
  getFeaturedPlaylists,
  getNewReleases,
  getPlaylist,
  getRecommendations,
  getTrack,
  getUserPlaylists,
  getUserSavedAlbums,
  getUserSavedTracks,
  getUserTopItems,
  parseCsv,
  parseInteger,
  searchSpotify,
} from '../services/spotify-api.js'

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

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const data = await getCurrentUserProfile(req.accessToken)
    res.json(data)
  }),
)

router.get(
  '/me/top/:type',
  asyncHandler(async (req, res) => {
    const { type } = req.params
    assert(
      ['artists', 'tracks'].includes(type),
      'type must be either artists or tracks',
    )

    const timeRange = req.query.time_range || 'medium_term'
    assert(
      ['short_term', 'medium_term', 'long_term'].includes(timeRange),
      'time_range must be short_term, medium_term, or long_term',
    )

    const data = await getUserTopItems(req.accessToken, type, {
      time_range: timeRange,
      limit: parseInteger(req.query.limit, 10),
      offset: parseInteger(req.query.offset, 0, { min: 0, max: 1000 }),
    })

    res.json(data)
  }),
)

router.get(
  '/playlists',
  asyncHandler(async (req, res) => {
    const data = await getUserPlaylists(req.accessToken, {
      limit: parseInteger(req.query.limit, 20),
      offset: parseInteger(req.query.offset, 0, { min: 0, max: 1000 }),
    })

    res.json(data)
  }),
)

router.get(
  '/me/tracks',
  asyncHandler(async (req, res) => {
    const data = await getUserSavedTracks(req.accessToken, {
      limit: parseInteger(req.query.limit, 20),
      offset: parseInteger(req.query.offset, 0, { min: 0, max: 1000 }),
      market: req.query.market || 'from_token',
    })

    res.json(data)
  }),
)

router.get(
  '/me/albums',
  asyncHandler(async (req, res) => {
    const data = await getUserSavedAlbums(req.accessToken, {
      limit: parseInteger(req.query.limit, 20),
      offset: parseInteger(req.query.offset, 0, { min: 0, max: 1000 }),
      market: req.query.market || 'from_token',
    })

    res.json(data)
  }),
)

router.get(
  '/playlists/:playlistId',
  asyncHandler(async (req, res) => {
    const data = await getPlaylist(req.accessToken, req.params.playlistId, {
      market: req.query.market || 'from_token',
    })

    res.json(data)
  }),
)

router.get(
  '/browse/featured-playlists',
  asyncHandler(async (req, res) => {
    const data = await getFeaturedPlaylists(req.accessToken, {
      country: req.query.country || undefined,
      locale: req.query.locale || undefined,
      timestamp: req.query.timestamp || undefined,
      limit: parseInteger(req.query.limit, 20),
      offset: parseInteger(req.query.offset, 0, { min: 0, max: 1000 }),
    })

    res.json(data)
  }),
)

router.get(
  '/browse/categories',
  asyncHandler(async (req, res) => {
    const data = await getCategories(req.accessToken, {
      country: req.query.country || undefined,
      locale: req.query.locale || undefined,
      limit: parseInteger(req.query.limit, 20),
      offset: parseInteger(req.query.offset, 0, { min: 0, max: 1000 }),
    })

    res.json(data)
  }),
)

router.get(
  '/browse/new-releases',
  asyncHandler(async (req, res) => {
    const data = await getNewReleases(req.accessToken, {
      country: req.query.country || undefined,
      limit: parseInteger(req.query.limit, 20),
      offset: parseInteger(req.query.offset, 0, { min: 0, max: 1000 }),
    })

    res.json(data)
  }),
)

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    assert(req.query.q, 'q is required')

    const data = await searchSpotify(req.accessToken, {
      q: req.query.q,
      type: req.query.type || 'track,artist,playlist,album',
      limit: parseInteger(req.query.limit, 10),
      offset: parseInteger(req.query.offset, 0, { min: 0, max: 1000 }),
      market: req.query.market || 'from_token',
      include_external: req.query.include_external || undefined,
    })

    res.json(data)
  }),
)

router.get(
  '/tracks/:trackId',
  asyncHandler(async (req, res) => {
    const data = await getTrack(req.accessToken, req.params.trackId, {
      market: req.query.market || 'from_token',
    })

    res.json(data)
  }),
)

router.get(
  '/albums/:albumId',
  asyncHandler(async (req, res) => {
    const data = await getAlbum(req.accessToken, req.params.albumId, {
      market: req.query.market || 'from_token',
    })

    res.json(data)
  }),
)

router.get(
  '/artists/:artistId',
  asyncHandler(async (req, res) => {
    const data = await getArtist(req.accessToken, req.params.artistId)
    res.json(data)
  }),
)

router.get(
  '/artists/:artistId/top-tracks',
  asyncHandler(async (req, res) => {
    const data = await getArtistTopTracks(
      req.accessToken,
      req.params.artistId,
      {
        market: req.query.market || 'from_token',
      },
    )

    res.json(data)
  }),
)

router.get(
  '/recommendations/genres',
  asyncHandler(async (req, res) => {
    const data = await getAvailableGenreSeeds(req.accessToken)
    res.json(data)
  }),
)

router.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const seedArtists = parseCsv(req.query.seed_artists)
    const seedTracks = parseCsv(req.query.seed_tracks)
    const seedGenres = parseCsv(req.query.seed_genres)
    const totalSeedCount =
      seedArtists.length + seedTracks.length + seedGenres.length

    assert(
      totalSeedCount > 0,
      'At least one seed is required: seed_artists, seed_tracks, or seed_genres',
    )
    assert(
      totalSeedCount <= 5,
      'Spotify recommendations support at most 5 combined seeds',
    )

    const data = await getRecommendations(req.accessToken, {
      seed_artists: seedArtists.join(','),
      seed_tracks: seedTracks.join(','),
      seed_genres: seedGenres.join(','),
      limit: parseInteger(req.query.limit, 20),
      market: req.query.market || 'from_token',
    })

    res.json(data)
  }),
)

export default router
