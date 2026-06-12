const TOKEN_KEY = "aside.authToken";
const AUTH_LOST_EVENT = "aside-auth-lost";

export interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
}

interface TokenResponse {
  token: string;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function onAuthLost(handler: () => void): () => void {
  window.addEventListener(AUTH_LOST_EVENT, handler);
  return () => window.removeEventListener(AUTH_LOST_EVENT, handler);
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const headers = new Headers();
  const token = getAuthToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch("/api/auth/status", { headers });
  if (!res.ok) throw new Error(`status failed: ${res.status}`);
  return res.json() as Promise<AuthStatus>;
}

export async function setupPassword(password: string): Promise<string> {
  const body = await requestToken("/api/auth/setup", password);
  setAuthToken(body.token);
  return body.token;
}

export async function loginPassword(password: string): Promise<string> {
  const body = await requestToken("/api/auth/login", password);
  setAuthToken(body.token);
  return body.token;
}

export async function logout(): Promise<void> {
  await authFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  clearAuthToken();
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 || res.status === 403) {
    clearAuthToken();
    window.dispatchEvent(new Event(AUTH_LOST_EVENT));
  }
  return res;
}

export function authUrl(path: string): string {
  const token = getAuthToken();
  if (!token) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", token);
  return `${url.pathname}${url.search}${url.hash}`;
}

async function requestToken(
  url: string,
  password: string,
): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
    );
  }
  return res.json() as Promise<TokenResponse>;
}
