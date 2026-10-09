import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const liveMode = Boolean(url && key);
export const supabase = liveMode ? createClient(url!, key!) : null;
