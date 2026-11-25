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
  // Ends the caller's own session and nothing else.
  "src/app/api/auth/logout/route.ts",
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
  // The policy lives in a constant above nextConfig, so these read the whole
  // file. Each directive here is one a later edit could quietly drop.
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]) {
    if (!config.includes(directive)) {
      violations.push(`[next-config] ${NEXT_CONFIG_PATH} CSP is missing "${directive}".`);
    }
  }
  if (/key:\s*"Content-Security-Policy-Report-Only"/.test(config)) {
    violations.push(`[next-config] ${NEXT_CONFIG_PATH} CSP went back to report-only.`);
  }
  // 'unsafe-eval' may appear only behind the isDev ternary.
  if (/"[^"]*'unsafe-eval'/.test(config.replace(/\$\{isDev[^}]*\}/g, ""))) {
    violations.push(`[next-config] ${NEXT_CONFIG_PATH} CSP allows 'unsafe-eval' outside development.`);
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
// Sign in with Apple / Google. An account made that way has a NULL
// password_hash, and the login route still runs a dummy bcrypt compare for it
// (timing). What keeps that compare from ever counting as a login is one
// guard, and losing it would make every such account open to a password.
requireContains(
  "src/app/api/auth/login/route.ts",
  "hash !== null",
  "a password-less (Apple/Google) account must never be signed in to by password.",
);
if (/DUMMY_HASH\s*=\s*bcrypt\.hashSync\(\s*["'`]/.test(readNormalized("src/app/api/auth/login/route.ts"))) {
  violations.push(
    "[invariant] src/app/api/auth/login/route.ts hashes a literal for DUMMY_HASH — it must be random bytes, so no known password matches it.",
  );
}
requireContains(
  "src/app/api/auth/reset/route.ts",
  "evictUntrustedIdentities(",
  "a password reset must remove Apple/Google sign-ins that are not provably the account's own inbox.",
);
// The Google iOS client id is compiled into the app as a URL scheme (its
// reversed form) AND handed to the native SDK from the remotely served page.
// If the two ever disagree, sign-in breaks in every installed build at once.
// Empty means Google is not set up yet, and there is nothing to match.
{
  const idsPath = "src/lib/oauth/publicIds.ts";
  if (!existsSync(join(ROOT, idsPath))) {
    violations.push(`[oauth] ${idsPath} does not exist.`);
  } else {
    const match = readNormalized(idsPath).match(/export const GOOGLE_IOS_CLIENT_ID\s*=\s*["'`]([^"'`]*)["'`]/);
    if (!match) {
      violations.push(`[oauth] ${idsPath} no longer declares GOOGLE_IOS_CLIENT_ID as a plain string constant.`);
    } else if (match[1]) {
      const suffix = ".apps.googleusercontent.com";
      const plistPath = "ios/App/App/Info.plist";
      if (!match[1].endsWith(suffix)) {
        violations.push(`[oauth] GOOGLE_IOS_CLIENT_ID does not end in ${suffix}.`);
      } else if (!existsSync(join(ROOT, plistPath))) {
        violations.push(`[oauth] GOOGLE_IOS_CLIENT_ID is set but ${plistPath} does not exist.`);
      } else {
        const scheme = `com.googleusercontent.apps.${match[1].slice(0, -suffix.length)}`;
        if (!readNormalized(plistPath).includes(scheme)) {
          violations.push(
            `[oauth] GOOGLE_IOS_CLIENT_ID is set but ${plistPath} has no URL scheme "${scheme}" — ` +
              `the id in src/lib/oauth/publicIds.ts and the scheme compiled into the app must match.`,
          );
        }
      }
    }
  }
}

// The build marker. A build that carries the sign-in plugin but not the Google
// URL scheme CRASHES when Google's sheet is asked for (the SDK raises an
// exception Swift cannot catch). The remotely served pages only offer native
// sign-in to a build whose user agent carries "PlateMapsSocial/<n>"
// (nativeState in src/lib/oauthClient.ts), so that marker is a promise that
// the scheme is compiled in. It may exist only alongside the scheme and a
// non-empty iOS client id, and the pages must keep asking for it.
{
  const capPath = "capacitor.config.ts";
  const plistPath = "ios/App/App/Info.plist";
  const idsPath = "src/lib/oauth/publicIds.ts";
  // Comments are stripped so that describing the marker does not count as setting it.
  const capSource = existsSync(join(ROOT, capPath))
    ? readNormalized(capPath).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    : "";
  if (capSource.includes("PlateMapsSocial/")) {
    const plist = existsSync(join(ROOT, plistPath)) ? readNormalized(plistPath) : "";
    if (!plist.includes("CFBundleURLTypes")) {
      violations.push(
        `[oauth] ${capPath} sets the PlateMapsSocial user-agent marker but ${plistPath} has no CFBundleURLTypes — ` +
          `a build marked this way without the Google URL scheme crashes on Google sign-in.`,
      );
    }
    const ids = existsSync(join(ROOT, idsPath)) ? readNormalized(idsPath) : "";
    if (!/export const GOOGLE_IOS_CLIENT_ID\s*=\s*["'`][^"'`]+["'`]/.test(ids)) {
      violations.push(
        `[oauth] ${capPath} sets the PlateMapsSocial user-agent marker but GOOGLE_IOS_CLIENT_ID is empty — ` +
          `add the marker in the same change as the id and its URL scheme, not before.`,
      );
    }
  }
}
requireContains(
  "src/lib/oauthClient.ts",
  "SOCIAL_BUILD_MARKER.test(",
  "native sign-in must only be offered to a build whose user agent carries the PlateMapsSocial marker — a build with the plugin and no Google URL scheme crashes.",
);

// Find friends from contacts. The match route answers "does this address
// belong to a member" and the phone routes send paid texts, so on these three
// the limiter is the protection itself: it has to stop the request when the
// counters cannot be read, and the routes must refuse outright while the
// feature is switched off.
for (const rel of [
  "src/app/api/contacts/match/route.ts",
  "src/app/api/account/phone/send/route.ts",
  "src/app/api/account/phone/verify/route.ts",
]) {
  requireContains(rel, "failClosed: true", "its limiter must fail closed (enumeration and SMS cost).");
}
for (const rel of ["src/app/api/contacts/match/route.ts", "src/app/api/account/phone/send/route.ts"]) {
  requireContains(rel, "clientIpBucket(", "its per-network limit must key on the IPv6 /64, not the full address.");
}
requireContains(
  "src/app/api/contacts/match/route.ts",
  "contactsMatchEnabled()",
  "contact matching must stay off until the deployment switches it on.",
);
// Uploaded contacts are compared in memory. The route must not reach for the
// database client itself — that is how an uploaded address would become a
// query parameter — and must not read the body in a way that skips the size
// check.
{
  const rel = "src/app/api/contacts/match/route.ts";
  if (existsSync(join(ROOT, rel))) {
    const content = readNormalized(rel);
    if (/@\/lib\/sqlClient/.test(content)) {
      violations.push(`[contacts] ${rel} imports the database client — uploaded contacts must never become query parameters.`);
    }
    if (/\breq\.json\(\)/.test(content)) {
      violations.push(`[contacts] ${rel} reads the body with req.json() — it must use req.text() so the real size is checked.`);
    }
    if (/console\.(log|info|debug|warn)\(/.test(content)) {
      violations.push(`[contacts] ${rel} logs with console.log/info/debug/warn — nothing about an upload may be logged.`);
    }
  }
}

// Finding #6: restaurant photos must bypass /_next/image, which is why the
// wildcard hostname was removed. They render through ShimmerImage, a plain
// <img>, so what has to hold is that ShimmerImage stays off next/image.
requireContains(
  "src/components/RestaurantPhoto.tsx",
  "<ShimmerImage",
  "finding #6 (restaurant photos must bypass /_next/image, which is why the wildcard hostname was removed) was undone.",
);
requireContains(
  "src/components/ShimmerImage.tsx",
  "<img",
  "finding #6 (restaurant photos must bypass /_next/image, which is why the wildcard hostname was removed) was undone.",
);
if (readNormalized("src/components/ShimmerImage.tsx").includes('from "next/image"')) {
  violations.push(
    "[invariant] src/components/ShimmerImage.tsx imports next/image — finding #6 (restaurant photos must bypass /_next/image) was undone.",
  );
}

// 2026-11-06 audit: each of these held a real hole.
requireContains(
  "src/proxy.ts",
  "isCrossSiteRequest(",
  "the cross-site write check in front of /api was removed.",
);
requireContains(
  "src/app/api/blob/upload/route.ts",
  "looksLikeJpeg(",
  "uploads must be checked by their bytes, not their declared type.",
);
requireContains(
  "src/app/api/posts/route.ts",
  "storedPhotoOwner(url) !== ownerId",
  "a post may only carry the author's own uploads.",
);
requireContains(
  "src/app/api/auth/avatar/route.ts",
  "storedPhotoOwner(avatarUrl) !== user.id",
  "an avatar must be the caller's own upload.",
);
requireContains(
  "src/lib/db.ts",
  "reversePostPoints(",
  "deleting a post must take back what it paid, or post-and-delete prints points.",
);
requireContains(
  "src/app/api/posts/route.ts",
  "countPaidPostsToday(",
  "the daily ceiling on paid posts was removed.",
);
requireContains(
  "src/app/api/posts/[id]/comments/route.ts",
  "hasCommentedOn(",
  "a post's author is paid once per commenter, not per comment.",
);
if (readNormalized("src/lib/db.ts").includes("export async function getPosts(")) {
  violations.push(
    "[invariant] src/lib/db.ts exports getPosts again: an unbounded read of every post is what /api/posts stopped doing.",
  );
}
if (!/requested\.length === 0/.test(readNormalized("src/app/api/restaurants/dishes/route.ts"))) {
  violations.push("[invariant] /api/restaurants/dishes must refuse a request with no ids.");
}

// Nothing tracked may hold a password hash: the repo has been public.
const hashHits = spawnSync(
  "git grep -lE '\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}'",
  { cwd: ROOT, shell: true, encoding: "utf8", timeout: 60_000 },
);
if (hashHits.stdout?.trim()) {
  violations.push(`[secrets] tracked files hold bcrypt hashes: ${hashHits.stdout.trim().split("\n").join(", ")}`);
}

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
