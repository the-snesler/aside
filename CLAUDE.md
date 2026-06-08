# Aside

A self-hostable, local-first, Discord-inspired note-taking app. Single-tenant,
single-container. The web UI writes to a local RxDB database that replicates to a
thin sync server, which persists to SQLite — so notes work offline and sync
across devices.

## Monorepo layout

pnpm workspaces + Turbo. Three packages under `packages/`:

```
packages/
├── shared/   @aside/shared   the client↔server contract (built with tsup)
│   └── src/
│       ├── types.ts        MessageDoc (document) + ReplicatedMessageDoc (wire) + Checkpoint
│       ├── schema.ts       RxDB JSON schema for the messages collection
│       ├── validation.ts   zod validator, reused server-side at the push boundary
│       └── index.ts        barrel export
├── client/   @aside/client  local-first web app (Vite + React + RxDB)
│   └── src/
│       ├── db/
│       │   ├── database.ts    RxDB instance (Dexie storage); singleton
│       │   ├── collections.ts collection defs built from shared/schema
│       │   └── replication.ts replicateRxCollection → /api/sync/{pull,push,stream}
│       ├── features/messages/MessageList.tsx   save/delete UI
│       ├── App.tsx
│       └── main.tsx
└── server/   @aside/server  thin sync server (Hono on @hono/node-server)
    └── src/
        ├── index.ts          routes + serves built client in prod
        ├── sync/
        │   ├── pull.ts        changed-since-checkpoint query
        │   ├── push.ts        zod-validate, conflict-detect, upsert
        │   ├── stream.ts      in-process EventEmitter → SSE fan-out
        │   └── row.ts         SQLite row ↔ wire document mapping
        └── db/
            ├── index.ts       Kysely; dialect switch (SQLite now, Postgres seam)
            ├── migrations.ts  creates the messages table on startup
            └── types.ts       Kysely table interfaces
```

**`shared` is load-bearing.** The document shape, RxDB schema, and zod validator
live there and are imported by both client and server. If the client's
`MessageDoc` drifts from the server's, sync corrupts silently — keep them in
lockstep.

## Commands

Run from the repo root:

- `pnpm dev` — Turbo runs all three packages: `shared` (tsup watch), `server`
  (`tsx watch`, port 3001), `client` (Vite, port 5173). Vite proxies `/api` → 3001.
- `pnpm build` — builds shared → client → server in dependency order.
- `pnpm typecheck` — `tsc --noEmit` across packages.
- `pnpm format` — Prettier.

## Architecture notes

- **Sync protocol**: standard RxDB replication. The client `pull`s changes since
  its checkpoint, `push`es local changes (server returns conflicting master docs),
  and subscribes to an SSE `stream` so a second instance updates live. The
  checkpoint is a server-assigned monotonic `seq`; deletes still bump `updatedAt`
  so conflict resolution sees them as a later client change.
- **Soft deletes**: RxDB owns `_deleted`. It is absent from `MessageDoc` and the
  RxDB schema, and only appears on the wire via `ReplicatedMessageDoc`. SQLite
  stores it as an integer `deleted` column.
- **DB layer**: Kysely keeps the queries typed and close to SQL. Only the SQLite
  dialect is wired today; `db/index.ts` has a dialect switch keyed on
  `DATABASE_URL` so Postgres can drop in later. Migrations stay in the common
  SQLite/Postgres subset.
- **Dev vs prod**: in dev, client and server run separately. In prod, the
  multi-stage `Dockerfile` builds everything into one Node image; the server
  serves the built client (`STATIC_DIR`) and the API on a single port, with SQLite
  on a mounted `/data` volume.

### Environment variables (server)

- `PORT` — listen port (default 3001).
- `DATA_DIR` — directory for `aside.sqlite` (default `./data`, `/data` in container).
- `DATABASE_URL` — `sqlite://<path>` or unset for SQLite; `postgres://…` is reserved (not implemented).
- `STATIC_DIR` — when set (prod), serve the built client from this directory.

## Gotchas

- **pnpm build scripts**: native/postinstall scripts are gated. Approved packages
  (`better-sqlite3`, `esbuild`) are listed under `allowBuilds` in
  `pnpm-workspace.yaml`. If a native dep won't load, check it's approved and run
  `pnpm rebuild <pkg>`.
- **RxDB dev-mode (DVM1)**: with the dev-mode plugin on, the storage must be
  wrapped in a schema validator. `database.ts` wraps Dexie with
  `wrappedValidateAjvStorage` in dev only.
- **Deleting a document**: `incrementalPatch` returns a new revision — call
  `remove()` on the returned doc, not the original reference, or RxDB throws
  `CONFLICT`.
- **Docker `pnpm deploy`**: needs `--legacy` (pnpm v10+ won't deploy non-injected
  workspaces). Fine here because the server bundles `@aside/shared` via tsup.
- **Cross-instance testing**: two browser tabs share IndexedDB. To test real sync,
  use two separate browser profiles (e.g. normal + incognito).
