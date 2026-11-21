import { describe, expect, it } from 'vitest'
import { loginReturnPath } from './loginReturn'

describe('答疑登录回跳', () => {
  it.each(['/assistant', '/assistant/new', '/assistant/legacy', '/ASSISTANT/thread-2/?q=1#reply'])(
    '保留列表或对话的完整地址 %s', (path) => expect(loginReturnPath(path)).toBe(path))
  it.each([null, 12, {}, '', 'https://other.invalid/', '//other.invalid', '/\\other.invalid',
    '/assistant/../../login', '/login', '/assistant/a/b', 'javascript:void(0)', '/assistant\n/other'])(
    '丢弃无效来路 %s', (path) => expect(loginReturnPath(path)).toBeNull())
})
