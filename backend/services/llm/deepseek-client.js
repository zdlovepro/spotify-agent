import OpenAI from 'openai'
import env from '../../config/env.js'

let cachedClient = null

function getDeepSeekBaseUrl() {
  return process.env.DEEPSEEK_BASE_URL || env.deepSeekBaseUrl || 'https://api.deepseek.com'
}

function getDeepSeekModel() {
  return process.env.DEEPSEEK_MODEL || env.deepSeekModel || 'deepseek-v4-pro'
}

function getDeepSeekApiKey() {
  return process.env.DEEPSEEK_API_KEY || env.deepSeekApiKey || ''
}

function getDeepSeekClient() {
  if (!isDeepSeekConfigured()) {
    return null
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      baseURL: getDeepSeekBaseUrl(),
      apiKey: getDeepSeekApiKey(),
    })
  }

  return cachedClient
}

export function isDeepSeekConfigured() {
  return Boolean(getDeepSeekApiKey())
}

export async function createDeepSeekChatCompletion(messages, options = {}) {
  if (!isDeepSeekConfigured()) {
    const error = new Error('DeepSeek API key is not configured')
    error.code = 'deepseek_not_configured'
    throw error
  }

  const client = getDeepSeekClient()
  const {
    model = getDeepSeekModel(),
    thinking = { type: 'enabled' },
    reasoning_effort = 'high',
    stream = false,
    ...restOptions
  } = options

  return client.chat.completions.create({
    model,
    messages,
    thinking,
    reasoning_effort,
    stream,
    ...restOptions,
  })
}

export default {
  isDeepSeekConfigured,
  createDeepSeekChatCompletion,
}
