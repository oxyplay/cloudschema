import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import modulesCatalog from '../../data/azure-modules.json'

const fallbackExamples: Record<number, string[]> = {
  1: [
    'I want to build a simple personal blog with a static site and a contact form.',
    'I am making a small portfolio website to show my projects and resume.',
    'I need a basic landing page for my small business with no backend.'
  ],
  2: [
    'I want to deploy a personal blog with a static frontend, comments API, and email notifications.',
    'I am building a simple to-do app with a web frontend, a small API, and a database.',
    'I need a simple event registration page with a form backend and file uploads.'
  ],
  3: [
    'I am building a small e-commerce site with a product catalog, shopping cart, and order API. I need a database, file storage for product images, and monitoring.',
    'My team needs an internal dashboard that pulls data from a SQL database, runs background jobs, and stores uploaded reports securely.',
    'I am creating a mobile app backend with user authentication, image uploads, push notifications, and analytics.'
  ],
  4: [
    'We are building a multi-region SaaS platform with a React frontend, microservices APIs, event-driven workers, relational and NoSQL data stores, secure secret management, monitoring, and CI/CD pipelines.',
    'I need a data processing platform that ingests files, runs serverless transformation jobs, stores results in multiple databases, caches hot data, and exposes REST and GraphQL APIs.',
    'We are launching a video streaming service with a web player, content API, transcoding jobs, blob storage, CDN, authentication, and real-time analytics.'
  ],
  5: [
    'We are designing a global enterprise banking platform with multi-region active-active deployment, Kubernetes microservices, event sourcing, distributed caches, multiple databases, private networking, zero-trust security, secrets rotation, comprehensive observability, disaster recovery, and automated compliance pipelines.',
    'I need a large-scale IoT platform that ingests millions of telemetry events per second, processes streams in real time, stores hot and cold data, runs ML inference, exposes APIs, and integrates with enterprise identity and monitoring systems.',
    'We are building a healthcare data platform that aggregates patient records across multiple hospitals, enforces strict HIPAA compliance, uses private endpoints, encryption at rest and in transit, audit logging, and automated Bicep deployments with policy validation.'
  ]
}

const keywordMap: Record<string, string[]> = {
  'static-web-app': ['static', 'frontend', 'website', 'blog', 'landing', 'documentation'],
  'app-service': ['api', 'backend', 'web app', 'saas', 'dashboard', 'service'],
  'functions': ['background job', 'scheduled', 'event-driven', 'serverless', 'job', 'function'],
  'container-apps': ['container', 'microservice', 'docker', 'containerized'],
  'aks': ['kubernetes', 'k8s', 'cluster', 'orchestration'],
  'storage': ['file', 'image', 'upload', 'blob', 'storage', 'asset', 'report'],
  'sql': ['database', 'sql', 'relational', 'data'],
  'cosmos-db': ['nosql', 'document', 'cosmos', 'global database'],
  'redis': ['cache', 'caching', 'session', 'redis'],
  'service-bus': ['queue', 'message', 'messaging', 'async'],
  'event-hubs': ['stream', 'streaming', 'telemetry', 'event hub', 'real-time'],
  'key-vault': ['secret', 'key', 'certificate', 'credential', 'secure'],
  'app-configuration': ['feature flag', 'configuration', 'app settings'],
  'application-insights': ['monitor', 'telemetry', 'logging', 'analytics', 'insight'],
  'log-analytics': ['log', 'logs', 'workspace', 'diagnostics'],
  'cdn': ['cdn', 'edge', 'cache', 'content delivery'],
  'front-door': ['front door', 'waf', 'firewall', 'global load balancer', 'edge security'],
  'api-management': ['api management', 'api gateway', 'rate limit', 'developer portal']
}

function suggestModules(description: string) {
  const lower = description.toLowerCase()
  const scored = modulesCatalog
    .map((module) => ({
      id: module.id,
      score: (keywordMap[module.id] || []).filter((kw) => lower.includes(kw)).length
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.id)

  return scored.length ? scored : ['app-service', 'storage']
}

function pickFallback(complexity: number) {
  const list = fallbackExamples[complexity] || fallbackExamples[3]!
  return list[Math.floor(Math.random() * list.length)]!
}

function complexityGuidance(complexity: number) {
  const map: Record<number, string> = {
    1: 'Generate a very easy, beginner-friendly Azure project description. Use only 1-2 simple services. Keep it to one short paragraph.',
    2: 'Generate a simple Azure project description. Use 2-3 services. Keep it to one paragraph.',
    3: 'Generate a moderately complex Azure project description. Use 3-4 services. Keep it to one paragraph.',
    4: 'Generate a complex Azure project description. Use 4-6 services and mention advanced requirements like scaling, caching, queues, or microservices. Keep it to one paragraph.',
    5: 'Generate a highly complex, enterprise-grade Azure project description. Include many services, multi-region concerns, security, compliance, identity, monitoring, and resilience. Keep it to one paragraph.'
  }
  return map[complexity] || map[3]!
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event).catch(() => ({}))
  const complexity = Number.isFinite(body?.complexity) ? Math.min(5, Math.max(1, Number(body.complexity))) : 3

  if (config.azureOpenAIEndpoint && config.azureOpenAIKey && config.azureOpenAIDeployment) {
    try {
      const standards = await readFile(join(process.cwd(), 'foundry_iq_knowledge', 'company_standards.md'), 'utf8')

      const response = await $fetch<{
        choices: Array<{ message: { content: string } }>
      }>(`${config.azureOpenAIEndpoint.replace(/\/$/, '')}/openai/deployments/${config.azureOpenAIDeployment}/chat/completions`, {
        method: 'POST',
        query: { 'api-version': config.azureOpenAIApiVersion },
        headers: {
          'api-key': config.azureOpenAIKey,
          'content-type': 'application/json'
        },
        body: {
          messages: [
            {
              role: 'system',
              content: 'You generate realistic Azure project descriptions. Return only one paragraph, no markdown, no bullets.'
            },
            {
              role: 'user',
              content: `${complexityGuidance(complexity)} Mention 2-${complexity >= 4 ? 'many' : '4'} Azure services from this list: App Service, Functions, Storage Account, SQL Database, Key Vault, Application Insights, Static Web Apps. Mention company standards context: ${standards.slice(0, 400)}`
            }
          ],
          temperature: 0.9,
          max_tokens: 220
        }
      })

      const example = response.choices[0]?.message.content?.trim() || pickFallback(complexity)
      return { example, modules: suggestModules(example) }
    } catch {
      // fall through to deterministic example
    }
  }

  const example = pickFallback(complexity)
  return { example, modules: suggestModules(example) }
})
