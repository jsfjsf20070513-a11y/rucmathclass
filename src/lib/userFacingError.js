// Only messages written for this site's users may pass through to the page.
// Unknown service errors use the caller's fallback instead of raw API text.
export class UserFacingError extends Error {}

export const userErrorMessage = (error, fallback) => error instanceof UserFacingError ? error.message : fallback
