import { Router } from 'express'
import { asyncHandler } from '../middleware/async-handler.js'
import { requireSpotifyAccessToken } from '../middleware/require-spotify-access-token.js'
import { assert } from '../utils/assert.js'
import {
  getAvailableDevices,
  getCategories,
  getAlbum,
  getArtist,
  getArtistTopTracks,
  getAvailableGenreSeeds,
  getCurrentPlaybackState,
  getCurrentUserProfile,
  getFeaturedPlaylists,
  getNewReleases,
  pausePlayback,
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
  skipToNextPlayback,
  skipToPreviousPlayback,
  startOrResumePlayback,
  transferPlayback,
} from '../services/spotify-api.js'

const router = Router()

router.use(requireSpotifyAccessToken)

function normalizeDeviceId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

async function selectPlaybackDevice(accessToken, preferredDeviceId = '') {
  const deviceData = await getAvailableDevices(accessToken)
  const devices = Array.isArray(deviceData?.devices)
    ? deviceData.devices.filter((device) => !device?.is_restricted)
    : []

  if (!devices.length) {
    return {
      device: null,
      devices,
    }
  }

  const preferred = preferredDeviceId
    ? devices.find((device) => device.id === preferredDeviceId)
    : null
  const active = devices.find((device) => device.is_active)
  const fallback = preferred || active || devices[0]

  return {
    device: fallback || null,
    devices,
  }
}

router.get(
  '/home',
  asyncHandler(async (req, res) => {
    const limit = parseInteger(req.query.limit, 8, { min: 1, max: 20 })

    const [
      profile,
      topTracks,
      topArtists,
      userPlaylists,
      featuredPlaylists,
      newReleases,
    ] = await Promise.all([
      getCurrentUserProfile(req.accessToken),
      getUserTopItems(req.accessToken, 'tracks', {
        time_range: 'medium_term',
        limit,
        offset: 0,
      }),
      getUserTopItems(req.accessToken, 'artists', {
        time_range: 'medium_term',
        limit,
        offset: 0,
      }),
      getUserPlaylists(req.accessToken, {
        limit,
        offset: 0,
      }),
      getFeaturedPlaylists(req.accessToken, {
        limit,
        offset: 0,
      }),
      getNewReleases(req.accessToken, {
        limit,
        offset: 0,
      }),
    ])

    res.json({
      profile,
      topTracks: topTracks.items || [],
      topArtists: topArtists.items || [],
      playlists: userPlaylists.items || [],
      featuredPlaylists: featuredPlaylists.playlists?.items || [],
      newReleases: newReleases.albums?.items || [],
    })
  }),
)

router.get(
  '/library/overview',
  asyncHandler(async (req, res) => {
    const limit = parseInteger(req.query.limit, 10, { min: 1, max: 20 })

    const [playlists, savedTracks, savedAlbums, topArtists] = await Promise.all([
      getUserPlaylists(req.accessToken, {
        limit,
        offset: 0,
      }),
      getUserSavedTracks(req.accessToken, {
        limit,
        offset: 0,
        market: req.query.market || 'from_token',
      }),
      getUserSavedAlbums(req.accessToken, {
        limit,
        offset: 0,
        market: req.query.market || 'from_token',
      }),
      getUserTopItems(req.accessToken, 'artists', {
        time_range: 'medium_term',
        limit,
        offset: 0,
      }),
    ])

    res.json({
      playlists: playlists.items || [],
      savedTracks: savedTracks.items || [],
      savedAlbums: savedAlbums.items || [],
      topArtists: topArtists.items || [],
    })
  }),
)

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

router.get(
  '/player/devices',
  asyncHandler(async (req, res) => {
    const data = await getAvailableDevices(req.accessToken)
    res.json(data)
  }),
)

router.get(
  '/player/state',
  asyncHandler(async (req, res) => {
    const data = await getCurrentPlaybackState(req.accessToken)
    res.json(data || {})
  }),
)

router.put(
  '/player/transfer',
  asyncHandler(async (req, res) => {
    const preferredDeviceId = normalizeDeviceId(req.body?.deviceId)
    const { device } = await selectPlaybackDevice(req.accessToken, preferredDeviceId)

    assert(
      device?.id,
      'No available Spotify playback device found. Open Spotify and try again.',
      409,
    )

    await transferPlayback(req.accessToken, {
      deviceId: device.id,
      play: req.body?.play !== false,
    })

    res.json({
      ok: true,
      device,
    })
  }),
)

router.put(
  '/player/play',
  asyncHandler(async (req, res) => {
    const preferredDeviceId = normalizeDeviceId(req.body?.deviceId)
    const { device } = await selectPlaybackDevice(req.accessToken, preferredDeviceId)

    assert(
      device?.id,
      'No available Spotify playback device found. Open Spotify and try again.',
      409,
    )

    if (!device.is_active) {
      await transferPlayback(req.accessToken, {
        deviceId: device.id,
        play: false,
      })
    }

    await startOrResumePlayback(req.accessToken, {
      deviceId: device.id,
      uris: Array.isArray(req.body?.uris) ? req.body.uris : null,
      contextUri:
        typeof req.body?.contextUri === 'string' ? req.body.contextUri.trim() : '',
      offset:
        req.body?.offset && typeof req.body.offset === 'object'
          ? req.body.offset
          : null,
      positionMs: req.body?.positionMs,
    })

    res.json({
      ok: true,
      device,
    })
  }),
)

router.put(
  '/player/pause',
  asyncHandler(async (req, res) => {
    const preferredDeviceId = normalizeDeviceId(req.body?.deviceId)
    const { device } = await selectPlaybackDevice(req.accessToken, preferredDeviceId)

    assert(
      device?.id,
      'No available Spotify playback device found. Open Spotify and try again.',
      409,
    )

    await pausePlayback(req.accessToken, {
      deviceId: device.id,
    })

    res.json({
      ok: true,
      device,
    })
  }),
)

router.post(
  '/player/next',
  asyncHandler(async (req, res) => {
    const preferredDeviceId = normalizeDeviceId(req.body?.deviceId)
    const { device } = await selectPlaybackDevice(req.accessToken, preferredDeviceId)

    assert(
      device?.id,
      'No available Spotify playback device found. Open Spotify and try again.',
      409,
    )

    await skipToNextPlayback(req.accessToken, {
      deviceId: device.id,
    })

    res.json({
      ok: true,
      device,
    })
  }),
)

router.post(
  '/player/previous',
  asyncHandler(async (req, res) => {
    const preferredDeviceId = normalizeDeviceId(req.body?.deviceId)
    const { device } = await selectPlaybackDevice(req.accessToken, preferredDeviceId)

    assert(
      device?.id,
      'No available Spotify playback device found. Open Spotify and try again.',
      409,
    )

    await skipToPreviousPlayback(req.accessToken, {
      deviceId: device.id,
    })

    res.json({
      ok: true,
      device,
    })
  }),
)

export default router
