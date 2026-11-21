// 标记只在本标签页传递。路由一变就消费，页面下载多久都不影响这次到达记录。
export const locationPath = ({ pathname, search = '', hash = '' }) => pathname + search + hash

export function createFlipNavigation() {
  let pending = null
  let visit = null
  return {
    mark(from, to) { pending = { from, to } },
    read(location, action) {
      if (visit?.location === location) return visit
      const previous = visit?.location
      const flip = action !== 'POP' && pending?.to === locationPath(location) ? pending : null
      pending = null
      visit = { location, previous, flip, action }
      return visit
    },
  }
}

export const flipNavigation = createFlipNavigation()
