import { neon } from "@neondatabase/serverless";
import pg from "pg";

/**
 * The scripts' database client, picking a driver from DATABASE_URL.
 *
 * Mirrors `src/lib/sqlClient.ts` — see that file for why this exists. The short
 * version: `neon()` speaks HTTP to Neon's proxy and cannot talk to a Postgres
 * running on this machine, so a local DATABASE_URL needs `pg` instead. A Neon
 * URL still gets the Neon driver, unchanged.
 *
 * Deliberately adopted one script at a time rather than swapped in everywhere:
 * the fetch/import scripts are long-running and cost money or quota, and none
 * of them should change behaviour because someone wanted a local database.
 */
const url = process.env.DATABASE_URL ?? "";
const isNeon = /\.neon\.tech|\.neon\.build/.test(url);

const UNSAFE = Symbol("unsafe");
const isUnsafe = (v) => typeof v === "object" && v !== null && UNSAFE in v;

function localClient(connectionString) {
  /* Spelled out rather than handing `pg` the string: the Neon integration also
     sets PGUSER/PGPASSWORD in .env.local and `pg` uses those for anything the
     URL omits, which made a local connection try to log in as neondb_owner. */
  const parsed = new URL(connectionString);
  const pool = new pg.Pool({
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username) || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    database: parsed.pathname.replace(/^\//, ""),
    ssl: false,
    max: 4,
  });
  const run = async (text, params) => (await pool.query(text, params)).rows;

  /* Lazy, because queries compose: publish-check builds one READY fragment and
     splices it into four statements. Running eagerly would make that fragment a
     Promise and bind it as a parameter instead of pasting it into the SQL. */
  class Query {
    constructor(text, params) {
      this.text = text;
      this.params = params;
    }
    then(onOk, onErr) {
      return run(this.text, this.params).then(onOk, onErr);
    }
  }

  const tagged = (strings, ...values) => {
    let text = "";
    const params = [];
    strings.forEach((chunk, i) => {
      text += chunk;
      if (i >= values.length) return;
      const value = values[i];
      if (isUnsafe(value)) {
        text += value[UNSAFE];
      } else if (value instanceof Query) {
        const offset = params.length;
        text += value.text.replace(/\$(\d+)/g, (_m, n) => `$${offset + Number(n)}`);
        params.push(...value.params);
      } else {
        params.push(value);
        text += `$${params.length}`;
      }
    });
    return new Query(text, params);
  };

  tagged.query = (text, params = []) => run(text, params);
  tagged.unsafe = (text) => ({ [UNSAFE]: text });
  /* The scripts are one-shot processes; without this node hangs on the pool. */
  tagged.end = () => pool.end();
  return tagged;
}

export const sql = isNeon || !url ? neon(url) : localClient(url);
export const usingLocalPostgres = !isNeon && !!url;
