import { sql } from "../scripts/sql-client.mjs";

console.log("posts total          ", (await sql`SELECT count(*)::int n FROM posts`)[0].n);
console.log(
  "posts with a rating  ",
  (await sql`SELECT count(*)::int n FROM posts WHERE rating IS NOT NULL`)[0].n,
);
console.log("by rating_kind:");
for (const r of await sql`
  SELECT rating_kind, count(*)::int n, count(rating)::int rated
  FROM posts GROUP BY rating_kind ORDER BY n DESC`) {
  console.log("  ", r.rating_kind, "posts", r.n, "rated", r.rated);
}
console.log("distinct restaurants rated:", (await sql`
  SELECT count(DISTINCT restaurant_id)::int n FROM posts
  WHERE rating_kind = 'dish' AND rating IS NOT NULL`)[0].n);
console.log("dish_name null on rated dish posts:", (await sql`
  SELECT count(*)::int n FROM posts
  WHERE rating_kind = 'dish' AND rating IS NOT NULL AND coalesce(trim(dish_name), '') = ''`)[0].n);
console.log("");
console.log("top rated branches:");
for (const r of await sql`
  SELECT p.restaurant_id, r.name, count(*)::int n, count(DISTINCT lower(trim(p.dish_name)))::int dishes
  FROM posts p LEFT JOIN restaurants r ON r.id = p.restaurant_id
  WHERE p.rating_kind = 'dish' AND p.rating IS NOT NULL
  GROUP BY p.restaurant_id, r.name ORDER BY n DESC LIMIT 15`) {
  console.log("  ", r.restaurant_id, r.name, "— ratings", r.n, "dishes", r.dishes);
}
