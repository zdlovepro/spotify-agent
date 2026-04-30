import { createEmptyMemoryProfile } from './memory-service.js'
import {
  buildConversationTitle,
  classifyIntent,
} from './intent-classifier.js'
import { createTrackArtifact, createTrackArtifacts } from './track-artifact.js'
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

function getPrimaryImage(entity) {
  return (
    entity?.image ||
    entity?.image_url ||
    entity?.images?.[0]?.url ||
    entity?.album?.images?.[0]?.url ||
    ''
  )
}

function extractAlbumName(track) {
  if (typeof track?.album === 'string') {
    return track.album
  }

  return track?.album?.name || ''
}

function mapArtistArtifact(artist) {
  return {
    id: artist.id,
    source_type: artist.source_type || artist.sourceType || 'spotify',
    source_id:
      artist.source_id || artist.sourceId || `${artist.source_type || 'spotify'}:artist:${artist.id}`,
    name: artist.name,
    genres: artist.genres || [],
    followers: artist.followers ?? 0,
    popularity: artist.popularity || 0,
    image: getPrimaryImage(artist),
  }
}

function mapAlbumArtifact(album) {
  return {
    id: album.id,
    source_type: album.source_type || album.sourceType || 'spotify',
    source_id:
      album.source_id || album.sourceId || `${album.source_type || 'spotify'}:album:${album.id}`,
    name: album.name,
    artists: (album.artists || []).map((artist) =>
      typeof artist === 'string' ? artist : artist.name,
    ),
    releaseDate: album.release_date || album.releaseDate || '',
    totalTracks: album.total_tracks || album.totalTracks || 0,
    image: getPrimaryImage(album),
  }
}

function buildPlayerQueue(tracks) {
  return createTrackArtifacts(tracks)
}

function findFirstPlayableIndex(tracks = []) {
  return tracks.findIndex((track) => track.playable)
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
    /查询/g,
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
    /放一首/g,
    /来一首/g,
    /听一首/g,
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

function extractSpotifyTrackSeed(track) {
  if (track?.sourceType === 'spotify' && track?.id) {
    return track.id
  }

  if (track?.source_type === 'spotify' && track?.id) {
    return track.id
  }

  if (typeof track?.sourceId === 'string' && track.sourceId.startsWith('spotify:track:')) {
    return track.sourceId.split(':').slice(2).join(':')
  }

  if (typeof track?.source_id === 'string' && track.source_id.startsWith('spotify:track:')) {
    return track.source_id.split(':').slice(2).join(':')
  }

  return ''
}

function extractSpotifyArtistSeed(artist) {
  if (artist?.sourceType === 'spotify' && artist?.id) {
    return artist.id
  }

  if (artist?.source_type === 'spotify' && artist?.id) {
    return artist.id
  }

  if (
    typeof artist?.sourceId === 'string' &&
    artist.sourceId.startsWith('spotify:artist:')
  ) {
    return artist.sourceId.split(':').slice(2).join(':')
  }

  if (
    typeof artist?.source_id === 'string' &&
    artist.source_id.startsWith('spotify:artist:')
  ) {
    return artist.source_id.split(':').slice(2).join(':')
  }

  return ''
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
    const track = await tools.run('catalog.get_track', {
      trackId: context.currentTrackId,
    })

    return {
      reply: `当前这首歌是《${track.name}》，来自 ${
        extractAlbumName(track) || '未知专辑'
      }，演唱者是 ${(track.artists || [])
        .map((artist) => artist.name)
        .join('、')}。`,
      intent: 'search_entity',
      actions: [],
      artifacts: {
        entityType: 'track',
        track: createTrackArtifact(track),
      },
    }
  }

  const query = extractEntityQuery(message)
  const searchResult = await tools.run('catalog.search', {
    q: query,
    type: 'artist,track,album',
    limit: 5,
  })
  const firstArtist = searchResult.results?.artists?.[0]
  const firstAlbum = searchResult.results?.albums?.[0]
  const firstTrack = searchResult.results?.tracks?.[0]
  const wantsArtist = /歌手|artist|谁唱/i.test(normalized)
  const wantsAlbum = /专辑|album/i.test(normalized)
  const wantsTrack = /歌曲|这首歌|track|song/i.test(normalized)

  if (wantsArtist && firstArtist) {
    const artist = await tools.run('catalog.get_artist', {
      artistId: firstArtist.id,
    })

    return {
      reply: `${artist.name} 的主要风格是 ${
        (artist.genres || []).slice(0, 3).join('、') || '暂未标注'
      }，当前热度大约是 ${artist.popularity || 0}。`,
      intent: 'search_entity',
      actions: [],
      artifacts: {
        entityType: 'artist',
        artist: mapArtistArtifact(artist),
      },
    }
  }

  if (wantsAlbum && firstAlbum) {
    const album = await tools.run('catalog.get_album', {
      albumId: firstAlbum.id,
    })

    return {
      reply: `我找到专辑《${album.name}》，发行时间是 ${
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

  if ((wantsTrack || !wantsArtist) && firstTrack) {
    const track = await tools.run('catalog.get_track', {
      trackId: firstTrack.id,
    })

    return {
      reply: `我找到《${track.name}》了，演唱者是 ${(track.artists || [])
        .map((artist) => artist.name)
        .join('、')}，所属专辑是 ${
        extractAlbumName(track) || '未知专辑'
      }。`,
      intent: 'search_entity',
      actions: [],
      artifacts: {
        entityType: 'track',
        track: createTrackArtifact(track),
      },
    }
  }

  if (firstArtist) {
    return {
      reply: `我优先找到艺人 ${firstArtist.name}，风格偏 ${
        (firstArtist.genres || []).slice(0, 3).join('、') || '暂未标注'
      }。`,
      intent: 'search_entity',
      actions: [],
      artifacts: {
        entityType: 'artist',
        artist: mapArtistArtifact(firstArtist),
      },
    }
  }

  return {
    reply: '我暂时没有找到足够匹配的歌曲、歌手或专辑信息，你可以换一个更具体的关键词。',
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

  const searchResult = await tools.run('catalog.search', {
    q: query,
    type: 'track,playlist,artist',
    limit: 8,
  })
  const firstPlaylist = searchResult.results?.playlists?.[0]
  const firstArtist = searchResult.results?.artists?.[0]
  const firstTrack =
    searchResult.results?.tracks?.find((track) => track.preview_url) ||
    searchResult.results?.tracks?.[0]

  if (wantsPlaylist && firstPlaylist) {
    const playlist = await tools.run('catalog.get_playlist', {
      playlistId: firstPlaylist.id,
    })
    const playlistTracks = (playlist.tracks || []).map((item) => item.track).filter(Boolean)
    const queue = buildPlayerQueue(playlistTracks)
    const startIndex = findFirstPlayableIndex(queue)

    return {
      reply: startIndex >= 0
        ? `我找到歌单《${playlist.name}》，已经把其中可试听的歌曲整理成播放队列。`
        : `我找到歌单《${playlist.name}》，但里面暂时没有可用的预览音频。`,
      intent: 'play_music',
      actions: startIndex >= 0
        ? [
            {
              type: 'player.replace_queue',
              payload: {
                tracks: queue,
                startIndex,
              },
            },
          ]
        : [],
      artifacts: {
        resultType: 'playlist',
        playlist: {
          id: playlist.id,
          name: playlist.name,
          image: getPrimaryImage(playlist),
          owner: playlist.owner?.display_name || '',
        },
        tracks: queue,
      },
    }
  }

  if (wantsArtist && firstArtist) {
    const artistTrackSearch = await tools.run('catalog.search', {
      q: firstArtist.name,
      type: 'track',
      limit: 10,
    })
    const artistTracks = (artistTrackSearch.results?.tracks || []).filter((track) =>
      (track.artists || []).some(
        (artist) =>
          artist.id === firstArtist.id ||
          artist.name.toLowerCase() === firstArtist.name.toLowerCase(),
      ),
    )
    const queue = buildPlayerQueue(artistTracks)
    const startIndex = findFirstPlayableIndex(queue)

    return {
      reply: startIndex >= 0
        ? `我找到 ${firstArtist.name} 了，已经把可试听的歌曲整理成播放队列。`
        : `我找到 ${firstArtist.name} 了，但暂时没有拿到可试听的预览音频。`,
      intent: 'play_music',
      actions: startIndex >= 0
        ? [
            {
              type: 'player.replace_queue',
              payload: {
                tracks: queue,
                startIndex,
              },
            },
          ]
        : [],
      artifacts: {
        resultType: 'artist',
        artist: mapArtistArtifact(firstArtist),
        tracks: queue,
      },
    }
  }

  if (firstTrack) {
    if (!firstTrack.preview_url) {
      return {
        reply: `我找到《${firstTrack.name}》了，但这个来源没有提供预览音频，所以现在还不能直接试听。`,
        intent: 'play_music',
        actions: [],
        artifacts: {
          resultType: 'track',
          track: createTrackArtifact(firstTrack),
        },
      }
    }

    return {
      reply: `我找到《${firstTrack.name}》了，已经准备好播放它的预览。`,
      intent: 'play_music',
      actions: [
        {
          type: 'player.replace_queue',
          payload: {
            tracks: buildPlayerQueue([firstTrack]),
            startIndex: 0,
          },
        },
      ],
      artifacts: {
        resultType: 'track',
        track: createTrackArtifact(firstTrack),
      },
    }
  }

  if (firstPlaylist) {
    const playlist = await tools.run('catalog.get_playlist', {
      playlistId: firstPlaylist.id,
    })
    const playlistTracks = (playlist.tracks || []).map((item) => item.track).filter(Boolean)
    const queue = buildPlayerQueue(playlistTracks)
    const startIndex = findFirstPlayableIndex(queue)

    return {
      reply: startIndex >= 0
        ? `我找到歌单《${playlist.name}》，已经把其中可试听的歌曲整理成播放队列。`
        : `我找到歌单《${playlist.name}》，但里面暂时没有可用的预览音频。`,
      intent: 'play_music',
      actions: startIndex >= 0
        ? [
            {
              type: 'player.replace_queue',
              payload: {
                tracks: queue,
                startIndex,
              },
            },
          ]
        : [],
      artifacts: {
        resultType: 'playlist',
        playlist: {
          id: playlist.id,
          name: playlist.name,
          image: getPrimaryImage(playlist),
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
  mode,
  message,
  memoryProfile,
  tools,
}) {
  const explicitGenres = detectGenreSeeds(message)
  const defaultGenres = Array.isArray(memoryProfile.defaultGenres)
    ? memoryProfile.defaultGenres
    : Array.isArray(memoryProfile.publicSeeds?.genres)
      ? memoryProfile.publicSeeds.genres
      : []
  const searchQuery = extractEntityQuery(message)
  const searchResult = await tools.run('catalog.search', {
    q: searchQuery,
    type: 'artist,track',
    limit: 5,
  })

  const searchArtistIds = limitSeeds(
    (searchResult.results?.artists || [])
      .map((artist) => extractSpotifyArtistSeed(artist))
      .filter(Boolean),
    2,
  )
  const searchTrackIds = limitSeeds(
    (searchResult.results?.tracks || [])
      .map((track) => extractSpotifyTrackSeed(track))
      .filter(Boolean),
    3,
  )
  const memoryArtistIds = limitSeeds(
    memoryProfile.topArtists.map((artist) => extractSpotifyArtistSeed(artist)).filter(Boolean),
    2,
  )
  const memoryTrackIds = limitSeeds(
    memoryProfile.topTracks
      .filter((track) =>
        !(memoryProfile.avoidSourceIds || []).includes(track.sourceId || track.source_id || ''),
      )
      .map((track) => extractSpotifyTrackSeed(track))
      .filter(Boolean),
    3,
  )
  const { seedGenres, seedArtists, seedTracks } = allocateRecommendationSeeds({
    explicitGenres: explicitGenres.length ? explicitGenres : defaultGenres,
    searchArtistIds,
    searchTrackIds,
    memoryArtistIds,
    memoryTrackIds,
  })
  let recommendationTracks = []

  if (seedArtists.length || seedTracks.length) {
    try {
      const recommendations = await tools.run('catalog.get_recommendations', {
        seed_artists: seedArtists.join(','),
        seed_tracks: seedTracks.join(','),
        seed_genres: seedGenres.join(','),
        limit: 10,
      })

      recommendationTracks = recommendations.tracks || []
    } catch {
      recommendationTracks = []
    }
  }

  if (!recommendationTracks.length) {
    const fallbackQuery =
      explicitGenres[0] ||
      defaultGenres[0] ||
      searchResult.results?.artists?.[0]?.name ||
      memoryProfile.topArtists[0]?.name ||
      memoryProfile.topTracks[0]?.name ||
      memoryProfile.publicSeeds?.query ||
      searchQuery ||
      'pop'
    const fallbackSearch = await tools.run('catalog.search', {
      q: fallbackQuery,
      type: 'track',
      limit: 10,
    })

    recommendationTracks = fallbackSearch.results?.tracks || []
  }

  const avoidSourceIds = new Set(memoryProfile.avoidSourceIds || [])
  const tracks = recommendationTracks
    .map((track) => createTrackArtifact(track))
    .filter((track) => !avoidSourceIds.has(track.source_id || track.sourceId || ''))
  const firstPlayableIndex = findFirstPlayableIndex(tracks)
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
  const modeLeadText =
    mode === 'spotify_enhanced'
      ? '我结合了你站内偏好和已绑定的 Spotify 画像'
      : mode === 'local_user'
        ? '我结合了你在 AgentMusic 里的收藏和歌单'
        : '我先按公开目录和你的描述'
  const genreText = seedGenres.length ? `，并参考 ${seedGenres.join('、')} 这类风格` : ''

  return {
    reply: firstPlayableIndex >= 0
      ? `${modeLeadText}${genreText}，整理出一组推荐，并且已经准备成可播放队列。`
      : `${modeLeadText}${genreText}，整理出一组推荐结果，不过这次没有拿到足够的预览音频，所以先把结果保存下来了。`,
    intent: 'generate_recommendation',
    actions: firstPlayableIndex >= 0
      ? [
          {
            type: 'player.replace_queue',
            payload: {
              tracks,
              startIndex: firstPlayableIndex,
            },
          },
        ]
      : [],
    artifacts: {
      recommendationId: historyEntry.id,
      recommendationTitle: historyEntry.title,
      tracks,
      seeds: historyEntry.seeds || {
        artists: seedArtists,
        tracks: seedTracks,
        genres: seedGenres,
      },
      memoryProfile,
    },
  }
}

export async function runAgent({
  mode = 'guest',
  localUserId = null,
  providerLinks = {},
  message,
  context = {},
  conversationId = '',
}) {
  const toolCalls = []
  const intentResult = classifyIntent(message)
  const tools = createAgentToolRegistry({
    mode,
    localUserId,
    providerLinks,
    toolCalls,
    conversationId,
  })
  const memoryProfile =
    intentResult.intent === 'control_player'
      ? createEmptyMemoryProfile()
      : mode === 'guest'
        ? createEmptyMemoryProfile()
        : await tools.run('memory.get_user_profile', {
            topLimit: 5,
            recommendationLimit: 5,
            feedbackLimit: 5,
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
        mode,
        message,
        memoryProfile,
        tools,
      })
      break
  }

  return {
    ...result,
    mode,
    confidence: intentResult.confidence,
    toolCalls,
    memoryProfile,
    conversationTitle: buildConversationTitle(message),
  }
}

export default {
  runAgent,
}
