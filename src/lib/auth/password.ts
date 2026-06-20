/**
 * Password hashing & verification.
 *
 * Uses bcrypt at cost 10. The constant-time login flow (OWASP ASVS
 * V3.2.2) is implemented in `verifyPasswordConstantTime` — on a
 * "user not found" miss the flow still runs `bcrypt.compare`
 * against a precomputed dummy hash so the wall-clock cost of a
 * "missing user" response is indistinguishable from a "wrong
 * password" response. Both paths return the generic
 * `"Invalid credentials"` error to the client.
 *
 * The precomputed dummy hash is generated at module load time using
 * the same cost the user hash would use (10). Generating it lazily
 * avoids paying the bcrypt cost on first import in hot paths.
 */

import bcrypt from "bcrypt";

/** Bcrypt cost factor. The spec mandates cost >= 10; 10 keeps login
 *  latency around 60ms on commodity hardware while making brute
 *  force impractical. */
export const BCRYPT_COST = 10;

/** A random plaintext the dummy hash was computed from. Not a
 *  secret — the value is arbitrary; we just want a real bcrypt
 *  hash to point `compare` at so the constant-time cost is paid. */
const DUMMY_PLAINTEXT = "shadowbrain-dummy-password-do-not-use";

/** A precomputed bcrypt hash for the dummy plaintext. Generated
 *  lazily on first import so the import cost is minimal. */
let _dummyHash: string | null = null;

function getDummyHash(): string {
  if (_dummyHash) return _dummyHash;
  _dummyHash = bcrypt.hashSync(DUMMY_PLAINTEXT, BCRYPT_COST);
  return _dummyHash;
}

/** Hash a plaintext password with bcrypt. Used at admin setup
 *  time (or wherever ADMIN_PASSWORD_HASH is generated). */
export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("Password must be a non-empty string");
  }
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** Plain bcrypt compare. Use `verifyPasswordConstantTime` from a
 *  login flow instead — that helper guarantees the wall-clock cost
 *  is the same whether the user exists or not. */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  if (typeof plain !== "string" || typeof hash !== "string") return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export interface ConstantTimeLoginInput {
  submittedPassword: string;
  /** The user's stored hash, or `null` if the user does not exist. */
  storedHash: string | null;
}

export interface ConstantTimeLoginResult {
  /** `true` only when the user exists *and* the password matched. */
  ok: boolean;
}

/** Constant-time login verification (OWASP ASVS V3.2.2).
 *
 *  - When `storedHash` is provided, we bcrypt.compare the submitted
 *    password against it.
 *  - When `storedHash` is `null` (user not found), we still run
 *    `bcrypt.compare` against a precomputed dummy hash. The wall
 *    clock cost is the same in both branches.
 *
 *  The result is the AND of "user existed" and "password matched";
 *  neither condition is leaked to the caller. The caller must
 *  return the same generic error message regardless. */
export async function verifyPasswordConstantTime({
  submittedPassword,
  storedHash,
}: ConstantTimeLoginInput): Promise<ConstantTimeLoginResult> {
  const dummy = getDummyHash();
  const hashToCompare = storedHash ?? dummy;
  let matched = false;
  try {
    matched = await bcrypt.compare(submittedPassword, hashToCompare);
  } catch {
    matched = false;
  }
  return { ok: storedHash !== null && matched };
}
