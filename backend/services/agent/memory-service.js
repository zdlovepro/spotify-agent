import {
  getUserTopItems,
  parseInteger,
} from '../spotify-api.js'
import { listAgentFeedback } from '../agent-feedback-store.js'
import { listRecommendationHistory } from '../recommendation-history-store.js'

function mapSimpleTrack(track) {
  return {
    id: track.id,
    name: track.name,
    artists: (track.artists || []).map((artist) => artist.name),
    popularity: track.popularity,
  }
}

function mapSimpleArtist(artist) {
  return {
    id: artist.id,
    name: artist.name,
    genres: artist.genres || [],
    popularity: artist.popularity,
  }
}

export async function buildUserTasteProfile({
  accessToken,
  userId,
  recommendationLimit = 5,
  topLimit = 5,
  feedbackLimit = 5,
}) {
  const safeTopLimit = parseInteger(topLimit, 5, { min: 1, max: 10 })
  const safeHistoryLimit = parseInteger(recommendationLimit, 5, {
    min: 1,
    max: 10,
  })
  const safeFeedbackLimit = parseInteger(feedbackLimit, 5, {
    min: 1,
    max: 10,
  })

  const [
    topTracks,
    topArtists,
    recentRecommendationHistory,
    recentFeedback,
  ] = await Promise.all([
    getUserTopItems(accessToken, 'tracks', {
      time_range: 'medium_term',
      limit: safeTopLimit,
      offset: 0,
    }),
    getUserTopItems(accessToken, 'artists', {
      time_range: 'medium_term',
      limit: safeTopLimit,
      offset: 0,
    }),
    listRecommendationHistory(userId, safeHistoryLimit),
    listAgentFeedback(userId, safeFeedbackLimit),
  ])

  return {
    topTracks: (topTracks.items || []).map(mapSimpleTrack),
    topArtists: (topArtists.items || []).map(mapSimpleArtist),
    recentRecommendations: recentRecommendationHistory.map((entry) => ({
      id: entry.id,
      title: entry.title,
      prompt: entry.prompt,
      seeds: entry.seeds,
      createdAt: entry.createdAt,
    })),
    recentFeedback: recentFeedback.map((entry) => ({
      id: entry.id,
      feedback: entry.feedback,
      recommendationId: entry.recommendationId,
      messageId: entry.messageId,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
  }
}
