import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const lint = new ESLint()
const errors = async (filePath, source) => (await lint.lintText(source, { filePath }))[0].messages.filter((message) => message.severity === 2)

describe('模块导入限制', () => {
  it.each(['pages/Probe.jsx', 'components/Probe.jsx', 'hooks/useProbe.js'])(
    '%s 不能直接操作 Supabase，也不能用动态导入绕过检查', async (path) => {
      expect(await errors(`src/${path}`, "import '../lib/supabase.js'\n")).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'no-restricted-imports' })]))
      expect(await errors(`src/${path}`, "export const load = (path) => import(path)\n")).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'no-restricted-syntax' })]))
    },
  )

  it.each(['lib/probe.js', 'data/probe.js'])('%s 不能反过来依赖界面', async (path) => {
    expect(await errors(`src/${path}`, "export { default } from '../pages/Home.jsx'\n")).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'no-restricted-imports' })]))
    expect(await errors(`src/${path}`, "export const load = () => import('react')\n")).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'no-restricted-syntax' })]))
  })

  it('业务导入和统一的页面按需下载仍可使用', async () => {
    expect(await errors('src/hooks/useProbe.js', "export { fetchReviewStates } from '../lib/vocabularyBackend.js'\n")).toEqual([])
    expect(await errors('src/routes/probe.js', "export const load = () => import('../pages/Home.jsx')\n")).toEqual([])
  })
})
