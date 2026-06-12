import type modules from '../../data/azure-modules.json'

type AzureModule = typeof modules[number]

type TemplateInput = {
  modules: AzureModule[]
  owner: string
  environment: string
  injectDemoError: boolean
}

const interpolation = (expression: string) => '${' + expression + '}'

export function buildDeterministicBicep(input: TemplateInput) {
  const ids = new Set(input.modules.map((module) => module.id))
  const resourceBlocks: string[] = []
  const outputs: string[] = []

  resourceBlocks.push(`param location string = resourceGroup().location
param owner string = '${safeString(input.owner)}'
param environment string = '${safeString(input.environment)}'
param namePrefix string = 'cloudschema'

var tags = {
  owner: owner
  environment: environment
  generatedBy: 'CloudSchema'
}`)

  if (ids.has('application-insights')) {
    resourceBlocks.push(`resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${interpolation('namePrefix')}-appi'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
  }
}`)
    outputs.push('output applicationInsightsName string = appInsights.name')
  }

  if (ids.has('storage') || ids.has('functions')) {
    resourceBlocks.push(`resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: toLower('${interpolation('namePrefix')}${interpolation('uniqueString(resourceGroup().id)')}')
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}`)
    outputs.push('output storageAccountName string = storageAccount.name')
  }

  if (ids.has('app-service') || ids.has('functions')) {
    resourceBlocks.push(`resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${interpolation('namePrefix')}-plan'
  location: location
  tags: tags
  sku: {
    name: 'B1'
    tier: 'Basic'
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}`)
    outputs.push('output appServicePlanName string = appServicePlan.name')
  }

  if (ids.has('app-service')) {
    const appSettings = ids.has('application-insights')
      ? "{ name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }"
      : "{ name: 'APP_ENV', value: environment }"

    resourceBlocks.push(`resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${interpolation('namePrefix')}-web'
  location: location
  tags: tags
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: true
      appSettings: [
        ${appSettings}
      ]
    }
  }
}`)
    outputs.push('output webAppName string = webApp.name')
  }

  if (ids.has('functions')) {
    resourceBlocks.push(`resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${interpolation('namePrefix')}-func'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      appSettings: [
        { name: 'AzureWebJobsStorage', value: 'UseDevelopmentStorage=true' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
      ]
    }
  }
}`)
    outputs.push('output functionAppName string = functionApp.name')
  }

  if (ids.has('static-web-app')) {
    resourceBlocks.push(`resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${interpolation('namePrefix')}-swa'
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    repositoryUrl: 'https://github.com/example/cloudschema-demo'
    branch: 'main'
    buildProperties: {
      appLocation: '/'
      outputLocation: 'dist'
    }
  }
}`)
    outputs.push('output staticWebAppName string = staticWebApp.name')
  }

  if (ids.has('sql')) {
    resourceBlocks.push(`@secure()
param sqlAdminPassword string

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: '${interpolation('namePrefix')}-sql-${interpolation('uniqueString(resourceGroup().id)')}'
  location: location
  tags: tags
  properties: {
    administratorLogin: 'cloudadmin'
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: 'appdb'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
}`)
    outputs.push('output sqlDatabaseName string = sqlDatabase.name')
  }

  if (ids.has('cosmos-db')) {
    resourceBlocks.push(`resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: toLower('${interpolation('namePrefix')}-cosmos-${interpolation('uniqueString(resourceGroup().id)')}')
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: 'appdb'
  properties: {
    resource: {
      id: 'appdb'
    }
  }
}`)
    outputs.push('output cosmosAccountName string = cosmosAccount.name')
  }

  if (ids.has('redis')) {
    resourceBlocks.push(`resource redisCache 'Microsoft.Cache/redis@2024-03-01' = {
  name: '${interpolation('namePrefix')}-redis-${interpolation('uniqueString(resourceGroup().id)')}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    family: 'C'
    capacity: 0
  }
  properties: {
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
}`)
    outputs.push('output redisCacheName string = redisCache.name')
  }

  if (ids.has('service-bus')) {
    resourceBlocks.push(`resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: '${interpolation('namePrefix')}-sb-${interpolation('uniqueString(resourceGroup().id)')}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
}

resource serviceBusQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'orders'
  properties: {
    maxDeliveryCount: 10
  }
}`)
    outputs.push('output serviceBusNamespaceName string = serviceBusNamespace.name')
  }

  if (ids.has('event-hubs')) {
    resourceBlocks.push(`resource eventHubNamespace 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: '${interpolation('namePrefix')}-eh-${interpolation('uniqueString(resourceGroup().id)')}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 1
  }
}

resource eventHub 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = {
  parent: eventHubNamespace
  name: 'telemetry'
  properties: {
    partitionCount: 2
    messageRetentionInDays: 1
  }
}`)
    outputs.push('output eventHubNamespaceName string = eventHubNamespace.name')
  }

  if (ids.has('container-apps')) {
    resourceBlocks.push(`resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${interpolation('namePrefix')}-env'
  location: location
  tags: tags
  properties: {}
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${interpolation('namePrefix')}-app'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
      }
    }
    template: {
      containers: [
        {
          name: 'app'
          image: 'mcr.microsoft.com/azuredocs/aci-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}`)
    outputs.push('output containerAppName string = containerApp.name')
  }

  if (ids.has('aks')) {
    resourceBlocks.push(`resource aksCluster 'Microsoft.ContainerService/managedClusters@2024-02-01' = {
  name: '${interpolation('namePrefix')}-aks'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: '${interpolation('namePrefix')}${interpolation('uniqueString(resourceGroup().id)')}'
    agentPoolProfiles: [
      {
        name: 'nodepool1'
        count: 1
        vmSize: 'Standard_B2s'
        mode: 'System'
        osType: 'Linux'
      }
    ]
  }
}`)
    outputs.push('output aksClusterName string = aksCluster.name')
  }

  if (ids.has('app-configuration')) {
    resourceBlocks.push(`resource appConfig 'Microsoft.AppConfiguration/configurationStores@2024-05-01' = {
  name: '${interpolation('namePrefix')}-appconfig-${interpolation('uniqueString(resourceGroup().id)')}'
  location: location
  tags: tags
  sku: {
    name: 'standard'
  }
}`)
    outputs.push('output appConfigName string = appConfig.name')
  }

  if (ids.has('cdn')) {
    resourceBlocks.push(`resource cdnProfile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: '${interpolation('namePrefix')}-cdn'
  location: 'Global'
  tags: tags
  sku: {
    name: 'Standard_Microsoft'
  }
}`)
    outputs.push('output cdnProfileName string = cdnProfile.name')
  }

  if (ids.has('front-door')) {
    resourceBlocks.push(`resource frontDoor 'Microsoft.Network/frontDoors@2021-06-01' = {
  name: '${interpolation('namePrefix')}-fd'
  location: 'Global'
  tags: tags
  properties: {
    routingRules: [
      {
        name: 'default'
        acceptedProtocols: ['Https']
        patternsToMatch: ['/*']
        frontendEndpoints: [
          {
            id: resourceId('Microsoft.Network/frontDoors/frontendEndpoints', '${interpolation('namePrefix')}-fd', 'default')
          }
        ]
        routeConfiguration: {
          '@odata.type': '#Microsoft.Azure.FrontDoor.Models.FrontdoorForwardingConfiguration'
          forwardingProtocol: 'HttpsOnly'
          backendPool: {
            id: resourceId('Microsoft.Network/frontDoors/backendPools', '${interpolation('namePrefix')}-fd', 'default')
          }
        }
      }
    ]
    backendPools: [
      {
        name: 'default'
        properties: {
          backends: []
        }
      }
    ]
    frontendEndpoints: [
      {
        name: 'default'
        properties: {
          hostName: '${interpolation('namePrefix')}-fd.azurefd.net'
        }
      }
    ]
  }
}`)
    outputs.push('output frontDoorName string = frontDoor.name')
  }

  if (ids.has('api-management')) {
    resourceBlocks.push(`resource apiManagement 'Microsoft.ApiManagement/service@2023-05-01-preview' = {
  name: '${interpolation('namePrefix')}-apim-${interpolation('uniqueString(resourceGroup().id)')}'
  location: location
  tags: tags
  sku: {
    name: 'Developer'
    capacity: 1
  }
  properties: {
    publisherEmail: 'admin@example.com'
    publisherName: 'CloudSchema'
  }
}`)
    outputs.push('output apiManagementName string = apiManagement.name')
  }

  if (ids.has('log-analytics')) {
    resourceBlocks.push(`resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${interpolation('namePrefix')}-law-${interpolation('uniqueString(resourceGroup().id)')}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}`)
    outputs.push('output logAnalyticsName string = logAnalytics.name')
  }

  if (ids.has('key-vault')) {
    resourceBlocks.push(`resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${interpolation('namePrefix')}-kv-${interpolation('uniqueString(resourceGroup().id)')}'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enabledForTemplateDeployment: false
  }
}`)
    outputs.push('output keyVaultName string = keyVault.name')
  }

  const bicep = [...resourceBlocks, ...outputs].join('\n\n')

  if (!input.injectDemoError) {
    return bicep
  }

  return bicep.replace("sku: {\n    name: 'B1'", "sku {\n    name: 'B1'")
}

export function repairKnownBicepErrors(bicep: string, error: string) {
  let repaired = bicep

  if (repaired.includes("sku {\n    name: 'B1'")) {
    repaired = repaired.replace("sku {\n    name: 'B1'", "sku: {\n    name: 'B1'")
  }

  if (error.includes('UseDevelopmentStorage')) {
    repaired = repaired.replace(
      "{ name: 'AzureWebJobsStorage', value: 'UseDevelopmentStorage=true' }",
      "{ name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${listKeys(storageAccount.id, storageAccount.apiVersion).keys[0].value}' }"
    )
  }

  return repaired
}

function safeString(value: string) {
  return value.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 64) || 'platform-team'
}
