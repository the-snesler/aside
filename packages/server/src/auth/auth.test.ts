import BetterSqlite3 from "better-sqlite3";
import { Hono } from "hono";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrations.js";
import type { Database } from "../db/types.js";
import { createAuthMiddleware, registerAuthRoutes } from "./index.js";

let database: Kysely<Database>;

beforeEach(async () => {
  database = new Kysely<Database>({
    dialect: new SqliteDialect({ database: new BetterSqlite3(":memory:") }),
  });
  await runMigrations(database);
});

afterEach(async () => {
  await database.destroy();
});

describe("auth routes", () => {
  it("sets up the owner once", async () => {
    const app = makeApp();

    const first = await app.request("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
      headers: { "content-type": "application/json" },
    });
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ token: expect.any(String) });

    const second = await app.request("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
      headers: { "content-type": "application/json" },
    });
    expect(second.status).toBe(409);
  });

  it("rejects bad passwords and accepts the configured password", async () => {
    const app = makeApp();
    await setup(app);

    const bad = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong" }),
      headers: { "content-type": "application/json" },
    });
    expect(bad.status).toBe(401);

    const good = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
      headers: { "content-type": "application/json" },
    });
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ token: expect.any(String) });
  });

  it("protects API routes without a token", async () => {
    const app = makeApp();
    await setup(app);

    const res = await app.request("/api/private");
    expect(res.status).toBe(401);
  });

  it("allows protected API routes with a valid bearer token", async () => {
    const app = makeApp();
    const token = await setup(app);

    const res = await app.request("/api/private", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("accepts EventSource-style query tokens", async () => {
    const app = makeApp();
    const token = await setup(app);

    const res = await app.request(`/api/private?token=${token}`);
    expect(res.status).toBe(200);
  });

  it("revokes the current token on logout", async () => {
    const app = makeApp();
    const token = await setup(app);

    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.status).toBe(200);

    const after = await app.request("/api/private", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.status).toBe(401);
  });
});

function makeApp(): Hono {
  const app = new Hono();
  registerAuthRoutes(app, database);
  app.use("/api/*", createAuthMiddleware(database));
  app.get("/api/private", (c) => c.json({ ok: true }));
  return app;
}

async function setup(app: Hono): Promise<string> {
  const res = await app.request("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password: "secret" }),
    headers: { "content-type": "application/json" },
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}
