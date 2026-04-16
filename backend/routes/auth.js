import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = Router();

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
].join(' ');

// In-memory store for pending OAuth states (CSRF protection)
const pendingStates = new Set();

function generateRandomString(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

// GET /api/auth/login
router.get('/login', (req, res) => {
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
  const state = generateRandomString(16);
  pendingStates.add(state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// GET /api/auth/callback
router.get('/callback', async (req, res) => {
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
  const FRONTEND_URI = process.env.FRONTEND_URI || 'http://localhost:5173';
  const { code, state, error } = req.query;

  if (error || !code) {
    return res.redirect(
      `${FRONTEND_URI}?error=${encodeURIComponent(error || 'access_denied')}`
    );
  }

  if (!state || !pendingStates.has(state)) {
    return res.redirect(`${FRONTEND_URI}?error=state_mismatch`);
  }
  pendingStates.delete(state);

  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    });

    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      body.toString(),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const params = new URLSearchParams({ access_token, refresh_token, expires_in });
    res.redirect(`${FRONTEND_URI}?${params.toString()}`);
  } catch (err) {
    const message = err.response?.data?.error || err.message || 'token_exchange_failed';
    res.redirect(`${FRONTEND_URI}?error=${encodeURIComponent(message)}`);
  }
});

// GET /api/auth/refresh_token
router.get('/refresh_token', async (req, res) => {
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  const { refresh_token } = req.query;

  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }

  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    });

    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      body.toString(),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, expires_in } = response.data;
    res.json({ access_token, expires_in });
  } catch (err) {
    const message = err.response?.data?.error || err.message || 'refresh_failed';
    res.status(400).json({ error: message });
  }
});

export default router;
