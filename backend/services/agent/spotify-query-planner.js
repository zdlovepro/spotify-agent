const MOOD_QUERY_PRESETS = [
  {
    mood: 'workout',
    keywords: ['健身', '运动', '跑步', 'gym', 'workout', 'running'],
    queries: [
      'workout energy',
      'gym motivation',
      'pump up cardio',
      'power training hits',
    ],
    titleZh: '运动 Spotify 推荐',
    titleEn: 'Workout Spotify Picks',
  },
  {
    mood: 'party',
    keywords: ['派对', '聚会', '跳舞', '蹦迪', 'party', 'dance', 'club'],
    queries: [
      'party dance',
      'dance pop hits',
      'edm party',
      'club hits',
    ],
    titleZh: '派对 Spotify 推荐',
    titleEn: 'Party Spotify Picks',
  },
  {
    mood: 'energy',
    keywords: [
      '激情',
      '热血',
      '燃',
      '高能',
      '带劲',
      '嗨一点',
      '劲爆',
      '提神',
      'high energy',
      'pump up',
      'hype',
      'energetic',
    ],
    queries: [
      'high energy pop',
      'workout energy',
      'pump up rock',
      'edm party',
      'motivational hip hop',
    ],
    titleZh: '高能量 Spotify 推荐',
    titleEn: 'Pump-up Spotify Picks',
  },
  {
    mood: 'sleep',
    keywords: ['睡觉', '睡前', '助眠', '安静', 'sleep', 'bedtime', 'calm night'],
    queries: [
      'sleep ambient',
      'calm piano',
      'relaxing sleep',
      'peaceful acoustic',
    ],
    titleZh: '睡前 Spotify 推荐',
    titleEn: 'Sleep Spotify Picks',
  },
  {
    mood: 'focus',
    keywords: ['学习', '写代码', '专注', '工作', 'coding', 'focus', 'study', 'work'],
    queries: [
      'focus coding instrumental',
      'deep focus electronic',
      'lo-fi study',
      'instrumental concentration',
    ],
    titleZh: '专注 Spotify 推荐',
    titleEn: 'Focus Spotify Picks',
  },
  {
    mood: 'chill',
    keywords: ['放松', '轻松', 'chill', 'relax', 'relaxing', 'mellow'],
    queries: [
      'chill pop',
      'relaxing acoustic',
      'chill vibes',
      'mellow evening',
    ],
    titleZh: '放松 Spotify 推荐',
    titleEn: 'Chill Spotify Picks',
  },
  {
    mood: 'sad',
    keywords: ['伤感', '失恋', 'emo', '难过', 'sad', 'heartbreak', 'melancholy'],
    queries: [
      'sad pop',
      'heartbreak ballads',
      'emotional acoustic',
      'mellow sad songs',
    ],
    titleZh: '伤感 Spotify 推荐',
    titleEn: 'Sad Spotify Picks',
  },
  {
    mood: 'romantic',
    keywords: ['浪漫', '约会', 'romantic', 'date night', 'love songs'],
    queries: [
      'romantic pop',
      'love songs acoustic',
      'date night vibes',
      'romantic r&b',
    ],
    titleZh: '浪漫 Spotify 推荐',
    titleEn: 'Romantic Spotify Picks',
  },
]

const GENERIC_QUERY_SET = [
  'pop essentials',
  'indie pop mix',
  'feel good mix',
  'spotify viral hits',
]

const RECOMMENDATION_PATTERN =
  /推荐|来点|一组|一些|适合|歌单|playlist|songs?|music|picks?|mix/i
const SPECIFIC_ACTION_PATTERN =
  /播放|我想听|想听|搜索|搜一下|搜一首|search|play|listen|hear/i
const MOOD_FILLER_PATTERN =
  /推荐|来点|来一首|来几首|来一些|来一组|给我|帮我|适合|一点|一下|可以吗|好吗|歌曲|歌单|音乐|歌|please|some|songs?|music|playlist|for me|can you|could you|give me|a few/gi
const SPECIFIC_PREFIX_PATTERN =
  /帮我|给我|播放|我想听|想听|搜索|搜一下|搜一首|来一首|来点|听一下|听听|please|play|listen to|listen|hear|search|find/gi

function normalizeMessage(message) {
  return String(message || '').trim()
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))]
}

function normalizeToken(value) {
  return normalizeMessage(value).toLowerCase()
}

function normalizeTrackArtists(artists = []) {
  if (!Array.isArray(artists)) {
    return []
  }

  return artists
    .map((artist) => normalizeMessage(artist))
    .filter(Boolean)
}

function sanitizeSpecificTrackQuery(rawMessage = '') {
  const quotedMatch = normalizeMessage(rawMessage).match(/[“"'《](.+?)[”"'》]/)

  if (quotedMatch?.[1]) {
    return normalizeMessage(quotedMatch[1])
  }

  let query = normalizeMessage(rawMessage)
    .replace(/[“”"']/g, ' ')
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(SPECIFIC_PREFIX_PATTERN, ' ')
    .replace(
      /推荐|来点|来一组|来一些|适合|一点|一下|可以吗|好吗|歌曲|歌单|音乐|的歌|听的歌/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()

  if (/^[\u3400-\u9fff]{5,8}$/.test(query)) {
    query = `${query.slice(0, -2)} ${query.slice(-2)}`
  }

  return query.trim()
}

function getMatchedMoodPreset(message = '') {
  const normalized = normalizeToken(message)

  return (
    MOOD_QUERY_PRESETS.find((preset) =>
      preset.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
    ) || null
  )
}

function getMatchedMoodKeywords(message = '') {
  const normalized = normalizeToken(message)
  const preset = getMatchedMoodPreset(message)

  if (!preset) {
    return []
  }

  return unique(
    preset.keywords.filter((keyword) =>
      normalized.includes(keyword.toLowerCase()),
    ),
  )
}

function stripMoodLanguage(text = '') {
  let remainder = normalizeToken(text)

  for (const preset of MOOD_QUERY_PRESETS) {
    for (const keyword of preset.keywords) {
      remainder = remainder.replaceAll(keyword.toLowerCase(), ' ')
    }
  }

  return remainder
    .replace(MOOD_FILLER_PATTERN, ' ')
    .replace(/[^\u3400-\u9fffA-Za-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isPureMoodRequest(message = '') {
  const normalized = normalizeMessage(message)

  if (!normalized) {
    return false
  }

  const matchedMoodKeywords = getMatchedMoodKeywords(normalized)

  if (!matchedMoodKeywords.length) {
    return false
  }

  return stripMoodLanguage(normalized).length === 0
}

function isReasonableEnglishSearchQuery(query = '') {
  const normalized = normalizeMessage(query)

  if (!normalized) {
    return false
  }

  if (/[\u3400-\u9fff]/.test(normalized)) {
    return false
  }

  if (normalized.split(/\s+/).length > 6) {
    return false
  }

  return !RECOMMENDATION_PATTERN.test(normalized)
}

export function isSpecificTrackSearch(message = '') {
  const normalized = normalizeMessage(message)

  if (!normalized) {
    return false
  }

  if (isPureMoodRequest(normalized)) {
    return false
  }

  if (
    getMatchedMoodPreset(normalized) &&
    !SPECIFIC_ACTION_PATTERN.test(normalized) &&
    !/[“"'《》]/.test(normalized)
  ) {
    return false
  }

  const sanitizedQuery = sanitizeSpecificTrackQuery(normalized)

  if (!sanitizedQuery) {
    return false
  }

  const tokenCount = sanitizedQuery.split(/\s+/).filter(Boolean).length

  if (RECOMMENDATION_PATTERN.test(normalized) && getMatchedMoodKeywords(normalized).length > 0) {
    return false
  }

  if (SPECIFIC_ACTION_PATTERN.test(normalized) && tokenCount <= 6) {
    return true
  }

  return tokenCount <= 4 && !RECOMMENDATION_PATTERN.test(normalized)
}

function shouldPreserveRawQuery(rawQuery = '', message = '') {
  const normalizedQuery = normalizeMessage(rawQuery)

  if (!normalizedQuery) {
    return false
  }

  if (isPureMoodRequest(normalizedQuery)) {
    return false
  }

  if (getMatchedMoodPreset(normalizedQuery) && !isReasonableEnglishSearchQuery(normalizedQuery)) {
    return false
  }

  if (RECOMMENDATION_PATTERN.test(normalizedQuery) || RECOMMENDATION_PATTERN.test(message)) {
    return isReasonableEnglishSearchQuery(normalizedQuery)
  }

  return isReasonableEnglishSearchQuery(normalizedQuery)
}

export function buildSpotifySearchQueries(message = '', options = {}) {
  const originalMessage = normalizeMessage(message)
  const rawQuery = normalizeMessage(options.rawQuery || '')
  const preferredLanguage = normalizeMessage(options.preferredLanguage || '')
  const referenceText = rawQuery || originalMessage
  const specificSearch =
    isSpecificTrackSearch(originalMessage) ||
    (rawQuery ? isSpecificTrackSearch(rawQuery) : false)

  if (specificSearch) {
    const specificQuery =
      sanitizeSpecificTrackQuery(rawQuery) ||
      sanitizeSpecificTrackQuery(originalMessage)

    return {
      mood: 'generic',
      queries: specificQuery ? [specificQuery] : [],
      avoidLiteralTerms: [],
      isSpecificTrackSearch: true,
      preferredLanguage,
    }
  }

  const preset = getMatchedMoodPreset(referenceText) || getMatchedMoodPreset(originalMessage)
  const matchedMoodKeywords = getMatchedMoodKeywords(referenceText || originalMessage)
  const baseQueries = preset ? preset.queries : GENERIC_QUERY_SET
  const queries = shouldPreserveRawQuery(rawQuery, originalMessage)
    ? unique([rawQuery, ...baseQueries]).slice(0, 5)
    : baseQueries.slice(0, 5)

  return {
    mood: preset?.mood || 'generic',
    queries,
    avoidLiteralTerms: matchedMoodKeywords,
    isSpecificTrackSearch: false,
    preferredLanguage,
  }
}

function buildTrackKey(track = {}) {
  return normalizeToken(track.uri || track.sourceId || track.id)
}

function buildTrackNameKey(track = {}) {
  return normalizeToken(track.name)
}

function buildTrackNameArtistKey(track = {}) {
  return `${buildTrackNameKey(track)}::${normalizeTrackArtists(track.artists).join('|').toLowerCase()}`
}

function getPrimaryArtistKey(track = {}) {
  return normalizeToken(normalizeTrackArtists(track.artists)[0] || '')
}

function hasLiteralMoodTitlePenalty(track = {}, avoidLiteralTerms = []) {
  const normalizedName = normalizeToken(track.name)

  return avoidLiteralTerms.some((term) =>
    normalizedName.includes(normalizeToken(term)),
  )
}

function computeSpotifyTrackScore(track = {}, options = {}) {
  const mood = options.mood || 'generic'
  const avoidLiteralTerms = Array.isArray(options.avoidLiteralTerms)
    ? options.avoidLiteralTerms
    : []
  const popularity =
    Number.isFinite(Number(track.popularity)) && Number(track.popularity) >= 0
      ? Number(track.popularity)
      : 0
  let score = popularity

  if (normalizeTrackArtists(track.artists).length > 0) {
    score += 18
  }

  if (normalizeMessage(track.image)) {
    score += 12
  }

  if (normalizeMessage(track.uri).startsWith('spotify:track:')) {
    score += 30
  }

  if (Number.isFinite(Number(track.resultIndex))) {
    score += Math.max(0, 10 - Number(track.resultIndex))
  }

  if (Number.isFinite(Number(track.queryIndex))) {
    score += Math.max(0, 6 - Number(track.queryIndex))
  }

  if (normalizeMessage(track.matchedQuery)) {
    score += 4
  }

  if (mood !== 'generic' && hasLiteralMoodTitlePenalty(track, avoidLiteralTerms)) {
    score -= 45
  }

  if (!normalizeTrackArtists(track.artists).length) {
    score -= 20
  }

  if (!normalizeMessage(track.name)) {
    score -= 100
  }

  return score
}

function isValidSpotifyTrack(track = {}) {
  return (
    normalizeMessage(track.name) &&
    normalizeTrackArtists(track.artists).length > 0 &&
    track.sourceType === 'spotify' &&
    normalizeMessage(track.uri).startsWith('spotify:track:') &&
    track.playMode === 'spotify_remote'
  )
}

export function selectDiverseSpotifyTracks(tracks = [], options = {}) {
  const mood = options.mood || 'generic'
  const avoidLiteralTerms = Array.isArray(options.avoidLiteralTerms)
    ? options.avoidLiteralTerms
    : []
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
    ? Number(options.limit)
    : 8
  const specificSearch = options.specificSearch === true

  const groupedCandidates = new Map()

  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!isValidSpotifyTrack(track)) {
      continue
    }

    if (
      !specificSearch &&
      mood !== 'generic' &&
      hasLiteralMoodTitlePenalty(track, avoidLiteralTerms)
    ) {
      continue
    }

    const queryKey = normalizeMessage(track.matchedQuery || '__default__')
    const candidate = {
      ...track,
      __score: computeSpotifyTrackScore(track, {
        mood,
        avoidLiteralTerms,
      }),
    }

    if (!groupedCandidates.has(queryKey)) {
      groupedCandidates.set(queryKey, [])
    }

    groupedCandidates.get(queryKey).push(candidate)
  }

  for (const queue of groupedCandidates.values()) {
    queue.sort((left, right) => right.__score - left.__score)
  }

  const selectedTracks = []
  const seenIds = new Set()
  const seenNameArtist = new Set()
  const artistCounts = new Map()
  const nameCounts = new Map()
  const queryEntries = [...groupedCandidates.entries()]

  while (
    selectedTracks.length < limit &&
    queryEntries.some(([, queue]) => queue.length > 0)
  ) {
    for (const [, queue] of queryEntries) {
      while (queue.length > 0 && selectedTracks.length < limit) {
        const candidate = queue.shift()
        const idKey = buildTrackKey(candidate)
        const nameArtistKey = buildTrackNameArtistKey(candidate)
        const artistKey = getPrimaryArtistKey(candidate)
        const nameKey = buildTrackNameKey(candidate)

        if (!idKey || seenIds.has(idKey) || seenNameArtist.has(nameArtistKey)) {
          continue
        }

        if (artistKey && (artistCounts.get(artistKey) || 0) >= 2) {
          continue
        }

        if (nameKey && (nameCounts.get(nameKey) || 0) >= 2) {
          continue
        }

        seenIds.add(idKey)
        seenNameArtist.add(nameArtistKey)

        if (artistKey) {
          artistCounts.set(artistKey, (artistCounts.get(artistKey) || 0) + 1)
        }

        if (nameKey) {
          nameCounts.set(nameKey, (nameCounts.get(nameKey) || 0) + 1)
        }

        selectedTracks.push({
          ...candidate,
          __score: undefined,
        })
        break
      }
    }
  }

  return selectedTracks.map((track) => {
    const { __score, ...rest } = track
    return rest
  })
}

export function buildSpotifyRecommendationTitle(mood = 'generic', preferredLanguage = '') {
  const preset = MOOD_QUERY_PRESETS.find((item) => item.mood === mood)
  const wantsChinese = /zh|cn|中文|汉语|汉字/i.test(preferredLanguage)

  if (!preset) {
    return wantsChinese ? 'Spotify 推荐' : 'Spotify Recommendation'
  }

  return wantsChinese ? preset.titleZh : preset.titleEn
}

export default {
  buildSpotifySearchQueries,
  buildSpotifyRecommendationTitle,
  isSpecificTrackSearch,
  selectDiverseSpotifyTracks,
}
