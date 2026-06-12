import type { QualityReview } from './cloudSchemaTypes'

const suspiciousSecretPatterns = [
  {
    title: 'Hard-coded password-like value',
    pattern: /(?:password|adminPassword|administratorLoginPassword)\s*:\s*'[^']{6,}'/i
  },
  {
    title: 'Hard-coded secret-like value',
    pattern: /(?:secret|clientSecret|apiKey|token)\s*:\s*'[^']{8,}'/i
  },
  {
    title: 'Hard-coded connection string',
    pattern: /(?:connectionString|connString)\s*:\s*'[^']*(?:AccountKey|Password|SharedAccessKey)[^']*'/i
  }
]

export function findBicepSecretIssues(bicep: string): QualityReview['issues'] {
  const issues: QualityReview['issues'] = []

  for (const check of suspiciousSecretPatterns) {
    if (!check.pattern.test(bicep)) continue
    issues.push({
      severity: 'critical',
      category: 'security',
      title: check.title,
      description: 'The generated Bicep appears to include a hard-coded credential or secret-like literal.',
      suggestion: 'Use secure parameters, Key Vault references, or managed identity instead of embedding secrets in the template.'
    })
  }

  return issues
}

export function applySecurityGuardrails(review: QualityReview, bicep: string): QualityReview {
  const guardrailIssues = findBicepSecretIssues(bicep)
  if (!guardrailIssues.length) return review

  const issues = [...guardrailIssues, ...review.issues]
  const score = Math.max(0, review.score - guardrailIssues.length * 35)

  return {
    ...review,
    summary: `Security guardrail found ${guardrailIssues.length} critical secret-handling issue${guardrailIssues.length === 1 ? '' : 's'}. ${review.summary}`,
    score,
    passed: false,
    issues
  }
}
