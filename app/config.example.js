// These values are PUBLIC browser identifiers; they are not server secrets.
// Fill in your own Clerk and Supabase project values before deployment.
export const CLERK_PUBLISHABLE_KEY = 'YOUR_CLERK_PUBLISHABLE_KEY';
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY';
// Optional Worker endpoint for the dedicated '아이디 중복 확인' button.
// Clerk itself always checks uniqueness atomically at final registration.
export const USERNAME_CHECK_URL = '';
