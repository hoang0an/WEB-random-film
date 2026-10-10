'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, incomingAuthError, incomingRecovery } from './supabase';
import { authErrorMessage } from './auth-errors';

type AuthState = {
  status: 'initializing' | 'signedOut' | 'signedIn' | 'recovering' | 'error';
  session: Session | null;
  error: string;
};
function credentialFailure(error: unknown) {
  const value = error as {status?: number; code?: string} | null;
  return value?.status === 401 || value?.status === 403 ||
    ['bad_jwt', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'user_not_found'].includes(value?.code || '');
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({status: supabase ? 'initializing' : 'signedOut', session: null, error: ''});
  const active = useRef(false);
  const revision = useRef(0);
  const recovering = useRef(incomingRecovery);
  const verify = useCallback(async () => {
    if (!supabase || !active.current) return;
    const version = revision.current;
    try {
      const {data, error} = await supabase.auth.getSession();
      if (error) throw error;
      if (version !== revision.current || !active.current) return;
      if (!data.session) {
        setState({status: 'signedOut', session: null, error: ''}); return;
      }
      const result = await supabase.auth.getUser(data.session.access_token);
      if (version !== revision.current || !active.current) return;
      if (result.error) {
        if (credentialFailure(result.error)) {
          setState({status: 'signedOut', session: null, error: 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'});
          await supabase.auth.signOut({scope: 'local'});
        } else {
          // Infrastructure/network errors do not invalidate a stored session.
          setState({status: recovering.current ? 'recovering' : 'signedIn', session: data.session, error: authErrorMessage(result.error)});
        }
        return;
      }
      setState({status: recovering.current ? 'recovering' : 'signedIn', session: {...data.session, user: result.data.user}, error: ''});
    } catch (error) {
      if (version !== revision.current || !active.current) return;
      if (credentialFailure(error)) setState({status: 'signedOut', session: null, error: 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'});
      else setState(previous => ({...previous, status: previous.session ? previous.status : 'error', error: authErrorMessage(error)}));
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    active.current = true;
    if (incomingAuthError) {
      setState({status: 'error', session: null, error: incomingAuthError});
      return () => {active.current = false;};
    }
    const {data: {subscription}} = supabase.auth.onAuthStateChange((event, session) => {
      revision.current++;
      if (event === 'PASSWORD_RECOVERY') recovering.current = true;
      if (event === 'SIGNED_OUT') recovering.current = false;
      if (event === 'INITIAL_SESSION') {
        // Verification runs outside the listener to avoid SDK lock contention.
        queueMicrotask(() => void verify()); return;
      }
      if (active.current) setState({status: session ? recovering.current ? 'recovering' : 'signedIn' : 'signedOut', session, error: ''});
    });
    void verify();
    return () => {active.current = false; revision.current++; subscription.unsubscribe();};
  }, [verify]);
  return {...state, retry: verify};
}
