import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`select id, name, website from restaurants where name ilike '%san luis%' limit 10`;
for(const x of r) console.log(x.id+" | "+x.name+" | "+(x.website||"(none)"));
