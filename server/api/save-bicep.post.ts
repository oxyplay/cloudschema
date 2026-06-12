import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

const saveBicepSchema = z.object({
  bicep: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const body = saveBicepSchema.parse(await readBody(event))
  const filePath = join(process.cwd(), 'main.bicep')
  await writeFile(filePath, body.bicep, 'utf8')
  return { path: filePath }
})
