import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { apiUrl } from './config';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

type Options = { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; auth?: boolean };

const TIMEOUT_MS = 8000;
const offline = () =>
  new ApiError("Can't reach the store. Check your connection and try again.", 0, 'network');
const expired = () => new ApiError('Please sign in again.', 401, 'session_expired');

async function send(path: string, { method = 'GET', body, auth = false }: Options) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw expired();
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw offline();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls the store API. An expired session is refreshed once and the call retried. If the refresh
 * cannot reach the server the call fails as a network error; if the server refuses it, the
 * customer is signed out on this device and the call fails with `session_expired`.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  let response = await send(path, options);
  let data = await response.json().catch(() => ({}));
  if (options.auth && response.status === 401 && data.code === 'session_expired') {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      // A refresh that could not reach the server says nothing about the session: keep it.
      if (isAuthRetryableFetchError(error)) throw offline();
      // Local scope: only this device signs out; the customer's website session stays.
      await supabase.auth.signOut({ scope: 'local' });
      throw expired();
    }
    response = await send(path, options);
    data = await response.json().catch(() => ({}));
  }
  if (response.ok) return data as T;
  throw new ApiError(
    data.error || 'Something went wrong. Please try again.',
    response.status,
    data.code,
  );
}
