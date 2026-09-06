// Unit tests for the Firestore read cache (firestoreCache.ts).
//
// Run with:  npm test
// (node's built-in test runner via tsx; no extra dependencies)
//
// These tests exercise the cache purely in memory — no Firestore, no disk.
// Disk autoload is skipped via FIRESTORE_CACHE_NO_AUTOLOAD and persistence is
// disabled, so a test run never touches firestore_stale_cache.json.
import { test } from "node:test";
import assert from "node:assert/strict";

// Skip disk autoload BEFORE importing the module (dynamic import so this runs first).
process.env.FIRESTORE_CACHE_NO_AUTOLOAD = "1";
const cache = await import("./firestoreCache.ts");

const {
  firestoreCache,
  CACHE_TTL_MS,
  baseCollectionQueryKey,
  normalizeForCache,
  getCached,
  getCachedWithExpiredFallback,
  setCached,
  invalidateCache,
  dropFilteredCaches,
  patchDocUpdateInCaches,
  patchDocSetInCaches,
  patchDocDeleteInCaches,
  setPersistenceEnabled,
  __resetCache,
} = cache;

setPersistenceEnabled(false);

const TICKETS = "tickets";
const baseKey = baseCollectionQueryKey(TICKETS);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Seed a realistic set of cache entries for the `tickets` collection:
//   - the hot unfiltered full-collection query (baseKey)
//   - a couple of per-document caches
//   - a filtered query cache and a count cache (the "cheap to rebuild" ones)
function seedTickets(docs: Array<{ id: string; data: any }>) {
  __resetCache();
  setCached(baseKey, { empty: docs.length === 0, docs: docs.map(d => ({ id: d.id, data: { ...d.data } })) });
  for (const d of docs) {
    setCached(`doc:${TICKETS}:${d.id}`, { exists: true, data: { ...d.data } });
  }
  setCached(`query:${TICKETS}:{"filtered":"pending"}`, { empty: false, docs: [] });
  setCached(`count:${TICKETS}:{"all":true}`, { count: docs.length });
}

test("setCached / getCached round-trip", () => {
  __resetCache();
  setCached("doc:tickets:a", { exists: true, data: { x: 1 } });
  assert.deepEqual(getCached("doc:tickets:a"), { exists: true, data: { x: 1 } });
  assert.equal(getCached("doc:tickets:missing"), null);
});

test("getCached honors the TTL; expired fallback still returns the value", () => {
  __resetCache();
  setCached("query:tickets:x", { empty: false, docs: [] });
  assert.notEqual(getCached("query:tickets:x"), null);

  // Backdate the entry past the TTL.
  firestoreCache["query:tickets:x"].timestamp = Date.now() - (CACHE_TTL_MS + 1000);
  assert.equal(getCached("query:tickets:x"), null, "expired entry should not be served by getCached");
  assert.notEqual(getCachedWithExpiredFallback("query:tickets:x"), null, "expired fallback should still return it");
});

test("invalidateCache(path) clears only that collection; invalidateCache() clears all", () => {
  __resetCache();
  setCached("doc:tickets:a", { exists: true, data: {} });
  setCached("query:tickets:q", { empty: true, docs: [] });
  setCached("count:tickets:c", { count: 0 });
  setCached("doc:users:u", { exists: true, data: {} });

  invalidateCache("tickets");
  assert.equal(getCached("doc:tickets:a"), null);
  assert.equal(getCached("query:tickets:q"), null);
  assert.equal(getCached("count:tickets:c"), null);
  assert.notEqual(getCached("doc:users:u"), null, "other collections untouched");

  invalidateCache();
  assert.equal(getCached("doc:users:u"), null, "no-arg invalidate clears everything");
});

test("normalizeForCache converts the serverTimestamp sentinel to an ISO string", () => {
  const out = normalizeForCache({ a: 1, updated_at: "SERVER_TIMESTAMP_SENTINEL", name: "x" });
  assert.equal(out.a, 1);
  assert.equal(out.name, "x");
  assert.match(out.updated_at, ISO_RE);
});

test("baseCollectionQueryKey matches the key an unfiltered .get() produces", () => {
  assert.equal(baseCollectionQueryKey("tickets"), 'query:tickets:{"from":[{"collectionId":"tickets"}]}');
});

test("dropFilteredCaches removes filtered/count caches but keeps the base cache", () => {
  seedTickets([{ id: "t1", data: { flight_status: "PENDING" } }]);
  dropFilteredCaches(TICKETS, baseKey);
  assert.notEqual(getCached(baseKey), null, "base full-collection cache is preserved");
  assert.equal(getCached(`query:${TICKETS}:{"filtered":"pending"}`), null);
  assert.equal(getCached(`count:${TICKETS}:{"all":true}`), null);
});

test("patchDocUpdateInCaches merges fields, keeps the base cache warm, drops filtered/count", () => {
  seedTickets([
    { id: "t1", data: { flight_status: "PENDING", pax: "A" } },
    { id: "t2", data: { flight_status: "PENDING", pax: "B" } },
  ]);

  patchDocUpdateInCaches(TICKETS, "t1", { flight_status: "NO_SHOW", updated_at: "SERVER_TIMESTAMP_SENTINEL" });

  // Base full-collection cache stays warm (this is the whole point of the optimization).
  const base = getCached(baseKey);
  assert.notEqual(base, null, "base cache must survive an update");
  assert.equal(base.docs.length, 2, "membership unchanged on update");

  const t1 = base.docs.find((d: any) => d.id === "t1");
  assert.equal(t1.data.flight_status, "NO_SHOW", "changed field merged");
  assert.equal(t1.data.pax, "A", "untouched field preserved");
  assert.match(t1.data.updated_at, ISO_RE, "sentinel replaced with a real timestamp");

  // Per-doc cache merged too.
  assert.equal(getCached("doc:tickets:t1").data.flight_status, "NO_SHOW");

  // Filtered + count caches dropped (they could go stale).
  assert.equal(getCached(`query:${TICKETS}:{"filtered":"pending"}`), null);
  assert.equal(getCached(`count:${TICKETS}:{"all":true}`), null);
});

test("patchDocSetInCaches replaces an existing document (full overwrite, old fields gone)", () => {
  seedTickets([{ id: "t1", data: { flight_status: "PENDING", pax: "A", stale: "yes" } }]);

  patchDocSetInCaches(TICKETS, "t1", { flight_status: "FLOWN", pax: "A" });

  const base = getCached(baseKey);
  assert.equal(base.docs.length, 1, "no new doc appended on overwrite");
  const t1 = base.docs.find((d: any) => d.id === "t1");
  assert.equal(t1.data.flight_status, "FLOWN");
  assert.equal(t1.data.stale, undefined, "set is a full replace — removed field is gone");
  assert.equal(getCached("doc:tickets:t1").data.stale, undefined);
});

test("patchDocSetInCaches appends a brand-new document (membership +1)", () => {
  seedTickets([{ id: "t1", data: { flight_status: "PENDING" } }]);

  patchDocSetInCaches(TICKETS, "t2", { flight_status: "PENDING", created_at: "SERVER_TIMESTAMP_SENTINEL" });

  const base = getCached(baseKey);
  assert.equal(base.docs.length, 2, "new doc appended to the full-collection cache");
  assert.equal(base.empty, false);
  const t2 = base.docs.find((d: any) => d.id === "t2");
  assert.ok(t2, "new doc present in base cache");
  assert.match(t2.data.created_at, ISO_RE);

  // Filtered + count caches dropped so they rebuild with the new member.
  assert.equal(getCached(`count:${TICKETS}:{"all":true}`), null);
});

test("patchDocSetInCaches into an empty base cache flips empty to false", () => {
  __resetCache();
  setCached(baseKey, { empty: true, docs: [] });
  patchDocSetInCaches(TICKETS, "t1", { flight_status: "PENDING" });
  const base = getCached(baseKey);
  assert.equal(base.empty, false);
  assert.equal(base.docs.length, 1);
});

test("patchDocDeleteInCaches removes the doc from the base cache and marks it not-found", () => {
  seedTickets([
    { id: "t1", data: { flight_status: "PENDING" } },
    { id: "t2", data: { flight_status: "PENDING" } },
  ]);

  patchDocDeleteInCaches(TICKETS, "t1");

  const base = getCached(baseKey);
  assert.equal(base.docs.length, 1, "deleted doc removed from full-collection cache");
  assert.equal(base.docs.find((d: any) => d.id === "t1"), undefined);
  assert.equal(base.empty, false);

  // Doc cache now reports not-found (so a follow-up get is a cache hit, not a Firestore read).
  const t1doc = getCached("doc:tickets:t1");
  assert.equal(t1doc.exists, false);

  // Filtered + count caches dropped.
  assert.equal(getCached(`count:${TICKETS}:{"all":true}`), null);
});

test("deleting the last document sets the base cache empty flag to true", () => {
  seedTickets([{ id: "t1", data: { flight_status: "PENDING" } }]);
  patchDocDeleteInCaches(TICKETS, "t1");
  const base = getCached(baseKey);
  assert.equal(base.docs.length, 0);
  assert.equal(base.empty, true);
});

test("patches are safe no-ops when the collection has no cached reads yet", () => {
  __resetCache();
  // No base cache exists — a cold start. Patches must not throw and must not
  // fabricate a base cache (the next real read will populate it).
  assert.doesNotThrow(() => patchDocUpdateInCaches(TICKETS, "t1", { a: 1 }));
  assert.doesNotThrow(() => patchDocSetInCaches(TICKETS, "t1", { a: 1 }));
  assert.doesNotThrow(() => patchDocDeleteInCaches(TICKETS, "t1"));
  assert.equal(getCached(baseKey), null, "no base cache is fabricated by a patch");
});

test("a write to one collection never disturbs another collection's warm cache", () => {
  // seedTickets() resets the cache, so seed the users cache AFTER it.
  seedTickets([{ id: "t1", data: { flight_status: "PENDING" } }]);
  const usersBase = baseCollectionQueryKey("users");
  setCached(usersBase, { empty: false, docs: [{ id: "u1", data: { name: "X" } }] });

  patchDocSetInCaches(TICKETS, "t2", { flight_status: "PENDING" });

  assert.notEqual(getCached(usersBase), null, "users cache untouched by a tickets write");
  assert.equal(getCached(usersBase).docs.length, 1);
});
