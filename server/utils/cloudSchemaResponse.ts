import type modules from '../../data/azure-modules.json'
import type { CloudSchemaResponse } from './cloudSchemaTypes'

type AzureModule = typeof modules[number]

export function buildArchitectureGraph(selectedModules: AzureModule[]) {
  const nodes = [
    { id: 'project', label: 'Your project', type: 'project' },
    ...selectedModules.map((module) => ({ id: module.id, label: module.name, type: module.category }))
  ]

  const edges = selectedModules.map((module) => ({
    from: 'project',
    to: module.id,
    label: module.category
  }))

  const mermaid = buildMermaidGraph(selectedModules)

  return { nodes, edges, mermaid }
}

function buildMermaidGraph(selectedModules: AzureModule[]) {
  const sanitizedLabel = (label: string) => label.replace(/[()]/g, '').trim()
  const sanitizedId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_')
  const lines = ['graph TD']

  lines.push(`  ${sanitizedId('project')}[${sanitizedLabel('Your project')}]`)

  for (const module of selectedModules) {
    const id = sanitizedId(module.id)
    const label = sanitizedLabel(module.name)
    lines.push(`  ${id}[${label}]`)
  }

  for (const module of selectedModules) {
    lines.push(`  ${sanitizedId('project')} --> ${sanitizedId(module.id)}`)
  }

  return lines.join('\n')
}

export function buildTutorExplanation(input: {
  projectDescription: string
  selectedModules: AzureModule[]
  resourceGroup: string
  bicep: string
}): CloudSchemaResponse['explanation'] {
  return {
    overview: `CloudSchema turned the project description into a beginner-friendly Azure architecture with ${input.selectedModules.length} selected module(s). The Bicep template is compiled locally before it is shown as final.`,
    resources: input.selectedModules.map((module) => ({
      name: module.name,
      purpose: module.beginnerDescription,
      beginnerNote: `${module.name} maps to ${module.bicepResourceType}. In Bicep, this appears as a resource block with location, tags, SKU/properties, and outputs when useful.`
    })),
    codeBlocks: buildBicepCodeExplanations(input.bicep, input.selectedModules),
    deployCommands: [
      `az group create --name ${input.resourceGroup} --location eastus`,
      `az deployment group create --resource-group ${input.resourceGroup} --template-file main.bicep`
    ],
    safetyNotes: [
      'Generated templates are for learning and review before production use.',
      'Do not commit real secrets or production credentials into Bicep files.',
      'Review Azure costs before deploying paid resources such as App Service, SQL Database, or Application Insights.'
    ],
    nextExperiments: [
      'Compare App Service with Azure Functions for the same backend.',
      'Add Key Vault and observe how secret management changes the architecture.',
      'Enable Azure API validation after `az login` to check the template against your subscription.'
    ]
  }
}

function buildBicepCodeExplanations(code: string, selectedModules: AzureModule[]) {
  const lines = code.split('\n')
  const blocks: CloudSchemaResponse['explanation']['codeBlocks'] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() || ''

    if (!line) continue

    if (line.startsWith('param ')) {
      addOnce(blocks, seen, {
        id: 'params',
        title: 'Parameters',
        purpose: 'Defines the inputs used by the deployment, such as location, ownership, environment, and naming.',
        beginnerNote: 'Parameters make the Bicep template reusable. You can deploy the same file to different environments by changing parameter values instead of editing every resource.'
      })
      continue
    }

    if (line.startsWith('var ')) {
      const name = line.match(/^var\s+(\w+)/)?.[1] || 'value'
      addOnce(blocks, seen, {
        id: `var:${name}`,
        title: `Variable: ${name}`,
        purpose: name === 'tags'
          ? 'Collects shared tags that are applied to Azure resources for ownership, environment, and traceability.'
          : `Stores a reusable calculated value named ${name}.`,
        beginnerNote: 'Variables keep repeated values in one place so the template is easier to read and maintain.'
      })
      continue
    }

    if (line.startsWith('resource ')) {
      const match = line.match(/^resource\s+(\w+)\s+'([^']+)'/)
      if (!match?.[1] || !match[2]) continue
      const resourceName = match[1]
      const resourceType = match[2].split('@')[0] || ''
      addOnce(blocks, seen, describeResourceBlock(resourceName, resourceType, selectedModules))
      continue
    }

    if (line.startsWith('output ')) {
      addOnce(blocks, seen, {
        id: 'outputs',
        title: 'Outputs',
        purpose: 'Returns useful values from the deployment, such as generated resource names.',
        beginnerNote: 'Outputs are shown after deployment and help you find or pass resource names to later automation steps.'
      })
    }
  }

  return blocks
}

function addOnce(
  blocks: CloudSchemaResponse['explanation']['codeBlocks'],
  seen: Set<string>,
  block: CloudSchemaResponse['explanation']['codeBlocks'][number]
) {
  if (seen.has(block.id)) return
  seen.add(block.id)
  blocks.push(block)
}

function describeResourceBlock(resourceName: string, resourceType: string, selectedModules: AzureModule[]) {
  const selectedModule = findSelectedModuleForResource(resourceName, resourceType, selectedModules)
  if (selectedModule) {
    return {
      id: `resource:${resourceName}`,
      title: selectedModule.name,
      purpose: selectedModule.beginnerDescription,
      beginnerNote: `${selectedModule.name} maps to ${selectedModule.bicepResourceType}. This resource block defines the Azure service, its name, location, tags, SKU/properties, and security settings when relevant.`
    }
  }

  if (resourceType === 'Microsoft.Web/serverfarms') {
    return {
      id: `resource:${resourceName}`,
      title: 'App Service Plan',
      purpose: 'Defines the compute plan that hosts App Service or Functions workloads.',
      beginnerNote: 'An App Service Plan controls the pricing tier, capacity, operating system, and scale limits for the web apps that use it.'
    }
  }

  return {
    id: `resource:${resourceName}`,
    title: resourceName,
    purpose: `Creates an Azure resource of type ${resourceType}.`,
    beginnerNote: 'This resource block declares the Azure service and the configuration Azure Resource Manager will deploy.'
  }
}

function findSelectedModuleForResource(resourceName: string, resourceType: string, selectedModules: AzureModule[]) {
  if (resourceType === 'Microsoft.Web/sites') {
    const normalizedName = resourceName.toLowerCase()
    if (normalizedName.includes('function') || normalizedName.includes('func')) {
      return selectedModules.find((module) => module.id === 'functions')
    }
    return selectedModules.find((module) => module.id === 'app-service')
  }

  return selectedModules.find((module) => resourceType === module.bicepResourceType)
}
