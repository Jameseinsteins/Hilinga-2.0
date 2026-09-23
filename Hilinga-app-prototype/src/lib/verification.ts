/**
 * Verification & App Lock
 * - Email verification (Firebase emailVerified)
 * - Local PIN gate: 6-digit PIN hashed with SHA-256, per-user in localStorage.
 *   Session flag in sessionStorage so the user must re-verify each browser session
 *   (and after explicit lock). Offline-capable — PIN check never hits the network.
 * - Brute-force protection: 5 attempts -> 30s lockout, stored in localStorage.
 *
 * Security notes:
 * - PIN never stored plaintext — only SHA-256 hex is persisted.
 * - No secret leaves the device. Server-side Firestore rules still enforce
 *   request.auth != null && email_verified where sensitive.
 * - This is a local app-lock (like banking apps). It complements — not replaces —
 *   Firebase auth & security rules.
 */

const PIN_HASH_PREFIX = "hilinga_pin_hash_v1:";
const PIN_ATTEMPTS_PREFIX = "hilinga_pin_attempts_v1:";
const SESSION_VERIFIED_PREFIX = "hilinga_session_verified_v1:";
const LOCKOUT_MS = 30_000;
const MAX_ATTEMPTS = 5;

export type PinState =
  | { kind: "no_pin" }
  | { kind: "locked"; until: number; remainingMs: number }
  | { kind: "ready" };

function keyFor(prefix: string, uid: string) {
  return `${prefix}${uid}`;
}

function readAttempts(uid: string): { count: number; firstAt: number } | null {
  try {
    const raw = localStorage.getItem(keyFor(PIN_ATTEMPTS_PREFIX, uid));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.count === "number" && typeof v?.firstAt === "number") return v;
    return null;
  } catch { return null; }
}

function writeAttempts(uid: string, count: number, firstAt: number) {
  try { localStorage.setItem(keyFor(PIN_ATTEMPTS_PREFIX, uid), JSON.stringify({ count, firstAt })); } catch {}
}

function clearAttempts(uid: string) {
  try { localStorage.removeItem(keyFor(PIN_ATTEMPTS_PREFIX, uid)); } catch {}
}

export function getLockoutInfo(uid: string): { locked: boolean; until: number; remainingMs: number } {
  const a = readAttempts(uid);
  if (!a || a.count < MAX_ATTEMPTS) return { locked: false, until: 0, remainingMs: 0 };
  const until = a.firstAt + LOCKOUT_MS;
  const remainingMs = until - Date.now();
  if (remainingMs <= 0) {
    clearAttempts(uid);
    return { locked: false, until: 0, remainingMs: 0 };
  }
  return { locked: true, until, remainingMs };
}

export function getPinHash(uid: string): string | null {
  try { return localStorage.getItem(keyFor(PIN_HASH_PREFIX, uid)); } catch { return null; }
}

export function isPinSet(uid: string): boolean {
  return Boolean(getPinHash(uid));
}

export function isSessionVerified(uid: string): boolean {
  try { return sessionStorage.getItem(keyFor(SESSION_VERIFIED_PREFIX, uid)) === "1"; } catch { return false; }
}

export function setSessionVerified(uid: string): void {
  try { sessionStorage.setItem(keyFor(SESSION_VERIFIED_PREFIX, uid), "1"); } catch {}
}

export function clearSessionVerified(uid: string): void {
  try { sessionStorage.removeItem(keyFor(SESSION_VERIFIED_PREFIX, uid)); } catch {}
}

export function clearPin(uid: string): void {
  try {
    localStorage.removeItem(keyFor(PIN_HASH_PREFIX, uid));
    clearAttempts(uid);
    clearSessionVerified(uid);
  } catch {}
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePin(pin: string): string {
  return pin.trim();
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{6}$/.test(normalizePin(pin));
}

export async function hashPin(pin: string): Promise<string> {
  const n = normalizePin(pin);
  if (!isValidPinFormat(n)) throw new Error("PIN must be exactly 6 digits.");
  // Domain separation so SHA isn't raw PIN
  return sha256Hex(`hilinga-pin-v1:${n}`);
}

export async function createPin(uid: string, pin: string): Promise<void> {
  const hash = await hashPin(pin);
  try { localStorage.setItem(keyFor(PIN_HASH_PREFIX, uid), hash); } catch { throw new Error("Could not save PIN on this device."); }
  clearAttempts(uid);
  setSessionVerified(uid);
}

export async function verifyPin(uid: string, pin: string): Promise<{ ok: boolean; error?: string; lockedUntil?: number }> {
  const lock = getLockoutInfo(uid);
  if (lock.locked) return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(lock.remainingMs / 1000)}s.`, lockedUntil: lock.until };

  const stored = getPinHash(uid);
  if (!stored) return { ok: false, error: "No PIN set. Create one first." };

  const n = normalizePin(pin);
  if (!/^\d{6}$/.test(n)) return { ok: false, error: "Enter 6 digits." };

  const hash = await sha256Hex(`hilinga-pin-v1:${n}`);
  if (hash === stored) {
    clearAttempts(uid);
    setSessionVerified(uid);
    return { ok: true };
  }

  const prev = readAttempts(uid);
  const now = Date.now();
  if (!prev || now - prev.firstAt > LOCKOUT_MS) {
    writeAttempts(uid, 1, now);
  } else {
    writeAttempts(uid, prev.count + 1, prev.firstAt);
  }
  const nextLock = getLockoutInfo(uid);
  if (nextLock.locked) return { ok: false, error: `Too many attempts. Locked for 30 seconds.`, lockedUntil: nextLock.until };
  const remaining = MAX_ATTEMPTS - (readAttempts(uid)?.count ?? 1);
  return { ok: false, error: `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left.` };
}
