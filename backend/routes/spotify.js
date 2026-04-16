import { Router } from 'express';
import axios from 'axios';

const router = Router();

function getAccessToken(req) {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim();
}

async function spotifyGet(path, accessToken, params = {}) {
  const response = await axios.get(`https://api.spotify.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params,
  });

  return response.data;
}

router.use((req, res, next) => {
  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Missing Spotify access token' });
  }

  req.accessToken = accessToken;
  next();
});

router.get('/me', async (req, res) => {
  try {
    const data = await spotifyGet('/me', req.accessToken);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 400;
    const message =
      err.response?.data?.error?.message ||
      err.response?.data?.error ||
      err.message ||
      'spotify_profile_failed';

    res.status(status).json({ error: message });
  }
});

router.get('/playlists', async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;

  try {
    const data = await spotifyGet('/me/playlists', req.accessToken, {
      limit,
      offset,
    });

    res.json(data);
  } catch (err) {
    const status = err.response?.status || 400;
    const message =
      err.response?.data?.error?.message ||
      err.response?.data?.error ||
      err.message ||
      'spotify_playlists_failed';

    res.status(status).json({ error: message });
  }
});

router.get('/playlists/:playlistId', async (req, res) => {
  const { playlistId } = req.params;
  const { market = 'from_token' } = req.query;

  try {
    const data = await spotifyGet(`/playlists/${playlistId}`, req.accessToken, {
      market,
    });

    res.json(data);
  } catch (err) {
    const status = err.response?.status || 400;
    const message =
      err.response?.data?.error?.message ||
      err.response?.data?.error ||
      err.message ||
      'spotify_playlist_failed';

    res.status(status).json({ error: message });
  }
});

export default router;
