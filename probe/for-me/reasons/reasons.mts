/** SELECT only. node --env-file=<.env.local> --import tsx probe/for-me/reasons/reasons.mts */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus } from "../../../src/lib/discover.ts";
import { getUserById, postsForDishTaste, crowdPostsRows, getBlockedEitherWayIds } from "../../../src/lib/db.ts";
import { loadDishIndex } from "../../../src/lib/dishIndex.ts";
import { resolveTasteContext } from "../../../src/lib/tasteContext.ts";
import { meanRating } from "../../../src/lib/taste.ts";
import { rankDishes, dishPickLog } from "../../../src/lib/dishTaste.ts";
import { buildCrowd, crowdMultipliers, crowdHighlights } from "../../../src/lib/crowdBonus.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const user = await getUserById("940561ca-05c8-4010-b8a9-f397235378b9");
if (!user) throw new Error("user not found");
const corpus = await loadCorpus();
const ctx = await resolveTasteContext({ user, corpus, prefs: undefined });
const index = await loadDishIndex(ctx.corpus);
const posts = await postsForDishTaste(user.id);
const crowdIdx = buildCrowd(await crowdPostsRows());
const blocked = new Set(await getBlockedEitherWayIds(user.id));
const picks = rankDishes({
  index, restaurants: ctx.corpus.restaurants, plates: ctx.corpus.plates, ratingMean: meanRating(ctx.corpus.restaurants),
  posts, prefs: ctx.prefs, now: Date.now(), limit: 24, flavor40: true,
  crowd: crowdMultipliers(crowdIdx, user.id, blocked), crowdNotes: crowdHighlights(crowdIdx, user.id, blocked),
}) ?? [];
const L: string[] = ["# For me reasons, Calvin (flavor40): before and after", ""];
let empty = 0, maxS = 0, maxT = 0;
picks.forEach((p, i) => {
  const old = dishPickLog(p)?.plain;
  maxS = Math.max(maxS, p.reason.short.length); maxT = Math.max(maxT, p.reason.text.length);
  if (!p.reason.text) empty++;
  L.push(`## ${i + 1}. ${p.restaurant.name} (${p.reason.kind})`, `- before: ${old?.short ?? ""}`, `- after short (${p.reason.short.length}): ${p.reason.short || "(none)"}`, `- after text (${p.reason.text.length}): ${p.reason.text || "(none)"}`, "");
});
L.push(`Picks ${picks.length}, empty ${empty}, longest short ${maxS}, longest text ${maxT}.`);
writeFileSync(join(HERE, "before-after.md"), L.join("\n") + "\n");
console.log(L.slice(-1)[0]);
