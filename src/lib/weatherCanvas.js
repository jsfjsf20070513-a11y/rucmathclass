import { createAnimationTasks } from './animationTasks'

// 封面天气 canvas，负责天气对应的粒子和墨色。
// 四模式:雨(尾迹雨丝+底缘涟漪+溅珠)、雷(双闪节奏+锯齿闪电)、
// 晴昼(暖金呼吸光晕)、晴夜(深蓝暮色+月光池)。全部 dt 驱动,帧率无关。
// cloud/snow 两模式按裁定删除:weathercode 阴/雾/雪一律回落 clear(按昼夜)。
// particleScale:移动端粒子数减半(0.5)。

export function resolveWeatherType(weather, override = 'auto') {
  let isDay = weather ? weather.isDay : 1
  if (override && override !== 'auto') {
    if (override === 'clear-day') return { type: 'clear', isDay: 1 }
    if (override === 'clear-night') return { type: 'clear', isDay: 0 }
    return { type: override, isDay }
  }
  let type = 'clear'
  if (weather) {
    const c = weather.code
    if (c >= 95) type = 'thunder'
    else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) type = 'rain'
  }
  return { type, isDay }
}

// Édition/Suzhou 行墨色映射(1.2s 过渡在 CSS 侧)。
export const WEATHER_INK = {
  rain: '#5f6e7d',
  thunder: '#565a6e',
  'clear-day': '#8a7350',
  'clear-night': '#525f7d',
}

export function weatherInkFor(weather, override = 'auto') {
  const { type, isDay } = resolveWeatherType(weather, override)
  const key = type === 'clear' ? (isDay ? 'clear-day' : 'clear-night') : type
  return WEATHER_INK[key] || '#6f675e'
}

export function startWeatherCanvas(canvas, weather, { override = 'auto', particleScale = 1 } = {}) {
  if (!canvas || !weather) return () => {}
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  const tasks = createAnimationTasks()

  // 柔和登场:氛围呼吸着进来,不弹跳。
  canvas.style.opacity = '0'
  canvas.style.transition = 'opacity 1.4s ease'
  tasks.frame(() => tasks.frame(() => { canvas.style.opacity = '1' }))
  tasks.timeout(() => { canvas.style.transition = 'none' }, 1600)

  const { type, isDay } = resolveWeatherType(weather, override)

  let dpr = 1
  let cw = 0
  let ch = 0
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.parentElement.getBoundingClientRect()
    cw = rect.width
    ch = rect.height
    canvas.width = cw * dpr
    canvas.height = ch * dpr
    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`
  }
  resize()
  window.addEventListener('resize', resize)

  const rand = (a, b) => a + Math.random() * (b - a)
  const particles = []
  const splashes = []
  const droplets = []

  if (type === 'rain' || type === 'thunder') {
    const n = Math.round((type === 'thunder' ? 170 : 140) * particleScale)
    for (let i = 0; i < n; i += 1) {
      const depth = Math.pow(Math.random(), 1.5) // 远多近少
      particles.push({
        x: rand(-cw * 0.1, cw * 1.1),
        y: rand(-ch, ch),
        depth,
        len: 11 + depth * 26,
        speed: (150 + depth * 300) / 1000, // px/ms
        width: 0.6 + depth * 0.9,
        opacity: 0.08 + depth * 0.16,
      })
    }
  } else if (type === 'clear' && !isDay) {
    // 夜:一小片刻意的星座(固定、克制)
    const n = Math.round(22 * particleScale)
    for (let i = 0; i < n; i += 1) {
      particles.push({
        x: rand(cw * 0.05, cw * 0.95),
        y: rand(ch * 0.05, ch * 0.6),
        size: rand(1.2, 2.6),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.5, 1.3),
      })
    }
  }

  // 雷电状态机:idle → flash1 → gap → flash2 → idle
  const flash = { t: 0, phase: 'idle', next: 3000 + Math.random() * 6000, boltX: 0 }

  let last = performance.now()
  const draw = (nowT) => {
    const dt = Math.min(nowT - last, 50) // 切标签页夹住
    last = nowT
    const t = nowT
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)

    // 全片平铺的氛围色纸(无渐变条带)
    if (type === 'rain') {
      ctx.fillStyle = 'rgba(96,112,132,0.06)'
      ctx.fillRect(0, 0, cw, ch)
    } else if (type === 'thunder') {
      ctx.fillStyle = 'rgba(58,60,78,0.09)'
      ctx.fillRect(0, 0, cw, ch)
    } else if (type === 'clear') {
      ctx.fillStyle = isDay ? 'rgba(232,196,110,0.05)' : 'rgba(38,48,76,0.08)'
      ctx.fillRect(0, 0, cw, ch)
    }

    if (type === 'rain' || type === 'thunder') {
      const slant = type === 'thunder' ? 0.18 : 0.12
      ctx.lineCap = 'round'
      for (const p of particles) {
        const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.len * slant, p.y + p.len)
        grad.addColorStop(0, 'rgba(34,29,24,0)')
        grad.addColorStop(1, `rgba(34,29,24,${p.opacity})`)
        ctx.strokeStyle = grad
        ctx.lineWidth = p.width
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + p.len * slant, p.y + p.len)
        ctx.stroke()
        p.y += p.speed * dt
        p.x += p.speed * slant * dt
        if (p.y + p.len >= ch - 1) {
          // 落地:涟漪 + 弹跳微珠
          const gx = p.x + p.len * slant
          if (p.depth > 0.45 && splashes.length < 24) {
            splashes.push({ x: gx, y: ch - 1.5, r: 0, max: 6 + p.depth * 10, a: p.opacity * 1.6 })
          }
          if (p.depth > 0.7 && droplets.length < 40) {
            const nD = 2 + Math.floor(Math.random() * 3)
            for (let d = 0; d < nD; d += 1) {
              droplets.push({
                x: gx,
                y: ch - 2,
                vx: rand(-0.06, 0.06),
                vy: rand(-0.22, -0.1) * (0.6 + p.depth * 0.6),
                r: rand(0.5, 1.1) * p.depth,
                a: p.opacity * 1.4,
                life: 1,
              })
            }
          }
          p.y = -(p.len + rand(0, 60))
          p.x = rand(-cw * 0.1, cw * 1.1)
        }
      }
      // 底缘湿光
      const sheen = ctx.createLinearGradient(0, ch - 14, 0, ch)
      sheen.addColorStop(0, 'rgba(96,112,132,0)')
      sheen.addColorStop(1, `rgba(96,112,132,${type === 'thunder' ? 0.10 : 0.08})`)
      ctx.fillStyle = sheen
      ctx.fillRect(0, ch - 14, cw, 14)
      // 涟漪沿地面压扁
      for (let i = splashes.length - 1; i >= 0; i -= 1) {
        const s = splashes[i]
        s.r += dt * 0.014 * s.max
        const alpha = s.a * (1 - s.r / s.max)
        if (alpha <= 0.004) { splashes.splice(i, 1); continue }
        ctx.beginPath()
        ctx.ellipse(s.x, s.y, s.r, s.r * 0.22, 0, Math.PI, Math.PI * 2)
        ctx.strokeStyle = `rgba(52,64,80,${alpha})`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }
      // 微珠抛物线回落
      for (let i = droplets.length - 1; i >= 0; i -= 1) {
        const d = droplets[i]
        d.vy += dt * 0.00055 // 重力
        d.x += d.vx * dt
        d.y += d.vy * dt
        d.life -= dt / 700
        if (d.life <= 0 || d.y > ch) { droplets.splice(i, 1); continue }
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(52,64,80,${d.a * d.life})`
        ctx.fill()
      }
      // 闪电:快速双闪带衰减
      if (type === 'thunder') {
        flash.t += dt
        if (flash.phase === 'idle' && flash.t > flash.next) { flash.phase = 'f1'; flash.t = 0 }
        else if (flash.phase === 'f1' && flash.t > 90) { flash.phase = 'gap'; flash.t = 0 }
        else if (flash.phase === 'gap' && flash.t > 70) { flash.phase = 'f2'; flash.t = 0 }
        else if (flash.phase === 'f2' && flash.t > 160) {
          flash.phase = 'idle'
          flash.t = 0
          flash.next = 4000 + Math.random() * 8000
        }
        if (flash.phase === 'f1' || flash.phase === 'f2') {
          const dur = flash.phase === 'f1' ? 90 : 160
          const k = 1 - flash.t / dur
          ctx.fillStyle = `rgba(255,252,240,${0.45 * k})`
          ctx.fillRect(0, 0, cw, ch)
          if (flash.phase === 'f1') {
            if (!flash.boltX) flash.boltX = rand(cw * 0.2, cw * 0.8)
            ctx.strokeStyle = `rgba(120,110,90,${0.5 * k})`
            ctx.lineWidth = 1.4
            ctx.beginPath()
            let bx = flash.boltX
            let by = 0
            ctx.moveTo(bx, by)
            while (by < ch * 0.55) {
              bx += rand(-26, 26)
              by += rand(24, 52)
              ctx.lineTo(bx, by)
            }
            ctx.stroke()
          }
        } else {
          flash.boltX = 0
        }
      }
    } else {
      // clear —— 头顶的光与地面的回应(通感)
      if (isDay) {
        const gk = 0.5 + Math.sin(t * 0.0004) * 0.5
        const glow = ctx.createRadialGradient(cw * 0.75, 0, 0, cw * 0.75, 0, Math.max(cw, ch) * 0.7)
        glow.addColorStop(0, `rgba(226,180,90,${0.10 + gk * 0.04})`)
        glow.addColorStop(1, 'rgba(226,180,90,0)')
        ctx.fillStyle = glow
        ctx.fillRect(0, 0, cw, ch)
        const pool = ctx.createLinearGradient(0, ch - 50, 0, ch)
        pool.addColorStop(0, 'rgba(226,180,90,0)')
        pool.addColorStop(1, `rgba(226,180,90,${0.07 + gk * 0.05})`)
        ctx.fillStyle = pool
        ctx.fillRect(0, ch - 50, cw, 50)
      } else {
        const gk = 0.5 + Math.sin(t * 0.00025) * 0.5
        const glow = ctx.createRadialGradient(cw * 0.5, 0, 0, cw * 0.5, 0, Math.max(cw, ch) * 0.8)
        glow.addColorStop(0, `rgba(90,110,160,${0.08 + gk * 0.03})`)
        glow.addColorStop(1, 'rgba(90,110,160,0)')
        ctx.fillStyle = glow
        ctx.fillRect(0, 0, cw, ch)
        const pool = ctx.createLinearGradient(0, ch - 40, 0, ch)
        pool.addColorStop(0, 'rgba(120,140,190,0)')
        pool.addColorStop(1, `rgba(120,140,190,${0.05 + gk * 0.04})`)
        ctx.fillStyle = pool
        ctx.fillRect(0, ch - 40, cw, 40)
        for (const p of particles) {
          p.phase += dt * 0.001 * p.twinkle
          const a = 0.25 + (0.5 + Math.sin(p.phase) * 0.5) * 0.3
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(190,200,225,${a})`
          ctx.fill()
        }
      }
    }

    tasks.frame(draw)
  }
  tasks.frame(draw)

  return () => {
    tasks.cancel()
    window.removeEventListener('resize', resize)
  }
}
