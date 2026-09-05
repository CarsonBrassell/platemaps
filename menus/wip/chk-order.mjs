import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const cols = await sql`select column_name from information_schema.columns where table_name='dishes'`;
console.log("dishes columns: "+cols.map(c=>c.column_name).join(", "));
