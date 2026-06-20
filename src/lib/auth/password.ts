/**
 * Password hashing & verification.
 *
 * Uses `bcryptjs` (pure-JS bcrypt re-implementation) at cost 10.
 * The native `bcrypt` package works fine on Linux but pulls in
 * `node-pre-gyp`, which calls `url.parse()` at module load and
 * triggers a `DEP0169` deprecation warning on Node 24+. The
 * pure-JS `bcryptjs` avoids the warning and the native build
 * step; the trade-off is roughly 3× slower per hash, which is
 * negligible for a single-user login that runs once per session.
 *
 * The constant-time login flow (OWASP ASVS V3.2.2) is implemented
 * in `verifyPasswordConstantTime` — on a "user not found" miss
 * the flow still runs `bcrypt.compare` against a precomputed
 * dummy hash so the wall-clock cost of a "missing user" response
 * is indistinguishable from a "wrong password" response. Both
 * paths return the generic `"Invalid credentials"` error to the
 * client.
 *
 * The precomputed dummy hash is generated lazily on first use
 * (at the same cost) so the import cost is minimal.
 */

import bcrypt from "bcryptjs";

/** Bcrypt cost factor. The spec mandates cost >= 10; 10 keeps login
 *  latency around 200ms with bcryptjs (well under the 5s
 *  rate-limit window) while making brute force impractical. */
export const BCRYPT_COST = 10;

/** A random plaintext the dummy hash was computed from. Not a
 *  secret — the value is arbitrary; we just want a real bcrypt
 *  hash to point `compare` at so the constant-time cost is paid. */
const DUMMY_PLAINTEXT = "shadowbrain-dummy-password-do-not-use";

/** A precomputed bcrypt hash for the dummy plaintext. Generated
 *  lazily on first use so the import cost is minimal. */
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
