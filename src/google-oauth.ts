/**
 * Google OAuth utilities for Classroom AI.
 *
 * This module is intentionally NOT exposed as a public route.
 * A production caller MUST enforce authenticated MCP user identity,
 * secure short-lived one-time state storage, PKCE and CSRF validation,
 * encrypted token persistence, and session isolation first.
 */
export const GOOGLE_REDIRECT_URI =
  "https://classroom-ai.hak32204.workers.dev/auth/google/callback";

export const CLASSROOM_READ_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
] as const;

export interface OAuthConfiguration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
}

export function generateOpaqueToken(length = 32): string {
  if (!Number.isInteger(length) || length < 32 || length > 128)
    throw new Error("Invalid token length");
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base64url(bytes);
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
    throw new Error("Invalid PKCE verifier");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function googleAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  challenge: string,
): string {
  if (!clientId || !state || !challenge || !redirectUri.startsWith("https://"))
    throw new Error("Missing OAuth parameters");
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("scope", CLASSROOM_READ_SCOPES.join(" "));
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

/**
 * Call only after verifying a single-use server-side state challenge, bound
 * to the authenticated user/session, and validating the associated PKCE verifier.
 */
export async function exchangeGoogleCode(
  code: string,
  verifier: string,
  config: OAuthConfiguration,
): Promise<GoogleTokenResponse> {
  if (!code || !verifier || !config.clientId || !config.clientSecret)
    throw new Error("Missing OAuth exchange fields");
  if (config.redirectUri !== GOOGLE_REDIRECT_URI)
    throw new Error("Unexpected OAuth redirect URI");
  const form = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: verifier,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!response.ok) throw new Error("Google OAuth exchange failed");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("access_token" in data) ||
      typeof data.access_token !== "string" || !("expires_in" in data) ||
      typeof data.expires_in !== "number") {
    throw new Error("Invalid Google token response");
  }
  return data as GoogleTokenResponse;
}
