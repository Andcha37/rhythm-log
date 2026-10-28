// User-facing username rules, matching the independent server-side check.
export function normalizeUsername(value){return String(value||'').trim().toLowerCase()}
export function usernameValid(value){return /^[a-z][a-z0-9_]{3,23}$/.test(normalizeUsername(value))}
