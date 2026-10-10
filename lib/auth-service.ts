import type { SupabaseClient } from '@supabase/supabase-js';

function callbackUrl(origin: string, invite?: string | null) {
  const url = new URL('/auth/callback', origin);
  if (invite && /^[A-Z0-9]{1,64}$/i.test(invite)) url.searchParams.set('invite', invite);
  return url.href;
}

export function createAuthService(client: SupabaseClient) {
  return {
    async signup(fields: {email: string; password: string; name: string}, origin: string, invite?: string | null) {
      const {data, error} = await client.auth.signUp({
        email: fields.email.trim(), password: fields.password,
        options: {data: {name: fields.name.trim()}, emailRedirectTo: callbackUrl(origin, invite)},
      });
      if (error) throw error;
      return data;
    },
    async login(email: string, password: string) {
      const {error} = await client.auth.signInWithPassword({email: email.trim(), password});
      if (error) throw error;
    },
    async resend(email: string, origin: string, invite?: string | null) {
      const {error} = await client.auth.resend({type: 'signup', email: email.trim(), options: {emailRedirectTo: callbackUrl(origin, invite)}});
      if (error) throw error;
    },
    async recover(email: string, origin: string) {
      const {error} = await client.auth.resetPasswordForEmail(email.trim(), {redirectTo: new URL('/auth/reset-password', origin).href});
      if (error) throw error;
    },
    async updatePassword(password: string) {
      const {error} = await client.auth.updateUser({password});
      if (error) throw error;
    },
    async logout() {
      const {error} = await client.auth.signOut({scope: 'local'});
      if (error) throw error;
    },
    async google(enabled: boolean, origin: string, invite?: string | null) {
      if (!enabled) throw new Error('Google provider is disabled.');
      const {error} = await client.auth.signInWithOAuth({provider: 'google', options: {redirectTo: callbackUrl(origin, invite)}});
      if (error) throw error;
    },
  };
}
