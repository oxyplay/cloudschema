export default defineEventHandler(async () => {
  const start = Date.now()
  const { spawn } = await import('node:child_process')

  return new Promise((resolve) => {
    const child = spawn('az', ['bicep', 'version'], { shell: false })
    let output = ''
    let error = ''

    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { error += chunk.toString() })

    child.on('error', () => {
      resolve({ ok: false, latency: Date.now() - start, error: 'Azure CLI not available' })
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, latency: Date.now() - start, version: output.trim() })
      } else {
        resolve({ ok: false, latency: Date.now() - start, error: error.trim() })
      }
    })
  })
})
