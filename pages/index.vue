<script setup lang="ts">
import modulesCatalog from '../data/azure-modules.json'

const step = ref(1)
const projectDescription = ref('I am a beginner building a small SaaS app with a web frontend, an API, file uploads, monitoring, and safe secret storage.')
const owner = ref('platform-team')
const environment = ref('dev')
const selectedModules = ref(['app-service', 'storage', 'key-vault', 'application-insights'])
const injectDemoError = ref(true)
const runAzureValidate = ref(false)
const pending = ref(false)
const result = ref<any>(null)
const errorMessage = ref('')

const exampleLoading = ref(false)
const exampleComplexity = ref(3)

const complexityLabels = ['Easy', 'Simple', 'Medium', 'Complex', 'Enterprise']

const runtimeConfig = useRuntimeConfig()
const hasOpenAI = computed(() => Boolean(runtimeConfig.public.azureOpenAIEndpoint))
const hasFoundry = computed(() => Boolean(runtimeConfig.public.azureAIFoundryProjectEndpoint))

const examplePrompts = [
  'I am building a small e-commerce site with a product catalog, shopping cart, and order API. I need a database, file storage for product images, and monitoring.',
  'I want to deploy a personal blog with a static frontend, comments API, and email notifications.',
  'My team needs an internal dashboard that pulls data from a SQL database, runs background jobs, and stores uploaded reports securely.',
  'I am creating a mobile app backend with user authentication, image uploads, push notifications, and analytics.',
  'We need a CI/CD landing page with a documentation site, API docs, and a simple contact form backend.'
]

async function generateExample() {
  exampleLoading.value = true
  try {
    const response = await $fetch<{ example?: string, modules?: string[] }>('/api/generate-example', {
      method: 'POST',
      body: { complexity: exampleComplexity.value }
    })
    projectDescription.value = (response.example || examplePrompts[0]) as string
    if (response.modules?.length) {
      const valid = response.modules.filter((id) => modulesCatalog.some((m) => m.id === id))
      if (valid.length) selectedModules.value = valid
    }
  } finally {
    exampleLoading.value = false
  }
}
const statuses = ref<Record<string, { ok: boolean, latency?: number }>>({
  'Azure Bicep CLI': { ok: true },
  'Azure OpenAI': { ok: hasOpenAI.value },
  'Azure AI Foundry': { ok: hasFoundry.value }
})

onMounted(async () => {
  await Promise.all([
    checkBicepLatency(),
    checkOpenAILatency(),
    checkFoundryLatency()
  ])
})

async function checkBicepLatency() {
  const start = performance.now()
  try {
    await $fetch('/api/health-bicep')
    statuses.value['Azure Bicep CLI'] = { ok: true, latency: Math.round(performance.now() - start) }
  } catch {
    statuses.value['Azure Bicep CLI'] = { ok: false, latency: Math.round(performance.now() - start) }
  }
}

async function checkOpenAILatency() {
  if (!hasOpenAI.value) return
  const start = performance.now()
  try {
    await $fetch('/api/health-openai')
    statuses.value['Azure OpenAI'] = { ok: true, latency: Math.round(performance.now() - start) }
  } catch {
    statuses.value['Azure OpenAI'] = { ok: false, latency: Math.round(performance.now() - start) }
  }
}

async function checkFoundryLatency() {
  if (!hasFoundry.value) return
  const start = performance.now()
  try {
    await $fetch('/api/health-foundry')
    statuses.value['Azure AI Foundry'] = { ok: true, latency: Math.round(performance.now() - start) }
  } catch {
    statuses.value['Azure AI Foundry'] = { ok: false, latency: Math.round(performance.now() - start) }
  }
}

const graphRef = ref<HTMLDivElement | null>(null)
let mermaidModule: typeof import('mermaid') | null = null

async function renderMermaid(diagram: string) {
  if (!process.client || !graphRef.value) return
  if (!mermaidModule) {
    mermaidModule = await import('mermaid')
    mermaidModule.default.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        primaryColor: '#eaf2ff',
        primaryTextColor: '#1f2937',
        primaryBorderColor: '#b8c9f8',
        lineColor: '#6894fa',
        fontFamily: 'Inter, system-ui, sans-serif'
      }
    })
  }
  await nextTick()
  const id = `graph-${Date.now()}`
  const { svg } = await mermaidModule.default.render(id, diagram)
  graphRef.value.innerHTML = svg
}

watch(
  () => result.value?.architectureGraph?.mermaid,
  (diagram) => {
    if (diagram && process.client) {
      nextTick(() => renderMermaid(diagram))
    }
  }
)

let hljsModule: typeof import('highlight.js/lib/core') | null = null

const bicepCodeSpans = ref<Array<{ id: string, startLine: number, endLine: number }>>([])
const hoveredCodeBlockId = ref('')
const hoverPopup = ref<{ x: number, y: number, title: string, description: string, beginnerNote: string } | null>(null)
const bicepCodeRef = ref<HTMLPreElement | null>(null)

const hoverPopupStyle = computed(() => ({
  left: `${hoverPopup.value?.x ?? 0}px`,
  top: `${hoverPopup.value?.y ?? 0}px`
}))

const qualityReviewOpen = ref(false)
const qualitySortBy = ref<'severity' | 'category'>('severity')

const sortedQualityIssues = computed(() => {
  const issues = result.value?.qualityReview?.issues || []
  if (qualitySortBy.value === 'severity') {
    return [...issues].sort((a, b) => {
      const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    })
  }
  return [...issues].sort((a, b) => a.category.localeCompare(b.category))
})

function qualityIssueClass(severity: string) {
  return {
    critical: 'quality-critical',
    warning: 'quality-warning',
    info: 'quality-info'
  }[severity] || 'quality-info'
}

function getCodeBlockDescription(id: string) {
  return result.value?.explanation?.codeBlocks?.find((block: any) => block.id === id) || null
}

function findBicepCodeSpans(code: string) {
  const lines = code.split('\n')
  const spans: Array<{ id: string, startLine: number, endLine: number }> = []

  function endOfGroupedLines(startLine: number, keyword: string) {
    let endLine = startLine
    for (let i = startLine + 1; i < lines.length; i += 1) {
      const line = lines[i]?.trim() || ''
      if (!line.startsWith(`${keyword} `)) break
      endLine = i
    }
    return endLine
  }

  function endOfBracedBlock(startLine: number) {
    let balance = 0
    for (let i = startLine; i < lines.length; i += 1) {
      const line = lines[i] || ''
      balance += (line.match(/{/g) || []).length
      balance -= (line.match(/}/g) || []).length
      if (i > startLine && balance <= 0) return i
      if (i === startLine && balance <= 0) return i
    }
    return lines.length - 1
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() || ''

    if (!line) continue

    if (line.startsWith('param ')) {
      const endLine = endOfGroupedLines(i, 'param')
      spans.push({ id: 'params', startLine: i, endLine })
      i = endLine
      continue
    }

    if (line.startsWith('var ')) {
      const name = line.match(/^var\s+(\w+)/)?.[1]
      if (!name) continue
      const endLine = endOfBracedBlock(i)
      spans.push({ id: `var:${name}`, startLine: i, endLine })
      i = endLine
      continue
    }

    if (line.startsWith('resource ')) {
      const name = line.match(/^resource\s+(\w+)/)?.[1]
      if (!name) continue
      const endLine = endOfBracedBlock(i)
      spans.push({ id: `resource:${name}`, startLine: i, endLine })
      i = endLine
      continue
    }

    if (line.startsWith('output ')) {
      const endLine = endOfGroupedLines(i, 'output')
      spans.push({ id: 'outputs', startLine: i, endLine })
      i = endLine
    }
  }

  return spans
}

function applyBicepHighlights() {
  if (!bicepCodeRef.value || !bicepCodeSpans.value.length) return
  const lines = bicepCodeRef.value.querySelectorAll('.hljs-line')
  lines.forEach((line) => {
    line.classList.remove('resource-active')
  })
  if (!hoveredCodeBlockId.value) return
  const span = bicepCodeSpans.value.find((s) => s.id === hoveredCodeBlockId.value)
  if (!span) return
  for (let i = span.startLine; i <= span.endLine; i++) {
    const line = lines[i]
    if (line) line.classList.add('resource-active')
  }
}

function handleCodeBlockMouseEnter(event: MouseEvent, id: string) {
  hoveredCodeBlockId.value = id
  applyBicepHighlights()
  const description = getCodeBlockDescription(id)
  if (description) {
    hoverPopup.value = {
      x: event.clientX + 16,
      y: event.clientY + 12,
      title: description.title,
      description: description.purpose,
      beginnerNote: description.beginnerNote
    }
  }
}

function handleResourceMouseMove(event: MouseEvent) {
  if (!hoverPopup.value) return
  hoverPopup.value = {
    ...hoverPopup.value,
    x: event.clientX + 16,
    y: event.clientY + 12
  }
}

function handleResourceMouseLeave() {
  hoveredCodeBlockId.value = ''
  applyBicepHighlights()
  hoverPopup.value = null
}

function buildCodeHtml(rawCode: string, lang: string) {
  if (!hljsModule) return rawCode
  const highlighted = hljsModule.default.highlight(rawCode, { language: lang }).value
  const lines = highlighted.split('\n')
  return lines
    .map((line, index) => `<span class="hljs-line" data-line="${index}"><span class="line-number">${index + 1}</span><span class="line-code">${line || ' '}</span></span>`)
    .join('')
}

async function highlightAllCode() {
  if (!process.client) return
  if (!hljsModule) {
    hljsModule = await import('highlight.js/lib/core')
    const typescript = await import('highlight.js/lib/languages/typescript')
    const bash = await import('highlight.js/lib/languages/bash')
    hljsModule.default.registerLanguage('bicep', typescript.default)
    hljsModule.default.registerLanguage('bash', bash.default)
  }
  await nextTick()
  const codes = document.querySelectorAll('.code pre.line-numbers code')
  let renderedBicepCode = ''
  for (const code of codes) {
    const lang = code.classList.contains('language-bash') ? 'bash' : 'bicep'
    const raw = (code.textContent || '').trim()
    if (lang === 'bicep') renderedBicepCode = raw
    code.innerHTML = buildCodeHtml(raw, lang)
  }
  const bicepCode = document.querySelector('.code pre.line-numbers code.language-bicep')
  if (bicepCode) {
    bicepCodeSpans.value = findBicepCodeSpans(renderedBicepCode)
    attachBicepLineListeners(bicepCode)
  }
}

function attachBicepLineListeners(codeElement: Element) {
  codeElement.querySelectorAll('.hljs-line').forEach((lineEl) => {
    lineEl.addEventListener('mouseenter', handleLineMouseEnter)
    lineEl.addEventListener('mouseleave', handleResourceMouseLeave)
    lineEl.addEventListener('mousemove', (event) => handleResourceMouseMove(event as MouseEvent))
  })
}

function handleLineMouseEnter(event: Event) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const lineAttr = target.getAttribute('data-line')
  if (lineAttr === null) return
  const lineNumber = Number(lineAttr)
  const span = bicepCodeSpans.value.find((s) => lineNumber >= s.startLine && lineNumber <= s.endLine)
  if (!span) {
    handleResourceMouseLeave()
    return
  }
  handleCodeBlockMouseEnter(event as MouseEvent, span.id)
}

const toast = ref('')
let toastTimeout: ReturnType<typeof setTimeout> | null = null

function showToast(message: string) {
  toast.value = message
  if (toastTimeout) clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { toast.value = '' }, 1500)
}

function normalizeCodeSpacing(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n')
    .trim()
}

async function copyCode(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('Copied to clipboard')
  } catch {
    showToast('Copy failed')
  }
}

async function openInVSCode() {
  if (!result.value?.bicep) return
  try {
    const { path } = await $fetch<{ path: string }>('/api/save-bicep', {
      method: 'POST',
      body: { bicep: result.value.bicep }
    })
    window.open(`vscode://file${path}`)
  } catch {
    showToast('Could not open in VS Code')
  }
}

const graphPositions: Record<string, { left: string, top: string }> = {
  project: { left: '44%', top: '44%' },
  'static-web-app': { left: '8%', top: '18%' },
  cdn: { left: '4%', top: '8%' },
  'front-door': { left: '18%', top: '8%' },
  'app-service': { left: '22%', top: '66%' },
  'api-management': { left: '8%', top: '66%' },
  functions: { left: '10%', top: '43%' },
  'container-apps': { left: '24%', top: '43%' },
  aks: { left: '8%', top: '55%' },
  storage: { left: '68%', top: '17%' },
  sql: { left: '78%', top: '43%' },
  'cosmos-db': { left: '68%', top: '30%' },
  redis: { left: '84%', top: '30%' },
  'service-bus': { left: '62%', top: '55%' },
  'event-hubs': { left: '78%', top: '55%' },
  'key-vault': { left: '68%', top: '68%' },
  'app-configuration': { left: '84%', top: '68%' },
  'application-insights': { left: '42%', top: '8%' },
  'log-analytics': { left: '56%', top: '8%' }
}

async function generateInfrastructure() {
  pending.value = true
  errorMessage.value = ''

  try {
    result.value = await $fetch('/api/generate-infra', {
      method: 'POST',
      body: {
        projectDescription: projectDescription.value,
        modules: selectedModules.value,
        owner: owner.value,
        environment: environment.value,
        injectDemoError: injectDemoError.value,
        runAzureValidate: runAzureValidate.value
      }
    })
    result.value.bicep = normalizeCodeSpacing(result.value.bicep)
    if (result.value.explanation?.deployCommands) {
      result.value.explanation.deployCommands = result.value.explanation.deployCommands.filter(Boolean)
    }
    step.value = 3
    highlightAllCode()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <div class="top-inner">
        <img src="/cloudschema.svg" alt="CloudSchema" class="logo">
        <nav class="steps">
          <button :class="{ active: step >= 1 }" @click="step = 1">1. Describe</button>
          <button :class="{ active: step >= 2 }" @click="step = 2">2. Modules</button>
          <button :class="{ active: step >= 3 }" @click="result ? step = 3 : null">3. Review</button>
        </nav>
      </div>
    </header>

    <main class="wizard">
      <section v-if="step === 1" class="card">
        <h1>What are you building?</h1>
        <p class="lead">
          Describe your project in plain language. CloudSchema will choose the right Azure resources,
          apply your company standards, and generate a validated Bicep template.
        </p>

        <div class="label-row">
          <label class="label" for="project">Project description</label>
          <button class="small" :disabled="exampleLoading" @click="generateExample">
            {{ exampleLoading ? 'Generating...' : 'Generate AI example' }}
          </button>
        </div>

        <div class="complexity">
          <div class="complexity-header">
            <span class="complexity-label">Example complexity</span>
            <span class="complexity-value">{{ complexityLabels[exampleComplexity - 1] }}</span>
          </div>
          <input
            v-model.number="exampleComplexity"
            type="range"
            min="1"
            max="5"
            step="1"
            aria-label="Example complexity"
          >
          <div class="complexity-ticks">
            <span>Easy</span>
            <span>Most complex</span>
          </div>
        </div>

        <textarea id="project" v-model="projectDescription" rows="5" />

        <div class="form-row">
          <div>
            <label class="label" for="owner">Owner tag</label>
            <input id="owner" v-model="owner">
          </div>
          <div>
            <label class="label" for="environment">Environment tag</label>
            <input id="environment" v-model="environment">
          </div>
        </div>

        <div class="actions">
          <button class="primary" @click="step = 2">Next: pick modules</button>
        </div>
      </section>

      <section v-if="step === 2" class="card">
        <h1>Pick Azure modules</h1>
        <p class="lead">Select the services your project needs. Unsure? Start with a few and experiment.</p>

        <div class="prompt-summary">
          <span class="prompt-summary-label">Project description</span>
          <p>{{ projectDescription }}</p>
          <button class="small" @click="step = 1">Edit description</button>
        </div>

        <div class="modules">
          <label
            v-for="module in modulesCatalog"
            :key="module.id"
            class="module"
            :class="{ active: selectedModules.includes(module.id) }"
          >
            <input v-model="selectedModules" type="checkbox" :value="module.id">
            <span class="module-name">{{ module.name }}</span>
            <span class="module-desc">{{ module.beginnerDescription }}</span>
          </label>
        </div>

        <div class="options">
          <label class="row">
            <input v-model="injectDemoError" type="checkbox">
            Inject a demo compiler error to show self-repair
          </label>
          <label class="row">
            <input v-model="runAzureValidate" type="checkbox">
            Also validate against Azure Resource Manager
          </label>
        </div>

        <div class="actions">
          <button class="secondary" @click="step = 1">Back</button>
          <button class="primary" :disabled="pending" @click="generateInfrastructure">
            {{ pending ? 'Generating...' : 'Generate Bicep' }}
          </button>
        </div>

        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      </section>

      <section v-if="step === 3 && result" class="review">
        <div class="card">
          <div class="review-header">
            <div>
              <h1>Your infrastructure</h1>
              <p class="lead">{{ result.projectSummary }}</p>
            </div>
            <div class="status-pill" :class="result.attempts.some((a: any) => a.status === 'repaired') ? 'repaired' : 'ok'">
              {{ result.attempts.some((a: any) => a.status === 'repaired') ? 'Compiled after repair' : 'Compiled' }}
            </div>
          </div>

          <div class="resource-list">
            <span v-for="module in result.selectedModules" :key="module.id" class="resource-tag">{{ module.name }}</span>
          </div>

          <div class="grounding-panel">
            <div>
              <strong>Grounded standards</strong>
              <span>{{ result.standardsProvider === 'azure-ai-search' ? 'Azure AI Search retrieval' : 'Local Foundry IQ-style fallback' }}</span>
            </div>
            <ul>
              <li v-for="citation in result.standardsCitations" :key="`${citation.source}-${citation.title}`">
                <strong>{{ citation.title }}</strong>
                <small>{{ citation.source }}</small>
              </li>
            </ul>
          </div>

          <div ref="graphRef" class="graph-mermaid">
            <div v-if="!result.architectureGraph.mermaid" class="graph-fallback">
              <svg class="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M 48 48 C 38 35, 32 25, 20 22" />
                <path d="M 48 48 C 34 55, 28 65, 23 73" />
                <path d="M 53 48 C 62 36, 70 26, 77 23" />
                <path d="M 54 51 C 63 57, 69 68, 75 75" />
                <path d="M 50 42 C 49 29, 48 19, 48 14" />
              </svg>
              <div
                v-for="node in result.architectureGraph.nodes"
                :key="node.id"
                class="node"
                :style="graphPositions[node.id] || { left: '40%', top: '40%' }"
              >
                {{ node.label }}
                <small>{{ node.type }}</small>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2 class="section-title">Agent reasoning trace</h2>
          <p class="trace-note">
            Planner, generator, compiler verifier, repair agent, and reviewer steps are shown as an auditable reasoning loop.
          </p>
          <div class="timeline">
            <div
              v-for="trace in result.agentTrace"
              :key="`${trace.agent}-${trace.status}`"
              class="timeline-row"
              :class="{
                good: trace.status === 'completed',
                bad: trace.status === 'failed'
              }"
            >
              <span class="timeline-dot" />
              <div>
                <strong>{{ trace.agent }}</strong>
                <p>{{ trace.output }}</p>
                <code v-if="trace.tool">{{ trace.tool }}</code>
                <small class="trace-input">Input: {{ trace.input }}</small>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="quality-header">
            <div class="quality-title">
              <h2 class="section-title">Quality review</h2>
              <span
                class="quality-score"
                :class="result.qualityReview.passed ? 'quality-pass' : 'quality-fail'"
              >
                {{ result.qualityReview.score }}/100
              </span>
            </div>
            <button class="small" @click="qualityReviewOpen = !qualityReviewOpen">
              {{ qualityReviewOpen ? 'Hide details' : 'Show details' }}
            </button>
          </div>
          <p>{{ result.qualityReview.summary }}</p>

          <div v-if="qualityReviewOpen" class="quality-body">
            <div class="quality-sort">
              <span>Sort by</span>
              <select v-model="qualitySortBy">
                <option value="severity">Severity</option>
                <option value="category">Category</option>
              </select>
            </div>
            <div class="quality-issues">
              <div
                v-for="(issue, index) in sortedQualityIssues"
                :key="`${issue.category}-${issue.title}-${index}`"
                class="quality-issue"
                :class="qualityIssueClass(issue.severity)"
              >
                <div class="quality-issue-top">
                  <span class="quality-severity">{{ issue.severity }}</span>
                  <span class="quality-category">{{ issue.category }}</span>
                </div>
                <strong>{{ issue.title }}</strong>
                <p>{{ issue.description }}</p>
                <p v-if="issue.suggestion" class="quality-suggestion">
                  <strong>Suggestion:</strong> {{ issue.suggestion }}
                </p>
                <p v-if="issue.lineNumber" class="quality-line">
                  Line {{ issue.lineNumber }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="card code">
          <div class="code-header">
            <h2 class="section-title">Generated Bicep</h2>
            <div class="code-actions">
              <button class="small" @click="copyCode(result.bicep)">Copy</button>
              <button class="small" @click="openInVSCode">Open in VS Code</button>
            </div>
          </div>
          <pre
            ref="bicepCodeRef"
            class="line-numbers"
          ><code class="language-bicep">{{ result.bicep }}</code></pre>
        </div>

        <Teleport to="body">
          <div class="hover-popup" :class="{ visible: hoverPopup }" :style="hoverPopupStyle">
            <strong>{{ hoverPopup?.title }}</strong>
            <p>{{ hoverPopup?.description }}</p>
            <small>{{ hoverPopup?.beginnerNote }}</small>
          </div>
        </Teleport>

        <div class="card">
          <h2 class="section-title">Explain my infra</h2>
          <p>{{ result.explanation.overview }}</p>
          <ul class="explain-list">
            <li
              v-for="resource in result.explanation.resources"
              :key="resource.name"
            >
              <strong>{{ resource.name }}</strong>
              <span>{{ resource.purpose }}</span>
            </li>
          </ul>
        </div>

        <div class="card code">
          <div class="code-header">
            <h2 class="section-title">Deploy</h2>
            <button class="small" @click="copyCode(result.explanation.deployCommands.join('\n'))">Copy</button>
          </div>
          <pre class="line-numbers"><code class="language-bash">{{ result.explanation.deployCommands.join('\n') }}</code></pre>
        </div>

        <div class="actions">
          <button class="secondary" @click="step = 1">Start over</button>
          <button class="primary" @click="generateInfrastructure">Regenerate</button>
        </div>
      </section>
    </main>

    <div v-if="toast" class="toast">{{ toast }}</div>

    <footer class="footer">
      <div class="footer-inner">
        <span
          v-for="(status, name) in statuses"
          :key="name"
          class="connection"
          :class="{ on: status.ok }"
        >
          <span class="dot" />
          {{ name }}
          <span v-if="status.latency !== undefined" class="latency"
            >{{ status.latency }}ms</span
          >
        </span>
      </div>
    </footer>
  </div>
</template>
