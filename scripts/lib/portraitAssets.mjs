import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

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
    if (portrait.file !== `portraits/${portrait.slug}.webp`) {
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
export function validatePortraitWebp(bytes, label) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF'
    || bytes.toString('ascii', 8, 12) !== 'WEBP'
    || bytes.readUInt32LE(4) !== bytes.length - 8
    || !['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) {
    throw new Error(`肖像不是完整的 WebP 文件：${label}`)
  }
}

// Convert to sRGB and omit source metadata, including oversized ICC profiles.
// Keep the cover's existing 280 px width; smaller sources are not enlarged.
export function encodePortraitWebp(bytes) {
  return sharp(bytes).rotate().resize({ width: 280, withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 }).toBuffer()
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
    validatePortraitWebp(bytes, portrait.file)
  }
  // Vite copies all of public, including ignored files. Do not ship retired
  // local images merely because a developer still has them in this directory.
  const expected = new Set(manifest.map(({ slug }) => `${slug}.webp`))
  const extras = (await readdir(join(root, 'public/portraits')))
    .filter((name) => name !== '.DS_Store' && !expected.has(name))
  if (extras.length) throw new Error(`肖像目录有清单外文件，请移到 public 之外：${extras.join(', ')}`)
  return manifest.length
}
