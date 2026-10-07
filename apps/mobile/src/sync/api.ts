import Constants from 'expo-constants';

export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://10.0.2.2:8080';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** JSON request with a timeout. Status 0 means the server could not be reached. */
export async function api<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; token?: string | null; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? `Server error ${res.status}`);
  return data as T;
}
