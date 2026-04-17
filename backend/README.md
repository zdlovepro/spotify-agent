# Backend API

## Run

```powershell
cd D:\205zd\Desktop\Music\backend
npm install
npm run dev
```

Health check:

```text
GET /api/test
```

## Environment

Required values:

- `PORT`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `FRONTEND_URI`

## Auth Flow

- `GET /api/auth/login`
  Redirects the browser to Spotify authorization.

- `GET /api/auth/callback`
  Exchanges the Spotify authorization code for access and refresh tokens, then redirects back to the frontend.

- `GET /api/auth/refresh_token?refresh_token=...`
  Refreshes the Spotify access token.

Current Spotify scopes:

- `user-read-private`
- `user-read-email`
- `playlist-read-private`
- `playlist-read-collaborative`
- `user-library-read`
- `user-top-read`

## Spotify API Proxy

All routes below require:

```text
Authorization: Bearer <spotify_access_token>
```

### User

- `GET /api/spotify/me`
- `GET /api/spotify/me/top/tracks?time_range=medium_term&limit=10&offset=0`
- `GET /api/spotify/me/top/artists?time_range=medium_term&limit=10&offset=0`
- `GET /api/spotify/me/tracks?limit=20&offset=0&market=from_token`
- `GET /api/spotify/me/albums?limit=20&offset=0&market=from_token`
- `GET /api/spotify/playlists?limit=20&offset=0`
- `GET /api/spotify/playlists/:playlistId?market=from_token`

### Discovery

- `GET /api/spotify/search?q=radiohead&type=track,artist,album,playlist&limit=10&offset=0`
- `GET /api/spotify/browse/featured-playlists?limit=20&offset=0`
- `GET /api/spotify/browse/categories?limit=20&offset=0`
- `GET /api/spotify/browse/new-releases?limit=20&offset=0`

### Metadata

- `GET /api/spotify/tracks/:trackId?market=from_token`
- `GET /api/spotify/albums/:albumId?market=from_token`
- `GET /api/spotify/artists/:artistId`
- `GET /api/spotify/artists/:artistId/top-tracks?market=from_token`

### Recommendations

- `GET /api/spotify/recommendations/genres`
- `GET /api/spotify/recommendations?seed_tracks=id1,id2&limit=20`
- `GET /api/spotify/recommendations?seed_artists=id1&seed_genres=pop&limit=20`

Notes:

- Spotify recommendations allow at most 5 combined seeds across `seed_tracks`, `seed_artists`, and `seed_genres`.
- Query validation errors and Spotify API errors are normalized into JSON `{ "error": "..." }`.
