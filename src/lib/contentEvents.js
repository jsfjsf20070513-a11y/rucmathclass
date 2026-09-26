// Keep the existing event names so publication notifications work across tabs.
export const OFFICIAL_CONTENT_UPDATED_EVENT = 'mathclass-site-official-content-updated'
export const OFFICIAL_CONTENT_UPDATED_STORAGE_KEY = 'mathclass-site-official-content-updated-at'

export function emitOfficialContentUpdated() {
  window.dispatchEvent(new CustomEvent(OFFICIAL_CONTENT_UPDATED_EVENT))
  try {
    window.localStorage.setItem(OFFICIAL_CONTENT_UPDATED_STORAGE_KEY, `${Date.now()}`)
  } catch {
    // Private browsing may disallow storage; this tab still receives the event.
  }
}
