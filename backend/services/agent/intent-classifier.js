const controlPatterns = [
  { intent: 'control_player', action: 'next', pattern: /(下一首|下一个|next|skip)/i },
  {
    intent: 'control_player',
    action: 'previous',
    pattern: /(上一首|上一个|prev|previous)/i,
  },
  {
    intent: 'control_player',
    action: 'pause',
    pattern: /(暂停|先停一下|pause|stop)/i,
  },
  {
    intent: 'control_player',
    action: 'resume',
    pattern: /(继续播放|恢复播放|继续|resume|play again)/i,
  },
]

const searchPatterns =
  /(介绍|是什么|谁唱|歌手|专辑|歌曲信息|bio|artist|album|track info|歌词|信息)/i
const playlistPatterns =
  /(新建|创建|建一个|建个|做一个|做个).*(歌单|playlist)|(加入|加到).*(歌单|playlist)|收藏|favorite|saved? track/i
const playPatterns =
  /(播放|放一首|来一首|听一首|play|listen to|播一个)/i
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

  if (playlistPatterns.test(normalized)) {
    return {
      intent: 'create_playlist',
      confidence: 0.9,
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

export default {
  buildConversationTitle,
  classifyIntent,
}
