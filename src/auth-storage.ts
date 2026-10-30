/**
 * Encrypted Google OAuth token storage and single-use state transactions.
 *
 * Never use user_id from an unauthenticated request. The caller must receive
 * the user ID from a verified MCP identity/session and enforce that identity
 * on every read/write.
 */
export interface PreparedStatement {
  bind(...values: (string | number)[]): PreparedStatement;
  run(): Promise<{ meta: { changes?: number } }>;
  first<T>(): Promise<T | null>;
}
export interface AuthDatabase {
  prepare(sql: string): PreparedStatement;
}

export interface AuthState {
  userId: string;
  verifier: string;
}

function fromBase64(input: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input)) throw new Error("Invalid key encoding");
  const text = atob(input);
  return Uint8Array.from(text, c => c.charCodeAt(0));
}
function toBase64(data: Uint8Array): string {
  let result = "";
  for (const b of data) result += String.fromCharCode(b);
  return btoa(result);
}
async function encryptionKey(encodedKey: string): Promise<CryptoKey> {
  const raw = fromBase64(encodedKey);
  if (raw.byteLength !== 32) throw new Error("Encryption key must be 32 bytes");
  const keyBytes = new Uint8Array(new ArrayBuffer(32));
  keyBytes.set(raw);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptSecret(secret: string, encodedKey: string): Promise<string> {
  if (!secret) throw new Error("Empty secret");
  const key = await encryptionKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return "v1:" + toBase64(combined);
}
export async function decryptSecret(stored: string, encodedKey: string): Promise<string> {
  if (!stored.startsWith("v1:")) throw new Error("Unknown ciphertext format");
  const combined = fromBase64(stored.slice(3));
  if (combined.length < 29) throw new Error("Invalid ciphertext");
  const key = await encryptionKey(encodedKey);
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) }, key, combined.slice(12));
  return new TextDecoder().decode(clear);
}
export async function sha256hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Store OAuth state for at most 10 minutes. Caller must bind state to an
 * authenticated user identity and separately verify browser CSRF protection.
 */
export async function storeOauthState(
  db: AuthDatabase, state: string, userId: string,
  verifier: string, encodedKey: string, now = Date.now(),
): Promise<void> {
  if (!userId || !state || !verifier) throw new Error("Missing state fields");
  const hash = await sha256hex(state);
  const cipher = await encryptSecret(verifier, encodedKey);
  await db.prepare(
    "INSERT INTO oauth_states (state_hash, user_id, verifier_ciphertext, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(hash, userId, cipher, Math.floor(now / 1000) + 600).run();
}

/**
 * DELETE RETURNING is atomic in D1: a valid state cannot be replayed.
 * The verified session user ID must match the one that started the flow.
 */
export async function consumeOauthState(
  db: AuthDatabase, state: string, authenticatedUserId: string,
  encodedKey: string, now = Date.now(),
): Promise<AuthState | null> {
  if (!state || !authenticatedUserId) return null;
  const hash = await sha256hex(state);
  const record = await db.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ? AND user_id = ? AND expires_at > ? RETURNING user_id, verifier_ciphertext"
  ).bind(hash, authenticatedUserId, Math.floor(now / 1000))
   .first<{ user_id: string; verifier_ciphertext: string }>();
  if (!record) return null;
  return {
    userId: record.user_id,
    verifier: await decryptSecret(record.verifier_ciphertext, encodedKey),
  };
}

export async function saveRefreshToken(
  db: AuthDatabase, userId: string, refreshToken: string,
  encodedKey: string, now = Date.now(),
): Promise<void> {
  if (!userId) throw new Error("Missing verified user");
  const cipher = await encryptSecret(refreshToken, encodedKey);
  await db.prepare(
    "INSERT INTO google_credentials (user_id, refresh_token_ciphertext, updated_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(user_id) DO UPDATE SET refresh_token_ciphertext = excluded.refresh_token_ciphertext, updated_at = excluded.updated_at"
  ).bind(userId, cipher, Math.floor(now / 1000)).run();
}
export async function loadRefreshToken(
  db: AuthDatabase, verifiedUserId: string, encodedKey: string,
): Promise<string | null> {
  if (!verifiedUserId) return null;
  const record = await db.prepare(
    "SELECT refresh_token_ciphertext FROM google_credentials WHERE user_id = ?"
  ).bind(verifiedUserId).first<{ refresh_token_ciphertext: string }>();
  return record ? decryptSecret(record.refresh_token_ciphertext, encodedKey) : null;
}
export async function disconnectGoogle(
  db: AuthDatabase, verifiedUserId: string,
): Promise<void> {
  if (!verifiedUserId) throw new Error("Missing verified user");
  await db.prepare("DELETE FROM google_credentials WHERE user_id = ?")
    .bind(verifiedUserId).run();
}
