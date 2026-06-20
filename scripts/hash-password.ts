/**
 * CLI: generate a bcrypt password hash for ADMIN_PASSWORD_HASH.
 *
 * Usage:
 *   pnpm hash:password                        # hidden prompt
 *   pnpm hash:password --cost 12              # custom bcrypt cost
 *   pnpm hash:password --password-file ./pw   # non-interactive
 *   echo 'secret' | pnpm hash:password        # pipe
 *
 * Reuses `BCRYPT_COST` and `hashPassword` from `@/lib/auth/password`
 * so the hash is guaranteed to verify against the login route — no
 * risk of the script and the app drifting on cost factor or library.
 *
 * Prints a single copy-paste-ready line:
 *   ADMIN_PASSWORD_HASH="\$2b\$10\$..."
 *
 * Every `$` in the value is escaped as `\$`. `@next/env` (the loader
 * Next.js uses) does variable expansion on .env values by default,
 * which would otherwise treat `$2b`, `$10`, and the salt as variable
 * references and strip them. The `\$` escape survives expansion —
 * the interpolation regex has a negative lookbehind for `\`, and
 * `_resolveEscapeSequences` unescapes `\$` back to `$` afterwards.
 * Net result: the hash arrives in `process.env` intact.
 *
 * Self-verifies the hash against the submitted password before
 * printing. If verification fails the script exits non-zero.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

import bcrypt from "bcryptjs";

import { BCRYPT_COST, hashPassword } from "@/lib/auth/password";

interface CliArgs {
  cost: number;
  passwordFile: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    cost: BCRYPT_COST,
    passwordFile: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--cost" || arg === "-c") {
      const next = argv[i + 1];
      if (!next) throw new Error("--cost requires a numeric argument");
      args.cost = parseCost(next);
      i += 1;
    } else if (arg.startsWith("--cost=")) {
      args.cost = parseCost(arg.slice("--cost=".length));
    } else if (arg === "--password-file" || arg === "-f") {
      const next = argv[i + 1];
      if (!next) throw new Error("--password-file requires a path argument");
      args.passwordFile = next;
      i += 1;
    } else if (arg.startsWith("--password-file=")) {
      args.passwordFile = arg.slice("--password-file=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseCost(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 4 || n > 15) {
    throw new Error(`--cost must be an integer between 4 and 15 (got: ${raw})`);
  }
  return n;
}

function printHelp(): void {
  process.stdout.write(`Usage: pnpm hash:password [options]

Generate a bcrypt password hash for the ADMIN_PASSWORD_HASH env var.

The script uses the same library and cost as src/lib/auth/password.ts
(default cost ${BCRYPT_COST}), so the hash will verify against the login
route without further config.

Options:
  -c, --cost <n>            Bcrypt cost factor, 4-15 (default: ${BCRYPT_COST})
  -f, --password-file <p>   Read password from file (first line, trailing
                            newline trimmed). Avoids the password
                            appearing in shell history or process list.
  -h, --help                Show this help

If --password-file is not given, the password is read from stdin. When
stdin is a TTY the input is hidden; when piped, the first line is read.

Output is a single line ready to paste into .env:
  ADMIN_PASSWORD_HASH="\$2a\$10\$..."

Security notes:
  - Bcrypt silently truncates input at 72 bytes; the login route does
    the same. Use a password <= 72 bytes.
  - Higher cost = slower login. Cost ${BCRYPT_COST} is roughly 200ms with
    bcryptjs; cost 12 is roughly 800ms.
`);
}

function readPasswordFromStdin(): Promise<string> {
  return new Promise((resolvePwd, reject) => {
    if (!process.stdin.isTTY) {
      // Piped — read until EOF, take first line.
      const chunks: Buffer[] = [];
      process.stdin.on("data", (c: Buffer | string) => {
        chunks.push(typeof c === "string" ? Buffer.from(c, "utf8") : c);
      });
      process.stdin.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        // First line, trim CR/LF. Anything after a newline is dropped
        // so accidental trailing input does not end up in the hash.
        resolvePwd(raw.split(/\r?\n/, 1)[0] ?? "");
      });
      process.stdin.on("error", reject);
      return;
    }

    // Interactive — TTY. Hide input char-by-char.
    const stdin = process.stdin;
    process.stderr.write("Enter admin password: ");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let password = "";
    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (ch: string) => {
      // Ctrl-C / Ctrl-D — abort.
      if (ch === "\u0003" || ch === "\u0004") {
        cleanup();
        process.stderr.write("\n");
        reject(new Error("Aborted"));
        return;
      }
      // Enter / Return — submit.
      if (ch === "\r" || ch === "\n") {
        cleanup();
        process.stderr.write("\n");
        resolvePwd(password);
        return;
      }
      // Backspace / Delete.
      if (ch === "\u007f" || ch === "\b") {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stderr.write("\b \b");
        }
        return;
      }
      // Other control chars (Esc, arrows, etc.) — ignore.
      if (ch.charCodeAt(0) < 32) return;
      password += ch;
      process.stderr.write("*");
    };
    stdin.on("data", onData);
  });
}

function readPasswordFromFile(path: string): string {
  const absolute = resolve(process.cwd(), path);
  const raw = readFileSync(absolute, "utf8");
  return raw.split(/\r?\n/, 1)[0] ?? "";
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Argument error: ${message}\n`);
    printHelp();
    process.exit(2);
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  let password: string;
  try {
    password =
      args.passwordFile !== null
        ? readPasswordFromFile(args.passwordFile)
        : await readPasswordFromStdin();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Failed to read password: ${message}\n`);
    process.exit(1);
    return;
  }

  if (password.length === 0) {
    process.stderr.write("Error: password is empty.\n");
    process.exit(1);
    return;
  }

  const byteLength = Buffer.byteLength(password, "utf8");
  if (byteLength > 72) {
    process.stderr.write(
      `Warning: password is ${byteLength} bytes; bcrypt will silently ` +
        "truncate to 72 bytes. Use a shorter password or the hash will " +
        "match a different (shorter) string than you typed.\n"
    );
  }

  const hash = await hashPassword(password, args.cost);

  // Self-verify — guards against a corrupt or truncated hash and
  // confirms the cost embedded in the output is real.
  const ok = await bcrypt.compare(password, hash);
  if (!ok) {
    process.stderr.write(
      "Internal error: generated hash did not verify. Aborting.\n"
    );
    process.exit(1);
    return;
  }

  // Print a copy-paste-ready line. The value is double-quoted and
  // every `$` is escaped as `\$` so @next/env's variable expansion
  // (which Next.js uses to load .env) does not mangle the bcrypt
  // hash. The escape survives expansion: the interpolation regex has
  // a negative lookbehind for `\`, and `_resolveEscapeSequences`
  // unescapes `\$` back to `$` after interpolation.
  const escapedHash = hash.replace(/\$/g, "\\$");
  process.stdout.write(`ADMIN_PASSWORD_HASH="${escapedHash}"\n`);

  // Best-effort: scrub the plaintext from memory. Strings are
  // immutable in JS, so this is a defense-in-depth hint, not a
  // guarantee.
  password = "";
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Hash generation failed: ${message}\n`);
  process.exit(1);
});
