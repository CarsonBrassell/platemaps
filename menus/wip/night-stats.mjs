import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const [tot] = await sql`select count(*)::int n from restaurants`;
const [cov] = await sql`select count(distinct restaurant_id)::int n from menu_lookups where status='found'`;
const [dish] = await sql`select count(*)::int n from dishes`;
const rows = await sql`select attempted_at::date d, status, count(*)::int n from menu_lookups
  where attempted_at >= now() - interval '24 hours' group by 1,2 order by 1,2`;
const [mk] = await sql`select count(*)::int n from menu_lookups where status='found'
  and source_url ~ 'doordash|ubereats|grubhub|seamless'`;
console.log("restaurants="+tot.n+"  withMenu="+cov.n+"  dishes="+dish.n+"  marketplaceSourced="+mk.n);
for(const r of rows) console.log("  last24h "+r.d.toISOString().slice(0,10)+" "+r.status+" = "+r.n);
