/*
 * Render parity for everyone without For me (run by scripts/check-forme.mjs in
 * a tsx child; it needs CommonJS to stand in for useTaste and next/navigation).
 *
 * renderToStaticMarkup of the "Your taste" section (web and phone) for a
 * signed-out viewer, a signed-in viewer without forMe, and a viewer whose
 * account is still loading must carry exactly the button classes origin/main
 * ships. The expected strings are inlined from main (b5a10df) on purpose: if
 * the shared constants change again, this fails rather than following them.
 * A For me viewer is rendered as the control: the same check must see a
 * difference, or it proves nothing.
 */
/* eslint-disable */
const path = require("path");
const Module = require("module");
const assert = require("node:assert/strict");

const ROOT = process.cwd();
const rq = Module.createRequire(path.join(ROOT, "package.json"));
const React = rq("react");
const { renderToStaticMarkup } = rq("react-dom/server");

// origin/main src/components/TasteSection.tsx BTN
const MAIN_WEB_BTN =
  "text-[13px] font-medium text-zinc-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";
// origin/main src/components/mobile/PhoneTasteSection.tsx BTN
const MAIN_PHONE_BTN =
  "min-h-11 text-[13px] font-medium text-zinc-500 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

// renderToStaticMarkup is the server frame, where useHydrated is false and so the
// gate is closed for every viewer. Most checks here are about the frame after
// hydration; the hydration check below flips this off.
const S: any = { taste: null, hydrated: true };
const origLoad = Module._load;
Module._load = function (request: string) {
  if (request === "@/lib/useTaste") return { useTaste: () => S.taste };
  if (request === "@/lib/useHydrated") return { useHydrated: () => S.hydrated };
  if (request === "next/navigation")
    return { usePathname: () => "/", useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams("") };
  return origLoad.apply(this, arguments);
};

// The module-private AuthContext, caught as auth.tsx creates it.
const ctxs: any[] = [];
const origCreateContext = React.createContext;
React.createContext = function (def: any) {
  const c = origCreateContext(def);
  if (def === null) ctxs.push(c);
  return c;
};
require(path.join(ROOT, "src/lib/auth.tsx"));
React.createContext = origCreateContext;
assert.ok(ctxs.length, "AuthContext not found");

const noop = () => {};
const auth = (account: any, loading = false) => ({ account, loading, resolved: !loading, signIn: noop, signUp: noop, signOut: noop, refresh: noop });
const VIEWERS: Record<string, any> = {
  out: auth(null),
  in: auth({ id: "11111111-1111-1111-1111-111111111111", username: "someone", email: "a@b.c" }),
  loading: auth(null, true),
};
const FOR_ME = auth({ id: "11111111-1111-1111-1111-111111111111", username: "x", email: "a@b.c", forMe: true });

const restaurant = (i: number) => ({
  id: "r" + i, name: "Place " + i, cuisine: "Thai", cuisineTags: "", neighborhood: "North Park",
  distance: "1.0 mi", hours: null, lat: 32.7, lng: -117.1, rating: 4.1, reviewCount: 20, trending: false, priceBand: null,
});
const picks = [0, 1, 2].map((i) => ({
  restaurant: restaurant(i),
  plateScore: null,
  reason: { kind: "favorite", text: "Because you love Thai", short: "Thai" },
}));
const taste = () => ({
  status: "ready", basis: "history", header: "Based on your plates", shortHeader: "Plates",
  prefs: { loves: ["Thai"], skips: [], been: [], hidden: [] },
  picks, signedIn: false, apply: noop, undo: null,
});

function withAuth(value: any, el: any) {
  let out = el;
  for (const c of ctxs) out = React.createElement(c.Provider, { value }, out);
  return out;
}

// Force the edit panel open: the first useState in each section is `editing`.
function render(value: any, Component: any, props: any, editing: boolean) {
  S.taste = taste();
  const orig = React.useState;
  let first = true;
  React.useState = function (init: any) {
    if (first && editing) { first = false; init = true; }
    first = false;
    return orig(init);
  };
  try {
    return renderToStaticMarkup(withAuth(value, React.createElement(Component, props)));
  } finally {
    React.useState = orig;
  }
}

const classesOf = (html: string, labels: RegExp) => {
  const out: string[] = [];
  for (const m of html.matchAll(/<button\b[^>]*?class="([^"]*)"[^>]*>([^<]*)</g)) if (labels.test(m[2])) out.push(m[1]);
  return out;
};

const { TasteSection } = require(path.join(ROOT, "src/components/TasteSection.tsx"));
const { PhoneTasteSection } = require(path.join(ROOT, "src/components/mobile/PhoneTasteSection.tsx"));

let n = 0;
const dump: Record<string, string> = {};
for (const [name, viewer] of Object.entries(VIEWERS)) {
  for (const editing of [false, true]) {
    const web = render(viewer, TasteSection, { cuisines: ["Thai", "Mexican"] }, editing);
    dump[`web-${name}-${editing}`] = web;
    const webBtns = classesOf(web, /^(Been here|Not for me|Reset my taste)$/);
    assert.equal(webBtns.length, editing ? 7 : 6, `web ${name} editing=${editing}: button count`);
    for (const c of webBtns) assert.equal(c, MAIN_WEB_BTN, `web ${name} editing=${editing}: a taste button's classes differ from origin/main`);

    const phone = render(viewer, PhoneTasteSection, { cuisines: ["Thai", "Mexican"] }, editing);
    dump[`phone-${name}-${editing}`] = phone;
    const phoneBtns = classesOf(phone, /^(Been here|Not for me|Reset my taste)$/);
    assert.ok(phoneBtns.length >= 6, `phone ${name} editing=${editing}: buttons rendered`);
    for (const c of phoneBtns) assert.equal(c, MAIN_PHONE_BTN, `phone ${name} editing=${editing}: a taste button's classes differ from origin/main`);
    n += 2;
  }
}

// Developer aid: FORME_DUMP=out.json writes every markup, so the same file run in a checkout of origin/main can be diffed.
if (process.env.FORME_DUMP) require("node:fs").writeFileSync(process.env.FORME_DUMP, JSON.stringify(dump));

// Control: for the dish-pick accounts the buttons are allowed to differ, and the check must be able to see it.
const forMeWeb = render(FOR_ME, TasteSection, { cuisines: ["Thai"] }, false);
const forMeBtns = classesOf(forMeWeb, /^(Been here|Not for me)$/);
assert.ok(forMeBtns.length > 0 && forMeBtns.some((c) => c !== MAIN_WEB_BTN), "control: the dish-pick accounts should render the roomier buttons");

// Hydration: while a subtree hydrates, a dish-pick account must render exactly the
// server's frame (everyone else's), or React throws a hydration error on it.
S.hydrated = false;
for (const [label, Component, BTN] of [["web", TasteSection, MAIN_WEB_BTN], ["phone", PhoneTasteSection, MAIN_PHONE_BTN]] as const) {
  const btns = classesOf(render(FOR_ME, Component, { cuisines: ["Thai", "Mexican"] }, false), /^(Been here|Not for me|Reset my taste)$/);
  assert.ok(btns.length >= 6, `${label} hydrating: buttons rendered`);
  for (const c of btns) assert.equal(c, BTN, `${label} hydrating: a dish-pick account's frame differs from the server's, which is a hydration error`);
}
S.hydrated = true;

// The dish-pick accounts get no For me pill or link, no cuisine chips and no Edit panel, and a text reset.
for (const [label, Component] of [["web", TasteSection], ["phone", PhoneTasteSection]] as const) {
  for (const editing of [false, true]) {
    const html = render(FOR_ME, Component, { cuisines: ["Thai", "Mexican"] }, editing);
    const where = `${label} dish picks editing=${editing}`;
    assert.ok(!/For me|foryou|Tuned to you/.test(html), `${where}: a For me entry point is back: ${html.match(/.{30}(For me|foryou|Tuned to you).{30}/)?.[0]}`);
    assert.ok(!/aria-pressed/.test(html), `${where}: cuisine chips are back`);
    assert.ok(!/>Edit</.test(html), `${where}: the Edit button is back`);
    assert.ok(/Reset my taste/.test(html), `${where}: no text reset`);
    assert.ok(/Been here/.test(html) && /Not for me/.test(html), `${where}: a pick has lost its buttons`);
    n++;
  }
}
console.log(`forme:check  render parity ok (${n - 8} section renders match origin/main's button classes; the dish-pick accounts have no pill, chips or Edit)`);
