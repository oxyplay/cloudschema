export async function generateBicepWithAzureOpenAI(input: {
  endpoint: string
  key: string
  deployment: string
  apiVersion: string
  projectDescription: string
  selectedModules: unknown[]
  standards: string
  deterministicBicep: string
}) {
  const target = buildAzureChatTarget(input.endpoint, input.deployment)
  const response = await $fetch<{
    choices: Array<{ message: { content: string } }>
  }>(target.url, {
    method: 'POST',
    query: target.usesV1 ? undefined : { 'api-version': input.apiVersion },
    headers: {
      'api-key': input.key,
      'content-type': 'application/json'
    },
    body: {
      ...(target.usesV1 ? { model: input.deployment } : {}),
      messages: [
        {
          role: 'system',
          content: 'You generate Azure Bicep for beginners. Return only Bicep code. No markdown fences. Apply company standards. Do not include real secrets.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Improve or regenerate this Bicep template while preserving selected Azure modules and company standards.',
            projectDescription: input.projectDescription,
            selectedModules: input.selectedModules,
            companyStandards: input.standards,
            baselineTemplate: input.deterministicBicep
          })
        }
      ],
      temperature: 0.1
    }
  })

  return stripCodeFence(response.choices[0]?.message.content || '')
}

export async function repairBicepWithAzureOpenAI(input: {
  endpoint: string
  key: string
  deployment: string
  apiVersion: string
  bicep: string
  compilerError: string
  standards: string
}) {
  const target = buildAzureChatTarget(input.endpoint, input.deployment)
  const response = await $fetch<{
    choices: Array<{ message: { content: string } }>
  }>(target.url, {
    method: 'POST',
    query: target.usesV1 ? undefined : { 'api-version': input.apiVersion },
    headers: {
      'api-key': input.key,
      'content-type': 'application/json'
    },
    body: {
      ...(target.usesV1 ? { model: input.deployment } : {}),
      messages: [
        {
          role: 'system',
          content: 'You repair Azure Bicep compiler errors. Return only the complete fixed Bicep file. No markdown fences. Preserve company standards.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            compilerError: input.compilerError,
            companyStandards: input.standards,
            bicep: input.bicep
          })
        }
      ],
      temperature: 0
    }
  })

  return stripCodeFence(response.choices[0]?.message.content || '')
}

export async function reviewBicepQualityWithAzureOpenAI(input: {
  endpoint: string
  key: string
  deployment: string
  apiVersion: string
  bicep: string
  projectDescription: string
  selectedModules: unknown[]
  standards: string
}) {
  const target = buildAzureChatTarget(input.endpoint, input.deployment)
  const response = await $fetch<{
    choices: Array<{ message: { content: string } }>
  }>(target.url, {
    method: 'POST',
    query: target.usesV1 ? undefined : { 'api-version': input.apiVersion },
    headers: {
      'api-key': input.key,
      'content-type': 'application/json'
    },
    body: {
      ...(target.usesV1 ? { model: input.deployment } : {}),
      messages: [
        {
          role: 'system',
          content: 'You review Azure Bicep templates for quality and best practices. Respond with a single valid JSON object (no markdown fences) matching this schema: { summary: string, score: number 0-100, passed: boolean, issues: [{ severity: "info" | "warning" | "critical", category: string, title: string, description: string, suggestion?: string, lineNumber?: number }] }. Evaluate security, cost, reliability, maintainability, and alignment with the project description. Be strict but fair.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Review this Bicep template for quality issues beyond syntax correctness.',
            projectDescription: input.projectDescription,
            selectedModules: input.selectedModules,
            companyStandards: input.standards,
            bicep: input.bicep
          })
        }
      ],
      temperature: 0.1
    }
  })

  const content = stripCodeFence(response.choices[0]?.message.content || '')
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

function stripCodeFence(value: string) {
  return value
    .replace(/^```(?:bicep|json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

function buildAzureChatTarget(endpoint: string, deployment: string) {
  const trimmed = endpoint.replace(/\/$/, '')

  if (/\/openai\/v1$/i.test(trimmed)) {
    return {
      usesV1: true,
      url: `${trimmed}/chat/completions`
    }
  }

  const normalized = trimmed.replace(/\/openai$/i, '')

  return {
    usesV1: false,
    url: `${normalized}/openai/deployments/${deployment}/chat/completions`
  }
}
