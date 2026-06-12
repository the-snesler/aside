# Aside

A self-hostable, local-first, Discord-inspired note-taking app. Single-tenant,
single-container. The web UI writes to a local RxDB database that replicates to a
thin sync server, which persists to SQLite — so notes work offline and sync
across devices. See `ROADMAP.md` for the milestone breakdown and what's still
open.

What's grown on top of plain note sync: **channels** (`#tag`-routed), inline
**Markdown** rendering + a Slate composer, **OpenGraph link previews**, file
**attachments** backed by a content-addressed blob store, and **feeds** —
channels that auto-populate from an external source (Twitter/X bookmarks today).

## Monorepo layout

pnpm workspaces + Turbo. Three packages under `packages/`:

```
packages/
├── shared/   @aside/shared   the client↔server contract (built with tsup)
│   └── src/
│       ├── types.ts        the 4 synced doc types + Replicated* wire variants + Checkpoint
│       ├── schema.ts       RxDB JSON schemas + migrationStrategies (one per collection)
│       ├── validation.ts   zod validators, reused server-side at the push boundary
│       ├── conflict.ts     generic LWW conflict handler + per-collection instances
│       └── index.ts        barrel export
├── client/   @aside/client  local-first web app (Vite + React + RxDB + Tailwind v4)
│   └── src/
│       ├── db/
│       │   ├── database.ts    RxDB instance (Dexie storage); singleton, 4 collections
│       │   ├── collections.ts collection defs (schema + migration + conflict handler)
│       │   └── replication.ts generic startReplication() → /api/sync/<name>/{pull,push,stream}
│       ├── features/
│       │   ├── messages/      MessageList, Markdown (render), MarkdownEditor (Slate composer), LinkPreviewCard
│       │   ├── channels/      ChannelSidebar, channelName (#tag parsing/slug), home (Home sentinel id)
│       │   ├── attachments/   api.ts — upload/download against /api/blobs
│       │   └── feeds/         FeedSettings (modal UI), api.ts
│       ├── App.tsx, main.tsx, index.css (Tailwind theme tokens)
└── server/   @aside/server  thin sync server (Hono on @hono/node-server)
    └── src/
        ├── index.ts          routes (generic sync + blobs + feeds) + serves built client in prod
        ├── sync/
        │   ├── collection.ts  SyncCollection<TDoc> interface + equalDocs() conflict check
        │   ├── messages.ts / channels.ts / embeds.ts / attachments.ts  per-collection descriptors
        │   ├── pull.ts        changed-since-checkpoint query (generic)
        │   ├── push.ts        zod-validate, conflict-detect, upsert (generic)
        │   ├── ingest.ts      server-side inserts that skip existing ids (feeds; idempotent)
        │   ├── server-write.ts server-authoritative overwrites (embeds)
        │   ├── stream.ts      in-process EventEmitter → SSE fan-out, namespaced by collection
        │   └── row.ts         SQLite row ↔ wire document mapping
        ├── db/
        │   ├── index.ts       Kysely; dialect switch (SQLite now, Postgres seam); primes seq counters
        │   ├── migrations.ts  creates all tables on startup
        │   ├── sequence.ts    per-collection monotonic seq counters
        │   └── types.ts       Kysely table interfaces (7 tables)
        ├── blobs/             content-addressed (sha256) blob store; filesystem driver + seam for S3
        ├── embeds/            OpenGraph extraction: worker queue, URL→OG cache, scraper, URL extractor
        └── feeds/             config CRUD, croner scheduler, orchestrator, registry, sources/twitter.ts
```

**`shared` is load-bearing.** Every synced collection's document shape, RxDB
schema, zod validator, and conflict handler live there and are imported by both
client and server. If a client doc type drifts from the server's, sync corrupts
silently — keep them in lockstep. The shared-contract conformance test
(`shared/src/contract.test.ts`) asserts the type/schema/zod trio stays aligned.

## Collections & tables

Four collections sync through the same protocol: **messages**, **channels**,
**embeds** (server-authoritative link previews), **attachments** (file metadata).
Each maps to a SQLite table carrying a server-owned `seq` cursor and a `deleted`
soft-delete flag.

Three more tables are **server-only** — never synced (no `seq`/`deleted`), so
nothing here touches the RxDB sync path:

- `og_cache` — URL → fetched OpenGraph result (+ negative cache for dead URLs).
- `blobs` — blob metadata (content-type, size) backing the download endpoint; bytes live in the blob store keyed by sha256 hash.
- `feed_sources` — per-feed config: source type, schedule, cursor, status, and credentials' working dir.

## Commands

Run from the repo root:

- `pnpm dev` — Turbo runs all three packages: `shared` (tsup watch), `server`
  (`tsx watch`, port 3001), `client` (Vite, port 5173). Vite proxies `/api` → 3001.
- `pnpm build` — builds shared → client → server in dependency order.
- `pnpm typecheck` — `tsc --noEmit` across packages.
- `pnpm test` — Vitest (`shared` contract/conflict tests; `server` sync/ingest/embed tests).
- `pnpm format` — Prettier.

## Architecture notes

- **Generic sync**: every synced collection goes through one set of
  pull/push/stream handlers. A `SyncCollection<TDoc>` descriptor
  (`sync/collection.ts`) carries the table-specific bits — `parse` (zod),
  `fetchSince`, `fetchById`, `upsert` — so Kysely stays concretely typed with no
  dynamic table names. `registerSyncRoutes()` in `index.ts` mounts
  `/api/sync/<name>/{pull,push,stream}` for each. On the client, one
  `startReplication({ collection, name })` call wires each collection to those
  routes.
- **Sync protocol**: standard RxDB replication. The client `pull`s changes since
  its checkpoint, `push`es local changes (server returns conflicting master docs),
  and subscribes to an SSE `stream` so a second instance updates live. The
  checkpoint is a server-assigned monotonic `seq`, owned per-collection
  (`db/sequence.ts`); deletes still bump `updatedAt` so conflict resolution sees
  them as a later client change.
- **Conflict resolution**: a deterministic last-write-wins handler
  (`shared/src/conflict.ts`), built once and instantiated per collection. Tie-break
  order: newer `updatedAt` wins → delete beats non-delete → stable key comparison.
  The same `_deleted`-aware, RxDB-internals-dropping key logic backs the server's
  `equalDocs()` conflict check at the push boundary.
- **Server-authored writes** (off the client push path): two helpers reuse the
  seq/upsert/stream machinery. `ingestNewBatch` (`sync/ingest.ts`) _skips ids that
  already exist_ (incl. soft-deleted), so feed re-runs are idempotent and never
  clobber/resurrect user edits. `writeServerBatch` (`sync/server-write.ts`)
  _unconditionally_ overwrites — used for embeds, which the server fully owns.
- **Embeds (OpenGraph)**: server-authoritative — clients only ever pull them. A
  worker (`embeds/worker.ts`) subscribes to message writes (and backfills on boot),
  fetches OG metadata through a URL cache, and reconciles a message's preview
  cards. They live in their own collection so attaching a preview never marks the
  note as edited or contends with a client edit. A `sourceUpdatedAt` staleness
  guard aborts if the message changed mid-fetch.
- **Attachments & blobs**: attachment _metadata_ syncs like any collection; the
  _bytes_ travel off the sync path over `POST /api/blobs` (dedup, 25 MB cap) and
  `GET /api/blobs/:hash` (immutable-cached). Storage is content-addressed by
  sha256 (`blobs/`), with a filesystem driver and a seam for S3/MinIO.
- **Feeds**: channels that auto-populate from an external source. Config
  (credentials, schedule, cursor) is **server-only** and never enters the sync
  stream; the notes a feed produces arrive on clients through the normal messages
  stream. A `croner` scheduler runs one job per enabled feed; sources are
  pluggable via a `FeedSource` registry. The Twitter/X bookmarks source drives a
  persistent Puppeteer profile (the official API can't read bookmarks) — seed
  cookies once, auto-scroll + scrape, resume at the last permalink.
- **DB layer**: Kysely keeps the queries typed and close to SQL. Only the SQLite
  dialect is wired today; `db/index.ts` has a dialect switch keyed on
  `DATABASE_URL` so Postgres can drop in later. Migrations stay in the common
  SQLite/Postgres subset.
- **Client UI**: Tailwind v4 (`@tailwindcss/vite`, theme tokens in `index.css`)
  in a Discord-inspired dark palette; icons via `unplugin-icons` (lucide). Layout
  is a channel sidebar beside the message pane, with a "Home" view across all
  channels. Messages render through `react-markdown` (gfm + breaks +
  highlight); the composer is a Slate editor with live Markdown decoration.
- **Dev vs prod**: in dev, client and server run separately. In prod, the
  multi-stage `Dockerfile` builds everything into one Node image; the server
  serves the built client (`STATIC_DIR`) and the API on a single port, with SQLite
  and feed/blob data on a mounted `/data` volume. The runtime stage also installs
  Chromium for the Puppeteer feed source.
- **CI**: `.github/workflows/ci.yml` builds and publishes a Docker image to GHCR
  on push to `main`. Typecheck/test gating in CI is still open (ROADMAP CI-1).

### Environment variables (server)

- `PORT` — listen port (default 3001).
- `DATA_DIR` — directory for `aside.sqlite`, blobs, and feed profiles (default `./data`, `/data` in container).
- `DATABASE_URL` — `sqlite://<path>` or unset for SQLite; `postgres://…` is reserved (not implemented — `db/index.ts` throws).
- `STATIC_DIR` — when set (prod), serve the built client from this directory.
- `PUPPETEER_CACHE_DIR` / `PUPPETEER_SKIP_DOWNLOAD` — set in the Dockerfile so the
  Twitter feed's Chromium is installed once into a known cache dir at build time.

## Gotchas

- **pnpm build scripts**: native/postinstall scripts are gated. Approved packages
  (`better-sqlite3`, `esbuild`, `puppeteer`) are listed under `allowBuilds` in
  `pnpm-workspace.yaml`. If a native dep won't load, check it's approved and run
  `pnpm rebuild <pkg>`.
- **Adding a synced collection**: touch all of it — `shared` (type +
  `Replicated*` + schema + migration + zod + conflict handler + barrel + contract
  test), client (`collections.ts`, `database.ts`, a `startReplication` call), and
  server (a `sync/<name>.ts` descriptor, a migration/table, a `registerSyncRoutes`
  call, and a seq prime in `initDb`).
- **RxDB dev-mode (DVM1)**: with the dev-mode plugin on, the storage must be
  wrapped in a schema validator. `database.ts` wraps Dexie with
  `wrappedValidateAjvStorage` in dev only.
- **Deleting a document**: `incrementalPatch` returns a new revision — call
  `remove()` on the returned doc, not the original reference, or RxDB throws
  `CONFLICT`. The same bump-then-remove keeps soft-deletes winning LWW.
- **Docker `pnpm deploy`**: needs `--legacy` (pnpm v10+ won't deploy non-injected
  workspaces). Fine here because the server bundles `@aside/shared` via tsup.
- **Cross-instance testing**: two browser tabs share IndexedDB. To test real sync,
  use two separate browser profiles (e.g. normal + incognito).
