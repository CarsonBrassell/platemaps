import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
try { const r = await sql`SELECT name FROM pg_available_extensions WHERE name='unaccent'`; console.log("available:", JSON.stringify(r)); } catch(e){ console.log("avail err", e.message); }
try { const r = await sql`SELECT extname FROM pg_extension`; console.log("installed:", r.map(x=>x.extname).join(",")); } catch(e){ console.log("ext err", e.message); }
