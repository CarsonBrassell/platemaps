/**
 * How long a plate's words may be.
 *
 * 200 characters, and it is a product decision rather than a storage one —
 * the column is TEXT and would take a novel. A plate is a verdict you can read
 * off a phone while deciding where to eat (PRODUCT.md), and a feed of
 * paragraphs is a feed nobody scans. It also puts a floor under how much work
 * posting is, which is the supply side the whole points economy exists to
 * protect.
 *
 * Enforced in three places, deliberately:
 *
 * - `maxLength` on both composers' textareas, so the limit is felt while
 *   typing rather than discovered on submit;
 * - the live counter beside them, so "felt" means visible;
 * - `/api/posts`, which **rejects** an over-length body rather than truncating
 *   it. Truncation is the tempting one-liner and it is wrong: silently
 *   swallowing the end of what someone wrote is worse than telling them it
 *   didn't fit.
 *
 * Comments are not posts and keep their own, longer limit (1,000, set on
 * CommentsScreen's composer) — a reply is a conversation, not a verdict.
 *
 * **Rows written before this limit existed are longer than 200 and must still
 * render.** Nothing on the read path may assume this bound; it constrains
 * writes only.
 */
export const MAX_POST_TEXT = 200;

/**
 * How many characters are left before the counter starts warning. Purely a
 * display threshold — nothing is blocked at this point.
 */
export const POST_TEXT_WARN_AT = 20;
