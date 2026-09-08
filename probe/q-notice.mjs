import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position`;
console.log("users cols:", cols.map(c=>c.column_name).join(", "));
const u = await sql`SELECT id::text, name, share_photos_publicly, photo_notice_seen FROM users WHERE id='940561ca-05c8-4010-b8a9-f397235378b9'`;
console.log(u);
