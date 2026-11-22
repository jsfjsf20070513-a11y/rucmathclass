import { useLayoutEffect, useRef } from 'react'

const modes = { login: '登录', signup: '注册', otp: '验证码', forgot: '找回密码' }

export default function LoginTabs({ mode, aux, disabled, onChange }) {
  const tabs = useRef(null)
  const underline = useRef(null)
  useLayoutEffect(() => {
    const bar = tabs.current
    const active = bar.querySelector('[aria-pressed="true"]')
    const place = () => {
      const line = underline.current
      line.style.left = active.offsetLeft + 'px'
      line.style.top = active.offsetTop + active.offsetHeight - 1 + 'px'
      line.style.width = active.offsetWidth + 'px'
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(bar)
    for (const button of bar.querySelectorAll('button')) observer.observe(button)
    return () => observer.disconnect()
  }, [mode, aux])

  return <div ref={tabs} className="editorial-actions tabs login-tabs">
    {Object.entries(modes).filter(([key]) => !aux || key !== 'login').map(([key, label]) =>
      <button key={key} type="button" className="text-button" aria-pressed={mode === key}
        disabled={disabled} onClick={() => onChange(key)}>{label}</button>
    )}
    <span ref={underline} className="login-underline" aria-hidden="true" />
  </div>
}
