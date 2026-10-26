import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { checkPortraitAssets, encodePortraitWebp, validatePortraitManifest } from './portraitAssets.mjs'
import manifest from '../../src/data/portraits.json'
import { portraits, portraitSrc } from '../../src/data/portraits'

let root
const sample = manifest[0]
const imagePath = () => join(root, 'public', sample.file)
const writeManifest = (rows) => writeFile(join(root, 'src/data/portraits.json'), JSON.stringify(rows))

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'portrait-check-'))
  await mkdir(join(root, 'src/data'), { recursive: true })
  await mkdir(join(root, 'public/portraits'), { recursive: true })
  await writeManifest([sample])
  const image = await readFile(new URL(`../../public/${sample.file}`, import.meta.url))
  await writeFile(imagePath(), image)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('portrait assets at the build boundary', () => {
  it('uses the same ordered manifest and paths as the rendered cover', async () => {
    expect(validatePortraitManifest(manifest)).toHaveLength(portraits.length)
    expect(portraits).toEqual(manifest.map(({ name, slug, birthYear }) => ({ name, slug, birthYear })))
    expect(manifest.every((p) => portraitSrc(p.slug) === `/${p.file}`)).toBe(true)
    await expect(checkPortraitAssets(root)).resolves.toBe(1)
  })

  it('fails when a required image is missing, even if all metadata is present', async () => {
    await rm(imagePath())
    await expect(checkPortraitAssets(root)).rejects.toThrow(sample.file)
  })

  it('rejects an HTML error page saved as a large .webp file', async () => {
    await writeFile(imagePath(), '<html>Too many requests</html>'.repeat(200))
    await expect(checkPortraitAssets(root)).rejects.toThrow('WebP')
  })

  it('rejects a truncated image and unlisted files Vite would otherwise copy', async () => {
    const image = await readFile(imagePath())
    await writeFile(imagePath(), image.subarray(0, image.length - 10))
    await expect(checkPortraitAssets(root)).rejects.toThrow('WebP')
    await writeFile(imagePath(), image)
    await writeFile(join(root, 'public/portraits/old.jpg'), image)
    await expect(checkPortraitAssets(root)).rejects.toThrow('清单外文件')
  })

  it('rejects duplicate slugs, reordered entries and paths outside the portrait directory', async () => {
    await writeManifest([sample, { ...sample, order: 2 }])
    await expect(checkPortraitAssets(root)).rejects.toThrow('重复')
    await writeManifest([{ ...sample, order: 2 }])
    await expect(checkPortraitAssets(root)).rejects.toThrow('顺序')
    await writeManifest([{ ...sample, file: '../private.webp' }])
    await expect(checkPortraitAssets(root)).rejects.toThrow('路径')
  })
})

describe('downloaded portrait optimization', () => {
  it('limits source resolution and strips metadata before saving a decodable image', async () => {
    const source = await sharp({ create: { width: 560, height: 840, channels: 3, background: '#b0a090' } })
      .withMetadata().jpeg().toBuffer()
    expect((await sharp(source).metadata()).icc).toBeDefined()
    const optimized = await encodePortraitWebp(source)
    const metadata = await sharp(optimized).metadata()
    expect(metadata).toMatchObject({ format: 'webp', width: 280, height: 420 })
    expect(metadata.icc).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
    expect(optimized.length).toBeLessThan(source.length)
    await expect(sharp(optimized).raw().toBuffer()).resolves.toBeInstanceOf(Buffer)
  })

  it('rejects an upstream error page instead of saving it as a portrait', async () => {
    await expect(encodePortraitWebp(Buffer.from('<html>Too many requests</html>'))).rejects.toThrow()
  })
})
