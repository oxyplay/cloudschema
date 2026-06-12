import { DefaultAzureCredential } from '@azure/identity'

export type AzureValidationResult = {
  ok: boolean
  skipped: boolean
  summary: string
  error?: string
}

export async function validateArmTemplateWithAzure(input: {
  subscriptionId: string
  resourceGroupName: string
  deploymentName: string
  template: unknown
  location: string
}): Promise<AzureValidationResult> {
  if (!input.subscriptionId || !input.resourceGroupName) {
    return {
      ok: false,
      skipped: true,
      summary: 'Azure API validation skipped because AZURE_SUBSCRIPTION_ID or AZURE_RESOURCE_GROUP is not configured.'
    }
  }

  try {
    const credential = new DefaultAzureCredential()
    const token = await credential.getToken('https://management.azure.com/.default')
    const url = new URL(`https://management.azure.com/subscriptions/${input.subscriptionId}/resourcegroups/${input.resourceGroupName}/providers/Microsoft.Resources/deployments/${input.deploymentName}/validate`)
    url.searchParams.set('api-version', '2021-04-01')

    await $fetch(url.toString(), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.token}`,
        'content-type': 'application/json'
      },
      body: {
        properties: {
          mode: 'Incremental',
          template: input.template,
          parameters: {}
        }
      }
    })

    return {
      ok: true,
      skipped: false,
      summary: 'Azure Resource Manager accepted the generated ARM template for validation.'
    }
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      summary: 'Azure Resource Manager validation failed.',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
