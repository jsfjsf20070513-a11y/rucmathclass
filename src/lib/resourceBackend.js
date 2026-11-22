import { validateCatalog } from './resourcePolicy'
import { withRequestDeadline } from './requestDeadline'

export function fetchPublishedResources({ signal } = {}) {
  return withRequestDeadline(async requestSignal => {
    const response = await fetch('/api/resources', { signal: requestSignal })
    if (!response.ok) throw new Error('暂时无法更新书目。')
    return validateCatalog(await response.json())
  }, { signal })
}
