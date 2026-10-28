// Public client configuration, injected by Vite at build time.
// Populate repository Settings -> Secrets and variables -> Actions -> Variables.
// IMPORTANT: all VITE_* values are visible to every visitor in the compiled app.
// NEVER store Clerk secret, Supabase service_role or database passwords here.
const cfg=import.meta.env;
export const CLERK_PUBLISHABLE_KEY=(cfg.VITE_CLERK_PUBLISHABLE_KEY||'').trim();
export const SUPABASE_URL=(cfg.VITE_SUPABASE_URL||'').trim();
export const SUPABASE_PUBLISHABLE_KEY=(cfg.VITE_SUPABASE_PUBLISHABLE_KEY||'').trim();
export const USERNAME_CHECK_URL=(cfg.VITE_USERNAME_CHECK_URL||'').trim();
