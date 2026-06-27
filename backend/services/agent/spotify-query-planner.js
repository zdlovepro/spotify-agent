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
    moodToken: 'workout',
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
    moodToken: 'party',
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
    moodToken: 'energy',
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
    moodToken: 'sleep',
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
    moodToken: 'focus',
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
    moodToken: 'chill',
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
    moodToken: 'sad',
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
    moodToken: 'romantic',
  },
]

const GENERIC_QUERY_SET = [
  'pop essentials',
  'indie pop mix',
  'feel good mix',
  'spotify viral hits',
]

const GENRE_QUERY_ALIASES = new Map([
  ['ambient', 'ambient'],
  ['cantopop', 'cantopop'],
  ['chill', 'chill'],
  ['classical', 'classical'],
  ['edm', 'edm'],
  ['electronic', 'electronic'],
  ['happy', 'feel good'],
  ['hip-hop', 'hip hop'],
  ['j-pop', 'j-pop'],
  ['jazz', 'jazz'],
  ['k-pop', 'k-pop'],
  ['party', 'party'],
  ['pop', 'pop'],
  ['rock', 'rock'],
  ['sad', 'sad'],
  ['sleep', 'sleep'],
  ['study', 'focus'],
  ['work-out', 'workout'],
])

const GENRE_NORMALIZATION_RULES = [
  { seed: 'cantopop', pattern: /cantopop|粤语|港乐/i },
  { seed: 'k-pop', pattern: /k-?pop|韩语|korean pop/i },
  { seed: 'j-pop', pattern: /j-?pop|日语|anime/i },
  { seed: 'hip-hop', pattern: /hip[\s-]?hop|rap|说唱|嘻哈/i },
  { seed: 'edm', pattern: /\bedm\b|dance electronic/i },
  { seed: 'electronic', pattern: /electronic|电子|house|techno|synth/i },
  { seed: 'jazz', pattern: /jazz|爵士/i },
  { seed: 'classical', pattern: /classical|古典|orchestra|piano/i },
  { seed: 'rock', pattern: /rock|摇滚|punk|metal/i },
  { seed: 'ambient', pattern: /ambient|氛围|new age|drone/i },
  { seed: 'chill', pattern: /chill|lo[-\s]?fi|mellow|relax/i },
  { seed: 'pop', pattern: /pop|mandopop|c-pop|流行/i },
  { seed: 'party', pattern: /party|dance|club|派对/i },
  { seed: 'sad', pattern: /sad|emo|伤感|heartbreak/i },
  { seed: 'sleep', pattern: /sleep|bedtime|助眠|睡前/i },
  { seed: 'study', pattern: /focus|study|coding|专注|学习/i },
  { seed: 'work-out', pattern: /workout|work[-\s]?out|gym|健身|运动/i },
]

const RECOMMENDATION_PATTERN =
  /推荐|来点|一组|一些|适合|歌单|playlist|songs?|music|picks?|mix/i
const SPECIFIC_ACTION_PATTERN =
  /播放|我想听|听一下|搜索|搜一下|search|play|listen|hear|find/i
const MOOD_FILLER_PATTERN =
  /推荐|来点|来一首|来几首|来一些|给我|帮我|适合|可以听|歌曲|歌单|音乐|please|some|songs?|music|playlist|for me|can you|could you|give me|a few/gi
const SPECIFIC_PREFIX_PATTERN =
  /帮我|给我|播放|我想听|听一下|搜索|搜一下|来一首|来点|听一首|听听|please|play|listen to|listen|hear|search|find/gi
const QUERY_NOISE_PATTERN =
  /风格|类型|这种|这样|时候|一下|一点|一些|的歌|歌曲|歌单|音乐|song|songs|music|playlist|tracks?/gi
const BROAD_CJK_QUERY_PATTERN =
  /女声|男声|华语|粤语|国语|英文|日语|韩语|纯音乐|轻音乐|老歌|新歌|经典|热门|热歌|翻唱|现场|合集|串烧|伤感|放松|学习|专注|睡前|通勤|派对|节奏|氛围/
const QUERY_STOP_WORDS = new Set([
  'spotify',
  'music',
  'playlist',
  'songs',
  'song',
  'tracks',
  'track',
  'mix',
  'hits',
  'vibes',
  'please',
  'some',
  '推荐',
  '来点',
  '歌单',
  '歌曲',
  '音乐',
  '适合',
  '时候',
  '一下',
  '一点',
  '一些',
  '这种',
  '这样',
  '风格',
])

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

function normalizeSearchQuery(query = '') {
  return normalizeMessage(query)
    .replace(/[“”"'`]/g, ' ')
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeSpecificTrackQuery(rawMessage = '') {
  const quotedMatch = normalizeMessage(rawMessage).match(/[“"'《「](.+?)[”"'》」]/)

  if (quotedMatch?.[1]) {
    return normalizeMessage(quotedMatch[1])
  }

  let query = normalizeMessage(rawMessage)
    .replace(/[“”"'`]/g, ' ')
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(SPECIFIC_PREFIX_PATTERN, ' ')
    .replace(MOOD_FILLER_PATTERN, ' ')
    .replace(QUERY_NOISE_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (/^[\u3400-\u9fff]{5,8}$/.test(query)) {
    query = `${query.slice(0, -2)} ${query.slice(-2)}`
  }

  return query.trim()
}

function sanitizeRecommendationQuery(rawMessage = '') {
  return normalizeMessage(rawMessage)
    .replace(/[“”"'`]/g, ' ')
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(SPECIFIC_PREFIX_PATTERN, ' ')
    .replace(MOOD_FILLER_PATTERN, ' ')
    .replace(QUERY_NOISE_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
    .replace(QUERY_NOISE_PATTERN, ' ')
    .replace(/[^\u3400-\u9fffA-Za-z0-9\s&/-]/g, ' ')
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

function extractQueryKeywords(text = '') {
  const baseText =
    stripMoodLanguage(text) ||
    sanitizeRecommendationQuery(text) ||
    normalizeSearchQuery(text)

  if (!baseText) {
    return []
  }

  const normalized = baseText
    .replace(/[的呢吧呀啊哦]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const cjkKeywords = normalized.match(/[\u3400-\u9fff]{2,12}/g) || []
  const latinKeywords =
    normalized.toLowerCase().match(/[a-z0-9][a-z0-9&'/-]{1,}/g) || []

  return unique(
    [...cjkKeywords, ...latinKeywords]
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword && !QUERY_STOP_WORDS.has(keyword.toLowerCase())),
  )
}

function isReasonableSearchQuery(query = '') {
  const normalized = sanitizeRecommendationQuery(query) || normalizeSearchQuery(query)

  if (!normalized) {
    return false
  }

  if (normalized.length > 48) {
    return false
  }

  const latinTokenCount = (
    normalized.toLowerCase().match(/[a-z0-9][a-z0-9&'/-]{1,}/g) || []
  ).length

  if (latinTokenCount > 8) {
    return false
  }

  return extractQueryKeywords(normalized).length > 0
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
    !/[“"'《「]/.test(normalized)
  ) {
    return false
  }

  const sanitizedQuery = sanitizeSpecificTrackQuery(normalized)

  if (!sanitizedQuery) {
    return false
  }

  const tokenCount = sanitizedQuery.split(/\s+/).filter(Boolean).length
  const cjkCharacters = sanitizedQuery.match(/[\u3400-\u9fff]/g) || []

  if (RECOMMENDATION_PATTERN.test(normalized) && getMatchedMoodKeywords(normalized).length > 0) {
    return false
  }

  if (SPECIFIC_ACTION_PATTERN.test(normalized) && tokenCount <= 6) {
    return true
  }

  if (cjkCharacters.length > 0) {
    return (
      cjkCharacters.length <= 6 &&
      tokenCount <= 2 &&
      !BROAD_CJK_QUERY_PATTERN.test(sanitizedQuery)
    )
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

  if (!isReasonableSearchQuery(normalizedQuery)) {
    return false
  }

  const keywordCount = extractQueryKeywords(normalizedQuery).length

  if (keywordCount === 0) {
    return false
  }

  if (RECOMMENDATION_PATTERN.test(normalizedQuery) || RECOMMENDATION_PATTERN.test(message)) {
    return keywordCount > 0
  }

  return true
}

function getArtistName(value) {
  if (typeof value === 'string') {
    return normalizeMessage(value)
  }

  if (value?.name) {
    return normalizeMessage(value.name)
  }

  return ''
}

function normalizeGenreSeed(value = '') {
  const normalized = normalizeMessage(value)

  if (!normalized) {
    return ''
  }

  for (const rule of GENRE_NORMALIZATION_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.seed
    }
  }

  const directKey = normalizeToken(normalized)

  if (GENRE_QUERY_ALIASES.has(directKey)) {
    return directKey
  }

  return ''
}

function extractGenresFromArtists(artists = []) {
  const genreSeeds = []

  for (const artist of Array.isArray(artists) ? artists : []) {
    for (const genre of Array.isArray(artist?.genres) ? artist.genres : []) {
      const seed = normalizeGenreSeed(genre)

      if (seed) {
        genreSeeds.push(seed)
      }
    }
  }

  return unique(genreSeeds)
}

function resolvePreferredGenreSeeds(options = {}) {
  const explicitGenres = Array.isArray(options.explicitGenres) ? options.explicitGenres : []
  const memoryProfile = options.memoryProfile || {}
  const optionArtists = Array.isArray(options.topArtists) ? options.topArtists : []
  const memoryArtists = Array.isArray(memoryProfile.topArtists) ? memoryProfile.topArtists : []
  const derivedFromArtists = extractGenresFromArtists([...optionArtists, ...memoryArtists])

  return unique(
    [
      ...explicitGenres,
      ...derivedFromArtists,
      ...(Array.isArray(memoryProfile.topGenres) ? memoryProfile.topGenres : []),
      ...(Array.isArray(memoryProfile.defaultGenres) ? memoryProfile.defaultGenres : []),
      ...(Array.isArray(memoryProfile.publicSeeds?.genres) ? memoryProfile.publicSeeds.genres : []),
    ]
      .map((seed) => normalizeGenreSeed(seed) || normalizeToken(seed))
      .filter(Boolean),
  )
}

function resolveGenreQuery(seed = '') {
  return GENRE_QUERY_ALIASES.get(normalizeToken(seed)) || normalizeMessage(seed)
}

function pushQuery(queries, query) {
  const normalized = normalizeSearchQuery(query)

  if (normalized) {
    queries.push(normalized)
  }
}

function buildMoodQueries(preset, preferredGenreSeeds = []) {
  const queries = []
  const moodToken = preset?.moodToken || ''

  for (const genreSeed of preferredGenreSeeds.slice(0, 2)) {
    const genreQuery = resolveGenreQuery(genreSeed)

    if (!genreQuery || !moodToken) {
      continue
    }

    if (normalizeToken(genreQuery) === normalizeToken(moodToken)) {
      continue
    }

    pushQuery(queries, `${genreQuery} ${moodToken}`)
  }

  for (const query of preset?.queries || []) {
    pushQuery(queries, query)
  }

  return queries
}

function buildFallbackQueries(preferredGenreSeeds = []) {
  const queries = []
  const primaryGenre = resolveGenreQuery(preferredGenreSeeds[0] || '')

  if (primaryGenre) {
    pushQuery(queries, `${primaryGenre} mix`)
    pushQuery(queries, `${primaryGenre} essentials`)
  }

  for (const query of GENERIC_QUERY_SET) {
    pushQuery(queries, query)
  }

  return queries
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
  const preferredGenreSeeds = resolvePreferredGenreSeeds(options)
  const explicitGenreSeeds = unique(
    (Array.isArray(options.explicitGenres) ? options.explicitGenres : [])
      .map((seed) => normalizeGenreSeed(seed) || normalizeToken(seed))
      .filter(Boolean),
  )
  const supportingGenreSeeds = explicitGenreSeeds.length
    ? explicitGenreSeeds
    : preferredGenreSeeds.filter((seed) => seed !== 'pop')
  const preservedRawQuery = shouldPreserveRawQuery(rawQuery, originalMessage)
    ? sanitizeRecommendationQuery(rawQuery)
    : ''
  const queries = []

  if (preservedRawQuery) {
    pushQuery(queries, preservedRawQuery)
  }

  if (preset) {
    for (const query of buildMoodQueries(preset, supportingGenreSeeds)) {
      pushQuery(queries, query)
    }
  } else if (preservedRawQuery) {
    for (const genreSeed of supportingGenreSeeds.slice(0, 2)) {
      pushQuery(queries, `${preservedRawQuery} ${resolveGenreQuery(genreSeed)}`)
    }
  }

  if (!preservedRawQuery || queries.length < 3) {
    for (const query of buildFallbackQueries(preferredGenreSeeds)) {
      pushQuery(queries, query)
    }
  }

  return {
    mood: preset?.mood || 'generic',
    queries: unique(queries).slice(0, 5),
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

function buildTrackText(track = {}) {
  return normalizeToken(
    [
      normalizeMessage(track.name),
      ...normalizeTrackArtists(track.artists),
      normalizeMessage(track.album),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function hasLiteralMoodTitlePenalty(track = {}, avoidLiteralTerms = []) {
  const normalizedName = normalizeToken(track.name)

  return avoidLiteralTerms.some((term) =>
    normalizedName.includes(normalizeToken(term)),
  )
}

function buildPreferredArtistWeights(options = {}) {
  const memoryArtists = Array.isArray(options.memoryProfile?.topArtists)
    ? options.memoryProfile.topArtists
    : []
  const preferredArtists = Array.isArray(options.preferredArtists) ? options.preferredArtists : []
  const weightMap = new Map()
  let weight = 12

  for (const entry of [...preferredArtists, ...memoryArtists]) {
    const artistName = getArtistName(entry)
    const artistKey = normalizeToken(artistName)

    if (!artistKey || weightMap.has(artistKey)) {
      continue
    }

    weightMap.set(artistKey, weight)
    weight = Math.max(5, weight - 2)
  }

  return weightMap
}

function buildPreferredTrackKeys(memoryProfile = {}) {
  return new Set(
    [
      ...(Array.isArray(memoryProfile.likedSourceIds) ? memoryProfile.likedSourceIds : []),
      ...(Array.isArray(memoryProfile.topTracks) ? memoryProfile.topTracks : []).map(
        (track) => track.sourceId || track.source_id || track.id || '',
      ),
    ].filter(Boolean),
  )
}

function computeQueryMatchScore(track = {}, requestKeywords = []) {
  if (!requestKeywords.length) {
    return 0
  }

  const trackText = buildTrackText(track)

  if (!trackText) {
    return 0
  }

  let matchedCount = 0
  let score = 0

  for (const keyword of requestKeywords) {
    const normalizedKeyword = normalizeToken(keyword)

    if (!normalizedKeyword || !trackText.includes(normalizedKeyword)) {
      continue
    }

    matchedCount += 1
    score += /[\u3400-\u9fff]/.test(normalizedKeyword)
      ? 12
      : normalizedKeyword.length >= 4
        ? 10
        : 7
  }

  if (matchedCount > 1 && matchedCount === requestKeywords.length) {
    score += 8
  }

  return Math.min(score, 42)
}

function computeMatchedQueryScore(track = {}, requestKeywords = [], rawQuery = '') {
  const matchedQuery = normalizeToken(track.matchedQuery)

  if (!matchedQuery) {
    return 0
  }

  const normalizedRawQuery = normalizeToken(normalizeSearchQuery(rawQuery))

  if (normalizedRawQuery && matchedQuery === normalizedRawQuery) {
    return 18
  }

  const matchedKeywordCount = requestKeywords.filter((keyword) =>
    matchedQuery.includes(normalizeToken(keyword)),
  ).length

  if (matchedKeywordCount === 0) {
    return 0
  }

  return Math.min(16, 4 + matchedKeywordCount * 4)
}

function computeArtistAffinityScore(track = {}, preferredArtistWeights = new Map()) {
  let score = 0

  for (const artist of normalizeTrackArtists(track.artists)) {
    const artistKey = normalizeToken(artist)

    if (!artistKey) {
      continue
    }

    score += preferredArtistWeights.get(artistKey) || 0
  }

  return Math.min(score, 18)
}

function computeTrackAffinityScore(track = {}, preferredTrackKeys = new Set()) {
  const key = track.sourceId || track.id || ''

  if (!key || !preferredTrackKeys.has(key)) {
    return 0
  }

  return 18
}

function computeSpotifyTrackScore(track = {}, options = {}) {
  const mood = options.mood || 'generic'
  const avoidLiteralTerms = Array.isArray(options.avoidLiteralTerms)
    ? options.avoidLiteralTerms
    : []
  const requestKeywords = Array.isArray(options.requestKeywords)
    ? options.requestKeywords
    : []
  const preferredArtistWeights = options.preferredArtistWeights instanceof Map
    ? options.preferredArtistWeights
    : new Map()
  const preferredTrackKeys = options.preferredTrackKeys instanceof Set
    ? options.preferredTrackKeys
    : new Set()
  const popularity =
    Number.isFinite(Number(track.popularity)) && Number(track.popularity) >= 0
      ? Number(track.popularity)
      : 0
  let score = popularity * 0.32

  if (normalizeTrackArtists(track.artists).length > 0) {
    score += 12
  }

  if (normalizeMessage(track.image)) {
    score += 6
  }

  if (normalizeMessage(track.uri).startsWith('spotify:track:')) {
    score += 18
  }

  if (Number.isFinite(Number(track.resultIndex))) {
    score += Math.max(0, 6 - Number(track.resultIndex))
  }

  if (Number.isFinite(Number(track.queryIndex))) {
    score += Math.max(0, 4 - Number(track.queryIndex))
  }

  score += computeQueryMatchScore(track, requestKeywords)
  score += computeMatchedQueryScore(track, requestKeywords, options.rawQuery)
  score += computeArtistAffinityScore(track, preferredArtistWeights)
  score += computeTrackAffinityScore(track, preferredTrackKeys)

  if (mood !== 'generic' && hasLiteralMoodTitlePenalty(track, avoidLiteralTerms)) {
    score -= 24
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
  const requestKeywords = extractQueryKeywords(
    options.rawQuery ||
      options.requestMessage ||
      options.originalMessage ||
      '',
  )
  const preferredArtistWeights = buildPreferredArtistWeights({
    preferredArtists: options.preferredArtists || options.topArtists || [],
    memoryProfile: options.memoryProfile || {},
  })
  const preferredTrackKeys = buildPreferredTrackKeys(options.memoryProfile || {})
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
        rawQuery: options.rawQuery || '',
        requestKeywords,
        preferredArtistWeights,
        preferredTrackKeys,
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
  const queryEntries = [...groupedCandidates.entries()].sort(
    (left, right) =>
      (right[1][0]?.__score || 0) - (left[1][0]?.__score || 0),
  )

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
