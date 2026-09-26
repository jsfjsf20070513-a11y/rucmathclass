// 站内翻页衔接标记(宪法 §4)。离开页在 navigate 前 markFlipNav(fromPath),
// 到达页在挂载时读取:
// - 到达页播放翻入动画(正向从右、返回从左),读作同一个翻页动作;
// - Home 用 flipNavFrom() 按来路落页(/vocabulary→02、/resources→04、/login→05)。
// 标记 1.5s 自动过期,非破坏性读取——多个消费者都能看到同一次导航。

let flipAt = 0
let flipFrom = ''

export function markFlipNav(from = '') {
  flipAt = Date.now()
  flipFrom = from
}

export function wasFlipNav() {
  return Date.now() - flipAt < 1500
}

export function flipNavFrom() {
  return wasFlipNav() ? flipFrom : ''
}
