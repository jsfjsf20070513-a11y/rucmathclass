import manifest from './portraits.json'

// The cover and asset tools share one ordered manifest.
export const portraits = manifest.map(({ name, slug, birthYear }) => ({ name, slug, birthYear }))
export const portraitSrc = (slug) => `/portraits/${slug}.jpg`
