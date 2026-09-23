import { neon } from "@neondatabase/serverless";
import fs from "fs";
const url = (fs.readFileSync(".env.local","utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)||[])[1];
const sql = neon(url);
console.table(await sql`SELECT p.id, p.restaurant_id, u.email, p.dish_name, p.rating_kind, p.created_at FROM posts p LEFT JOIN users u ON u.id=p.user_id WHERE p.id LIKE '%demo%' ORDER BY p.id`);
