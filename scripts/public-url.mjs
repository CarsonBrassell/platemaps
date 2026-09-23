/**
 * Refuse to fetch anything that is not a public http(s) address.
 *
 * The menu scripts fetch URLs that came from third-party listings — an OSM
 * `website` tag, a Serper hit, a stored `menu_lookups.source_url` — and any
 * of those can be edited by a stranger to point at `http://127.0.0.1:…`, a
 * router on the LAN, or a cloud metadata address. These scripts run on a
 * developer's machine, so "somebody else's server" is the least bad target;
 * this is the check that keeps it that way.
 *
 * `assertPublicUrl` resolves the host and rejects loopback, private,
 * link-local, CGNAT, multicast and unspecified addresses (v4 and v6).
 * `publicFetch` is `fetch` with redirects followed by hand, re-checking every
 * hop, because `redirect: "follow"` would happily land on 169.254.169.254.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

function isPrivateV4(ip) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(ip) {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return /^(fc|fd|fe[89ab]|ff)/.test(v);
}

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) return isPrivateV6(ip);
  return true;
}

/** Throws unless `url` is http(s) and every address its host resolves to is public. */
export async function assertPublicUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`refused non-http(s) URL ${parsed.protocol}`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`refused private address for ${host}`);
  }
  return parsed;
}

/**
 * `fetch`, but every hop is checked with assertPublicUrl and redirects are
 * followed here rather than by undici. The returned Response's `url` is the
 * final hop, as it would be with `redirect: "follow"`.
 */
export async function publicFetch(url, init = {}, maxHops = 8) {
  let current = String(url);
  let { method = "GET", body } = init;
  for (let hop = 0; hop <= maxHops; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, method, body, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {});
      current = new URL(location, current).toString();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
      }
      continue;
    }
    Object.defineProperty(res, "url", { value: current });
    return res;
  }
  throw new Error(`too many redirects from ${url}`);
}
