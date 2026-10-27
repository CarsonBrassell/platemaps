# Restaurant claims: owners posting on PlateMaps

Status: MOCKUP APPROVED, NOT BUILT. Discussed 2026-09-28/29.

## Mockup
- `src/app/drafts/claim-restaurant/page.tsx`, at http://localhost:3000/drafts/claim-restaurant (dev only; /drafts 404s in prod).
- Calvin approved the look and the flow below.

## How owners are verified (decided)
- Rejected: posting a code on their website or Instagram (too confusing for owners), and domain-only email (many spots have no domain).
- Chosen: owner signs up with an email the restaurant posts publicly (website, Instagram, Facebook), plus a 6-digit email code (Resend), plus MANUAL review by Calvin.
- Scraping restaurant websites for emails to auto-match: deferred, "scrap later".
- Don't trust Yelp or Google listings as proof, because anyone can suggest edits there.

## Flow (approved)
1. Entry points:
   - Sign-up screen: a card under the form, "Restaurant owner? Sign up here to post for your restaurant →".
   - Restaurant page: an "Own this restaurant? [Claim]" card.
2. Find your restaurant: search by name, pick it, Continue. Includes a "Not listed? Tell us about it" link.
3. Claim form: your name, role (Owner/Manager), business email, business phone, create a password, and optionally where that email is posted. Signing up and claiming happen in one go.
4. Check your email: enter the 6-digit code.
5. Waiting for review: "usually 1–2 days", with a progress list (Claim sent ✓ → Email confirmed ✓ → PlateMaps review → Start posting).
6. Admin review queue: Calvin approves or rejects. The owner is emailed either way, and approval grants posting.

## Safeguards (proposed, not yet confirmed)
- One verified owner per restaurant, with a way to dispute or revoke a claim.
- Email the restaurant's listed address when it gets claimed.
- A "Restaurant" badge on owner posts.

## Open question (ask Calvin before building)
What can an approved restaurant post?
- (a) Normal posts under the restaurant's name with a badge, shown in the feed and on their page. Recommended because it reuses the post system.
- (b) Specials and updates only, shown on their restaurant page only.
- (c) Both, with a pinned special at the top of their page.

## Build scope once answered
Ships to phone AND web (shared logic in src/lib + src/app/api, separate Phone* components):
claims table migration, claim API and email code, owner sign-up link, find-restaurant step, claim form, waiting screen, admin queue, approval emails, and owner posting per the answer above.
