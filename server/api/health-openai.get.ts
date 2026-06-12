export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const start = Date.now()

  if (!config.azureOpenAIEndpoint || !config.azureOpenAIKey || !config.azureOpenAIDeployment) {
    return { ok: false, latency: 0, error: 'Not configured' }
  }

  try {
    await $fetch(`${config.azureOpenAIEndpoint.replace(/\/$/, '')}/openai/deployments/${config.azureOpenAIDeployment}/chat/completions`, {
      method: 'POST',
      query: { 'api-version': config.azureOpenAIApiVersion },
      headers: {
        'api-key': config.azureOpenAIKey,
        'content-type': 'application/json'
      },
      body: {
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      }
    })
    return { ok: true, latency: Date.now() - start }
  } catch (error) {
    return { ok: false, latency: Date.now() - start, error: error instanceof Error ? error.message : String(error) }
  }
})
