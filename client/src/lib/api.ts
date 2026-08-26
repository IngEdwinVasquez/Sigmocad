/**
 * Thin HTTP client for the SIGMOCAD Express API.
 * - Adds the JWT (Authorization: Bearer) stored in localStorage.
 * - Adds the selected company (X-Company-Id) for SUPER_ADMIN users.
 * - Throws ApiError with the server-provided message on non-2xx responses.
 */

const TOKEN_KEY = 'sigmocad.token';
const COMPANY_KEY = 'sigmocad.companyId';

export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let token: string | null = localStorage.getItem(TOKEN_KEY);
let companyId: string | null = localStorage.getItem(COMPANY_KEY);
let onUnauthorized: (() => void) | null = null;

export function setToken(value: string | null) {
  token = value;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return token;
}

export function setCompanyHeader(value: string | null) {
  companyId = value;
  if (value) localStorage.setItem(COMPANY_KEY, value);
  else localStorage.removeItem(COMPANY_KEY);
}

export function getStoredCompanyId() {
  return companyId;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

function buildHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (companyId) headers.set('X-Company-Id', companyId);
  return headers;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : typeof data === 'string' && data
          ? data
          : `Error ${res.status}`;
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, message);
  }
  return data as T;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = buildHeaders();
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, init);
  return parseResponse<T>(res);
}

function withQuery(path: string, query?: Record<string, string | number | boolean | null | undefined>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | boolean | null | undefined>) =>
    request<T>('GET', withQuery(path, query)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  /** Multipart upload. `form` must already contain the file fields. */
  async upload<T>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: buildHeaders(), body: form });
    return parseResponse<T>(res);
  },

  /** Upload a single file to a storage bucket and get its public URL. */
  async uploadFile(bucket: 'company-logos' | 'campanas' | 'news-files', file: File): Promise<{ url: string; name: string; size: number; type: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.upload(`/api/uploads/${bucket}`, form);
  },
};

export interface PublicConfig {
  publicUrl: string;
  allowRegistration: boolean;
  smtpConfigured: boolean;
  socialMonitoring: { reddit: boolean; youtube: boolean };
}

let configPromise: Promise<PublicConfig> | null = null;
export function getPublicConfig(): Promise<PublicConfig> {
  if (!configPromise) {
    configPromise = api.get<PublicConfig>('/api/auth/config').catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

export function errorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
