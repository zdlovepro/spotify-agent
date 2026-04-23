import { buildUserTasteProfile } from './memory-service.js'
import {
  buildConversationTitle,
  classifyIntent,
} from './intent-classifier.js'
import { createAgentToolRegistry } from './tool-registry.js'

const genreKeywordMap = [
  { seed: 'cantopop', keywords: ['粤语', '港乐', 'cantopop'] },
  { seed: 'pop', keywords: ['流行', 'pop'] },
  { seed: 'rock', keywords: ['摇滚', 'rock'] },
  { seed: 'hip-hop', keywords: ['说唱', '嘻哈', 'hip hop', 'hip-hop'] },
  { seed: 'electronic', keywords: ['电子', 'electronic'] },
  { seed: 'edm', keywords: ['edm'] },
  { seed: 'chill', keywords: ['放松', 'chill', '轻松'] },
  { seed: 'study', keywords: ['学习', '专注', 'study', 'focus'] },
  { seed: 'sleep', keywords: ['睡前', 'sleep'] },
  { seed: 'sad', keywords: ['伤感', '失恋', 'sad', 'emo'] },
  { seed: 'happy', keywords: ['开心', '快乐', 'happy'] },
  { seed: 'jazz', keywords: ['爵士', 'jazz'] },
  { seed: 'classical', keywords: ['古典', 'classical'] },
  { seed: 'k-pop', keywords: ['韩流', '韩文', 'k-pop', 'kpop'] },
  { seed: 'j-pop', keywords: ['日语', 'j-pop', 'jpop'] },
  { seed: 'ambient', keywords: ['氛围', 'ambient'] },
  { seed: 'party', keywords: ['派对', 'party'] },
  { seed: 'work-out', keywords: ['运动', '健身', 'workout', 'work-out'] },
]

function normalizeMessage(message) {
  return String(message || '').trim()
}

function unique(items) {
  return [...new Set(items.filter(Boolean))]
}

function mapTrackArtifact(track) {
  return {
    id: track.id,
    name: track.name,
    artists: (track.artists || []).map((artist) => artist.name),
    album: track.album?.name || '',
    image: track.album?.images?.[0]?.url || '',
    previewUrl: track.preview_url || '',
    durationMs: track.duration_ms || 0,
    uri: track.uri || '',
  }
}

function mapArtistArtifact(artist) {
  return {
    id: artist.id,
    name: artist.name,
    genres: artist.genres || [],
    followers: artist.followers?.total || 0,
    popularity: artist.popularity || 0,
    image: artist.images?.[0]?.url || '',
  }
}

function mapAlbumArtifact(album) {
  return {
    id: album.id,
    name: album.name,
    artists: (album.artists || []).map((artist) => artist.name),
    releaseDate: album.release_date || '',
    totalTracks: album.total_tracks || 0,
    image: album.images?.[0]?.url || '',
  }
}

function buildPlayerQueue(tracks) {
  return tracks
    .filter((track) => track.preview_url)
    .map((track) => ({
      id: track.id,
      name: track.name,
      artists: (track.artists || []).map((artist) => artist.name),
      album: track.album?.name || '',
      image: track.album?.images?.[0]?.url || '',
      previewUrl: track.preview_url || '',
      durationMs: track.duration_ms || 0,
      uri: track.uri || '',
    }))
}

function stripPrefixes(message, prefixes) {
  let output = normalizeMessage(message)

  for (const prefix of prefixes) {
    output = output.replace(prefix, '')
  }

  return output.trim()
}

function extractEntityQuery(message) {
  const cleaned = stripPrefixes(message, [
    /请/g,
    /帮我/g,
    /介绍一下/g,
    /介绍/g,
    /查一下/g,
    /查查/g,
    /搜索/g,
    /看看/g,
    /告诉我/g,
    /这个/g,
  ])

  return cleaned || normalizeMessage(message)
}

function extractPlaybackQuery(message) {
  const cleaned = stripPrefixes(message, [
    /请/g,
    /帮我/g,
    /给我/g,
    /播放/g,
    /放一下/g,
    /放一首/g,
    /来一首/g,
    /听一下/g,
    /播一下/g,
    /play/gi,
  ])

  return cleaned || normalizeMessage(message)
}

function detectGenreSeeds(message) {
  const normalized = normalizeMessage(message).toLowerCase()

  return unique(
    genreKeywordMap
      .filter((entry) =>
        entry.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
      )
      .map((entry) => entry.seed),
  )
}

function limitSeeds(items, maxCount) {
  return unique(items).slice(0, Math.max(0, maxCount))
}

function allocateRecommendationSeeds({
  explicitGenres,
  searchArtistIds,
  searchTrackIds,
  memoryArtistIds,
  memoryTrackIds,
}) {
  const genrePool = limitSeeds(explicitGenres, 2)
  const artistPool = unique([...searchArtistIds, ...memoryArtistIds])
  const trackPool = unique([...searchTrackIds, ...memoryTrackIds])

  let seedGenres = [...genrePool]

  if (!seedGenres.length && !artistPool.length && !trackPool.length) {
    seedGenres = ['pop']
  }

  let remaining = 5 - seedGenres.length
  const seedArtists = limitSeeds(artistPool, Math.min(2, remaining))
  remaining -= seedArtists.length

  const seedTracks = limitSeeds(trackPool, Math.min(3, remaining))

  return {
    seedGenres,
    seedArtists,
    seedTracks,
  }
}

async function handleControlPlayer(intentResult) {
  const actionMap = {
    next: {
      type: 'player.next',
      reply: '好的，我已经准备切到下一首。',
    },
    previous: {
      type: 'player.previous',
      reply: '好的，我已经准备回到上一首。',
    },
    pause: {
      type: 'player.pause',
      reply: '好的，我已经准备暂停播放。',
    },
    resume: {
      type: 'player.resume',
      reply: '好的，我已经准备继续播放。',
    },
  }

  const selected = actionMap[intentResult.controlAction] || actionMap.resume

  return {
    reply: selected.reply,
    intent: 'control_player',
    actions: [{ type: selected.type, payload: {} }],
    artifacts: {},
  }
}

async function handleSearchEntity({ message, context, tools }) {
  const normalized = normalizeMessage(message)

  if (
    /当前这首|当前歌曲|this song|current song/i.test(normalized) &&
    context.currentTrackId
  ) {
    const track = await tools.run('spotify.get_track', {
      trackId: context.currentTrackId,
    })

    return {
      reply: `当前这首歌是《${track.name}》，来自 ${
        track.album?.name || '未知专辑'
      }，演唱者是 ${(track.artists || [])
        .map((artist) => artist.name)
        .join('、')}。`,
      intent: 'search_entity',
      actions: [],
      artifacts: {
        entityType: 'track',
        track: mapTrackArtifact(track),
      },
    }
  }

  const query = extractEntityQuery(message)
  const searchResult = await tools.run('spotify.search', {
    q: query,
    type: 'artist,track,album',
    limit: 5,
  })

  const wantsArtist = /歌手|artist|谁唱/i.test(normalized)
  const wantsAlbum = /专辑|album/i.test(normalized)
  const wantsTrack = /歌曲|这首歌|track|song/i.test(normalized)

  if (wantsArtist && searchResult.artists?.items?.[0]) {
    const artist = await tools.run('spotify.get_artist', {
      artistId: searchResult.artists.items[0].id,
    })
    const topTracks = await tools.run('spotify.get_artist_top_tracks', {
      artistId: artist.id,
    })

    return {
      reply: `${artist.name} 的主要风格是 ${
        (artist.genres || []).slice(0, 3).join('、') || '未标注'
      }，Spotify 热度为 ${artist.popularity || 0}。我也顺手找到了他/她的热门歌曲。`,
      intent: 'search_entity',
      actions: [],
      artifacts: {
        entityType: 'artist',
        artist: mapArtistArtifact(artist),
        topTracks: (topTracks.tracks || []).map(mapTrackArtifact),
      },
    }
  }

  if (wantsAlbum && searchResult.albums?.items?.[0]) {
    const album = await tools.run('spotify.get_album', {
      albumId: searchResult.albums.items[0].id,
    })

    return {
      reply: `我找到了专辑《${album.name}》，发行时间是 ${
        album.release_date || '未知'
      }，共 ${album.total_tracks || 0} 首歌。`,
      intent: 'search_entity',
      actions: [],
      artifacts: {
        entityType: 'album',
        album: mapAlbumArtifact(album),
      },
    }
  }

  if ((wantsTrack || !wantsArtist) && searchResult.tracks?.items?.[0]) {
    const track = await tools.run('spotify.get_track', {
      trackId: searchResult.tracks.items[0].id,
    })

    return {
      reply: `我找到《${track.name}》了，演唱者是 ${(track.artists || [])
        .map((artist) => artist.name)
        .join('、')}，所属专辑是 ${
        track.album?.name || '未知专辑'
      }。`,
      intent: 'search_entity',
      actions: [],
      artifacts: {
        entityType: 'track',
        track: mapTrackArtifact(track),
      },
    }
  }

  if (searchResult.artists?.items?.[0]) {
    const artist = await tools.run('spotify.get_artist', {
      artistId: searchResult.artists.items[0].id,
    })

    return {
      reply: `我优先找到了艺人 ${artist.name}，风格偏 ${
        (artist.genres || []).slice(0, 3).join('、') || '未标注'
      }。`,
      intent: 'search_entity',
      actions: [],
      artifacts: {
        entityType: 'artist',
        artist: mapArtistArtifact(artist),
      },
    }
  }

  return {
    reply:
      '我暂时没有找到足够匹配的歌曲、歌手或专辑信息，你可以换一个更具体的关键词。',
    intent: 'search_entity',
    actions: [],
    artifacts: {},
  }
}

async function handlePlayMusic({ message, tools }) {
  const normalized = normalizeMessage(message)
  const query = extractPlaybackQuery(message)
  const wantsPlaylist = /歌单|playlist/i.test(normalized)
  const wantsArtist = /歌手|artist/i.test(normalized)

  const searchResult = await tools.run('spotify.search', {
    q: query,
    type: 'track,playlist,artist',
    limit: 5,
  })

  if (wantsPlaylist && searchResult.playlists?.items?.[0]) {
    const playlist = await tools.run('spotify.get_playlist', {
      playlistId: searchResult.playlists.items[0].id,
    })
    const playlistTracks = (playlist.tracks?.items || [])
      .map((item) => item.track)
      .filter(Boolean)
    const queue = buildPlayerQueue(playlistTracks)

    return {
      reply: queue.length
        ? `我找到了歌单《${playlist.name}》，已经把其中可试听的歌曲整理成播放队列。`
        : `我找到了歌单《${playlist.name}》，但里面暂时没有可用的预览音频。`,
      intent: 'play_music',
      actions: queue.length
        ? [
            {
              type: 'player.replace_queue',
              payload: {
                tracks: queue,
                startIndex: 0,
              },
            },
          ]
        : [],
      artifacts: {
        resultType: 'playlist',
        playlist: {
          id: playlist.id,
          name: playlist.name,
          image: playlist.images?.[0]?.url || '',
          owner: playlist.owner?.display_name || '',
        },
        tracks: queue,
      },
    }
  }

  if (wantsArtist && searchResult.artists?.items?.[0]) {
    const artist = searchResult.artists.items[0]
    const topTracks = await tools.run('spotify.get_artist_top_tracks', {
      artistId: artist.id,
    })
    const queue = buildPlayerQueue(topTracks.tracks || [])

    return {
      reply: queue.length
        ? `我找到 ${artist.name} 了，已经把可试听的热门歌曲整理成播放队列。`
        : `我找到 ${artist.name} 了，但他/她的热门歌曲里没有可用的预览音频。`,
      intent: 'play_music',
      actions: queue.length
        ? [
            {
              type: 'player.replace_queue',
              payload: {
                tracks: queue,
                startIndex: 0,
              },
            },
          ]
        : [],
      artifacts: {
        resultType: 'artist',
        artist: mapArtistArtifact(artist),
        tracks: queue,
      },
    }
  }

  if (searchResult.tracks?.items?.[0]) {
    const track =
      searchResult.tracks.items.find((item) => item.preview_url) ||
      searchResult.tracks.items[0]

    if (!track.preview_url) {
      return {
        reply: `我找到了《${track.name}》，但 Spotify 没有提供预览音频，所以这首歌现在还不能在网页里直接试听。`,
        intent: 'play_music',
        actions: [],
        artifacts: {
          resultType: 'track',
          track: mapTrackArtifact(track),
        },
      }
    }

    return {
      reply: `我找到《${track.name}》了，已经准备好播放它的预览。`,
      intent: 'play_music',
      actions: [
        {
          type: 'player.replace_queue',
          payload: {
            tracks: buildPlayerQueue([track]),
            startIndex: 0,
          },
        },
      ],
      artifacts: {
        resultType: 'track',
        track: mapTrackArtifact(track),
      },
    }
  }

  if (searchResult.playlists?.items?.[0]) {
    const playlist = await tools.run('spotify.get_playlist', {
      playlistId: searchResult.playlists.items[0].id,
    })
    const playlistTracks = (playlist.tracks?.items || [])
      .map((item) => item.track)
      .filter(Boolean)
    const queue = buildPlayerQueue(playlistTracks)

    return {
      reply: queue.length
        ? `我找到了歌单《${playlist.name}》，已经把其中可试听的歌曲整理成播放队列。`
        : `我找到了歌单《${playlist.name}》，但里面暂时没有可用的预览音频。`,
      intent: 'play_music',
      actions: queue.length
        ? [
            {
              type: 'player.replace_queue',
              payload: {
                tracks: queue,
                startIndex: 0,
              },
            },
          ]
        : [],
      artifacts: {
        resultType: 'playlist',
        playlist: {
          id: playlist.id,
          name: playlist.name,
          image: playlist.images?.[0]?.url || '',
          owner: playlist.owner?.display_name || '',
        },
        tracks: queue,
      },
    }
  }

  return {
    reply: `我没有找到和“${query}”足够匹配的可播放结果，你可以换一个更具体的歌名、歌手或歌单名。`,
    intent: 'play_music',
    actions: [],
    artifacts: {},
  }
}

async function handleRecommendation({
  message,
  memoryProfile,
  tools,
}) {
  const explicitGenres = detectGenreSeeds(message)
  const searchQuery = extractEntityQuery(message)
  const searchResult = await tools.run('spotify.search', {
    q: searchQuery,
    type: 'artist,track',
    limit: 5,
  })

  const searchArtistIds = limitSeeds(
    (searchResult.artists?.items || []).map((artist) => artist.id),
    2,
  )
  const searchTrackIds = limitSeeds(
    (searchResult.tracks?.items || []).map((track) => track.id),
    3,
  )

  const memoryArtistIds = limitSeeds(
    memoryProfile.topArtists.map((artist) => artist.id),
    2,
  )
  const memoryTrackIds = limitSeeds(
    memoryProfile.topTracks.map((track) => track.id),
    3,
  )

  const { seedGenres, seedArtists, seedTracks } = allocateRecommendationSeeds({
    explicitGenres,
    searchArtistIds,
    searchTrackIds,
    memoryArtistIds,
    memoryTrackIds,
  })

  const recommendations = await tools.run('spotify.get_recommendations', {
    seed_artists: seedArtists.join(','),
    seed_tracks: seedTracks.join(','),
    seed_genres: seedGenres.join(','),
    limit: 12,
  })

  const tracks = (recommendations.tracks || []).map(mapTrackArtifact)
  const playableTracks = tracks.filter((track) => track.previewUrl)

  const historyEntry = await tools.run('history.save_recommendation', {
    title: buildConversationTitle(message),
    prompt: message,
    description: 'Agent-generated recommendation set',
    seeds: {
      artists: seedArtists,
      tracks: seedTracks,
      genres: seedGenres,
    },
    tracks,
  })

  const genreText = seedGenres.length ? `，并结合 ${seedGenres.join('、')} 这种风格` : ''

  return {
    reply: playableTracks.length
      ? `我根据你的近期偏好${genreText}，整理出一组新的推荐，并且已经准备成可播放队列。`
      : '我整理出了一组推荐结果，但这些歌曲里没有足够的预览音频，所以这次先把结果保存到历史推荐里了。',
    intent: 'generate_recommendation',
    actions: playableTracks.length
      ? [
          {
            type: 'player.replace_queue',
            payload: {
              tracks: playableTracks,
              startIndex: 0,
            },
          },
        ]
      : [],
    artifacts: {
      recommendationId: historyEntry.id,
      recommendationTitle: historyEntry.title,
      tracks,
      seeds: historyEntry.seeds,
      memoryProfile,
    },
  }
}

export async function runAgent({
  accessToken,
  userId,
  message,
  context = {},
}) {
  const toolCalls = []
  const intentResult = classifyIntent(message)
  const tools = createAgentToolRegistry({
    accessToken,
    userId,
    toolCalls,
  })

  const memoryProfile =
    intentResult.intent === 'control_player'
      ? {
          topTracks: [],
          topArtists: [],
          recentRecommendations: [],
          recentFeedback: [],
        }
      : await buildUserTasteProfile({
          accessToken,
          userId,
        })

  let result

  switch (intentResult.intent) {
    case 'control_player':
      result = await handleControlPlayer(intentResult)
      break
    case 'search_entity':
      result = await handleSearchEntity({
        message,
        context,
        tools,
      })
      break
    case 'play_music':
      result = await handlePlayMusic({
        message,
        tools,
      })
      break
    case 'generate_recommendation':
    default:
      result = await handleRecommendation({
        message,
        memoryProfile,
        tools,
      })
      break
  }

  return {
    ...result,
    confidence: intentResult.confidence,
    toolCalls,
    memoryProfile,
    conversationTitle: buildConversationTitle(message),
  }
}
