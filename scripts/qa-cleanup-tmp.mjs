import { sql } from "./sql-client.mjs";

// Preview first: list the demo users and their post counts before deleting.
const before = await sql`
  SELECT u.id, u.name, u.email, COUNT(p.id) AS post_count
  FROM users u
  LEFT JOIN posts p ON p.user_id = u.id
  WHERE u.email LIKE '%@demo.platemaps.app'
  GROUP BY u.id, u.name, u.email
`;
console.log("Demo accounts found:", JSON.stringify(before, null, 2));

if (before.length === 0) {
  console.log("Nothing to clean up.");
  process.exit(0);
}

const deleted = await sql`
  DELETE FROM users WHERE email LIKE '%@demo.platemaps.app'
  RETURNING id, name, email
`;
console.log("Deleted users:", JSON.stringify(deleted, null, 2));
