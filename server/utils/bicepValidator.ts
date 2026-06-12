import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

export type BicepCompileResult = {
  ok: boolean
  command: string
  bicepPath: string
  armPath: string
  stdout: string
  stderr: string
  armTemplate?: unknown
}

export async function compileBicep(bicep: string, workspaceId: string): Promise<BicepCompileResult> {
  const dir = join(process.cwd(), '.data', 'generated', workspaceId)
  await mkdir(dir, { recursive: true })

  const bicepPath = join(dir, 'main.bicep')
  const armPath = join(dir, 'main.json')
  await writeFile(bicepPath, bicep, 'utf8')

  const command = 'az bicep build --file main.bicep --outfile main.json'
  const result = await runCommand('az', ['bicep', 'build', '--file', bicepPath, '--outfile', armPath])

  if (result.code !== 0) {
    return {
      ok: false,
      command,
      bicepPath,
      armPath,
      stdout: result.stdout,
      stderr: result.stderr
    }
  }

  const armTemplate = JSON.parse(await readFile(armPath, 'utf8'))

  return {
    ok: true,
    command,
    bicepPath,
    armPath,
    stdout: result.stdout,
    stderr: result.stderr,
    armTemplate
  }
}

function runCommand(command: string, args: string[]) {
  return new Promise<{ code: number | null, stdout: string, stderr: string }>((resolve) => {
    const child = spawn(command, args, { shell: false })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}`.trim() })
    })

    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}
