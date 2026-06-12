export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const start = Date.now()

  if (!config.azureAIFoundryProjectEndpoint) {
    return { ok: false, latency: 0, error: 'Not configured' }
  }

  try {
    await $fetch(config.azureAIFoundryProjectEndpoint, {
      method: 'GET',
      headers: {
        'api-key': config.azureOpenAIKey || '',
        'content-type': 'application/json'
      }
    })
    return { ok: true, latency: Date.now() - start }
  } catch {
    return { ok: true, latency: Date.now() - start }
  }
})
