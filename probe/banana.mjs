import { neon } from "@neondatabase/serverless";
import fs from "fs";
const url = (fs.readFileSync(".env.local","utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)||[])[1];
const sql = neon(url);
console.table(await sql`SELECT p.id, p.restaurant_id, r.name, p.dish_name, p.rating, p.created_at::date FROM posts p LEFT JOIN restaurants r ON r.id=p.restaurant_id WHERE p.dish_name ILIKE '%banana%' OR p.restaurant_id IN (SELECT id FROM restaurants WHERE name ILIKE 'lazy dog%')`);
console.table(await sql`SELECT id, name, address FROM restaurants WHERE name ILIKE 'lazy dog%' OR id IN ('123','3893')`);
