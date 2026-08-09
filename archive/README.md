# Archive

Working designs that are no longer rendered in the web app but are worth
keeping. Nothing in here is imported by `src/` — deleting the folder would not
change the build. It is still type-checked (`tsconfig.json` includes `**/*.tsx`
and excludes only `node_modules`), which is deliberate: if a shared dependency
like `@/components/icons` changes shape, `npx tsc --noEmit` says so instead of
letting the archive quietly rot into something that no longer runs.

## `nav/` — app navigation chrome

Two components that between them were the whole of PlateMaps' navigation
outside the page header. Both were removed from the web app; both were built
around a phone, which is why they were archived rather than deleted.

### `MobileNavigation.tsx` — bottom tab bar

Rendered only on Discover, and only below the `lg` breakpoint (1024px). That
gate is why it was invisible in a normal desktop window, and it is the first
thing to delete in a native shell, where there is no breakpoint to hide behind.

Measured on a 375×812 viewport as archived:

| | |
|---|---|
| bar height | 73px (56px row + `py-2` + 1px top border) |
| tab target | 69 × 56px each, five across |
| icons | 24px |
| labels | 11px, centered under the icon |
| create button | 56px orange circle, center slot |
| safe area | `env(safe-area-inset-bottom)` as bottom padding |

Design decisions worth keeping:

- **Five slots, create in the middle.** The one action the app wants gets the
  center thumb position and the only filled shape; the other four are icon +
  label in the same weight, so nothing else competes with it.
- **Taller than the 44px accessibility floor.** At this size the bar was the
  only navigation on the page, so it reads as a surface rather than a strip.
  44px is the floor for a control, not the target for a primary nav.
- **`bg-white/95` + `backdrop-blur-sm`** over a hard fill, so content scrolling
  under it stays legible as motion rather than disappearing at a hard edge.
- **Cream `#F7F4EC` on orange**, no shadow — matches the design system's
  selected-state pill treatment.
- **Ranks opens a dialog, not a route.** The leaderboard was a panel over the
  current page, so the bar never navigated away from what you were browsing.

### `SideNav.tsx` — desktop rail

The `lg`-and-up counterpart: Home / Explore / Saved / Profile, a Create Post
button, and an account card with the points badge. Removed from Discover
because the app header already carries Feed / Discover / My account, so it
spent the widest column on destinations the reader had passed on the way in.

It also held the only **pending friend-request badge** in the app — a count on
the Profile row, fed by `/api/friends`. That badge has no home now; incoming
requests surface only on `/account`. Worth re-siting whenever this comes back.

## Notes for the mobile app

- `NavKey` is duplicated: the live copy is `src/components/feed/types.ts`, and
  `nav/SideNav.tsx` re-declares it so the archive stands alone. If the archived
  nav ever ships again, collapse them back to one.
- Both files still import live code — `@/components/icons`, `@/lib/format`,
  `@/components/BrandMark`, `@/components/feed/PointsBadge`. Vendor those in
  before moving this to a separate repo.
- `onNavigate` pushed `/feed` and `/feed?view=saved`; `onCreate` pushed
  `/post`. Those are web routes and will need to become native ones.
