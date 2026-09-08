import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const u = await sql`SELECT id::text, name, email, share_photos_publicly FROM users ORDER BY name`;
for (const x of u) console.log(`${x.share_photos_publicly?'ON ':'off'} ${x.name} (${x.id})`);
