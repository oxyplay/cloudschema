export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  nitro: {
    preset: process.env.NITRO_PRESET || undefined
  },
  runtimeConfig: {
    azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
    azureOpenAIKey: process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY || '',
    azureOpenAIDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || '',
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
    azureAIFoundryProjectEndpoint: process.env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT || '',
    azureAIFoundryProjectName: process.env.AZURE_AI_FOUNDRY_PROJECT_NAME || '',
    foundryIQKnowledgeSourceName: process.env.FOUNDRY_IQ_KNOWLEDGE_SOURCE_NAME || '',
    azureAISearchEndpoint: process.env.AZURE_AI_SEARCH_ENDPOINT || '',
    azureAISearchKey: process.env.AZURE_AI_SEARCH_KEY || '',
    azureAISearchIndexName: process.env.AZURE_AI_SEARCH_INDEX_NAME || '',
    azureAISearchContentField: process.env.AZURE_AI_SEARCH_CONTENT_FIELD || 'content',
    azureAISearchTitleField: process.env.AZURE_AI_SEARCH_TITLE_FIELD || 'title',
    azureSubscriptionId: process.env.AZURE_SUBSCRIPTION_ID || '',
    azureResourceGroup: process.env.AZURE_RESOURCE_GROUP || '',
    azureLocation: process.env.AZURE_LOCATION || 'eastus',
    public: {
      appName: 'CloudSchema',
      azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
      azureAIFoundryProjectEndpoint: process.env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT || ''
    }
  }
})
