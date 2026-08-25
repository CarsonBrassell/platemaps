/**
 * How a plate's name becomes the key its ratings are grouped under.
 *
 * Its own module, tiny as it is, because both sides of the join need it and they
 * cannot share a file: the grouping happens in SQL in lib/db.ts (server-only —
 * it constructs the Neon client at module scope), and the lookup happens in
 * `RestaurantDetail`, which is a client component. Putting this in db.ts and
 * importing it there would pull the database driver into the browser bundle.
 *
 * **This must stay identical to `plateGroupOn` in lib/db.ts**, which is
 * `lower(trim(coalesce(<alias>.dish_name, '')))`. If the two drift, a rated
 * plate silently renders as unrated — no error, just a missing percent.
 *
 * db.ts imports this one, which is the safe direction: `getDishPosts`
 * normalises the dish name it is *given* here and compares it against the SQL
 * expression, so both sides of that lookup already come from one place. The
 * grouping itself still has to be written in SQL, and that copy is the one to
 * keep in step.
 */
export function dishRatingKey(dishName: string): string {
  return dishName.trim().toLowerCase();
}
