import { fileURLToPath } from 'node:url'
import { checkPortraitAssets } from './lib/portraitAssets.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const count = await checkPortraitAssets(root)
console.log(`肖像检查通过：${count} 张，素材与清单一致。`)
