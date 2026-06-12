import { z } from 'zod'

export const generateInfraRequestSchema = z.object({
  projectDescription: z.string().min(8),
  modules: z.array(z.string()).min(1),
  owner: z.string().min(1).default('platform-team'),
  environment: z.string().min(1).default('dev'),
  injectDemoError: z.boolean().default(false),
  runAzureValidate: z.boolean().default(false)
})

const qualityReviewSchema = z.object({
  summary: z.string(),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  issues: z.array(z.object({
    severity: z.enum(['info', 'warning', 'critical']),
    category: z.string(),
    title: z.string(),
    description: z.string(),
    suggestion: z.string().optional(),
    lineNumber: z.number().optional()
  }))
})

const agentTraceSchema = z.object({
  agent: z.string(),
  status: z.enum(['planned', 'completed', 'failed', 'skipped']),
  input: z.string(),
  output: z.string(),
  tool: z.string().optional()
})

export const cloudSchemaResponseSchema = z.object({
  projectSummary: z.string(),
  selectedModules: z.array(z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    beginnerDescription: z.string(),
    bicepResourceType: z.string()
  })),
  standardsApplied: z.array(z.string()),
  standardsProvider: z.enum(['azure-ai-search', 'local-markdown']),
  standardsCitations: z.array(z.object({
    source: z.string(),
    title: z.string(),
    excerpt: z.string()
  })),
  bicep: z.string(),
  agentTrace: z.array(agentTraceSchema),
  attempts: z.array(z.object({
    attempt: z.number(),
    status: z.enum(['generated', 'compile_failed', 'compile_passed', 'repaired', 'azure_validate_failed', 'azure_validate_passed', 'skipped']),
    summary: z.string(),
    command: z.string().optional(),
    error: z.string().optional()
  })),
  architectureGraph: z.object({
    nodes: z.array(z.object({
      id: z.string(),
      label: z.string(),
      type: z.string()
    })),
    edges: z.array(z.object({
      from: z.string(),
      to: z.string(),
      label: z.string()
    })),
    mermaid: z.string()
  }),
  explanation: z.object({
    overview: z.string(),
    resources: z.array(z.object({
      name: z.string(),
      purpose: z.string(),
      beginnerNote: z.string()
    })),
    codeBlocks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      purpose: z.string(),
      beginnerNote: z.string()
    })),
    deployCommands: z.array(z.string()),
    safetyNotes: z.array(z.string()),
    nextExperiments: z.array(z.string())
  }),
  qualityReview: qualityReviewSchema
})

export type QualityReview = z.infer<typeof qualityReviewSchema>

export type GenerateInfraRequest = z.infer<typeof generateInfraRequestSchema>
export type CloudSchemaResponse = z.infer<typeof cloudSchemaResponseSchema>
