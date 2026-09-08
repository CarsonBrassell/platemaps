import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const c = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='restaurants' ORDER BY ordinal_position`;
console.log(c.map(x=>x.column_name).join(", "));
