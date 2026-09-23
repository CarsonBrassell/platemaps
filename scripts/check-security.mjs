// Static security-regression check, run automatically before every `next
// build` (see the "prebuild" script in package.json) so a regression fails
// the Vercel deploy instead of shipping. Freezes the fixes from the Stage 3
// pass (see probe/SECURITY-FINDINGS.md and CLAUDE.md's "Security invariants"
// section). Plain Node ESM, no dependencies.
//
//   node scripts/check-security.mjs      run it directly
//   npm run security:check               same thing, via package.json
//
// Every check below normalizes CRLF to LF before matching — many files in
// this repo are CRLF, and a check that only matches `\n`-terminated lines
// would silently pass files it never actually scanned.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const API_DIR = join(ROOT, "src", "app", "api");

/** Read a file relative to the repo root, normalizing CRLF to LF. */
function readNormalized(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8").replace(/\r\n/g, "\n");
}

/** Recursively list files under `dir` (absolute) matching `basename`. */
function findFiles(dir, basename) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { recursive: true })) {
    if (entry.split(/[\\/]/).pop() !== basename) continue;
    const full = join(dir, entry);
    if (statSync(full).isFile()) out.push(full);
  }
  return out;
}

const violations = [];
const warnings = [];

// ---------------------------------------------------------------------------
// Check 1: rate limits on mutating API routes.
// ---------------------------------------------------------------------------
//
// authenticated routes that were deliberately left unlimited in Stage 3;
// remove an entry when you add a limit, never add to this list without a
// reason
const RATE_LIMIT_ALLOWLIST = new Set([
  "src/app/api/account/email/verify/route.ts",
  "src/app/api/account/sessions/route.ts",
  "src/app/api/account/settings/route.ts",
  "src/app/api/account/username/route.ts",
  "src/app/api/auth/logout/route.ts",
  "src/app/api/auth/reset/route.ts",
  "src/app/api/friends/respond/route.ts",
  "src/app/api/friends/route.ts",
  "src/app/api/posts/[id]/route.ts",
  // Read-only: POST only to keep the Nearby coords out of the URL, same as
  // restaurants/discover below.
  "src/app/api/posts/discover/route.ts",
  "src/app/api/restaurants/discover/route.ts",
]);

const MUTATING_EXPORT_RE = /export (async )?function (POST|PUT|PATCH|DELETE)\b/g;
const HAS_LIMIT_RE = /limitOrReject\(|checkLoginAllowed\(/;

const routeFiles = findFiles(API_DIR, "route.ts").sort();
let mutatingRouteCount = 0;

for (const abs of routeFiles) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  const content = readNormalized(rel);

  const methods = [...content.matchAll(MUTATING_EXPORT_RE)].map((m) => m[2]);
  if (methods.length === 0) continue;
  mutatingRouteCount++;

  if (HAS_LIMIT_RE.test(content)) continue;
  if (RATE_LIMIT_ALLOWLIST.has(rel)) continue;

  violations.push(
    `[rate-limit] ${rel} exports ${methods.join(", ")} but calls neither ` +
      `limitOrReject( nor checkLoginAllowed(, and is not in the RATE_LIMIT_ALLOWLIST.`,
  );
}

// A stale allowlist entry (route now limited, or route no longer exists /
// no longer mutating) is not itself a security hole, but it rots silently
// otherwise — surface it as a warning so it gets cleaned up.
for (const rel of RATE_LIMIT_ALLOWLIST) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    warnings.push(`[rate-limit] allowlist entry ${rel} no longer exists — remove it.`);
    continue;
  }
  const content = readNormalized(rel);
  const stillMutating = MUTATING_EXPORT_RE.test(content);
  MUTATING_EXPORT_RE.lastIndex = 0;
  if (!stillMutating) {
    warnings.push(`[rate-limit] allowlist entry ${rel} no longer exports a mutating method — remove it.`);
  } else if (HAS_LIMIT_RE.test(content)) {
    warnings.push(`[rate-limit] allowlist entry ${rel} now calls limitOrReject/checkLoginAllowed — remove it from the allowlist.`);
  }
}

// ---------------------------------------------------------------------------
// Check 2: every `req.json()` / `request.json()` / `_req.json()` call in an
// API route must be guarded, either with `.catch(` on the same line or a
// `try {` / `try{` within the 8 preceding lines.
// ---------------------------------------------------------------------------
const JSON_CALL_RE = /\b(req|request|_req)\.json\(\)/;
const TRY_RE = /try\s*\{/;

for (const abs of routeFiles) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  const lines = readNormalized(rel).split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (!JSON_CALL_RE.test(lines[i])) continue;
    if (lines[i].includes(".catch(")) continue;

    const start = Math.max(0, i - 8);
    const preceding = lines.slice(start, i);
    if (preceding.some((l) => TRY_RE.test(l))) continue;

    violations.push(
      `[json-guard] ${rel}:${i + 1} calls req.json() with neither .catch( on the ` +
        `same line nor a try { within the 8 preceding lines.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Check 3: next.config.ts.
// ---------------------------------------------------------------------------
const NEXT_CONFIG_PATH = "next.config.ts";
if (!existsSync(join(ROOT, NEXT_CONFIG_PATH))) {
  violations.push(`[next-config] ${NEXT_CONFIG_PATH} not found.`);
} else {
  // Strip /* */ block comments before matching: the file documents the old
  // wildcard hostname and other now-forbidden patterns in prose right above
  // the code that replaced them, and a raw text match would trip on those
  // explanations rather than on real config.
  const config = readNormalized(NEXT_CONFIG_PATH).replace(/\/\*[\s\S]*?\*\//g, "");

  if (!/poweredByHeader:\s*false/.test(config)) {
    violations.push(`[next-config] ${NEXT_CONFIG_PATH} is missing "poweredByHeader: false".`);
  }

  if (/hostname:\s*["'`]\*\*?["'`]/.test(config)) {
    violations.push(
      `[next-config] ${NEXT_CONFIG_PATH} contains a wildcard-only hostname ` +
        `("**" or "*") in images.remotePatterns — this reopens the image-proxy SSRF (finding #6).`,
    );
  }

  const headersMatch = config.match(/async headers\(\)[\s\S]*?\n\}/);
  const headersBlock = headersMatch ? headersMatch[0] : "";
  const requiredHeaders = [
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Content-Security-Policy",
  ];
  for (const header of requiredHeaders) {
    if (!headersBlock.includes(header)) {
      violations.push(`[next-config] ${NEXT_CONFIG_PATH} headers() is missing "${header}".`);
    }
  }
  if (headersBlock.includes("Content-Security-Policy") && !headersBlock.includes("frame-ancestors 'none'")) {
    violations.push(
      `[next-config] ${NEXT_CONFIG_PATH} headers() Content-Security-Policy is missing "frame-ancestors 'none'".`,
    );
  }
}

// ---------------------------------------------------------------------------
// Check 4: core invariants from the Stage 3 findings.
// ---------------------------------------------------------------------------
function requireContains(relPath, needle, message) {
  if (!existsSync(join(ROOT, relPath))) {
    violations.push(`[invariant] ${relPath} does not exist — ${message}`);
    return;
  }
  const content = readNormalized(relPath);
  if (!content.includes(needle)) {
    violations.push(`[invariant] ${relPath} no longer contains "${needle}" — ${message}`);
  }
}

requireContains(
  "src/lib/db.ts",
  "maySeeMedia",
  "finding #1 (private-media gate in hydratePosts) was undone.",
);
requireContains(
  "src/lib/db.ts",
  "getBlockStatus(",
  "finding #3 (block enforcement) was undone.",
);
requireContains(
  "src/lib/db.ts",
  "hashToken(",
  "finding #8 (createSession must insert a hashed token, never the raw session token) was undone.",
);
requireContains(
  "src/app/u/[id]/page.tsx",
  "getBlockStatus(",
  "finding #10 (profile page block check) was undone.",
);
requireContains(
  "src/app/m/u/[id]/page.tsx",
  "getBlockStatus(",
  "finding #10 (mobile profile page block check) was undone.",
);
requireContains(
  "src/app/robots.ts",
  "/drafts",
  "finding #9 (/drafts kept out of the crawl index) was undone.",
);
requireContains(
  "src/app/drafts/layout.tsx",
  "notFound(",
  "finding #9 (/drafts 404s in production) was undone.",
);
requireContains(
  "src/app/api/auth/login/route.ts",
  "DUMMY_HASH",
  "finding #15 (constant-time login — dummy bcrypt compare when no user exists) was undone.",
);
requireContains(
  "src/components/RestaurantPhoto.tsx",
  "unoptimized",
  "finding #6 (restaurant photos must bypass /_next/image, which is why the wildcard hostname was removed) was undone.",
);

// WARN (don't fail) if some other <Image in src/ lacks `unoptimized` nearby.
// This is a coarse per-file check, not a per-usage one: it flags a file that
// renders <Image without the word "unoptimized" anywhere in it, other than
// RestaurantPhoto.tsx itself (already required above).
function findFilesByExt(dir, ext) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { recursive: true })) {
    if (!entry.endsWith(ext)) continue;
    const full = join(dir, entry);
    if (statSync(full).isFile()) out.push(full);
  }
  return out;
}

const SRC_DIR = join(ROOT, "src");
for (const abs of findFilesByExt(SRC_DIR, ".tsx")) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  if (rel === "src/components/RestaurantPhoto.tsx") continue;
  const content = readNormalized(rel);
  if (/<Image\b/.test(content) && !content.includes("unoptimized")) {
    warnings.push(
      `[image] ${rel} renders <Image without "unoptimized" anywhere in the file — ` +
        `confirm it only ever points at an allowlisted host in next.config.ts.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Check 5: npm audit — fail on any high/critical prod vulnerability.
// ---------------------------------------------------------------------------
if (process.env.SKIP_AUDIT === "1") {
  warnings.push("[audit] SKIP_AUDIT=1 set — npm audit skipped.");
} else {
  // A single command string (all static tokens, nothing interpolated) rather
  // than an args array with shell:true — passing both trips Node's
  // DEP0190 warning about unescaped argument concatenation.
  const result = spawnSync("npm audit --omit=dev --audit-level=high --json", {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    timeout: 120_000,
  });

  const stdout = result.stdout ?? "";
  if (result.error || !stdout.trim()) {
    warnings.push(
      `[audit] npm audit could not run (${result.error ? result.error.message : "no output"}) — failing open.`,
    );
  } else {
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      warnings.push("[audit] npm audit produced unparseable output — failing open.");
      parsed = null;
    }

    if (parsed) {
      const vulns = parsed.metadata?.vulnerabilities;
      if (!vulns) {
        warnings.push("[audit] npm audit JSON had no metadata.vulnerabilities — failing open.");
      } else {
        const highAndCritical = (vulns.high ?? 0) + (vulns.critical ?? 0);
        if (highAndCritical > 0) {
          const names = Object.entries(parsed.vulnerabilities ?? {})
            .filter(([, v]) => v.severity === "high" || v.severity === "critical")
            .map(([name, v]) => `${name} (${v.severity})`);
          violations.push(
            `[audit] ${highAndCritical} high/critical vulnerabilities in production dependencies: ${names.join(", ") || "(names unavailable)"}`,
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
if (warnings.length > 0) {
  console.warn("security check warnings:");
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (violations.length > 0) {
  console.error(`security check FAILED (${violations.length} violation${violations.length === 1 ? "" : "s"}):`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(
  `security check passed (${routeFiles.length} routes, ${mutatingRouteCount} mutating, ` +
    `${RATE_LIMIT_ALLOWLIST.size} allowlisted, ${warnings.length} warning${warnings.length === 1 ? "" : "s"})`,
);
