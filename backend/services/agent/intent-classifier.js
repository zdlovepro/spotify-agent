const controlPatterns = [
  { intent: 'control_player', action: 'next', pattern: /(下一首|next|skip)/i },
  {
    intent: 'control_player',
    action: 'previous',
    pattern: /(上一首|prev|previous)/i,
  },
  {
    intent: 'control_player',
    action: 'pause',
    pattern: /(暂停|pause|先停一下)/i,
  },
  {
    intent: 'control_player',
    action: 'resume',
    pattern: /(继续播放|恢复播放|继续|resume)/i,
  },
]

const searchPatterns =
  /(介绍|是谁|谁唱|歌手|专辑|歌曲信息|bio|artist|album|track info|歌词)/i
const playPatterns =
  /(播放|放一下|放一首|来一首|听一下|play|listen to|播一下)/i
const recommendPatterns =
  /(推荐|来点|适合|随机|歌单|想听|类似|风格|mood|recommend|discover)/i

function normalizeText(message) {
  return String(message || '').trim()
}

export function buildConversationTitle(message) {
  const normalized = normalizeText(message)

  if (!normalized) {
    return 'New Conversation'
  }

  return normalized.slice(0, 24)
}

export function classifyIntent(message) {
  const normalized = normalizeText(message)

  for (const rule of controlPatterns) {
    if (rule.pattern.test(normalized)) {
      return {
        intent: rule.intent,
        confidence: 0.98,
        controlAction: rule.action,
      }
    }
  }

  if (searchPatterns.test(normalized)) {
    return {
      intent: 'search_entity',
      confidence: 0.84,
    }
  }

  if (playPatterns.test(normalized)) {
    return {
      intent: 'play_music',
      confidence: 0.88,
    }
  }

  if (recommendPatterns.test(normalized)) {
    return {
      intent: 'generate_recommendation',
      confidence: 0.86,
    }
  }

  return {
    intent: 'generate_recommendation',
    confidence: 0.5,
  }
}
