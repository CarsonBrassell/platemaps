# Text entry, sign-in, accounts and onboarding

14 confirmed (0 critical, 0 major, 7 minor, 7 polish) · 0 deliberate · 0 refuted, of 14 reported. Two findings were re-rated down and one factual number was corrected (see INP-01 and INP-10).

Scope note: nothing here is likely to cause an App Review rejection. The area already meets the account rules that Apple does enforce: account deletion is in the app, there is no social login (so Sign in with Apple is not required), and signed-out people can browse before being asked to sign up.

## Findings

### INP-01 · minor · No webcredentials associated domain for password AutoFill
- **Where:** `ios/App/App/App.entitlements:5` (only `aps-environment`). `public/.well-known` does not exist. A repo-wide search for `associated-domains`, `webcredentials` and `applinks` finds nothing outside probe/.
- **Screens:** Sign up / log in sheet, Account, Settings (password rows), Delete account
- **HIG:** managing-accounts. Apple names associated domains only for tvOS credential suggestions, and prefers passkeys on iOS when an app does not use Sign in with Apple. The page has no iPhone AutoFill section, so this is a general principle, not a stated rule.
- **What happens:** The entitlements file has one key. There is no `apple-app-site-association` file. The password fields themselves carry the right tokens (`new-password`, `current-password`), so only the app-to-site link is missing. Whether iOS still offers saved passwords inside this WKWebView is not settled by code. The original rating of major rested on that unproven consequence, so it is lowered to minor.
- **Fix:** Add `com.apple.developer.associated-domains` with `webcredentials:<site host>`. Serve `/.well-known/apple-app-site-association` as JSON with a `webcredentials.apps` entry for the team ID plus `com.platemapsapp.ios`. Enable Associated Domains on the App ID. This is also the first step for passkeys (INP-14) and for universal links (INP-02).
- **App Review risk:** none
- **Needs device:** yes. On a signed build, check whether a saved login is offered on the log-in sheet and whether a save prompt appears after sign-up.

### INP-02 · minor · Verify-email and reset-password links open Safari with no route back to the app
- **Where:** `src/lib/mail.ts:92` and `:121` build `${appUrl()}/verify-email?token=` and `/reset-password?token=`. `src/components/account/RecoveryForms.tsx:180` (reset success: "Sign in with your new password" plus a Sign in link) and `:360` (verify success: "Go to your account" link). The component comment at about line 241 says the link opens in whichever browser the mail app prefers.
- **Screens:** Forgot password, Reset password, Verify email (reached from email)
- **HIG:** managing-accounts says nothing about returning to the app (the page does not cover it). General principle: a task begun in the app should end back in the app.
- **What happens:** The links are plain https links and there are no universal links, so Mail opens them in Safari. The success cards then point to the account page in Safari. The reset card does say the person is signed out everywhere, but no copy says "open the PlateMaps app". The Safari session is separate from the app's, so the person finishes in the wrong place. The flow is still completable, which is why this is minor.
- **Fix:** Short term: add one line to both success cards, "Now open the PlateMaps app and sign in there", and on phones swap the Sign in link for it. Proper fix: universal links for `/reset-password` and `/verify-email` (needs the same associated-domains work as INP-01).
- **App Review risk:** low (a reviewer who tests forgot-password will land in Safari)
- **Needs device:** yes. Confirm which browser the Mail app uses and how the `/m` redirect behaves from there.

### INP-03 · minor · Leaving the composer discards a multi-step post with no confirmation
- **Where:** `src/app/m/post/page.tsx:453` (title-row X is a plain Link to the feed). `:429` (camera `onClose` calls `router.push`). `:789` (step-0 Cancel calls `router.push`). No `localStorage`, `sessionStorage` or `beforeunload` in `src/app/m/post` or `src/components/post`.
- **Screens:** Post a plate (all steps)
- **HIG:** entering-data says to design so mistakes are easy to avoid. The "confirm before discarding" idea is a general modality principle; I did not fetch a page that states it.
- **What happens:** Photos, restaurant, dish, rating and note live only in React state. One tap on the 44 px X on step 5 loses the whole post. `useStepHistory.ts:87` protects only step-to-step back.
- **Fix:** Once any photo, place or note exists, intercept leave with a "Discard this post?" sheet (Keep editing, Discard). Optionally mirror place, dish and note to `sessionStorage`.
- **App Review risk:** none
- **Needs device:** no

### INP-04 · minor · Return in the custom-dish and search fields submits the step instead of choosing
- **Where:** `src/components/post/DishPicker.tsx:240` (custom-dish input, no `onKeyDown`, no `enterKeyHint`). `:161` and `src/components/post/RestaurantPicker.tsx:167` (search inputs). All sit inside `<form id="phone-post-form" onSubmit={handleSubmit}>` (`src/app/m/post/page.tsx:487`).
- **Screens:** Post a plate: Where, What did you order
- **HIG:** entering-data (offer choices, give feedback right away). text-fields does not cover the Return key, so the Return-key part is a general principle.
- **What happens:** `handleSubmit` (`page.tsx:401`) calls `problemWith('dish')`, which fails while no dish is chosen. Someone who types a custom dish and presses Return sees "Choose a dish off the menu, or type what you ordered". The typed name only counts after tapping the separate "Use this" button (`DishPicker.tsx:247`). Return in the restaurant search with nothing picked shows a similar error.
- **Fix:** On the custom-dish input, Enter runs the same handler as "Use this" (when `customName` is set) and calls `preventDefault`. Add `enterKeyHint="done"` there and `enterKeyHint="search"` on the two search fields; on Enter in a search field, blur it.
- **App Review risk:** none
- **Needs device:** no

### INP-05 · minor · Terms and Privacy links in the sign-up form navigate away and lose the typed form
- **Where:** `src/components/mobile/PhoneProfileAuth.tsx:378` and `:382` (`<Link href="/m/terms">` and `/m/privacy`, no `target`). The comment at lines 351-355 says they "open in a new tab".
- **Screens:** Sign up sheet (and the sign-up form on Account)
- **HIG:** entering-data (do not make people re-enter information). General principle for keeping consent text reachable without breaking the flow.
- **What happens:** There are no tabs in the WKWebView, and a search for `_blank` and `target=` in both files finds none. The link replaces the page. Username, email, password and the checkbox are component state, and nothing is stored (the only storage in `PhoneSignUpSheet.tsx` is the dismissed flag). The comment does not match the code.
- **Fix:** Show the documents in a sheet over the form, or save username and email to `sessionStorage` and restore them. Correct the comment either way.
- **App Review risk:** low
- **Needs device:** no

### INP-06 · minor · Sign-up errors appear only after submit, as one message
- **Where:** `src/components/mobile/PhoneProfileAuth.tsx:104-160` (`validate()` runs only in `handleSubmit`; form uses `noValidate`). `:331` (single `role="alert"` message, above the Create button). `:314` (only the password has live feedback).
- **Screens:** Sign up / log in sheet
- **HIG:** text-fields: check email addresses when focus leaves the field, and user names and passwords before focus moves on. entering-data: report a problem as soon as it is seen.
- **What happens:** The message names only the first problem, in screen order. A username error shows three fields below the username with the keyboard up. Fields get `aria-invalid` but no `aria-describedby` (lines 255, 277, 299). The red box on the bad field and the first-problem ordering do soften this.
- **Fix:** Validate username and email on blur and show the message under that field with `aria-describedby`. Keep the bottom message for server errors and scroll it into view.
- **App Review risk:** none
- **Needs device:** yes. Check whether the message is visible with the keyboard up on a small phone.

### INP-07 · minor · Sign-up username field allows capitalising and autocorrect; Return after username submits an empty form
- **Where:** `src/components/mobile/PhoneProfileAuth.tsx:255` (no `autoCapitalize`, `autoCorrect`, `spellCheck` or `enterKeyHint`; a search of the file and of `RecoveryForms.tsx` for those attributes finds only `RecoveryForms.tsx:96-97`). Compare `src/components/account/AccountLedger.tsx:210-214`, which sets them.
- **Screens:** Sign up sheet
- **HIG:** text-fields: show the keyboard that fits the content. The page does not cover the Return key, so that half is a general principle.
- **What happens:** The handle field can be capitalised or autocorrected ("yourname" is a made-up word). Return after the username submits the form and shows "Enter your email." instead of moving to the next field. Return on the password field submitting is correct.
- **Fix:** On the username input add `autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"`. Add `enterKeyHint="next"` on email and `"go"` on password, and move focus on Enter.
- **App Review risk:** none
- **Needs device:** yes. iOS may already suppress capitalising for `autocomplete="username"`; check on a phone.

### INP-08 · polish · Log-in email field uses `autocomplete="email"`, not `username`
- **Where:** `src/components/mobile/PhoneProfileAuth.tsx:277` (`autoComplete="email"`; only the sign-up username at `:255` says `username`).
- **Screens:** Log in sheet
- **HIG:** text-fields (keyboard and content type). The token is a web detail, not an HIG rule.
- **What happens:** In log-in mode the identifier is the email field. AutoFill pairs a `username` field with the password field, so this may match saved logins less well. Not a visible defect on its own.
- **Fix:** `autoComplete={mode === "login" ? "username" : "email"}`.
- **App Review risk:** none
- **Needs device:** yes

### INP-09 · polish · No show/hide control on new-password fields
- **Where:** `src/components/mobile/PhoneProfileAuth.tsx:299`. Also `src/components/account/RecoveryForms.tsx:206` and `src/components/account/AccountLedger.tsx:265`. A search for "show password" and "reveal" finds nothing.
- **Screens:** Sign up, Reset password, Settings (change password)
- **HIG:** text-fields and entering-data want secure fields for passwords (met). A reveal toggle is a usability nicety, not an Apple rule.
- **What happens:** People invent a password against a rule (length plus a digit) while typing blind. The live `weakPassword` line at `:314` already helps.
- **Fix:** A 44 px "Show" toggle at the trailing end of the three new-password inputs. Keep log-in and delete masked.
- **App Review risk:** none
- **Needs device:** no

### INP-10 · polish · The coach tour cannot be replayed from inside the app
- **Where:** `src/components/tour/CoachTour.tsx:122-193` (the `STEPS` array), `:878-889` (`?tour=1` flag). No tour row in `PhoneSettingsScreen.tsx` or any account component.
- **Screens:** First-run tour; Settings
- **HIG:** onboarding: keep it brief, make it skippable, do not repeat it after a skip or finish, and make it easy to find later in help, account or settings.
- **What happens:** The finder said 12 steps. The array has 8 (feed, map, feedtab, restaurant, discover, friends, profile, post), so length is fine. Skip and no-repeat are met (`:699`, `:215`). Only the "find it later" part is missing: the `?tour=1` flag is the only way back and the comment at `:875` calls it that. A WKWebView has no address bar.
- **Fix:** Add a "Replay the tour" row in Settings that goes to `/m/feed?tour=1`.
- **App Review risk:** none
- **Needs device:** no

### INP-11 · polish · Last composer step is titled "Anything else?" but the note is required
- **Where:** `src/app/m/post/page.tsx:229` (title), `:546` (label "In your words", no required marker), `:275-276` (empty note rejected: "Say something about it...").
- **Screens:** Post a plate: final step
- **HIG:** entering-data: make clear what is required before people continue.
- **What happens:** The heading reads as optional. The sibling field is tagged "(optional, pick one)", so the untagged one reads as optional too. The error shows only after tapping Post, and its wording is clear, so the cost is one failed tap.
- **Fix:** Retitle to "Say something about it" and add "(required)" to the label. Do not disable Post (the code comments explain why).
- **App Review risk:** none
- **Needs device:** no

### INP-12 · polish · Two `autocomplete` tokens suggest the wrong thing
- **Where:** `src/components/mobile/freefood/InviteFriends.tsx:69` (`autoComplete="tel"` on a friend's number). `src/components/account/AccountLedger.tsx:154` (`autoComplete="email"` on the new-address field).
- **Screens:** Free food invite; Settings (email row)
- **HIG:** text-fields (content type). General principle.
- **What happens:** iOS offers the person's own number in a field meant for someone else's. The new-email field suggests the current address.
- **Fix:** `autoComplete="off"` on both. Keep `inputMode="tel"` and `type="email"`. The Settings username field (`:210`) is a rename of an existing handle; `autoComplete="username"` there is arguable, so leave it unless AutoFill misfires on device.
- **App Review risk:** none
- **Needs device:** no

### INP-13 · polish · Composer note is a fixed 3-row box for up to 200 characters; comments are single-line
- **Where:** `src/app/m/post/page.tsx:550-558` (`rows={3}`, `resize-none`, `maxLength` 200 from `src/lib/postLimits.ts:28`). `src/components/feed/ReportSheet.tsx:115` (`rows={3}`, same limit). `src/components/feed/Composer.tsx:62` (single-line `<input maxLength={1000}>`).
- **Screens:** Post a plate: final step; Report sheet; Comments
- **HIG:** text-fields: match the field's size to the expected text, and use a text view for longer text.
- **What happens:** 200 characters at 16 px in a phone column is about 5 lines, so text scrolls inside a 3-row box. A long comment cannot be reviewed before sending. The finder's "about 5 lines" is an estimate; check on device.
- **Fix:** Start at 3 rows and grow to about 6 (`field-sizing: content` or a small height-on-input handler). Use a growing textarea for comments.
- **App Review risk:** none
- **Needs device:** yes (line count at 390 px)

### INP-14 · polish · Password-only accounts: no passkey option or second factor
- **Where:** `src/components/mobile/PhoneProfileAuth.tsx:277` and `:299` (email plus password only). No OAuth or social login in `package.json`.
- **Screens:** Sign up / log in; Settings
- **HIG:** managing-accounts: if an app does not use Sign in with Apple, prefer passkeys on iOS; if passwords must stay, add two-factor authentication.
- **What happens:** The page states this, so the citation is sound. It is a preference, not a review rule. With no third-party login, Sign in with Apple is not required.
- **Fix:** Backlog. Passkeys need the associated-domains work in INP-01 first.
- **App Review risk:** none
- **Needs device:** no

## Deliberate deviations
None found. AGENTS.md and DESIGN.md say nothing about autocomplete tokens, Return keys, validation timing, the composer's leave behaviour or tour replay, so none of these is a recorded design choice. The 16 px inputs, 44 px targets and orange focus rings that this area does use are the project's own accessibility floor and are met.

## Refuted
None refuted. Corrections made while checking:
- The finder's "12 steps" for the coach tour is wrong; the array has 8 (INP-10 stands on the missing in-app replay alone).
- INP-01 was rated major on a consequence that code cannot prove; lowered to minor with the device check noted.
- The finder cited "set the Return key type" to text-fields and virtual-keyboards. text-fields says it does not cover the Return key, so INP-04 and INP-07 call that part a general principle.

## Already right
- No social login, so Sign in with Apple is not required; sign-up asks username, email, password only; signed-out browsing allowed. `src/lib/signInGate.ts:51`, `src/components/mobile/PhoneSignUpSheet.tsx:191`. "Not now" is on both sheet steps (`PhoneSignUpSheet.tsx:213`, `:225`). Matches managing-accounts "delay sign-in".
- Account deletion is in the app, in three steps, deletes outright, with Keep my account and a password check. `src/components/mobile/PhoneDeleteAccountPanel.tsx:83-138`. Meets the deletion guidance on managing-accounts.
- Password tokens are correct: `new-password` at `PhoneProfileAuth.tsx:299`, `RecoveryForms.tsx:209`, `AccountLedger.tsx:265`; `current-password` at `PhoneDeleteAccountPanel.tsx:138`. Passwords use `type="password"`; email uses `type="email"` (`PhoneProfileAuth.tsx:277`).
- Inputs are 16 px so iOS does not zoom: `PhoneProfileAuth.tsx:29`, `NoticeCard.tsx:25`, `DishPicker.tsx:166`, `RestaurantPicker.tsx:174`. Targets are `min-h-11`.
- Every sign-up field has a visible label (`PhoneProfileAuth.tsx:249-299`); pickers use `sr-only` labels (`RestaurantPicker.tsx:164`, `DishPicker.tsx:158`).
- The composer offers choices before typing (nearby list, menu list, rating meter) and shows "Step n of 5" with a progress bar (`page.tsx:468`). Back goes step by step (`useStepHistory.ts:87`).
- Sign-up keeps typed input after an error and maps the server reply onto the bad field (`PhoneProfileAuth.tsx:158-182`). The consent box turns red instead of the button being disabled (`:336-349`).
- Search fields set `type="search"`, `enterKeyHint="search"` and `autoCapitalize="none"` where names are typed (`PhoneDiscoverSearch.tsx:158`, `PhoneFindFriends.tsx:290-293`). Settings username and email set `autoCapitalize`/`autoCorrect` off (`AccountLedger.tsx:156-158`, `:210-214`).
- The tour is skippable and remembers where it was (`CoachTour.tsx:699`, `:215`).

## Needs a real iPhone
- Whether iCloud Keychain offers or saves passwords in the WKWebView build without the webcredentials association (INP-01, INP-08).
- Which browser the Mail app opens for reset and verify links, and where the person ends up afterwards (INP-02).
- Keyboard overlap in the Sign up / Log in sheet and the composer note step. The sheet is `fixed inset-0` with a dvh cap; WKWebView does not shrink dvh for the keyboard; there is no Keyboard plugin. Check password, consent row and Post button on a 375x667 phone (INP-06).
- Whether the keyboard closes on scroll or on a tap outside the field in the sheet, composer and Settings.
- Whether iOS capitalises or autocorrects the username field given `autocomplete="username"` (INP-07).
- VoiceOver reading of the error alert and of `aria-invalid` fields (belongs to the accessibility area).
- Line count of a 200-character note at 390 px (INP-13).
