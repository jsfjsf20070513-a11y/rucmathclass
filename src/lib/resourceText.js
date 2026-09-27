function trimValue(value = '') {
  return `${value}`.trim()
}

export function getResourceLead(resource = {}) {
  return trimValue(resource.description || resource.materials)
}
