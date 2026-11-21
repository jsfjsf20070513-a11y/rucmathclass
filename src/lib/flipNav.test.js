import { describe, expect, it, vi } from 'vitest'
import { createFlipNavigation } from './flipNav'

const location = (pathname, search = '', hash = '') => ({ pathname, search, hash })

describe('站内翻页来路', () => {
  it('页面和数据晚到，仍能读到发给该地址的标记', () => {
    vi.useFakeTimers()
    try {
      const nav = createFlipNavigation()
      nav.read(location('/'), 'POP')
      nav.mark('/', '/login?aux=1')
      vi.advanceTimersByTime(12000)
      expect(nav.read(location('/login', '?aux=1'), 'PUSH').flip?.from).toBe('/')
    } finally { vi.useRealTimers() }
  })

  it('快速后退、再前进，都不复用已消费的标记', () => {
    const nav = createFlipNavigation()
    const home = location('/')
    const shelf = location('/resources', '', '#shelf-2')
    nav.read(home, 'POP')
    nav.mark('/', '/resources#shelf-2')
    expect(nav.read(shelf, 'PUSH').flip).toBeTruthy()
    expect(nav.read(home, 'POP').flip).toBeNull()
    expect(nav.read(shelf, 'POP').flip).toBeNull()
    expect(nav.read(location('/resources', '', '#shelf-2'), 'PUSH').flip).toBeNull()
  })

  it('同一次到达可供首页定位、入场和重复渲染共同读取', () => {
    const nav = createFlipNavigation()
    nav.read(location('/lecture'), 'POP')
    const home = location('/')
    nav.mark('/lecture', '/')
    const arrival = nav.read(home, 'PUSH')
    expect(arrival.flip).toEqual({ from: '/lecture', to: '/' })
    expect(nav.read(home, 'PUSH')).toBe(arrival)
    expect(nav.read(home, 'PUSH').previous.pathname).toBe('/lecture')
  })

  it.each([
    [location('/login'), 'PUSH'], [location('/login', '?aux=1', '#other'), 'PUSH'],
    [location('/login', '?aux=1'), 'POP'],
  ])('改道或取消后，原标记作废', (interrupted, action) => {
    const nav = createFlipNavigation()
    nav.mark('/', '/login?aux=1')
    expect(nav.read(interrupted, action).flip).toBeNull()
    expect(nav.read(location('/login', '?aux=1'), 'PUSH').flip).toBeNull()
  })
})
