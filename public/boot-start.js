// Runs before the module entry, so a failed entry download still has a way out.
(() => {
  const root = document.getElementById('root')
  const overlay = root.querySelector('.boot-overlay')
  const recovery = document.getElementById('boot-recovery')
  const showRecovery = () => { if (overlay.isConnected) recovery.hidden = false }
  const onScriptError = (event) => {
    if (event.target?.tagName === 'SCRIPT' && event.target.type === 'module') showRecovery()
  }
  const timer = window.setTimeout(showRecovery, 15000)
  document.getElementById('boot-reload').addEventListener('click', () => window.location.reload())
  window.addEventListener('error', onScriptError, true)
  const observer = new MutationObserver(() => {
    if (!overlay.isConnected) {
      window.clearTimeout(timer)
      window.removeEventListener('error', onScriptError, true)
      observer.disconnect()
    }
  })
  observer.observe(root, { childList: true })
})()
