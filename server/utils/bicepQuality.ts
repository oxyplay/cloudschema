import type { QualityReview, GenerateInfraRequest } from './cloudSchemaTypes'
import type modules from '../../data/azure-modules.json'

type AzureModule = typeof modules[number]

export function runDeterministicQualityReview(input: {
  bicep: string
  request: GenerateInfraRequest
  selectedModules: AzureModule[]
}): QualityReview {
  const issues: QualityReview['issues'] = []
  const bicep = input.bicep
  const lower = bicep.toLowerCase()

  for (const module of input.selectedModules) {
    if (module.id === 'app-service' || module.id === 'functions') {
      if (!lower.includes('httpsonly') && !lower.includes('https_only')) {
        issues.push({
          severity: 'warning',
          category: 'security',
          title: `${module.name} does not enforce HTTPS`,
          description: 'Web apps should set httpsOnly: true to prevent unencrypted traffic.',
          suggestion: `Add httpsOnly: true to the ${module.name} resource properties.`
        })
      }
    }

    if (module.id === 'sql') {
      if (!lower.includes('publicnetworkaccess') && !lower.includes('public_network_access')) {
        issues.push({
          severity: 'warning',
          category: 'security',
          title: 'SQL Database public network access',
          description: 'Public network access should be disabled unless private endpoints are configured.',
          suggestion: 'Set publicNetworkAccess: \'Disabled\' on the SQL server.'
        })
      }
      if (lower.includes('changeme123')) {
        issues.push({
          severity: 'critical',
          category: 'security',
          title: 'Default SQL administrator password',
          description: 'The template uses a hard-coded placeholder password.',
          suggestion: 'Require the password as a secure parameter and generate a strong value at deployment time.'
        })
      }
    }

    if (module.id === 'storage') {
      if (!lower.includes('allowblobpublicaccess: false') && !lower.includes('allowblobpublicaccess=false')) {
        issues.push({
          severity: 'warning',
          category: 'security',
          title: 'Storage public blob access',
          description: 'Public blob access should be disabled by default.',
          suggestion: 'Set allowBlobPublicAccess: false on the storage account.'
        })
      }
      if (!lower.includes('minimumtlsversion')) {
        issues.push({
          severity: 'warning',
          category: 'security',
          title: 'Storage TLS version',
          description: 'Enforce a minimum TLS version to protect data in transit.',
          suggestion: 'Set minimumTlsVersion: \'TLS1_2\' on the storage account.'
        })
      }
    }

    if (module.id === 'key-vault') {
      if (!lower.includes('enablerbacauthorization')) {
        issues.push({
          severity: 'info',
          category: 'security',
          title: 'Key Vault authorization model',
          description: 'Consider using Azure RBAC for Key Vault access control.',
          suggestion: 'Set enableRbacAuthorization: true on the vault.'
        })
      }
    }

    if (module.id === 'cosmos-db') {
      if (!lower.includes('disablelocalauth') && !lower.includes('disable_local_auth')) {
        issues.push({
          severity: 'info',
          category: 'security',
          title: 'Cosmos DB local authentication',
          description: 'For production, disable local auth and use managed identities.',
          suggestion: 'Set disableLocalAuth: true when using managed identity.'
        })
      }
    }

    if (module.id === 'aks') {
      if (!lower.includes('azurepolicy') && !lower.includes('azure_policy')) {
        issues.push({
          severity: 'info',
          category: 'governance',
          title: 'AKS policy add-on',
          description: 'Consider enabling Azure Policy for AKS to enforce cluster guardrails.',
          suggestion: 'Add azurePolicy: { enabled: true } to addonProfiles.'
        })
      }
      if (!lower.includes('enableprivateluster')) {
        issues.push({
          severity: 'warning',
          category: 'security',
          title: 'AKS public API server',
          description: 'Private clusters reduce attack surface for the Kubernetes API.',
          suggestion: 'Consider enablePrivateCluster: true for production workloads.'
        })
      }
    }
  }

  if (!lower.includes('tags')) {
    issues.push({
      severity: 'info',
      category: 'maintainability',
      title: 'No resource tags',
      description: 'Tagging helps with cost tracking, ownership, and environment management.',
      suggestion: 'Add a tags object and apply it to each resource.'
    })
  }

  const hasProductionSku = /sku:\s*\{[\s\S]*?name:\s*'(premium|standard_s1|standard_microsoft|s1|p1v2|p2v2|p3v2|standard_b2s)'/i.test(bicep)
  if (!hasProductionSku && input.selectedModules.length > 2) {
    issues.push({
      severity: 'info',
      category: 'cost',
      title: 'Review SKU sizing',
      description: 'Multiple services are using basic or developer SKUs.',
      suggestion: 'Confirm SKUs match expected production workload before deploying.'
    })
  }

  const score = Math.max(0, Math.min(100, 100 - issues.filter((i) => i.severity === 'critical').length * 25 - issues.filter((i) => i.severity === 'warning').length * 10 - issues.filter((i) => i.severity === 'info').length * 3))
  const passed = score >= 70

  return {
    summary: issues.length === 0
      ? 'The generated template follows common Azure best practices.'
      : `Found ${issues.length} quality concern${issues.length === 1 ? '' : 's'} to review before deployment.`,
    score,
    passed,
    issues
  }
}
