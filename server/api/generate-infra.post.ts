import modulesCatalog from '../../data/azure-modules.json'
import { generateInfraRequestSchema, cloudSchemaResponseSchema, type CloudSchemaResponse, type GenerateInfraRequest } from '../utils/cloudSchemaTypes'
import { retrieveGroundedStandards } from '../utils/foundryStandards'
import { buildDeterministicBicep, repairKnownBicepErrors } from '../utils/bicepTemplates'
import { compileBicep } from '../utils/bicepValidator'
import { validateArmTemplateWithAzure } from '../utils/azureValidation'
import { buildArchitectureGraph, buildTutorExplanation } from '../utils/cloudSchemaResponse'
import { generateBicepWithAzureOpenAI, repairBicepWithAzureOpenAI, reviewBicepQualityWithAzureOpenAI } from '../utils/azureOpenAI'
import { runDeterministicQualityReview } from '../utils/bicepQuality'
import { applySecurityGuardrails, findBicepSecretIssues } from '../utils/bicepSecurity'

export default defineEventHandler(async (event) => {
  const request = generateInfraRequestSchema.parse(await readBody(event))
  const selectedModules = modulesCatalog.filter((module) => request.modules.includes(module.id))

  if (!selectedModules.length) {
    throw createError({ statusCode: 400, statusMessage: 'Select at least one known Azure module.' })
  }

  const config = useRuntimeConfig()
  const groundedStandards = await retrieveGroundedStandards({
    azureAISearchEndpoint: config.azureAISearchEndpoint,
    azureAISearchKey: config.azureAISearchKey,
    azureAISearchIndexName: config.azureAISearchIndexName,
    azureAISearchContentField: config.azureAISearchContentField,
    azureAISearchTitleField: config.azureAISearchTitleField
  })
  const standardsMarkdown = groundedStandards.markdown
  const standardsApplied = groundedStandards.standards
  const attempts: CloudSchemaResponse['attempts'] = []
  const agentTrace: CloudSchemaResponse['agentTrace'] = []

  agentTrace.push({
    agent: 'Architecture Planner',
    status: 'completed',
    input: 'Project description and selected Azure modules',
    output: `Selected ${selectedModules.length} module(s): ${selectedModules.map((module) => module.name).join(', ')}.`
  })

  agentTrace.push({
    agent: 'Foundry IQ Standards Agent',
    status: 'completed',
    input: 'Company infrastructure standards knowledge source',
    output: `Retrieved ${standardsApplied.length} approved standard(s) with ${groundedStandards.citations.length} citation(s).`,
    tool: groundedStandards.provider === 'azure-ai-search' ? 'Azure AI Search retrievable knowledge source' : 'foundry_iq_knowledge/company_standards.md fallback'
  })

  let bicep = buildDeterministicBicep({
    modules: selectedModules,
    owner: request.owner,
    environment: request.environment,
    injectDemoError: request.injectDemoError
  })
  let generatorMode = 'deterministic fallback generator'

  if (hasAzureOpenAI(config)) {
    try {
      const generated = await generateBicepWithAzureOpenAI({
        endpoint: config.azureOpenAIEndpoint,
        key: config.azureOpenAIKey,
        deployment: config.azureOpenAIDeployment,
        apiVersion: config.azureOpenAIApiVersion,
        projectDescription: request.projectDescription,
        selectedModules,
        standards: standardsMarkdown,
        deterministicBicep: bicep
      })

      if (generated.includes('resource ') && generated.includes('param ')) {
        bicep = request.injectDemoError ? generated.replace("sku: {\n    name: 'B1'", "sku {\n    name: 'B1'") : generated
        generatorMode = 'Azure OpenAI / Azure AI Foundry generation'
      }
    } catch (error) {
      attempts.push({
        attempt: 0,
        status: 'skipped',
        summary: 'Azure OpenAI generation failed; CloudSchema used the deterministic generator fallback.',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  agentTrace.push({
    agent: 'Bicep Generator',
    status: 'completed',
    input: 'Architecture plan, selected modules, owner/environment tags, and grounded standards',
    output: `Produced initial Bicep using ${generatorMode}.`,
    tool: hasAzureOpenAI(config) ? 'Azure OpenAI / Azure AI Foundry or deterministic fallback' : 'Deterministic fallback generator'
  })

  attempts.push({
    attempt: 1,
    status: 'generated',
    summary: 'Generated Bicep from project description, selected modules, and Foundry IQ standards.'
  })

  let compiledTemplate: unknown
  let compilePassed = false
  let repairCount = 0

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const compile = await compileBicep(bicep, `run-${Date.now()}-${attempt}`)

    if (compile.ok) {
      compiledTemplate = compile.armTemplate
      compilePassed = true
      attempts.push({
        attempt,
        status: 'compile_passed',
        summary: 'Azure Bicep CLI compiled the template successfully.',
        command: compile.command
      })
      break
    }

    attempts.push({
      attempt,
      status: 'compile_failed',
      summary: 'Azure Bicep CLI found a compiler error. The error is fed back into the repair step.',
      command: compile.command,
      error: truncate(sanitizeCompilerOutput(`${compile.stderr}\n${compile.stdout}`.trim()))
    })

    let repaired = repairKnownBicepErrors(bicep, `${compile.stderr}\n${compile.stdout}`)

    if (repaired === bicep && hasAzureOpenAI(config)) {
      repaired = await repairBicepWithAzureOpenAI({
        endpoint: config.azureOpenAIEndpoint,
        key: config.azureOpenAIKey,
        deployment: config.azureOpenAIDeployment,
        apiVersion: config.azureOpenAIApiVersion,
        bicep,
        compilerError: `${compile.stderr}\n${compile.stdout}`,
        standards: standardsMarkdown
      })
    }

    if (repaired === bicep) {
      break
    }

    bicep = repaired
    repairCount += 1
    attempts.push({
      attempt: attempt + 1,
      status: 'repaired',
      summary: 'Self-Repair Agent produced a revised Bicep template from compiler feedback.'
    })
  }

  agentTrace.push({
    agent: 'Compiler Validator',
    status: compilePassed ? 'completed' : 'failed',
    input: 'Generated Bicep candidate',
    output: compilePassed ? 'Bicep compiler produced an ARM template successfully.' : 'Bicep compiler did not produce a valid ARM template within the retry limit.',
    tool: 'az bicep build'
  })

  agentTrace.push({
    agent: 'Self-Repair Agent',
    status: repairCount > 0 ? 'completed' : 'skipped',
    input: 'Compiler diagnostics and current Bicep candidate',
    output: repairCount > 0 ? `Applied ${repairCount} repair attempt(s) from compiler feedback.` : 'No repair was needed because validation passed without a repair step.',
    tool: hasAzureOpenAI(config) ? 'Known-error repair rules and optional Azure OpenAI repair' : 'Known-error repair rules'
  })

  if (request.runAzureValidate && compiledTemplate) {
    const azureValidation = await validateArmTemplateWithAzure({
      subscriptionId: config.azureSubscriptionId,
      resourceGroupName: config.azureResourceGroup,
      deploymentName: `cloudschema-${Date.now()}`,
      template: compiledTemplate,
      location: config.azureLocation
    })

    attempts.push({
      attempt: attempts.length + 1,
      status: azureValidation.skipped ? 'skipped' : azureValidation.ok ? 'azure_validate_passed' : 'azure_validate_failed',
      summary: azureValidation.summary,
      error: azureValidation.error ? truncate(azureValidation.error) : undefined
    })
  }

  const secretIssues = findBicepSecretIssues(bicep)
  agentTrace.push({
    agent: 'Security Guardrail',
    status: secretIssues.length ? 'failed' : 'completed',
    input: 'Final generated Bicep',
    output: secretIssues.length ? `Found ${secretIssues.length} hard-coded secret risk(s).` : 'No hard-coded secret patterns detected.',
    tool: 'Static Bicep pattern scan'
  })

  const qualityReview = applySecurityGuardrails(await runQualityReview(config, bicep, request, selectedModules, standardsMarkdown), bicep)
  agentTrace.push({
    agent: 'Quality Reviewer',
    status: qualityReview.passed ? 'completed' : 'failed',
    input: 'Final Bicep, project goal, selected modules, and grounded standards',
    output: `Quality score ${qualityReview.score}/100 with ${qualityReview.issues.length} issue(s).`,
    tool: hasAzureOpenAI(config) ? 'Azure OpenAI / Azure AI Foundry or deterministic review' : 'Deterministic review'
  })

  const explanation = buildTutorExplanation({
    projectDescription: request.projectDescription,
    selectedModules,
    resourceGroup: config.azureResourceGroup || 'rg-cloudschema-demo',
    bicep
  })
  agentTrace.push({
    agent: 'Explainer Agent',
    status: 'completed',
    input: 'Final Bicep and selected modules',
    output: `Generated explanations for ${explanation.codeBlocks.length} Bicep code block(s).`
  })

  const response: CloudSchemaResponse = {
    projectSummary: summarizeProject(request.projectDescription, selectedModules.map((module) => module.name)),
    selectedModules,
    standardsApplied,
    standardsProvider: groundedStandards.provider,
    standardsCitations: groundedStandards.citations,
    bicep,
    agentTrace,
    attempts,
    architectureGraph: buildArchitectureGraph(selectedModules),
    explanation,
    qualityReview
  }

  return cloudSchemaResponseSchema.parse(response)
})

async function runQualityReview(
  config: ReturnType<typeof useRuntimeConfig>,
  bicep: string,
  request: GenerateInfraRequest,
  selectedModules: typeof modulesCatalog,
  standards: string
) {
  if (hasAzureOpenAI(config)) {
    try {
      const review = await reviewBicepQualityWithAzureOpenAI({
        endpoint: config.azureOpenAIEndpoint,
        key: config.azureOpenAIKey,
        deployment: config.azureOpenAIDeployment,
        apiVersion: config.azureOpenAIApiVersion,
        bicep,
        projectDescription: request.projectDescription,
        selectedModules,
        standards
      })
      if (review && typeof review.score === 'number' && Array.isArray(review.issues)) {
        return review
      }
    } catch {
      // fall through to deterministic review
    }
  }

  return runDeterministicQualityReview({ bicep, request, selectedModules })
}

function hasAzureOpenAI(config: ReturnType<typeof useRuntimeConfig>) {
  return Boolean(config.azureOpenAIEndpoint && config.azureOpenAIKey && config.azureOpenAIDeployment)
}

function summarizeProject(description: string, moduleNames: string[]) {
  return `CloudSchema planned infrastructure for: "${description}". Selected modules: ${moduleNames.join(', ')}.`
}

function truncate(value: string) {
  return value.length > 2400 ? `${value.slice(0, 2400)}...` : value
}

function sanitizeCompilerOutput(value: string) {
  return value
    .replaceAll(process.cwd(), '.')
    .replace(/\.data\/generated\/[^/]+\/main\.bicep/g, 'main.bicep')
    .replace(/\.data\/generated\/[^/]+\/main\.json/g, 'main.json')
}
