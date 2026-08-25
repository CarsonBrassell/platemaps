import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { Pool } from "pg";

/**
 * The one database client, and the one place that decides which driver backs it.
 *
 * `lib/db.ts` used to call `neon(process.env.DATABASE_URL!)` directly. That
 * driver speaks HTTP to Neon's own proxy, not the Postgres wire protocol, so a
 * `DATABASE_URL` pointing at a Postgres on this machine simply cannot work
 * through it — which meant local development had no option but to spend the
 * production database's metered data transfer on every page load.
 *
 * So the URL picks the driver. Anything hosted at Neon keeps the exact client
 * it has always had, untouched; anything else gets a `pg` pool wearing the same
 * interface. **Production never takes the second branch** — a Neon URL is a
 * Neon URL — so this is additive rather than a change to how the deployed app
 * talks to its database.
 *
 * ## What the shim has to implement
 *
 * Only the three things `db.ts` actually uses, which is what keeps this small:
 *
 * - the **tagged template**, `sql`...`` — parameterised, returning rows;
 * - **`sql.query(text, params)`** — the two callers that build SQL as a string;
 * - **`sql.unsafe(text)`** — a fragment inlined *verbatim* rather than
 *   parameterised, for the ORDER BY clauses and the shared POST_SELECT.
 *
 * That last one is the subtle one and it is why this cannot be a two-line
 * wrapper: an interpolation is normally turned into `$1`, but an `unsafe` one
 * has to be pasted straight into the SQL text. Getting that backwards produces
 * `ORDER BY $1`, which Postgres accepts and then ignores, silently returning
 * the feed in whatever order it liked.
 */

const url = process.env.DATABASE_URL ?? "";

/** Neon's own hostnames. Everything else is treated as a plain Postgres. */
const isNeon = /\.neon\.tech|\.neon\.build/.test(url);

/** Marks a fragment that must be pasted into the SQL rather than bound to it. */
const UNSAFE = Symbol("unsafe");
type UnsafeFragment = { [UNSAFE]: string };

function isUnsafe(value: unknown): value is UnsafeFragment {
  return typeof value === "object" && value !== null && UNSAFE in value;
}

function localClient(connectionString: string) {
  /* Small on purpose: this is one developer's machine, not a serverless fleet,
     and an idle pool holding ten connections open to a local Postgres is just
     noise in `pg_stat_activity`. */
  /*
   * Every field spelled out, and `password` left undefined on purpose.
   *
   * The Vercel-Neon integration also writes PGUSER/PGPASSWORD/PGHOST/PGDATABASE
   * into .env.local, and `pg` silently falls back to those for anything the
   * connection string omits — so a local URL without a username connected as
   * `neondb_owner` and failed with "role does not exist". Parsing the URL here
   * and passing the parts explicitly stops the ambient Neon credentials from
   * leaking into a local connection.
   */
  const parsed = new URL(connectionString);
  const pool = new Pool({
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username) || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    database: parsed.pathname.replace(/^\//, ""),
    ssl: false,
    max: 4,
  });

  async function run(text: string, params: unknown[]) {
    const result = await pool.query(text, params);
    /* neon's tagged template resolves to the rows themselves, not to a result
       object — every call site in db.ts destructures rows directly. */
    return result.rows;
  }

  /*
   * A built-but-not-yet-run query.
   *
   * It has to be lazy, because these compose: `publish-check` defines one
   * `READY` fragment and interpolates it into four different statements so the
   * definition of "ready" cannot drift between them. Running eagerly would make
   * that fragment a Promise, and it would be bound in as a parameter rather
   * than spliced into the SQL — which is exactly the `syntax error at or near
   * "hold_reason"` this used to produce.
   *
   * Thenable rather than a Promise subclass so `await sql`...`` still works
   * while an un-awaited one stays inert and inspectable.
   */
  class Query {
    constructor(
      readonly text: string,
      readonly params: unknown[],
    ) {}
    then<T>(onOk?: ((rows: Record<string, unknown>[]) => T) | null, onErr?: ((e: unknown) => T) | null) {
      return run(this.text, this.params).then(onOk, onErr);
    }
  }

  const build = (strings: TemplateStringsArray, values: unknown[]) => {
    let text = "";
    const params: unknown[] = [];
    strings.forEach((chunk, i) => {
      text += chunk;
      if (i >= values.length) return;
      const value = values[i];
      if (isUnsafe(value)) {
        text += value[UNSAFE];
      } else if (value instanceof Query) {
        /* Splice the fragment in, shifting its placeholders past the ones
           already collected — $1 inside the fragment is not $1 out here. */
        const offset = params.length;
        text += value.text.replace(/\$(\d+)/g, (_m, n: string) => `$${offset + Number(n)}`);
        params.push(...value.params);
      } else {
        params.push(value);
        text += `$${params.length}`;
      }
    });
    return new Query(text, params);
  };

  const tagged = (strings: TemplateStringsArray, ...values: unknown[]) =>
    build(strings, values);

  tagged.query = (text: string, params: unknown[] = []) => run(text, params);
  tagged.unsafe = (text: string): UnsafeFragment => ({ [UNSAFE]: text });

  return tagged;
}

/* Cast so `db.ts` keeps the types it already had. The shim implements the part
   of the surface that file uses and nothing more; anything it reaches for that
   is missing is a compile error there rather than a silent runtime hole. */
export const sql = (
  isNeon || !url ? neon(url) : localClient(url)
) as NeonQueryFunction<false, false>;

/** True when this process is talking to a local Postgres, for startup logging. */
export const usingLocalPostgres = !isNeon && !!url;
