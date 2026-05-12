import {
  createDeepSeekChatCompletion,
  isDeepSeekConfigured,
} from '../services/llm/deepseek-client.js'

async function main() {
  if (!isDeepSeekConfigured()) {
    console.log('DeepSeek is not configured. Set DEEPSEEK_API_KEY to run this test.')
    return
  }

  const completion = await createDeepSeekChatCompletion([
    {
      role: 'system',
      content: 'You are DeepSeek running inside AgentMusic. Reply briefly.',
    },
    {
      role: 'user',
      content: 'Say hello from DeepSeek.',
    },
  ])

  console.log(completion.choices?.[0]?.message?.content || '')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
