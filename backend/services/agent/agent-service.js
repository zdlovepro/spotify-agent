import { listAudioAssets } from '../media/media-service.js'
import { isDeepSeekConfigured } from '../llm/deepseek-client.js'
import {
  getGuestConversation,
  getStoredConversation,
  listStoredConversations,
} from './agent-conversation-service.js'
import { planAgentWithDeepSeek } from './deepseek-agent-planner.js'
import {
  buildAgentMemoryContext,
  buildUserTasteProfile,
  createEmptyMemoryProfile,
} from './memory-service.js'
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

const SPOTIFY_RECOMMENDATION_SEARCH_TERMS = {
  ambient: 'ambient calm focus',
  cantopop: 'cantopop',
  chill: 'chill relaxing evening',
  classical: 'classical focus instrumental',
  edm: 'edm workout energy',
  electronic: 'electronic focus',
  happy: 'feel good happy pop',
  'hip-hop': 'hip hop energy',
  jazz: 'jazz evening',
  'j-pop': 'j-pop',
  'k-pop': 'k-pop',
  party: 'party dance',
  pop: 'pop hits',
  rock: 'rock hits',
  sad: 'sad mellow',
  sleep: 'sleep ambient calm',
  study: 'focus coding instrumental',
  'work-out': 'workout gym energy',
}

function wantsLocalRecommendation(message) {
  return (
    prefersLocalPlayback(message) ||
    /\u672c\u5730\u5e93|\u6211\u4e0a\u4f20\u8fc7\u7684|\u6211\u7684\u6b4c|\u6211\u7684\u97f3\u9891|local library/i.test(
      normalizeMessage(message),
    )
  )
}

function wantsHybridRecommendation(message) {
  return /\u7ed3\u5408|\u4e00\u8d77|\u6df7\u5408|both|mix|together/i.test(
    normalizeMessage(message),
  )
}

function wantsImmediateRecommendationPlayback(message) {
  return /\u76f4\u63a5\u64ad\u653e|\u9a6c\u4e0a\u64ad\u653e|\u76f4\u63a5\u64ad|\u64ad\u8d77\u6765|play now|start playing|directly play/i.test(
    normalizeMessage(message),
  )
}

function extractRecommendationQuery(message) {
  return normalizeMessage(message)
    .replace(
      /\u63a8\u8350|\u6765\u70b9|\u7ed9\u6211|\u5e2e\u6211|\u7ed3\u5408|\u4e00\u7ec4|\u5408\u9002|\u9002\u5408|recommend(?:ation)?|suggest|give me|find me/gi,
      ' ',
    )
    .replace(
      /\u6211\u4e0a\u4f20\u8fc7\u7684|\u6211\u7684\u672c\u5730|\u6211\u7684\u97f3\u9891|\u672c\u5730\u5e93|spotify|\u76f4\u63a5\u64ad\u653e|play now|start playing/gi,
      ' ',
    )
    .replace(/\u91cc|\u7684|\u6b4c|\u542c\u7684|music|songs?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasMeaningfulRecommendationQuery(query) {
  const normalized = normalizeMessage(query).toLowerCase()

  if (!normalized || normalized.length < 2) {
    return false
  }

  return ![
    '我',
    '我的',
    '推荐',
    '一组',
    'music',
    'song',
    'songs',
  ].includes(normalized)
}

function getTrackIdentity(track = {}) {
  return track.sourceId || track.source_id || track.id || ''
}

function dedupeTrackArtifacts(tracks = []) {
  const trackMap = new Map()

  for (const track of tracks) {
    const artifact = createTrackArtifact(track)
    const key = getTrackIdentity(artifact)

    if (!key || trackMap.has(key)) {
      continue
    }

    trackMap.set(key, artifact)
  }

  return [...trackMap.values()]
}

function createTrackScoreSets(memoryProfile = {}) {
  return {
    liked: new Set(memoryProfile.likedSourceIds || []),
    topTracks: new Set(
      (memoryProfile.topTracks || [])
        .map((track) => track.sourceId || track.source_id || track.id || '')
        .filter(Boolean),
    ),
  }
}

function scoreRecommendationTrack(track, scoreSets, { preferLocal = false } = {}) {
  const key = getTrackIdentity(track)
  let score = 0

  if (track.playMode === 'local_audio') {
    score += preferLocal ? 30 : 12
  }

  if (track.playMode === 'spotify_remote' && track.uri) {
    score += preferLocal ? 8 : 14
  }

  if (scoreSets.liked.has(key)) {
    score += 10
  }

  if (scoreSets.topTracks.has(key)) {
    score += 8
  }

  return score
}

function sortRecommendationTracks(
  tracks = [],
  memoryProfile = {},
  { preferLocal = false } = {},
) {
  const scoreSets = createTrackScoreSets(memoryProfile)

  return [...tracks].sort((left, right) => {
    const scoreDelta =
      scoreRecommendationTrack(right, scoreSets, { preferLocal }) -
      scoreRecommendationTrack(left, scoreSets, { preferLocal })

    if (scoreDelta !== 0) {
      return scoreDelta
    }

    return String(left.name || '').localeCompare(String(right.name || ''))
  })
}

function interleaveRecommendationTracks(trackGroups = [], maxCount = 10) {
  const queues = trackGroups.map((group) => [...group])
  const mixedTracks = []
  const seen = new Set()

  while (mixedTracks.length < maxCount && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      if (!queue.length || mixedTracks.length >= maxCount) {
        continue
      }

      const track = queue.shift()
      const key = getTrackIdentity(track)

      if (!key || seen.has(key)) {
        continue
      }

      seen.add(key)
      mixedTracks.push(track)
    }
  }

  return mixedTracks
}

function filterAvoidedRecommendationTracks(tracks = [], memoryProfile = {}) {
  const avoidSourceIds = new Set(memoryProfile.avoidSourceIds || [])

  return tracks.filter((track) => !avoidSourceIds.has(getTrackIdentity(track)))
}

function buildSpotifyRecommendationQueries({
  message,
  explicitGenres,
  topArtists,
  memoryProfile,
}) {
  const normalizedQuery = extractRecommendationQuery(message)
  const moodQuery =
    SPOTIFY_RECOMMENDATION_SEARCH_TERMS[explicitGenres[0]] || explicitGenres[0] || ''
  const favoriteArtist =
    topArtists[0]?.name ||
    memoryProfile.topArtists?.[0]?.name ||
    ''

  return unique(
    [
      hasMeaningfulRecommendationQuery(normalizedQuery) ? normalizedQuery : '',
      moodQuery && favoriteArtist ? `${moodQuery} ${favoriteArtist}` : '',
      moodQuery,
      favoriteArtist,
      memoryProfile.publicSeeds?.query || '',
    ].filter(Boolean),
  ).slice(0, 3)
}

function buildRecommendationReply({
  message,
  tracks,
  localRequested,
  spotifyConnected,
  mixedRequested,
  startedPlaying,
}) {
  const trackCount = tracks.length

  if (!trackCount) {
    return localizePlaybackReply(
      message,
      spotifyConnected
        ? '我这次还没整理出足够合适的推荐。你可以换个更具体的情绪、场景，或者告诉我想偏向本地音频还是 Spotify。'
        : '我先在你的本地音频库里找过了，但还没整理出足够合适的推荐。连接 Spotify 后我可以给你更多选择。',
      spotifyConnected
        ? 'I could not shape a strong recommendation set yet. Try a more specific mood or tell me whether to lean local audio or Spotify.'
        : 'I checked your local audio first, but could not shape a strong recommendation set yet. Connect Spotify for more options.',
    )
  }

  if (localRequested) {
    return localizePlaybackReply(
      message,
      startedPlaying
        ? `我先从你的本地音频库里挑了 ${trackCount} 首，并已经开始播放。`
        : `我先从你的本地音频库里挑了 ${trackCount} 首推荐。`,
      startedPlaying
        ? `I picked ${trackCount} local tracks from your library and started playing them.`
        : `I picked ${trackCount} local tracks from your library.`,
    )
  }

  if (!spotifyConnected) {
    return localizePlaybackReply(
      message,
      startedPlaying
        ? `我先只用你的本地音频库整理了 ${trackCount} 首，并已经开始播放。连接 Spotify 后我可以给你更多推荐。`
        : `我先只用你的本地音频库整理了 ${trackCount} 首推荐。连接 Spotify 后我可以给你更多推荐。`,
      startedPlaying
        ? `I used your local audio library for ${trackCount} picks and started playing them. Connect Spotify for more recommendations.`
        : `I used your local audio library for ${trackCount} picks. Connect Spotify for more recommendations.`,
    )
  }

  if (mixedRequested || tracks.some((track) => track.playMode === 'local_audio') && tracks.some((track) => track.playMode === 'spotify_remote')) {
    return localizePlaybackReply(
      message,
      startedPlaying
        ? `我结合了你的本地音频和 Spotify，整理了 ${trackCount} 首，并已经开始播放。`
        : `我结合了你的本地音频和 Spotify，整理了 ${trackCount} 首推荐。`,
      startedPlaying
        ? `I combined your local audio and Spotify into ${trackCount} picks and started playback.`
        : `I combined your local audio and Spotify into ${trackCount} picks.`,
    )
  }

  return localizePlaybackReply(
    message,
    startedPlaying
      ? `我整理了 ${trackCount} 首 Spotify 推荐，并已经开始播放。`
      : `我整理了 ${trackCount} 首 Spotify 推荐。`,
    startedPlaying
      ? `I prepared ${trackCount} Spotify recommendations and started playback.`
      : `I prepared ${trackCount} Spotify recommendations.`,
  )
}

function isPlaylistManagementRequest(message) {
  return /歌单|playlist|收藏|favorite/i.test(normalizeMessage(message))
}

function wantsFavoriteSave(message) {
  return /收藏|favorite|save.*favorite|加入我的收藏/i.test(normalizeMessage(message))
}

function extractPlaylistTitle(message) {
  const quotedMatch = normalizeMessage(message).match(/["“](.+?)["”]/)

  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim()
  }

  const normalized = normalizeMessage(message)
    .replace(/请|帮我|给我/gi, ' ')
    .replace(/新建|创建|建一个|建个|做一个|做个|create|make/gi, ' ')
    .replace(/把.+$/gi, ' ')
    .replace(/加.+$/gi, ' ')
    .replace(/spotify/gi, ' Spotify ')
    .replace(/\s+/g, ' ')
    .trim()
  const playlistMatch = normalized.match(/(.+?(?:歌单|playlist))/i)

  if (playlistMatch?.[1]) {
    return playlistMatch[1].trim()
  }

  return shouldReplyInChinese(message) ? '新建歌单' : 'New Playlist'
}

function extractPlaylistTrackQuery(message, playlistTitle = '') {
  const normalized = normalizeMessage(message)
    .replace(/请|帮我|给我/gi, ' ')
    .replace(/新建|创建|建一个|建个|做一个|做个|create|make/gi, ' ')
    .replace(/歌单|playlist/gi, ' ')
    .replace(/把|加入|加进|放进|收藏|favorite|当前播放的歌|当前播放|热门歌|热门|几首|我上传的|上传的|本地|我的音频/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized) {
    return normalized
  }

  return normalizeMessage(playlistTitle)
    .replace(/歌单|playlist/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getCurrentTrackFromContext(context = {}) {
  if (context.currentTrack && typeof context.currentTrack === 'object') {
    return createTrackArtifact(context.currentTrack)
  }

  return null
}

function buildPlaylistOperationReply({
  message,
  playlistName,
  addedCount,
  loginRequired = false,
  favoriteSaved = false,
  localRequested = false,
  spotifyUsed = false,
}) {
  if (loginRequired) {
    return localizePlaybackReply(
      message,
      '需要先登录 AgentMusic，才能保存歌单或收藏。',
      'Sign in to AgentMusic first to save playlists or favorites.',
    )
  }

  if (favoriteSaved) {
    return localizePlaybackReply(
      message,
      '已经把当前歌曲加入你的收藏。',
      'I saved the current track to your favorites.',
    )
  }

  if (addedCount > 0) {
    return localizePlaybackReply(
      message,
      localRequested
        ? `已经创建歌单《${playlistName}》，并加入 ${addedCount} 首本地音频。`
        : spotifyUsed
          ? `已经创建歌单《${playlistName}》，并加入 ${addedCount} 首 Spotify 曲目引用。`
          : `已经创建歌单《${playlistName}》，并加入 ${addedCount} 首歌曲。`,
      localRequested
        ? `I created "${playlistName}" and added ${addedCount} local tracks.`
        : spotifyUsed
          ? `I created "${playlistName}" and added ${addedCount} Spotify track references.`
          : `I created "${playlistName}" and added ${addedCount} tracks.`,
    )
  }

  return localizePlaybackReply(
    message,
    `已经创建空歌单《${playlistName}》。你可以继续告诉我要加本地音频还是 Spotify 曲目。`,
    `I created an empty playlist called "${playlistName}". Tell me whether to add local audio or Spotify tracks next.`,
  )
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

async function handleHybridRecommendation({
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
  const localRequested = wantsLocalRecommendation(message)
  const mixedRequested = wantsHybridRecommendation(message)
  const directPlayRequested = wantsImmediateRecommendationPlayback(message)
  const spotifyConnected = mode === 'spotify_enhanced'
  const canUseLocal = mode !== 'guest'
  const recommendationQuery = extractRecommendationQuery(message)
  let localTracks = []
  let spotifyTracks = []
  let spotifyTopArtists = []

  if (canUseLocal) {
    try {
      const shouldSearchLocal =
        localRequested && hasMeaningfulRecommendationQuery(recommendationQuery)
      const localTool = shouldSearchLocal
        ? 'library.search_local_audio'
        : 'library.list_audio_assets'
      const localArgs = shouldSearchLocal
        ? {
            q: recommendationQuery,
            limit: 12,
          }
        : {}
      let localResult = await tools.run(localTool, localArgs)

      if (shouldSearchLocal && !(localResult.items || []).length) {
        localResult = await tools.run('library.list_audio_assets', {})
      }

      localTracks = sortRecommendationTracks(
        filterAvoidedRecommendationTracks(
          dedupeTrackArtifacts(localResult.items || []),
          memoryProfile,
        ),
        memoryProfile,
        { preferLocal: true },
      )
    } catch {
      localTracks = []
    }
  }

  if (spotifyConnected && (!localRequested || mixedRequested || localTracks.length === 0)) {
    let spotifyTopTrackItems = []

    try {
      const topTrackResult = await tools.run('spotify.get_user_top_tracks', {
        limit: 6,
      })
      spotifyTopTrackItems = topTrackResult.items || []
    } catch {
      spotifyTopTrackItems = []
    }

    try {
      const topArtistResult = await tools.run('spotify.get_user_top_artists', {
        limit: 4,
      })
      spotifyTopArtists = topArtistResult.items || []
    } catch {
      spotifyTopArtists = []
    }

    const spotifySearchTracks = []
    const spotifyQueries = buildSpotifyRecommendationQueries({
      message,
      explicitGenres: explicitGenres.length ? explicitGenres : defaultGenres,
      topArtists: spotifyTopArtists,
      memoryProfile,
    })

    for (const spotifyQuery of spotifyQueries) {
      try {
        const searchResult = await tools.run('spotify.search_tracks', {
          q: spotifyQuery,
          limit: 6,
        })

        spotifySearchTracks.push(...(searchResult.items || []))
      } catch {
        continue
      }
    }

    spotifyTracks = sortRecommendationTracks(
      filterAvoidedRecommendationTracks(
        dedupeTrackArtifacts([...spotifyTopTrackItems, ...spotifySearchTracks]),
        memoryProfile,
      ),
      memoryProfile,
      { preferLocal: false },
    )
  }

  let tracks = []

  if (localRequested && !mixedRequested) {
    tracks = localTracks.slice(0, 10)
  } else if (spotifyConnected) {
    tracks = interleaveRecommendationTracks(
      [localTracks.slice(0, 4), spotifyTracks.slice(0, 8)],
      10,
    )
  } else {
    tracks = localTracks.slice(0, 10)
  }

  if (!tracks.length && spotifyTracks.length) {
    tracks = spotifyTracks.slice(0, 10)
  }

  tracks = dedupeTrackArtifacts(tracks)

  const saveToolName =
    mode === 'guest' ? 'history.save_recommendation' : 'recommendation.save_run'
  const seedSummary = {
    query: recommendationQuery || message,
    genres: explicitGenres.length ? explicitGenres : defaultGenres,
    localRequested,
    mixedRequested,
    spotifyConnected,
    localTrackCount: localTracks.length,
    spotifyTrackCount: spotifyTracks.length,
    topArtistNames: spotifyTopArtists
      .map((artist) => artist?.name || '')
      .filter(Boolean)
      .slice(0, 4),
  }
  const historyEntry = await tools.run(saveToolName, {
    title: buildConversationTitle(message),
    prompt: message,
    description: 'Agent-generated recommendation set from local audio and Spotify.',
    seeds: seedSummary,
    tracks,
  })
  const startIndex = directPlayRequested ? findFirstPlannerQueueIndex(tracks) : -1
  const actions =
    startIndex >= 0
      ? [
          {
            type: 'player.replace_queue',
            payload: {
              tracks,
              startIndex,
              playlistId: historyEntry.id || '',
              playlistTitle: historyEntry.title || '',
            },
          },
        ]
      : []

  return {
    reply: buildRecommendationReply({
      message,
      tracks,
      localRequested,
      spotifyConnected,
      mixedRequested,
      startedPlaying: actions.length > 0,
    }),
    intent: 'generate_recommendation',
    actions,
    artifacts: {
      recommendationId: historyEntry.id,
      recommendationTitle: historyEntry.title,
      tracks,
      seeds: historyEntry.seeds || seedSummary,
      memoryProfile,
    },
  }
}

async function handleCreatePlaylist({
  mode,
  localUserId,
  message,
  context,
  providerLinks,
  tools,
}) {
  if (!localUserId) {
    return {
      reply: buildPlaylistOperationReply({
        message,
        playlistName: '',
        addedCount: 0,
        loginRequired: true,
      }),
      intent: 'create_playlist',
      actions: [],
      artifacts: {
        error: {
          message: 'local_user_required',
        },
      },
    }
  }

  if (wantsFavoriteSave(message)) {
    const currentTrack = getCurrentTrackFromContext(context)

    if (!currentTrack?.sourceId && !currentTrack?.id) {
      return {
        reply: localizePlaybackReply(
          message,
          '我还没拿到当前播放歌曲的信息。先播放一首歌，再让我帮你加入收藏。',
          'I do not have the current track yet. Start a song first, then I can save it to favorites.',
        ),
        intent: 'create_playlist',
        actions: [],
        artifacts: {
          error: {
            message: 'current_track_unavailable',
          },
        },
      }
    }

    const favorite = await tools.run('library.favorite_track', {
      track: currentTrack,
      favoriteType: 'track',
    })

    return {
      reply: buildPlaylistOperationReply({
        message,
        favoriteSaved: true,
      }),
      intent: 'create_playlist',
      actions: [],
      artifacts: {
        track: favorite.track,
        favorite: {
          id: favorite.id,
          favoriteType: favorite.favoriteType,
        },
      },
    }
  }

  const playlistTitle = extractPlaylistTitle(message)
  const playlist = await tools.run('library.create_playlist', {
    title: playlistTitle,
    metadata: {
      createdBy: 'agent',
      source: 'deepseek-agent',
    },
  })
  const localRequested = prefersLocalPlayback(message)
  const currentTrack = getCurrentTrackFromContext(context)
  const tracksToAdd = []

  if (/当前播放|现在这首|这首歌|current song|currently playing/i.test(normalizeMessage(message)) && currentTrack) {
    tracksToAdd.push(currentTrack)
  }

  if (!tracksToAdd.length && localRequested) {
    const localQuery = extractPlaylistTrackQuery(message, playlistTitle)
    let localResult = hasMeaningfulRecommendationQuery(localQuery)
      ? await tools.run('library.search_local_audio', {
          q: localQuery,
          limit: 5,
        })
      : await tools.run('library.list_audio_assets', {})

    if (hasMeaningfulRecommendationQuery(localQuery) && !(localResult.items || []).length) {
      localResult = await tools.run('library.list_audio_assets', {})
    }

    tracksToAdd.push(...((localResult.items || []).slice(0, 5)))
  }

  if (!tracksToAdd.length) {
    const spotifyQuery = extractPlaylistTrackQuery(message, playlistTitle)
    const spotifyResult = await tools.run('spotify.search_tracks', {
      q: spotifyQuery || playlistTitle,
      limit: 5,
    })

    tracksToAdd.push(...(spotifyResult.items || []).slice(0, 5))
  }

  const addedItems = []

  for (const track of tracksToAdd) {
    try {
      const item = await tools.run('library.add_track_to_playlist', {
        playlistId: playlist.id,
        track,
      })

      if (item?.track) {
        addedItems.push(item)
      }
    } catch {
      continue
    }
  }

  const playlistArtifact = {
    ...normalizePlaylistArtifact(playlist),
    itemCount: addedItems.length,
    sourceType: playlist.sourceType || 'agentmusic',
    sourceId: playlist.sourceId || '',
    description: playlist.description || '',
  }
  const addedTracks = addedItems.map((item) => item.track).filter(Boolean)

  return {
    reply: buildPlaylistOperationReply({
      message,
      playlistName: playlistArtifact.name,
      addedCount: addedTracks.length,
      localRequested,
      spotifyUsed: addedTracks.some((track) => track.playMode === 'spotify_remote'),
    }),
    intent: 'create_playlist',
    actions: [],
    artifacts: {
      playlist: playlistArtifact,
      tracks: addedTracks,
    },
  }
}

function extractSourceAwarePlaybackQuery(message) {
  return normalizeMessage(message)
    .replace(/播放|来点|来一首|放一首|听一首|帮我|给我|我想听|play/gi, ' ')
    .replace(/本地|上传|我上传的|我的音频|m4a|mp3|spotify/gi, ' ')
    .replace(/第\s*[0-9一二两三四五六七八九十]+\s*首/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRequestedTrackIndex(message) {
  const normalized = normalizeMessage(message).toLowerCase()

  if (/第一首|first/.test(normalized)) {
    return 0
  }

  if (/第二首|second/.test(normalized)) {
    return 1
  }

  if (/第三首|third/.test(normalized)) {
    return 2
  }

  const directMatch = normalized.match(/第\s*(\d+)\s*首/)

  if (directMatch) {
    return Math.max(Number(directMatch[1]) - 1, 0)
  }

  return 0
}

function wantsPlaybackQueue(message) {
  return /来点|一些|几首|队列|shuffle|mix|queue/i.test(normalizeMessage(message))
}

function extractRequestedLocalFormat(message) {
  const normalized = normalizeMessage(message).toLowerCase()

  if (normalized.includes('mp3')) {
    return 'mp3'
  }

  if (normalized.includes('m4a')) {
    return 'm4a'
  }

  return ''
}

function hasMeaningfulPlaybackQuery(query) {
  const normalized = normalizeMessage(query).toLowerCase()

  if (!normalized || normalized.length < 2) {
    return false
  }

  return ![
    '我',
    '我的',
    '歌',
    '的歌',
    '我的歌',
    'audio',
    'song',
    'songs',
  ].includes(normalized)
}

function buildFallbackCapabilities({
  localUserId,
  providerLinks,
  context,
}) {
  return {
    localAudioAvailable: Boolean(localUserId && listAudioAssets(localUserId).length > 0),
    spotifyConnected: Boolean(providerLinks?.spotify?.accessToken),
    spotifyPlaybackReady: context?.spotifyPlaybackReady === true,
    currentDeviceId: context?.currentDeviceId || '',
  }
}

function buildPlayerToolActions(result) {
  if (!result?.ok || !result?.type) {
    return []
  }

  return [
    {
      type: result.type,
      payload: result.payload || {},
    },
  ]
}

async function handleSourceAwarePlayback({
  message,
  localUserId,
  providerLinks,
  context,
  tools,
}) {
  const spotifyConnected = Boolean(providerLinks?.spotify?.accessToken)
  const capabilities = buildFallbackCapabilities({
    localUserId,
    providerLinks,
    context,
  })
  const plannerLikeInput = {
    isAuthenticated: Boolean(localUserId),
    capabilities,
  }
  const normalizedMessage = normalizeMessage(message)
  const playbackQuery = extractSourceAwarePlaybackQuery(message) || normalizedMessage
  const preferredTrackIndex = parseRequestedTrackIndex(message)
  const localFirst = prefersLocalPlayback(message)
  const queueRequested = wantsPlaybackQueue(message)
  const requestedLocalFormat = extractRequestedLocalFormat(message)

  if (localFirst) {
    if (!localUserId) {
      return {
        reply: buildPlaybackFailureReply({
          message,
          plannerInput: plannerLikeInput,
        }),
        intent: 'play_music',
        actions: [],
        artifacts: {},
      }
    }

    const localSearchResult =
      hasMeaningfulPlaybackQuery(playbackQuery) && !queueRequested
        ? await tools.run('library.search_local_audio', {
            q: playbackQuery,
            limit: 10,
          })
        : await tools.run('library.list_audio_assets', {})
    const localTracks = (localSearchResult.items || []).filter((track) => {
      if (!requestedLocalFormat) {
        return true
      }

      return String(track.fileExtension || '')
        .toLowerCase()
        .includes(requestedLocalFormat)
    })

    if (!localTracks.length) {
      return {
        reply: buildPlaybackFailureReply({
          message,
          plannerInput: plannerLikeInput,
          noPlayableResult: true,
        }),
        intent: 'play_music',
        actions: [],
        artifacts: {},
      }
    }

    if (queueRequested) {
      const queueResult = await tools.run('player.replace_queue', {
        tracks: localTracks,
        startIndex: Math.min(preferredTrackIndex, localTracks.length - 1),
      })

      return {
        reply: localizePlaybackReply(
          message,
          '我已经把你的本地音频整理成队列并开始播放。',
          'I queued your local audio selection and started playback.',
        ),
        intent: 'play_music',
        actions: buildPlayerToolActions(queueResult),
        artifacts: {
          tracks: localTracks.map((track) => createTrackArtifact(track)),
        },
      }
    }

    const selectedTrack = localTracks[Math.min(preferredTrackIndex, localTracks.length - 1)]
    const localPlayResult = await tools.run('player.play_local', {
      assetId: selectedTrack.id,
    })

    return {
      reply: localizePlaybackReply(
        message,
        `正在播放你上传的《${selectedTrack.name}》。`,
        `Playing your uploaded track "${selectedTrack.name}".`,
      ),
      intent: 'play_music',
      actions: buildPlayerToolActions(localPlayResult),
      artifacts: {
        track: createTrackArtifact(selectedTrack),
        tracks: [createTrackArtifact(selectedTrack)],
      },
    }
  }

  if (spotifyConnected) {
    const spotifySearchResult = await tools.run('spotify.search_tracks', {
      q: playbackQuery,
      limit: 5,
    })
    const spotifyTracks = spotifySearchResult.items || []

    if (spotifyTracks.length > 0) {
      const selectedTrack = spotifyTracks[0]

      try {
        await tools.run('spotify.play_uri', {
          uri: selectedTrack.uri,
          deviceId: context?.currentDeviceId || undefined,
        })

        return {
          reply: localizePlaybackReply(
            message,
            `正在通过 Spotify 播放《${selectedTrack.name}》。`,
            `Playing "${selectedTrack.name}" through Spotify.`,
          ),
          intent: 'play_music',
          actions: [],
          artifacts: {
            track: createTrackArtifact(selectedTrack),
            tracks: [createTrackArtifact(selectedTrack)],
          },
        }
      } catch (error) {
        return {
          reply: buildPlaybackFailureReply({
            message,
            error,
            plannerInput: plannerLikeInput,
          }),
          intent: 'play_music',
          actions: [],
          artifacts: {
            track: createTrackArtifact(selectedTrack),
            error: {
              message: error.message || 'playback_failed',
              tool: 'spotify.play_uri',
            },
          },
        }
      }
    }
  }

  if (localUserId) {
    const localSearchResult = await tools.run('library.search_local_audio', {
      q: playbackQuery,
      limit: 10,
    })
    const localTracks = localSearchResult.items || []

    if (localTracks.length > 0) {
      const selectedTrack = localTracks[Math.min(preferredTrackIndex, localTracks.length - 1)]
      const localPlayResult = await tools.run('player.play_local', {
        assetId: selectedTrack.id,
      })

      return {
        reply: localizePlaybackReply(
          message,
          `我在你的本地音频库里找到了《${selectedTrack.name}》，现在开始播放。`,
          `I found "${selectedTrack.name}" in your local audio library and started playback.`,
        ),
        intent: 'play_music',
        actions: buildPlayerToolActions(localPlayResult),
        artifacts: {
          track: createTrackArtifact(selectedTrack),
          tracks: [createTrackArtifact(selectedTrack)],
        },
      }
    }
  }

  return {
    reply: buildPlaybackFailureReply({
      message,
      plannerInput: plannerLikeInput,
      noPlayableResult: true,
    }),
    intent: 'play_music',
    actions: [],
    artifacts: {},
  }
}

function canQueuePlannerTrack(track = {}) {
  return Boolean(
    track?.playable ||
      track?.playMode === 'spotify_remote' ||
      track?.playMode === 'remote' ||
      track?.uri ||
      track?.sourceId?.startsWith?.('spotify:track:') ||
      track?.source_id?.startsWith?.('spotify:track:'),
  )
}

function findFirstPlannerQueueIndex(tracks = []) {
  return tracks.findIndex((track) => canQueuePlannerTrack(track))
}

function summarizeConversationMessages(conversation) {
  return (conversation?.messages || []).slice(-4).map((message) => ({
    role: message.role,
    content: String(message.content || '').slice(0, 140),
    intent: message.intent || null,
    createdAt: message.createdAt || '',
  }))
}

function summarizeRecentConversationThreads(localUserId) {
  if (!localUserId) {
    return []
  }

  return listStoredConversations(localUserId, 3).map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    lastMessagePreview: conversation.lastMessagePreview || '',
    updatedAt: conversation.updatedAt,
  }))
}

function summarizeLocalAudioAssets(localUserId) {
  if (!localUserId) {
    return []
  }

  return listAudioAssets(localUserId).slice(0, 8).map((asset) => ({
    id: asset.id,
    title: asset.title || asset.originalFilename || 'Local audio',
    artists: Array.isArray(asset.artists) ? asset.artists : [],
    album: asset.album || '',
    fileExtension: asset.fileExtension || '',
    durationMs: asset.durationMs ?? null,
    sourceType: asset.sourceType || 'local_audio',
    sourceId: asset.sourceId || `local_audio:${asset.id}`,
  }))
}

async function loadPlannerMemoryProfile({
  mode,
  localUserId,
  providerLinks,
}) {
  if (mode === 'guest' || !localUserId) {
    return createEmptyMemoryProfile({
      mode: 'guest',
    })
  }

  return buildUserTasteProfile({
    mode,
    localUserId,
    providerLinks,
    recommendationLimit: 5,
    topLimit: 5,
    feedbackLimit: 5,
  })
}

function buildPlannerInput({
  mode,
  localUserId,
  providerLinks,
  message,
  context,
  conversation,
  memoryProfile,
  tools,
}) {
  const localAudioSummary = summarizeLocalAudioAssets(localUserId)
  const memoryContext = buildAgentMemoryContext(localUserId)
  const spotifyConnected = Boolean(providerLinks?.spotify?.accessToken)

  return {
    userMessage: message,
    currentUserId: localUserId || '',
    isAuthenticated: Boolean(localUserId),
    isSpotifyConnected: spotifyConnected,
    spotifyConnectionStatus: {
      connected: spotifyConnected,
      providerName: providerLinks?.spotify?.providerName || 'spotify',
    },
    currentPlaybackState: {
      playerState: context.playerState || '',
      currentTrackId: context.currentTrackId || '',
      currentPlaylistId: context.currentPlaylistId || '',
      spotifyPlaybackReady: context.spotifyPlaybackReady === true,
      currentDeviceId: context.currentDeviceId || '',
      currentTrack: getCurrentTrackFromContext(context) || null,
    },
    capabilities: {
      localAudioAvailable: localAudioSummary.length > 0,
      localAudioCount: localAudioSummary.length,
      spotifyConnected,
      spotifyPlaybackReady: context.spotifyPlaybackReady === true,
      currentDeviceId: context.currentDeviceId || '',
    },
    localAudioSummary,
    memoryContext,
    recentConversationSummary: summarizeConversationMessages(conversation),
    recentConversationThreads: summarizeRecentConversationThreads(localUserId),
    recentRecommendationHistory: memoryProfile.recentRecommendations || [],
    memoryProfileSummary: {
      mode: memoryProfile.mode,
      topTracks: (memoryProfile.topTracks || []).slice(0, 5).map((track) => ({
        name: track.name,
        sourceId: track.sourceId || track.source_id || '',
      })),
      topArtists: (memoryProfile.topArtists || []).slice(0, 5).map((artist) => ({
        name: artist.name,
        sourceId: artist.sourceId || artist.source_id || '',
      })),
      likedSourceIds: memoryProfile.likedSourceIds || [],
      avoidSourceIds: memoryProfile.avoidSourceIds || [],
    },
    availableTools: tools.listAvailableTools(),
  }
}

function prefersLocalPlayback(message) {
  return /本地|上传|我上传的|我的音频|m4a|mp3|\blocal\b|\bupload(?:ed)?\b|\bmy audio\b/i.test(
    normalizeMessage(message),
  )
}

function shouldReplyInChinese(message) {
  return /[\u3400-\u9fff]/.test(normalizeMessage(message))
}

function localizePlaybackReply(message, zhText, enText) {
  return shouldReplyInChinese(message) ? zhText : enText
}

function extractPlannerReference(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    return trimmed.slice(2, -2).trim()
  }

  if (trimmed.startsWith('$')) {
    return trimmed.slice(1).trim()
  }

  return ''
}

function splitPlannerReferencePath(reference) {
  return String(reference || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function readPlannerReferenceValue(source, pathSegments = []) {
  let currentValue = source

  for (const segment of pathSegments) {
    if (currentValue == null) {
      return undefined
    }

    if (Array.isArray(currentValue) && /^\d+$/.test(segment)) {
      currentValue = currentValue[Number(segment)]
      continue
    }

    if (typeof currentValue === 'object' && segment in currentValue) {
      currentValue = currentValue[segment]
      continue
    }

    return undefined
  }

  return currentValue
}

function resolvePlannerReference(reference, plannerInput, executedSteps) {
  const extractedReference = extractPlannerReference(reference)

  if (!extractedReference) {
    return undefined
  }

  const pathSegments = splitPlannerReferencePath(extractedReference)

  if (!pathSegments.length) {
    return undefined
  }

  const [rootSegment, ...restSegments] = pathSegments

  if (/^step\d+$/.test(rootSegment)) {
    const stepIndex = Number(rootSegment.slice(4))
    return readPlannerReferenceValue(executedSteps[stepIndex]?.result, restSegments)
  }

  if (rootSegment === 'steps') {
    const [stepIndexSegment, ...nextSegments] = restSegments
    const stepIndex = Number(stepIndexSegment)

    if (!Number.isFinite(stepIndex)) {
      return undefined
    }

    return readPlannerReferenceValue(executedSteps[stepIndex]?.result, nextSegments)
  }

  if (rootSegment === 'plannerInput' || rootSegment === 'context') {
    return readPlannerReferenceValue(plannerInput, restSegments)
  }

  return readPlannerReferenceValue(plannerInput?.[rootSegment], restSegments)
}

function resolvePlannerArgumentValue(value, plannerInput, executedSteps) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      resolvePlannerArgumentValue(item, plannerInput, executedSteps),
    )
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        resolvePlannerArgumentValue(nestedValue, plannerInput, executedSteps),
      ]),
    )
  }

  const resolvedReference = resolvePlannerReference(value, plannerInput, executedSteps)

  return typeof resolvedReference === 'undefined' ? value : resolvedReference
}

function plannerRequestsPlayback(plan = {}) {
  if (
    plan.intent === 'play_music' ||
    plan.intent === 'play_local_audio' ||
    plan.intent === 'play_spotify'
  ) {
    return true
  }

  const plannedTools = Array.isArray(plan.toolPlan) ? plan.toolPlan : []
  const plannedActions = Array.isArray(plan.playerActions) ? plan.playerActions : []

  return (
    plannedTools.some(
      (step) =>
        typeof step?.tool === 'string' &&
        (step.tool.startsWith('player.play_') ||
          step.tool === 'player.replace_queue' ||
          step.tool === 'player.append_queue' ||
          step.tool.startsWith('spotify.play_')),
    ) ||
    plannedActions.some(
      (action) =>
        typeof action?.type === 'string' &&
        (action.type.startsWith('player.play_') ||
          action.type === 'player.replace_queue' ||
          action.type === 'player.append_queue'),
    )
  )
}

function hasSuccessfulDirectPlayback(executedSteps = []) {
  return executedSteps.some(
    (step) =>
      (step.tool === 'spotify.play_uri' || step.tool === 'spotify.play_uris') &&
      step.result?.ok,
  )
}

function buildPlaybackFailureReply({
  message,
  error = null,
  plannerInput,
  noPlayableResult = false,
}) {
  const normalizedError = normalizeMessage(error?.message).toLowerCase()
  const capabilities = plannerInput?.capabilities || {}
  const localPreferred = prefersLocalPlayback(message)

  if (!plannerInput?.isAuthenticated && localPreferred) {
    return localizePlaybackReply(
      message,
      '需要先登录 AgentMusic，才能访问你的本地音频库。',
      'Sign in to AgentMusic first to access your local audio library.',
    )
  }

  if (
    normalizedError.includes('spotify provider is not connected') ||
    (!capabilities.spotifyConnected && !capabilities.localAudioAvailable)
  ) {
    return localizePlaybackReply(
      message,
      '需要先连接 Spotify，或者你可以上传本地音频。',
      'Connect Spotify first, or upload a local audio file.',
    )
  }

  if (
    normalizedError.includes('no available spotify playback device') ||
    (capabilities.spotifyConnected &&
      !capabilities.spotifyPlaybackReady &&
      !capabilities.currentDeviceId)
  ) {
    return localizePlaybackReply(
      message,
      'Spotify 已连接，但播放器还没准备好。请先激活网页播放器或打开其他可用设备。',
      'Spotify is connected, but the playback device is not ready yet. Activate the web player or open another available Spotify device first.',
    )
  }

  if (normalizedError.includes('audio asset not found')) {
    return localizePlaybackReply(
      message,
      '我没有在你的本地音频库里找到匹配歌曲。你可以换个关键词，或者上传新的本地音频。',
      'I could not find a matching track in your local audio library. Try another keyword, or upload a new local audio file.',
    )
  }

  if (noPlayableResult) {
    if (localPreferred) {
      return localizePlaybackReply(
        message,
        capabilities.spotifyConnected
          ? '我没有在你的本地音频库里找到匹配歌曲。你可以换个关键词，或者改用 Spotify 搜索。'
          : '我没有在你的本地音频库里找到匹配歌曲。需要先连接 Spotify，或者你可以上传本地音频。',
        capabilities.spotifyConnected
          ? 'I could not find a matching track in your local audio library. Try another keyword, or switch to Spotify search.'
          : 'I could not find a matching track in your local audio library. Connect Spotify first, or upload a local audio file.',
      )
    }

    return localizePlaybackReply(
      message,
      capabilities.spotifyConnected
        ? '我暂时没有找到合适的可播放结果。你可以换个更具体的歌名、歌手或专辑名。'
        : '我暂时没有找到本地可播放结果。需要先连接 Spotify，或者你可以上传本地音频。',
      capabilities.spotifyConnected
        ? 'I could not find a playable result yet. Try a more specific song, artist, or album name.'
        : 'I could not find a playable local result yet. Connect Spotify first, or upload a local audio file.',
    )
  }

  return localizePlaybackReply(
    message,
    `播放失败：${normalizeMessage(error?.message) || '暂时无法开始播放。'}`,
    `Playback failed: ${normalizeMessage(error?.message) || 'Unable to start playback right now.'}`,
  )
}

function buildPlannerOperationFailureReply({
  message,
  error = null,
  plannerInput,
  planIntent = '',
}) {
  if (planIntent === 'create_playlist') {
    const normalizedError = normalizeMessage(error?.message).toLowerCase()

    if (normalizedError.includes('local user authentication required') || normalizedError.includes('local_user_required')) {
      return buildPlaylistOperationReply({
        message,
        playlistName: '',
        addedCount: 0,
        loginRequired: true,
      })
    }

    if (normalizedError.includes('playlist not found')) {
      return localizePlaybackReply(
        message,
        '我没找到要操作的站内歌单。你可以先让我新建一个歌单。',
        'I could not find that AgentMusic playlist. Ask me to create one first.',
      )
    }

    return localizePlaybackReply(
      message,
      `这次保存歌单失败了：${normalizeMessage(error?.message) || '暂时无法保存。'}`,
      `The playlist save failed: ${normalizeMessage(error?.message) || 'Unable to save right now.'}`,
    )
  }

  return buildPlaybackFailureReply({
    message,
    error,
    plannerInput,
  })
}

function mapPlannerIntentToAssistantIntent(intent) {
  switch (intent) {
    case 'control_player':
      return 'control_player'
    case 'create_playlist':
      return 'create_playlist'
    case 'play_music':
    case 'play_local_audio':
    case 'play_spotify':
      return 'play_music'
    case 'search_music':
    case 'chat':
      return 'search_entity'
    case 'import_spotify_library':
    case 'recommend_music':
    default:
      return 'generate_recommendation'
  }
}

function normalizePlaylistArtifact(playlist = {}) {
  return {
    id: playlist.id || '',
    sourceType: playlist.sourceType || playlist.source_type || 'agentmusic',
    sourceId:
      playlist.sourceId ||
      playlist.source_id ||
      (playlist.id ? `agentmusic:playlist:${playlist.id}` : ''),
    name: playlist.name || playlist.title || 'Playlist',
    image: getPrimaryImage(playlist),
    description: playlist.description || '',
    itemCount:
      playlist.itemCount ??
      playlist.trackCount ??
      playlist.tracks?.total ??
      playlist.items?.length ??
      0,
    owner:
      playlist.owner?.display_name ||
      playlist.owner?.id ||
      playlist.metadata?.spotifyOwnerName ||
      '',
  }
}

function collectTracksFromToolExecution(execution) {
  const { tool, result } = execution

  switch (tool) {
    case 'catalog.get_track':
    case 'spotify.get_track':
    case 'library.get_audio_asset':
      return result ? [result] : []
    case 'catalog.search':
      return result.results?.tracks || []
    case 'spotify.search_tracks':
      return result.items || []
    case 'catalog.get_playlist':
    case 'spotify.get_playlist':
      return (result.tracks || []).map((item) => item.track || item).filter(Boolean)
    case 'catalog.get_recommendations':
    case 'spotify.get_recommendations':
      return result.tracks || []
    case 'library.list_audio_assets':
    case 'library.search_local_audio':
      return result.items || []
    case 'library.add_track_to_playlist':
    case 'library.favorite_track':
      return result.track ? [result.track] : []
    case 'library.list_favorites':
      return Array.isArray(result) ? result : []
    case 'spotify.get_artist_top_tracks':
    case 'spotify.get_user_top_tracks':
    case 'provider.spotify.get_top_tracks':
      return result.items || []
    case 'player.play_local':
    case 'player.play_spotify_uri':
    case 'player.play_spotify_uris':
    case 'player.replace_queue':
    case 'player.append_queue':
      return result.payload?.tracks || []
    case 'recommendation.save_run':
    case 'history.save_recommendation':
      return result.tracks || []
    default:
      return []
  }
}

function collectPlayerActionsFromToolExecution(execution) {
  const { tool, result } = execution

  if (!result?.ok || !result?.type) {
    return []
  }

  switch (tool) {
    case 'player.play_local':
    case 'player.play_spotify_uri':
    case 'player.play_spotify_uris':
    case 'player.replace_queue':
    case 'player.append_queue':
    case 'player.pause':
    case 'player.resume':
    case 'player.next':
    case 'player.previous':
      return [
        {
          type: result.type,
          payload: result.payload || {},
        },
      ]
    default:
      return []
  }
}

function buildPlannerArtifacts({
  plan,
  executedSteps,
  trackArtifacts,
  memoryProfile,
}) {
  const artifacts = {
    planner: {
      intent: plan.intent,
      memoryWriteback: plan.memoryWriteback,
      executedTools: executedSteps.map((step) => step.tool),
    },
  }

  if (trackArtifacts.length > 0) {
    artifacts.tracks = trackArtifacts
  }

  const savedRecommendation = executedSteps.find(
    (step) =>
      step.tool === 'history.save_recommendation' ||
      step.tool === 'recommendation.save_run',
  )?.result

  if (savedRecommendation?.id) {
    artifacts.recommendationId = savedRecommendation.id
    artifacts.recommendationTitle = savedRecommendation.title
    artifacts.seeds = savedRecommendation.seeds || {}
  }

  const trackResult =
    executedSteps.find((step) => step.tool === 'spotify.get_track')?.result ||
    executedSteps.find((step) => step.tool === 'catalog.get_track')?.result ||
    executedSteps.find((step) => step.tool === 'library.get_audio_asset')?.result ||
    executedSteps.find((step) => step.tool === 'library.favorite_track')?.result?.track ||
    executedSteps.find((step) => step.tool === 'library.add_track_to_playlist')?.result?.track ||
    executedSteps.find((step) => step.tool === 'library.search_local_audio')?.result?.items?.[0] ||
    executedSteps.find((step) => step.tool === 'library.list_audio_assets')?.result?.items?.[0]

  if (trackResult) {
    artifacts.track = createTrackArtifact(trackResult)
  }

  const artistResult =
    executedSteps.find((step) => step.tool === 'spotify.get_artist')?.result ||
    executedSteps.find((step) => step.tool === 'catalog.get_artist')?.result ||
    executedSteps.find((step) => step.tool === 'spotify.search_artists')?.result?.items?.[0] ||
    executedSteps.find((step) => step.tool === 'catalog.search')?.result?.results?.artists?.[0]

  if (artistResult) {
    artifacts.artist = mapArtistArtifact(artistResult)
  }

  const albumResult =
    executedSteps.find((step) => step.tool === 'catalog.get_album')?.result ||
    executedSteps.find((step) => step.tool === 'catalog.search')?.result?.results?.albums?.[0]

  if (albumResult) {
    artifacts.album = mapAlbumArtifact(albumResult)
  }

  const playlistResult =
    executedSteps.find((step) => step.tool === 'catalog.get_playlist')?.result ||
    executedSteps.find((step) => step.tool === 'spotify.get_user_playlists')?.result?.items?.[0] ||
    executedSteps.find((step) => step.tool === 'provider.spotify.import_playlist')?.result?.playlist ||
    executedSteps.find((step) => step.tool === 'library.create_playlist')?.result

  if (playlistResult) {
    const addedTrackCount = executedSteps.filter(
      (step) => step.tool === 'library.add_track_to_playlist' && step.result?.track,
    ).length

    artifacts.playlist = {
      ...normalizePlaylistArtifact(playlistResult),
      itemCount: Math.max(
        normalizePlaylistArtifact(playlistResult).itemCount || 0,
        addedTrackCount,
      ),
    }
  }

  const importResult = executedSteps.find((step) =>
    step.tool === 'provider.spotify.import_playlists' ||
    step.tool === 'provider.spotify.import_playlist' ||
    step.tool === 'provider.spotify.sync_saved_tracks',
  )?.result

  if (importResult) {
    artifacts.importResult = importResult
  }

  if (memoryProfile) {
    artifacts.memoryProfile = memoryProfile
  }

  const favoriteResult = executedSteps.find((step) => step.tool === 'library.favorite_track')
    ?.result

  if (favoriteResult?.id) {
    artifacts.favorite = {
      id: favoriteResult.id,
      favoriteType: favoriteResult.favoriteType || 'track',
    }
  }

  return artifacts
}

function filterTracksForPlannerAction(actionType, trackArtifacts = []) {
  if (actionType === 'player.play_local') {
    return trackArtifacts.filter(
      (track) =>
        track.sourceType === 'local_audio' ||
        track.playMode === 'local_audio' ||
        track.playMode === 'local',
    )
  }

  if (
    actionType === 'player.play_spotify' ||
    actionType === 'player.play_spotify_uri' ||
    actionType === 'player.play_spotify_uris'
  ) {
    return trackArtifacts.filter(
      (track) =>
        track.sourceType === 'spotify' ||
        track.playMode === 'spotify_remote' ||
        track.playMode === 'remote' ||
        track.uri?.startsWith?.('spotify:track:'),
    )
  }

  return trackArtifacts
}

function mapPlannerPlayerActions(playerActions = [], trackArtifacts = []) {
  const actions = []

  function buildTrackAction(type, tracks = []) {
    if (!tracks.length) {
      return null
    }

    const startIndex = findFirstPlannerQueueIndex(tracks)

    if (startIndex < 0) {
      return null
    }

    if (type === 'player.play_local' || type === 'player.play_spotify_uri') {
      return {
        type,
        payload: {
          tracks: [tracks[startIndex]],
          startIndex: 0,
        },
      }
    }

    return {
      type,
      payload: {
        tracks,
        startIndex,
      },
    }
  }

  for (const playerAction of playerActions) {
    if (
      playerAction.type === 'player.pause' ||
      playerAction.type === 'player.resume' ||
      playerAction.type === 'player.next' ||
      playerAction.type === 'player.previous'
    ) {
      actions.push({
        type: playerAction.type,
        payload: playerAction.payload || {},
      })
      continue
    }

    if (
      playerAction.type === 'player.play' ||
      playerAction.type === 'player.play_local' ||
      playerAction.type === 'player.play_spotify' ||
      playerAction.type === 'player.play_spotify_uris' ||
      playerAction.type === 'player.play_spotify_uri' ||
      playerAction.type === 'player.replace_queue'
    ) {
      const plannedTracks = filterTracksForPlannerAction(
        playerAction.type,
        trackArtifacts,
      )
      const nextType =
        playerAction.type === 'player.play_spotify'
          ? 'player.play_spotify_uris'
          : playerAction.type === 'player.play'
            ? 'player.replace_queue'
            : playerAction.type
      const nextAction = buildTrackAction(nextType, plannedTracks)

      if (nextAction) {
        actions.push(nextAction)
      }

      continue
    }

    if (playerAction.type === 'player.append_queue') {
      const appendTracks = filterTracksForPlannerAction(
        playerAction.type,
        trackArtifacts,
      )

      if (appendTracks.length > 0) {
        actions.push({
          type: 'player.append_queue',
          payload: {
            tracks: appendTracks,
          },
        })
      }
    }
  }

  return actions
}

async function runDeepSeekPlannedAgent({
  mode,
  localUserId,
  providerLinks,
  localSessionToken,
  message,
  context,
  conversationId,
  conversation,
  tools,
  toolCalls,
}) {
  const memoryProfile = await loadPlannerMemoryProfile({
    mode,
    localUserId,
    providerLinks,
  })
  const plannerInput = buildPlannerInput({
    mode,
    localUserId,
    providerLinks,
    message,
    context,
    conversation,
    memoryProfile,
    tools,
  })
  const plannerResponse = await planAgentWithDeepSeek(plannerInput)

  if (!plannerResponse?.plan) {
    throw new Error('DeepSeek planner returned no plan')
  }

  toolCalls.push({
    name: 'planner.deepseek',
    layer: 'planner',
    args: {
      mode,
      localUserId,
      isSpotifyConnected: Boolean(providerLinks?.spotify?.accessToken),
      capabilities: plannerInput.capabilities,
      availableTools: tools.listAvailableTools(),
    },
    summary: {
      ok: true,
      model: plannerResponse.model || '',
      intent: plannerResponse.plan.intent,
      plannedTools: plannerResponse.plan.toolPlan.map((step) => step.tool),
      plannedPlayerActions: plannerResponse.plan.playerActions.map(
        (action) => action.type,
      ),
    },
  })

  const executedSteps = []

  for (const step of plannerResponse.plan.toolPlan) {
    const resolvedArgs = resolvePlannerArgumentValue(
      step.args,
      plannerInput,
      executedSteps,
    )

    try {
      const result = await tools.run(step.tool, resolvedArgs)
      executedSteps.push({
        tool: step.tool,
        args: resolvedArgs,
        result,
      })
    } catch (error) {
      const trackArtifacts = unique(
        executedSteps
          .flatMap((execution) => collectTracksFromToolExecution(execution))
          .map((track) => createTrackArtifact(track))
          .filter((track) => track.sourceId || track.id),
      ).map((sourceId) =>
        executedSteps
          .flatMap((execution) => collectTracksFromToolExecution(execution))
          .map((track) => createTrackArtifact(track))
          .find((track) => (track.sourceId || track.id) === sourceId),
      )
      const artifacts = buildPlannerArtifacts({
        plan: plannerResponse.plan,
        executedSteps,
        trackArtifacts,
        memoryProfile,
      })

      artifacts.error = {
        message: error.message || 'playback_failed',
        tool: step.tool,
      }

      return {
        reply: buildPlannerOperationFailureReply({
          message,
          error,
          plannerInput,
          planIntent: plannerResponse.plan.intent,
        }),
        intent: mapPlannerIntentToAssistantIntent(plannerResponse.plan.intent),
        actions: [],
        artifacts,
        mode,
        confidence: 0.95,
        toolCalls,
        memoryProfile,
        conversationTitle: buildConversationTitle(message),
      }
    }
  }

  const trackArtifacts = unique(
    executedSteps
      .flatMap((execution) => collectTracksFromToolExecution(execution))
      .map((track) => createTrackArtifact(track))
      .filter((track) => track.sourceId || track.id),
  ).map((sourceId) =>
    executedSteps
      .flatMap((execution) => collectTracksFromToolExecution(execution))
      .map((track) => createTrackArtifact(track))
      .find((track) => (track.sourceId || track.id) === sourceId),
  )

  if (plannerResponse.plan.intent === 'recommend_music' && trackArtifacts.length === 0) {
    const fallbackResult = await handleHybridRecommendation({
      mode,
      message,
      memoryProfile,
      tools,
    })

    return {
      ...fallbackResult,
      mode,
      confidence: 0.93,
      toolCalls,
      memoryProfile,
      conversationTitle: buildConversationTitle(message),
    }
  }

  if (plannerResponse.plan.intent === 'recommend_music' && trackArtifacts.length > 0) {
    const alreadySaved = executedSteps.some(
      (step) =>
        step.tool === 'history.save_recommendation' ||
        step.tool === 'recommendation.save_run',
    )

    if (!alreadySaved) {
      const saveToolName =
        mode === 'guest' ? 'history.save_recommendation' : 'recommendation.save_run'
      const saveArgs = {
        title: buildConversationTitle(message),
        prompt: message,
        description: 'DeepSeek-generated recommendation set from local audio and Spotify.',
        seeds: {
          query: extractRecommendationQuery(message) || message,
          localRequested: wantsLocalRecommendation(message),
          mixedRequested: wantsHybridRecommendation(message),
          spotifyConnected: Boolean(providerLinks?.spotify?.accessToken),
        },
        tracks: trackArtifacts,
      }

      try {
        const savedRecommendation = await tools.run(saveToolName, saveArgs)
        executedSteps.push({
          tool: saveToolName,
          args: saveArgs,
          result: savedRecommendation,
        })
      } catch {
        // Keep the recommendation response usable even if persistence fails.
      }
    }
  }

  const toolDrivenActions = executedSteps.flatMap((execution) =>
    collectPlayerActionsFromToolExecution(execution),
  )
  const plannedActions = mapPlannerPlayerActions(
    plannerResponse.plan.playerActions,
    trackArtifacts,
  )
  let actions = [...toolDrivenActions, ...plannedActions].filter(
    (action, index, collection) =>
      collection.findIndex(
        (candidate) =>
          candidate.type === action.type &&
          JSON.stringify(candidate.payload || {}) ===
            JSON.stringify(action.payload || {}),
      ) === index,
  )

  if (
    plannerResponse.plan.intent === 'recommend_music' &&
    wantsImmediateRecommendationPlayback(message) &&
    actions.length === 0
  ) {
    const startIndex = findFirstPlannerQueueIndex(trackArtifacts)
    const savedRecommendation = executedSteps.find(
      (step) =>
        step.tool === 'history.save_recommendation' ||
        step.tool === 'recommendation.save_run',
    )?.result

    if (startIndex >= 0) {
      actions = [
        {
          type: 'player.replace_queue',
          payload: {
            tracks: trackArtifacts,
            startIndex,
            playlistId: savedRecommendation?.id || '',
            playlistTitle: savedRecommendation?.title || '',
          },
        },
      ]
    }
  }

  const artifacts = buildPlannerArtifacts({
    plan: plannerResponse.plan,
    executedSteps,
    trackArtifacts,
    memoryProfile,
  })

  if (
    plannerRequestsPlayback(plannerResponse.plan) &&
    actions.length === 0 &&
    !hasSuccessfulDirectPlayback(executedSteps)
  ) {
    artifacts.error = {
      message: 'no_playable_result',
    }

    return {
      reply: buildPlaybackFailureReply({
        message,
        plannerInput,
        noPlayableResult: true,
      }),
      intent: mapPlannerIntentToAssistantIntent(plannerResponse.plan.intent),
      actions: [],
      artifacts,
      mode,
      confidence: 0.95,
      toolCalls,
      memoryProfile,
      conversationTitle: buildConversationTitle(message),
    }
  }

  return {
    reply: plannerResponse.plan.reply,
    intent: mapPlannerIntentToAssistantIntent(plannerResponse.plan.intent),
    actions,
    artifacts,
    mode,
    confidence: 0.95,
    toolCalls,
    memoryProfile,
    conversationTitle: buildConversationTitle(message),
  }
}

async function runRuleBasedAgent({
  mode = 'guest',
  localUserId = null,
  localSessionToken = '',
  providerLinks = {},
  message,
  context = {},
  conversationId = '',
  tools = null,
  toolCalls = null,
}) {
  const resolvedToolCalls = toolCalls || []
  const intentResult = classifyIntent(message)
  const resolvedTools =
    tools ||
    createAgentToolRegistry({
      mode,
      localUserId,
      localSessionToken,
      providerLinks,
      toolCalls: resolvedToolCalls,
      conversationId,
    })
  const memoryProfile =
    intentResult.intent === 'control_player'
      ? createEmptyMemoryProfile()
      : mode === 'guest'
        ? createEmptyMemoryProfile()
        : await resolvedTools.run('memory.get_user_profile', {
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
        tools: resolvedTools,
      })
      break
    case 'play_music':
      result = await handleSourceAwarePlayback({
        message,
        localUserId,
        providerLinks,
        context,
        tools: resolvedTools,
      })
      break
    case 'create_playlist':
      result = await handleCreatePlaylist({
        mode,
        localUserId,
        message,
        context,
        providerLinks,
        tools: resolvedTools,
      })
      break
    case 'generate_recommendation':
    default:
      result = await handleHybridRecommendation({
        mode,
        message,
        memoryProfile,
        tools: resolvedTools,
      })
      break
  }

  return {
    ...result,
    mode,
    confidence: intentResult.confidence,
    toolCalls: resolvedToolCalls,
    memoryProfile,
    conversationTitle: buildConversationTitle(message),
  }
}

export async function runAgent({
  mode = 'guest',
  localUserId = null,
  localSessionToken = '',
  providerLinks = {},
  message,
  context = {},
  conversationId = '',
  conversation = null,
}) {
  const toolCalls = []
  const tools = createAgentToolRegistry({
    mode,
    localUserId,
    localSessionToken,
    providerLinks,
    toolCalls,
    conversationId,
  })

  if (isDeepSeekConfigured()) {
    try {
      return await runDeepSeekPlannedAgent({
        mode,
        localUserId,
        providerLinks,
        localSessionToken,
        message,
        context,
        conversationId,
        conversation:
          conversation ||
          (localUserId
            ? getStoredConversation(localUserId, conversationId)
            : getGuestConversation(conversationId)),
        tools,
        toolCalls,
      })
    } catch (error) {
      toolCalls.push({
        name: 'planner.deepseek',
        layer: 'planner',
        args: {
          mode,
          localUserId,
          conversationId,
        },
        summary: {
          ok: false,
          error: error.message || 'deepseek_planner_failed',
        },
      })
    }
  }

  return runRuleBasedAgent({
    mode,
    localUserId,
    localSessionToken,
    providerLinks,
    message,
    context,
    conversationId,
    tools,
    toolCalls,
  })
}

export default {
  runAgent,
}
