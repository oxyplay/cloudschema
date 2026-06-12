import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DefaultAzureCredential } from '@azure/identity'

export type StandardsCitation = {
  source: string
  title: string
  excerpt: string
}

export type GroundedStandards = {
  markdown: string
  standards: string[]
  citations: StandardsCitation[]
  provider: 'azure-ai-search' | 'local-markdown'
}

type StandardsProviderConfig = {
  azureAISearchEndpoint?: string
  azureAISearchKey?: string
  azureAISearchIndexName?: string
  azureAISearchContentField?: string
  azureAISearchTitleField?: string
}

const localStandardsPath = join(process.cwd(), 'foundry_iq_knowledge', 'company_standards.md')

export async function retrieveGroundedStandards(config: StandardsProviderConfig): Promise<GroundedStandards> {
  if (config.azureAISearchEndpoint && config.azureAISearchIndexName) {
    try {
      return await retrieveStandardsFromAzureSearch(config)
    } catch {
      return await retrieveLocalStandards()
    }
  }

  return await retrieveLocalStandards()
}

export async function readFoundryStandards() {
  return await readFile(localStandardsPath, 'utf8')
}

export function extractStandards(markdown: string) {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\./.test(line))
    .map((line) => line.replace(/^\d+\.\s*/, ''))
}

async function retrieveLocalStandards(): Promise<GroundedStandards> {
  const markdown = await readFoundryStandards()
  return {
    markdown,
    standards: extractStandards(markdown),
    citations: [{
      source: 'foundry_iq_knowledge/company_standards.md',
      title: 'CloudSchema Company Infrastructure Standards',
      excerpt: extractExcerpt(markdown)
    }],
    provider: 'local-markdown'
  }
}

async function retrieveStandardsFromAzureSearch(config: StandardsProviderConfig): Promise<GroundedStandards> {
  const endpoint = config.azureAISearchEndpoint?.replace(/\/$/, '')
  const indexName = config.azureAISearchIndexName
  if (!endpoint || !indexName) throw new Error('Azure AI Search endpoint or index name is missing.')

  const contentField = config.azureAISearchContentField || 'content'
  const titleField = config.azureAISearchTitleField || 'title'
  const headers: Record<string, string> = { 'content-type': 'application/json' }

  if (config.azureAISearchKey) {
    headers['api-key'] = config.azureAISearchKey
  } else {
    const credential = new DefaultAzureCredential()
    const token = await credential.getToken('https://search.azure.com/.default')
    headers.authorization = `Bearer ${token.token}`
  }

  const response = await $fetch<{ value?: Array<Record<string, unknown>> }>(`${endpoint}/indexes/${encodeURIComponent(indexName)}/docs/search`, {
    method: 'POST',
    query: { 'api-version': '2024-07-01' },
    headers,
    body: {
      search: 'Azure infrastructure standards tags storage TLS secrets beginner demos',
      top: 5,
      select: `${contentField},${titleField}`
    }
  })

  const documents = response.value || []
  const citations = documents
    .map((document, index) => {
      const content = stringField(document, contentField)
      if (!content) return null
      return {
        source: `azure-ai-search://${indexName}/${index + 1}`,
        title: stringField(document, titleField) || `Azure AI Search document ${index + 1}`,
        excerpt: extractExcerpt(content)
      }
    })
    .filter((citation): citation is StandardsCitation => Boolean(citation))

  if (!citations.length) throw new Error('Azure AI Search returned no standards documents.')

  const markdown = citations.map((citation) => `# ${citation.title}\n\n${citation.excerpt}`).join('\n\n')
  const standards = extractStandards(markdown)

  return {
    markdown,
    standards: standards.length ? standards : citations.map((citation) => citation.excerpt),
    citations,
    provider: 'azure-ai-search'
  }
}

function stringField(document: Record<string, unknown>, field: string) {
  const value = document[field]
  return typeof value === 'string' ? value : ''
}

function extractExcerpt(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(' ')
    .slice(0, 700)
}
