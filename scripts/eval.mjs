import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const port = process.env.EVAL_PORT || '3177'
const baseUrl = process.env.EVAL_BASE_URL || `http://127.0.0.1:${port}`
const shouldStartServer = !process.env.EVAL_BASE_URL

const moduleTypes = {
  'static-web-app': 'Microsoft.Web/staticSites',
  'app-service': 'Microsoft.Web/sites',
  functions: 'Microsoft.Web/sites',
  'container-apps': 'Microsoft.App/containerApps',
  aks: 'Microsoft.ContainerService/managedClusters',
  'cosmos-db': 'Microsoft.DocumentDB/databaseAccounts',
  storage: 'Microsoft.Storage/storageAccounts',
  sql: 'Microsoft.Sql/servers',
  redis: 'Microsoft.Cache/redis',
  'service-bus': 'Microsoft.ServiceBus/namespaces',
  'event-hubs': 'Microsoft.EventHub/namespaces',
  'key-vault': 'Microsoft.KeyVault/vaults',
  'app-configuration': 'Microsoft.AppConfiguration/configurationStores',
  'application-insights': 'Microsoft.Insights/components',
  cdn: 'Microsoft.Cdn/profiles',
  'front-door': 'Microsoft.Network/frontDoors',
  'api-management': 'Microsoft.ApiManagement/service'
}

const secretPatterns = [
  /(?:password|adminPassword|administratorLoginPassword)\s*:\s*'[^']{6,}'/i,
  /(?:secret|clientSecret|apiKey|token)\s*:\s*'[^']{8,}'/i,
  /(?:connectionString|connString)\s*:\s*'[^']*(?:AccountKey|Password|SharedAccessKey)[^']*'/i
]

let server

try {
  if (shouldStartServer) {
    server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AZURE_OPENAI_ENDPOINT: '',
        AZURE_OPENAI_KEY: '',
        AZURE_OPENAI_API_KEY: '',
        AZURE_OPENAI_DEPLOYMENT: '',
        AZURE_AI_FOUNDRY_PROJECT_ENDPOINT: '',
        AZURE_AI_SEARCH_ENDPOINT: '',
        AZURE_AI_SEARCH_KEY: '',
        AZURE_AI_SEARCH_INDEX_NAME: ''
      }
    })
    await waitForServer(baseUrl)
  }

  const suite = JSON.parse(await readFile(new URL('../evals/reasoning-agent-evals.json', import.meta.url), 'utf8'))
  const results = []

  for (const testCase of suite.cases) {
    const response = await fetch(`${baseUrl}/api/generate-infra`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectDescription: testCase.prompt,
        modules: testCase.modules,
        owner: 'eval-team',
        environment: 'test',
        injectDemoError: Boolean(testCase.injectDemoError),
        runAzureValidate: false
      })
    })

    if (!response.ok) {
      throw new Error(`${testCase.id} failed HTTP ${response.status}: ${await response.text()}`)
    }

    const data = await response.json()
    const checks = evaluateCase(testCase, data)
    results.push({ id: testCase.id, title: testCase.title, checks })
  }

  printResults(results)
  const failed = results.flatMap((result) => result.checks.filter((check) => !check.ok))
  if (failed.length) process.exitCode = 1
} finally {
  if (server) server.kill('SIGTERM')
}

function evaluateCase(testCase, data) {
  return [
    check('response has structured agent trace', Array.isArray(data.agentTrace) && data.agentTrace.length >= 6),
    check('compiler validation passed', data.attempts?.some((attempt) => attempt.status === 'compile_passed')),
    check('demo repair loop is visible when requested', !testCase.injectDemoError || data.attempts?.some((attempt) => attempt.status === 'repaired')),
    check('standards were applied', Array.isArray(data.standardsApplied) && data.standardsApplied.length >= 3),
    check('standards citations are present', Array.isArray(data.standardsCitations) && data.standardsCitations.length >= 1),
    check('standards provider is reported', ['azure-ai-search', 'local-markdown'].includes(data.standardsProvider)),
    check('quality review is present', typeof data.qualityReview?.score === 'number' && Array.isArray(data.qualityReview?.issues)),
    check('code block explanations are present', Array.isArray(data.explanation?.codeBlocks) && data.explanation.codeBlocks.length >= 3),
    check('no hard-coded secret patterns detected', !secretPatterns.some((pattern) => pattern.test(data.bicep || ''))),
    ...testCase.modules.map((moduleId) => check(`includes ${moduleId}`, includesModule(data.bicep || '', moduleId)))
  ]
}

function includesModule(bicep, moduleId) {
  const resourceType = moduleTypes[moduleId]
  return resourceType ? bicep.includes(resourceType) : true
}

function check(name, ok) {
  return { name, ok: Boolean(ok) }
}

function printResults(results) {
  for (const result of results) {
    console.log(`\n${result.id}: ${result.title}`)
    for (const checkResult of result.checks) {
      console.log(`${checkResult.ok ? 'PASS' : 'FAIL'} ${checkResult.name}`)
    }
  }
}

async function waitForServer(url) {
  const started = Date.now()
  while (Date.now() - started < 60000) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}`)
}
