/**
 * API token generation and verification for programmatic access.
 *
 * Tokens are bearer tokens (`Authorization: Bearer sb_tok_<64 hex chars>`)
 * that grant access to content-management API routes. The raw token is
 * shown only once at creation time; a bcrypt hash is stored in the DB
 * and the token prefix (SHA-256 first 8 hex chars) is used for lookup.
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";

import type Database from "better-sqlite3";
import { BCRYPT_COST } from "@/lib/auth/password";
import { apiTokens } from "@/db/repositories/api-tokens";
import type { ApiTokenRow } from "@/db/repositories/api-tokens";

export const TOKEN_SCOPE_PREFIXES: readonly string[] = [
  "/api/items",
  "/api/tags",
  "/api/links",
  "/api/images",
];

/** Check whether a pathname is within the token scope.
 *  Matches by path *segment* — `/api/items` and `/api/items/123`
 *  are in scope; `/api/itemsuffix` is not. */
export function isPathInTokenScope(pathname: string): boolean {
  return TOKEN_SCOPE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

/**
 * Generate a new API token.
 *
 * The raw token is `sb_tok_` followed by 64 random hex characters.
 * The prefix is the first 8 hex chars of the SHA-256 hash of the raw
 * token. The hash is the raw token bcrypt-hashed at BCRYPT_COST.
 */
export function generateToken(): {
  raw: string;
  prefix: string;
  hash: string;
} {
  const rawBytes = crypto.randomBytes(32);
  const raw = "sb_tok_" + rawBytes.toString("hex");

  // NOTE: 8 hex chars = 32 bits of entropy. The birthday bound for
  // a collision is ~65 k active tokens — fine for a single-user app.
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = sha256.slice(0, 8);

  const hash = bcrypt.hashSync(raw, BCRYPT_COST);

  return { raw, prefix, hash };
}

/**
 * Verify a raw token against the database.
 *
 * Computes the prefix, queries for matching active tokens, then
 * bcrypt-compares each. Returns the first matching row or null.
 */
export async function verifyToken(
  raw: string,
  db: Database.Database
): Promise<ApiTokenRow | null> {
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = sha256.slice(0, 8);

  const candidates = apiTokens.findByPrefix(db, prefix);

  for (const row of candidates) {
    try {
      const match = await bcrypt.compare(raw, row.token_hash);
      if (match) {
        return row;
      }
    } catch {
      // Individual compare failure — skip this candidate.
    }
  }

  return null;
}
