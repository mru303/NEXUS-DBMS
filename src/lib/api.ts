const DEFAULT_API_BASE = 'http://localhost:3001/api';
declare const __NEXUS_API_BASE_URL__: string;

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

function normalizeBase(base: string): string {
  return base.replace(/\/+$/, '');
}

export function resolveApiBase(): string {
  const configured =
    (typeof localStorage !== 'undefined' ? localStorage.getItem('nexus.apiBase') : '') ||
    (typeof __NEXUS_API_BASE_URL__ !== 'undefined' ? __NEXUS_API_BASE_URL__ : '') ||
    (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '/api' : DEFAULT_API_BASE);

  return normalizeBase(configured || DEFAULT_API_BASE);
}

function buildQueryString(params?: QueryParams): string {
  if (!params) return '';

  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, String(item)));
      return;
    }
    search.append(key, String(value));
  });

  const raw = search.toString();
  return raw ? `?${raw}` : '';
}

function readErrorText(response: Response): Promise<string> {
  return response.text().then((text) => {
    if (!text) return `Request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string; details?: unknown };
      return parsed.error || parsed.message || JSON.stringify(parsed);
    } catch {
      return text;
    }
  }).catch(() => `Request failed with status ${response.status}`);
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: QueryParams;
}

export async function apiRequest<T>(path: string, init: ApiRequestOptions = {}): Promise<T> {
  const { params, body, headers, ...rest } = init;
  const url = path.startsWith('http') ? path : `${resolveApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const finalUrl = params ? `${url}${buildQueryString(params)}` : url;

  const requestInit: RequestInit = {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && body !== null ? { 'Content-Type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
  };

  if (body !== undefined && body !== null) {
    requestInit.body = typeof body === 'string' || body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer || body instanceof URLSearchParams
      ? body as BodyInit
      : JSON.stringify(body);
  }

  const response = await fetch(finalUrl, requestInit);

  if (!response.ok) {
    throw new Error(await readErrorText(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function apiGet<T>(path: string, params?: QueryParams): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', params });
}

export async function apiPost<T>(path: string, body: any, params?: QueryParams): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body, params });
}

export async function apiPut<T>(path: string, body: any, params?: QueryParams): Promise<T> {
  return apiRequest<T>(path, { method: 'PUT', body, params });
}

export async function apiPatch<T>(path: string, body: any, params?: QueryParams): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body, params });
}

export async function apiDelete<T>(path: string, params?: QueryParams): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE', params });
}
