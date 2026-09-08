import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const a = await sql`SELECT id::text,name,address,lat,lng,listed,hold_reason,source_key,google_place_id,deh_record_id FROM restaurants WHERE google_place_id IN ('ChIJrbGpedBU2YARuBxARvxB9og','ChIJ3xjPzQoN3IARxUAGaoAz1eo')`;
console.log("by place id:", JSON.stringify(a,null,1));
const b = await sql`SELECT id::text,name,address,lat,lng,listed,source_key,deh_record_id FROM restaurants
  WHERE lat BETWEEN 32.746 AND 32.750 AND lng BETWEEN -117.164 AND -117.160`;
console.log("\nnear 3884 Fourth Ave:", b.map(r=>`${r.id} ${r.name} | ${r.address} | ${r.source_key} | deh=${r.deh_record_id??"-"}`).join("\n"));
const c = await sql`SELECT id::text,name,address,source_key,deh_record_id,listed FROM restaurants WHERE deh_record_id IN ('DEH2018-FFPP-009111','DEH2019-FFPP-011990')`;
console.log("\nstamped with those permits:", JSON.stringify(c));
