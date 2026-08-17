#!/usr/bin/env bash
#
# First-run setup on a new machine.
#
#   ./setup.sh
#
# Installs dependencies, walks you through the two credentials the project
# actually needs, writes .env.local, and proves the connection works before it
# claims to be done.
#
# `.env.local` is gitignored, so a fresh clone has no credentials — that is
# deliberate, and it is the one thing a clone cannot bring with it.

set -euo pipefail

cd "$(dirname "$0")"

echo
echo "PlateMaps setup"
echo "==============="
echo

# --- Node ------------------------------------------------------------------
#
# The scripts use `node --env-file` and Node's native TypeScript type-stripping
# to import .ts seed files from .mjs. Both need Node 22 or newer; the project
# was developed on 24.

if ! command -v node >/dev/null 2>&1; then
  echo "Node is not installed. Install it first:"
  echo "    brew install node"
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node $(node -v) is too old — this project needs 22 or newer."
  echo "    brew upgrade node"
  exit 1
fi
echo "Node $(node -v)  ok"

# --- Dependencies ----------------------------------------------------------

if [ ! -d node_modules ]; then
  echo
  echo "Installing dependencies (this takes a minute)..."
  npm install
else
  echo "Dependencies already installed"
fi

# --- Credentials -----------------------------------------------------------
#
# Only two are read by the code. The rest of what may be in an older .env.local
# is Vercel/Neon auto-generated and unused here — see the grep in CLAUDE.md.

if [ -f .env.local ] && grep -q "^DATABASE_URL=" .env.local; then
  echo ".env.local already has DATABASE_URL — leaving it alone"
else
  echo
  echo "Two credentials are needed. Get fresh ones rather than copying old:"
  echo
  echo "  1. DATABASE_URL  — console.neon.tech -> your project -> Connect"
  echo "                     (or Roles -> neondb_owner -> reset password first)"
  echo "  2. YELP_API_KEY  — fusion.yelp.com -> your app"
  echo
  echo "Paste them below. They go straight into .env.local and are not printed."
  echo

  # -s so the value never appears on screen or in shell history.
  read -r -s -p "DATABASE_URL: " DB_URL
  echo
  read -r -s -p "YELP_API_KEY: " YELP_KEY
  echo

  if [ -z "$DB_URL" ]; then
    echo "No DATABASE_URL given — nothing written."
    exit 1
  fi

  # Check the shapes before storing them. `-s` hides the input, which is right
  # for a secret and awful for a paste error: on 11 Aug 2026 the connection
  # string went into both prompts — same clipboard, nothing on screen to show
  # it — and .env.local carried a DATABASE_URL under YELP_API_KEY for two days.
  # Nothing noticed until fetch-restaurants.mjs sent it to Yelp as a Bearer
  # token and Yelp echoed the database password back in seventy error bodies.
  #
  # Neither check prints the value it rejects.
  case "$DB_URL" in
    postgres://*|postgresql://*) ;;
    *)
      echo "That does not look like a Postgres connection string (expected postgres:// or postgresql://)."
      echo "Nothing written — re-run when you have it."
      exit 1
      ;;
  esac

  if [ -n "$YELP_KEY" ]; then
    if [ "$YELP_KEY" = "$DB_URL" ]; then
      echo "YELP_API_KEY is identical to DATABASE_URL — looks like the same paste twice."
      echo "Nothing written. Copy the Yelp key first, then re-run."
      exit 1
    fi
    # A Yelp key is 128 URL-safe characters.
    if ! printf '%s' "$YELP_KEY" | grep -Eq '^[A-Za-z0-9_-]{128}$'; then
      echo "YELP_API_KEY does not look like a Yelp key (expected 128 URL-safe characters)."
      echo "Nothing written — a key sent to the wrong service is a leaked credential."
      exit 1
    fi
  fi

  {
    echo "# Written by setup.sh. Gitignored — never commit this file."
    echo "DATABASE_URL=$DB_URL"
    [ -n "$YELP_KEY" ] && echo "YELP_API_KEY=$YELP_KEY"
  } >> .env.local

  chmod 600 .env.local
  echo "Wrote .env.local (readable only by you)"
fi

# --- Prove it works --------------------------------------------------------
#
# A setup script that stops at "wrote the file" is a setup script that lies:
# the whole question is whether the credential is right, and only a query
# answers that.

echo
echo "Checking the database connection..."
if npm run --silent menus:todo -- --limit 1 2>/dev/null | grep -q "Coverage:"; then
  npm run --silent menus:todo -- --limit 1 2>/dev/null | grep "Coverage:"
  echo
  echo "Connected. You're set up."
  echo
  echo "  npm run dev           the site on :3000"
  echo "  npm run menus:todo    what still needs a menu"
  echo "  npm run menus:fresh   which menus have changed since extraction"
else
  echo
  echo "Could not reach the database. Check DATABASE_URL in .env.local —"
  echo "it should start with postgresql:// and end with ?sslmode=require"
  exit 1
fi
