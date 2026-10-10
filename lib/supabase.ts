import { createClient } from '@supabase/supabase-js';
import { linkError } from './auth-redirect';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const liveMode = Boolean(url && key);
export const googleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true';
// Capture only the outcome before the SDK consumes/clears the URL; never store tokens.
export const incomingAuthError = typeof window === 'undefined' ? null : linkError(window.location.search, window.location.hash);
export const incomingRecovery = typeof window !== 'undefined' && new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
export const supabase = liveMode ? createClient(url!, key!) : null;
