import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export function validatePortraitManifest(manifest) {
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('肖像清单不能为空。')
  const seen = new Set()
  for (const [index, portrait] of manifest.entries()) {
    if (!portrait || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(portrait.slug || '')) {
      throw new Error(`第 ${index + 1} 条肖像的 slug 无效。`)
    }
    if (seen.has(portrait.slug)) throw new Error(`肖像 slug 重复：${portrait.slug}`)
    seen.add(portrait.slug)
    if (portrait.order !== index + 1 || !portrait.name?.trim() || !Number.isFinite(portrait.birthYear)) {
      throw new Error(`肖像元数据或顺序无效：${portrait.slug}`)
    }
    if (portrait.file !== `portraits/${portrait.slug}.jpg`) {
      throw new Error(`肖像路径与 slug 不一致：${portrait.slug}`)
    }
    const source = new URL(portrait.sourceUrl)
    if (source.protocol !== 'https:' || !['commons.wikimedia.org', 'upload.wikimedia.org'].includes(source.hostname)) {
      throw new Error(`肖像来源不是预期的 Wikimedia 地址：${portrait.slug}`)
    }
  }
  return manifest
}

// Reject error pages and obviously truncated downloads. This is a signature
// check, not a replacement for decoding/rendering images in a browser.
export function validatePortraitJpeg(bytes, label) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff
    || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new Error(`肖像不是完整的 JPEG 文件：${label}`)
  }
}

export async function readPortraitManifest(root) {
  const manifest = JSON.parse(await readFile(join(root, 'src/data/portraits.json'), 'utf8'))
  return validatePortraitManifest(manifest)
}

export async function checkPortraitAssets(root) {
  const manifest = await readPortraitManifest(root)
  for (const portrait of manifest) {
    const path = join(root, 'public', portrait.file)
    let bytes
    try { bytes = await readFile(path) } catch (error) {
      throw new Error(`无法读取肖像 ${portrait.file}；请恢复仓库素材或运行 npm run portraits:fetch。`, { cause: error })
    }
    validatePortraitJpeg(bytes, portrait.file)
  }
  // Vite copies all of public, including ignored files. Do not ship retired
  // local images merely because a developer still has them in this directory.
  const expected = new Set(manifest.map(({ slug }) => `${slug}.jpg`))
  const extras = (await readdir(join(root, 'public/portraits')))
    .filter((name) => name !== '.DS_Store' && !expected.has(name))
  if (extras.length) throw new Error(`肖像目录有清单外文件，请移到 public 之外：${extras.join(', ')}`)
  return manifest.length
}
