# Backend API

## Run

```powershell
cd D:\205zd\Desktop\Music\backend
npm install
npm run dev
```

Default local backend origin:

```text
http://127.0.0.1:8080
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

- `GET /api/auth/spotify/callback`
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

Recommended local dev settings:

- Backend origin: `http://127.0.0.1:8080`
- Frontend origin: `http://127.0.0.1:5173`
- Spotify Redirect URI: `http://127.0.0.1:8080/api/auth/spotify/callback`

## Spotify API Proxy

All routes below require:

```text
Authorization: Bearer <spotify_access_token>
```

### User

- `GET /api/spotify/me`
- `GET /api/spotify/home?limit=8`
- `GET /api/spotify/library/overview?limit=10`
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

## Recommendation History

All history routes also require:

```text
Authorization: Bearer <spotify_access_token>
```

The backend derives the current Spotify user from the token and stores a per-user local history file.

- `GET /api/history/recommendations?limit=20`
- `POST /api/history/recommendations`
- `DELETE /api/history/recommendations/:entryId`

Example POST body:

```json
{
  "title": "Late Night Discovery",
  "prompt": "给我来点适合深夜学习的电子乐",
  "description": "Warm electronic recommendations for focus",
  "seeds": {
    "genres": ["electronic", "ambient"]
  },
  "tracks": [
    {
      "id": "123",
      "name": "Example Track",
      "artists": ["Example Artist"],
      "album": "Example Album",
      "image": "https://...",
      "previewUrl": "https://..."
    }
  ]
}
```

## Agent API

All agent routes also require:

```text
Authorization: Bearer <spotify_access_token>
```

The current implementation is a rule-based agent scaffold. It can classify intents, call Spotify tools, build recommendation history, and return structured player actions.

- `GET /api/agent/feedback?limit=20`
- `POST /api/agent/feedback`
- `GET /api/agent/conversations?limit=20`
- `POST /api/agent/conversations`
- `GET /api/agent/conversations/:conversationId`
- `POST /api/agent/chat`

Example `POST /api/agent/feedback` body:

```json
{
  "conversationId": "conversation-id",
  "recommendationId": "recommendation-id",
  "feedback": "like",
  "note": "更喜欢轻一点的人声和氛围感",
  "metadata": {
    "source": "ui-thumb-up"
  }
}
```

Example `POST /api/agent/chat` body:

```json
{
  "conversationId": "optional-conversation-id",
  "message": "给我推荐一点适合晚上学习的音乐",
  "context": {
    "currentTrackId": "optional-current-track-id",
    "playerState": "playing"
  }
}
```

Example response shape:

```json
{
  "conversation": {
    "id": "conversation-id",
    "title": "给我推荐一点适合晚上学习的音乐",
    "messages": []
  },
  "assistant": {
    "reply": "我根据你的近期偏好，整理出一组新的推荐，并且已经准备成可播放队列。",
    "intent": "generate_recommendation",
    "confidence": 0.86,
    "actions": [
      {
        "type": "player.replace_queue",
        "payload": {
          "tracks": []
        }
      }
    ],
    "artifacts": {},
    "toolCalls": [],
    "memoryProfile": {
      "topTracks": [],
      "topArtists": [],
      "recentRecommendations": [],
      "recentFeedback": []
    }
  }
}
```

Supported intents in the current scaffold:

- `generate_recommendation`
- `play_music`
- `search_entity`
- `control_player`

Notes:

- Spotify recommendations allow at most 5 combined seeds across `seed_tracks`, `seed_artists`, and `seed_genres`.
- Query validation errors and Spotify API errors are normalized into JSON `{ "error": "..." }`.
- A lightweight in-memory cache is enabled for Spotify GET requests to reduce repeated calls and help with rate-limit pressure.
