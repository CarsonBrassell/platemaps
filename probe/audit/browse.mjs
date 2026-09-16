/**
 * The headless browser the audit agents drive. One daemon, many named sessions,
 * text in and text out so an agent's context stays small.
 *
 *   node probe/audit/browse.mjs serve                        daemon on :3777 (run.mjs starts it)
 *   node probe/audit/browse.mjs <session> open phone|web [lat,lng]
 *   node probe/audit/browse.mjs <session> goto /m/feed       path or full URL
 *   node probe/audit/browse.mjs <session> snap               numbered interactive elements
 *   node probe/audit/browse.mjs <session> click 12           by number, css selector, or text=...
 *   node probe/audit/browse.mjs <session> type 3 breakfast   fill by number or selector
 *   node probe/audit/browse.mjs <session> press Enter        any Playwright key name
 *   node probe/audit/browse.mjs <session> text [max] [from]  what a person sees, capped
 *   node probe/audit/browse.mjs <session> scroll down|up [px]
 *   node probe/audit/browse.mjs <session> wait 800
 *   node probe/audit/browse.mjs <session> shot label         png in probe/audit/shots/
 *   node probe/audit/browse.mjs <session> errors             console/page/network errors since last call
 *   node probe/audit/browse.mjs <session> login              signs in with AUDIT_EMAIL / AUDIT_PASSWORD (daemon env)
 *   node probe/audit/browse.mjs <session> back | url | close
 *
 * Phone sessions are an iPhone viewport with touch and a mobile UA; both kinds
 * carry a geolocation so "near you" has an answer. The dev server must already
 * be up on :3000 (AUDIT_BASE_URL overrides).
 */
import http from "node:http";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BROWSE_PORT ?? 3777);
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const SHOTS = path.join(HERE, "shots");
const IDLE_MS = 30 * 60_000;
const DEFAULT_GEO = { latitude: 32.7757, longitude: -117.0719 }; // SDSU

/**
 * Git Bash on Windows rewrites a leading "/" argument into a Windows path
 * before node sees it: "/m" becomes "M:/", "/m/feed" becomes "M:/feed", and
 * "/feed" becomes "C:/Program Files/Git/feed". Undo that, and accept paths
 * without the slash ("m/feed") so callers can sidestep it entirely.
 */
function normalizePath(raw) {
  let p = String(raw).trim();
  if (/^https?:\/\//i.test(p)) return p;
  const git = p.match(/^[A-Za-z]:[\\/].*?[\\/]Git[\\/](.*)$/i);
  if (git) p = "/" + git[1];
  const drive = p.match(/^([A-Za-z]):[\\/](.*)$/);
  if (drive) p = `/${drive[1].toLowerCase()}${drive[2] ? "/" + drive[2] : ""}`;
  p = p.replace(/\\/g, "/");
  if (!p.startsWith("/")) p = "/" + p;
  return p;
}

/* ---------------------------------------------------------------- daemon */

async function serve() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  /** @type {Map<string, {context: import('playwright').BrowserContext, page: import('playwright').Page, errors: string[], last: number, kind: string}>} */
  const sessions = new Map();

  async function open(name, kind, geo) {
    await close(name);
    const base = kind === "phone"
      ? { ...devices["iPhone 14"] }
      : { viewport: { width: 1280, height: 800 } };
    const context = await browser.newContext({
      ...base,
      baseURL: BASE,
      geolocation: geo ?? DEFAULT_GEO,
      permissions: ["geolocation"],
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
    });
    context.setDefaultTimeout(8000);
    const page = await context.newPage();
    const s = { context, page, errors: [], last: Date.now(), kind };
    page.on("pageerror", (e) => s.errors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
    page.on("console", (m) => { if (m.type() === "error") s.errors.push(`console: ${m.text().slice(0, 300)}`); });
    page.on("requestfailed", (r) => {
      if (/favicon|hot-update|webpack-hmr|turbopack/.test(r.url())) return;
      s.errors.push(`requestfailed: ${r.method()} ${r.url().slice(0, 200)} ${r.failure()?.errorText ?? ""}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400 && !/favicon/.test(r.url())) s.errors.push(`http ${r.status()}: ${r.request().method()} ${r.url().slice(0, 200)}`);
    });
    sessions.set(name, s);
    return s;
  }

  async function close(name) {
    const s = sessions.get(name);
    if (!s) return;
    sessions.delete(name);
    await s.context.close().catch(() => {});
  }

  function get(name) {
    const s = sessions.get(name);
    if (!s) throw new Error(`no session "${name}" - run: open phone|web`);
    s.last = Date.now();
    return s;
  }

  async function settle(page) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(250);
  }

  async function pageText(page, max = 3500, from = 0) {
    const raw = await page.evaluate(() => document.body?.innerText ?? "");
    const text = raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const slice = text.slice(from, from + max);
    const more = text.length > from + max
      ? `\n[... ${text.length - from - max} more chars; run: text ${max} ${from + max}]`
      : "";
    return slice + more;
  }

  async function where(page, ms) {
    const title = await page.title().catch(() => "");
    return `${ms != null ? `${ms}ms  ` : ""}${page.url()}\n# ${title}`;
  }

  async function snap(page) {
    const rows = await page.evaluate(() => {
      const sel = 'a[href], button, input, textarea, select, [role="button"], [role="tab"], [role="link"], [role="option"], [role="menuitem"], [contenteditable="true"], summary, label[for]';
      const els = Array.from(document.querySelectorAll(sel));
      const out = [];
      let n = 0;
      const vh = window.innerHeight;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.display === "none" || st.opacity === "0") continue;
        n += 1;
        el.setAttribute("data-pm-ref", String(n));
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute("type");
        const role = el.getAttribute("role") ?? (tag === "a" ? "link" : tag === "input" ? `input:${type ?? "text"}` : tag);
        const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.value || el.getAttribute("title") || el.querySelector("img")?.getAttribute("alt") || "")
          .replace(/\s+/g, " ").trim().slice(0, 70);
        const inView = r.bottom > 0 && r.top < vh ? "" : " (offscreen)";
        const state = [];
        if (el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-current")) state.push("selected");
        if (el.disabled) state.push("disabled");
        const href = tag === "a" ? ` -> ${el.getAttribute("href")}` : "";
        out.push(`[${n}] ${role} "${name}"${href}${state.length ? ` {${state.join(",")}}` : ""}${inView}`);
        if (n >= 160) { out.push("[... more elements; scroll and snap again]"); break; }
      }
      return out;
    });
    return rows.join("\n") || "(no interactive elements)";
  }

  function target(page, arg) {
    if (/^\d+$/.test(arg)) return page.locator(`[data-pm-ref="${arg}"]`).first();
    if (arg.startsWith("text=")) return page.getByText(arg.slice(5), { exact: false }).first();
    return page.locator(arg).first();
  }

  async function run(name, cmd, args) {
    if (cmd === "open") {
      const kind = args[0] === "phone" ? "phone" : "web";
      const geo = args[1]
        ? (([lat, lng]) => ({ latitude: Number(lat), longitude: Number(lng) }))(args[1].split(","))
        : null;
      await open(name, kind, geo);
      return `opened ${kind} session "${name}" at ${JSON.stringify(geo ?? DEFAULT_GEO)}; base ${BASE}`;
    }
    if (cmd === "close") { await close(name); return `closed "${name}"`; }
    const s = get(name);
    const { page } = s;
    switch (cmd) {
      case "goto": {
        const url = normalizePath(args[0] ?? "/");
        const t0 = Date.now();
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await settle(page);
        const ms = Date.now() - t0;
        const status = resp ? `  status ${resp.status()}` : "";
        return `${await where(page, ms)}${status}\n\n${await pageText(page, 1800)}`;
      }
      case "url": return await where(page);
      case "back": {
        await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
        await settle(page);
        return `${await where(page)}\n\n${await pageText(page, 1200)}`;
      }
      case "text": return await pageText(page, args[0] ? Number(args[0]) : 3500, args[1] ? Number(args[1]) : 0);
      case "snap": return `${await where(page)}\n${await snap(page)}`;
      case "click": {
        if (!args[0]) throw new Error("click needs a number, selector or text=...");
        const t0 = Date.now();
        await target(page, args[0]).click();
        await settle(page);
        return `clicked ${args[0]}  ${await where(page, Date.now() - t0)}\n\n${await pageText(page, 1500)}`;
      }
      case "type": {
        if (args.length < 2) throw new Error("type needs a target and text");
        const el = target(page, args[0]);
        await el.click();
        await el.fill(args.slice(1).join(" "));
        await page.waitForTimeout(700);
        return `typed into ${args[0]}  ${await where(page)}\n\n${await pageText(page, 1500)}`;
      }
      case "press": {
        await page.keyboard.press(args[0] ?? "Enter");
        await settle(page);
        return `pressed ${args[0]}  ${await where(page)}\n\n${await pageText(page, 1500)}`;
      }
      case "scroll": {
        const dir = args[0] === "up" ? -1 : 1;
        await page.mouse.wheel(0, Number(args[1] ?? 600) * dir);
        await page.waitForTimeout(500);
        const y = await page.evaluate(() => Math.round(window.scrollY));
        return `scrollY ${y}\n\n${await pageText(page, 1500)}`;
      }
      case "wait": { await page.waitForTimeout(Math.min(Number(args[0] ?? 500), 10000)); return "ok"; }
      case "shot": {
        const label = (args[0] ?? "shot").replace(/[^a-z0-9_-]/gi, "_");
        const file = path.join(SHOTS, `${name}-${label}-${Date.now()}.png`);
        await page.screenshot({ path: file, fullPage: false });
        return `saved ${path.relative(process.cwd(), file)}`;
      }
      case "errors": { const out = s.errors.splice(0).join("\n"); return out || "(no errors since last check)"; }
      case "login": {
        const email = process.env.AUDIT_EMAIL, password = process.env.AUDIT_PASSWORD;
        if (!email || !password) throw new Error("no AUDIT_EMAIL/AUDIT_PASSWORD in probe/audit/.env - logged-in scenarios are off");
        const r = await s.context.request.post("/api/auth/login", { data: { email, password } });
        if (!r.ok()) throw new Error(`login failed: ${r.status()} ${(await r.text()).slice(0, 200)}`);
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
        await settle(page);
        return `logged in as the audit account\n${await where(page)}`;
      }
      case "eval": {
        const v = await page.evaluate(args.join(" "));
        return typeof v === "string" ? v : (JSON.stringify(v, null, 1) ?? "undefined").slice(0, 4000);
      }
      default: throw new Error(`unknown command "${cmd}"`);
    }
  }

  setInterval(() => {
    const now = Date.now();
    for (const [name, s] of sessions) if (now - s.last > IDLE_MS) close(name);
  }, 60_000).unref();

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.end(JSON.stringify({ ok: true, sessions: [...sessions.keys()] }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { session, cmd, args = [] } = JSON.parse(body || "{}");
      const out = await run(session, cmd, args);
      res.end(JSON.stringify({ ok: true, out }));
    } catch (e) {
      res.end(JSON.stringify({ ok: false, out: `ERROR: ${e?.message ?? e}` }));
    }
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`browse daemon on http://127.0.0.1:${PORT}  base ${BASE}`));
  const bye = async () => { await browser.close().catch(() => {}); process.exit(0); };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}

/* ------------------------------------------------------------------- cli */

async function cli(session, cmd, args) {
  const res = await fetch(`http://127.0.0.1:${PORT}/cmd`, {
    method: "POST",
    body: JSON.stringify({ session, cmd, args }),
  }).catch(() => {
    throw new Error(`browse daemon not running on :${PORT} (start: node probe/audit/browse.mjs serve)`);
  });
  const { ok, out } = await res.json();
  process.stdout.write(out + "\n");
  if (!ok) process.exitCode = 1;
}

const [a, b, ...rest] = process.argv.slice(2);
if (a === "serve") serve();
else if (a && b) cli(a, b, rest).catch((e) => { console.error(e.message); process.exit(1); });
else { console.error("usage: browse.mjs serve | <session> <cmd> [args]  (see file header)"); process.exit(1); }
