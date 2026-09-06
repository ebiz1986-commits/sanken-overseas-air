// ---------------------------------------------------------------------------
// Firestore read cache
//
// The app talks to Firestore over the REST API. Every document/query read is
// billed per document, so this module keeps an in-memory cache in front of the
// REST layer to avoid re-reading (and re-paying for) data that hasn't changed.
//
// Two ideas keep it cheap AND correct:
//   1. A 30-minute TTL means unchanged data is served from memory.
//   2. Writes patch the cache in place instead of throwing it away, so the
//      expensive "read the whole collection" cache stays warm across edits,
//      creates and deletes. The single most costly thing this app can do is
//      re-scan the entire `tickets` collection, and it used to do that after
//      every write because writes wiped the cache.
//
// The logic here is deliberately free of Express/Firebase/Vite imports so it
// can be unit tested in isolation (see firestoreCache.test.ts).
// ---------------------------------------------------------------------------
import * as fs from "fs";
import path from "path";

export interface CacheEntry {
  timestamp: number;
  data: any;
}

// Live cache (subject to TTL). Keyed by `doc:<path>:<id>`, `query:<path>:<json>`
// or `count:<path>:<json>`.
export const firestoreCache: { [key: string]: CacheEntry } = {};
// Last-known-good copy with no TTL, used only as a fallback when Firestore
// errors (and persisted to disk so a fresh boot can still serve something).
export const staleFallbackCache: { [key: string]: any } = {};
// In-flight request de-duplication: concurrent identical reads share one fetch.
export const pendingQueries: { [key: string]: Promise<any> } = {};
export const pendingDocs: { [key: string]: Promise<any> } = {};
export const pendingCounts: { [key: string]: Promise<any> } = {};

export const CACHE_TTL_MS = 1800000; // 30 minutes

const STALE_CACHE_FILE = path.join(process.cwd(), "firestore_stale_cache.json");

// Disk persistence can be turned off (tests, or environments where the working
// directory is read-only) without touching the in-memory behavior.
let persistenceEnabled = true;
export function setPersistenceEnabled(enabled: boolean) {
  persistenceEnabled = enabled;
}

// Load stale cache from disk on startup (skippable for tests via env var).
if (!process.env.FIRESTORE_CACHE_NO_AUTOLOAD) {
  try {
    if (fs.existsSync(STALE_CACHE_FILE)) {
      const content = fs.readFileSync(STALE_CACHE_FILE, "utf-8");
      Object.assign(staleFallbackCache, JSON.parse(content));
      console.log(`[Cache] Loaded ${Object.keys(staleFallbackCache).length} entries from disk stale cache fallback.`);
    }
  } catch (err) {
    console.warn("[Cache] Failed to load disk stale cache:", err);
  }
}

export function saveStaleCacheToDisk() {
  if (!persistenceEnabled) return;
  try {
    fs.writeFileSync(STALE_CACHE_FILE, JSON.stringify(staleFallbackCache, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Cache] Failed to save disk stale cache:", err);
  }
}

// Debounce disk persistence: the stale cache file is ~1MB, and writing it on
// every single setCached()/patch was heavy local I/O. Coalesce bursts into one
// write.
let staleSaveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleStaleCacheSave() {
  if (!persistenceEnabled) return;
  if (staleSaveTimer) return;
  staleSaveTimer = setTimeout(() => {
    staleSaveTimer = null;
    saveStaleCacheToDisk();
  }, 5000);
  staleSaveTimer.unref?.();
}

// The canonical cache key for an unfiltered full-collection read (no
// where/orderBy/limit). This is the "hot" key the dashboard endpoints
// (metrics, flight-status, project-costs) all share, so we keep it warm across
// single-doc writes.
export function baseCollectionQueryKey(path: string): string {
  return `query:${path}:${JSON.stringify({ from: [{ collectionId: path }] })}`;
}

// Replace serverTimestamp sentinels with a real ISO string so patched cache
// entries match the shape fromProto() produces for real timestamp fields.
export function normalizeForCache(data: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v === "SERVER_TIMESTAMP_SENTINEL" ? new Date().toISOString() : v;
  }
  return out;
}

export function getCached(key: string): any | null {
  const entry = firestoreCache[key];
  if (entry && (Date.now() - entry.timestamp < CACHE_TTL_MS)) {
    return entry.data;
  }
  return null;
}

export function getCachedWithExpiredFallback(key: string): any | null {
  const entry = firestoreCache[key];
  if (entry) {
    return entry.data;
  }
  return null;
}

export function setCached(key: string, data: any) {
  firestoreCache[key] = {
    timestamp: Date.now(),
    data
  };
  staleFallbackCache[key] = data;
  scheduleStaleCacheSave();
}

export function invalidateCache(colPath?: string) {
  if (!colPath) {
    for (const key in firestoreCache) {
      delete firestoreCache[key];
    }
    return;
  }
  const normalizedPath = colPath.replace(/^\/|\/$/g, "");
  for (const key in firestoreCache) {
    if (
      key.startsWith(`doc:${normalizedPath}:`) ||
      key.startsWith(`query:${normalizedPath}:`) ||
      key.startsWith(`count:${normalizedPath}:`)
    ) {
      delete firestoreCache[key];
    }
  }
}

// Drop every cached read for a collection EXCEPT the unfiltered full-collection
// query (baseKey), which callers patch in place. Filtered/ordered query results
// and count aggregations can change when a document's fields or membership
// change, so they are invalidated and lazily rebuilt (a filtered query / a
// count is cheap next to a full collection scan).
export function dropFilteredCaches(path: string, baseKey: string) {
  for (const key in firestoreCache) {
    if (key === baseKey) continue;
    if (key.startsWith(`query:${path}:`) || key.startsWith(`count:${path}:`)) {
      delete firestoreCache[key];
    }
  }
}

// Surgically apply a single-document field UPDATE to the caches instead of
// blowing away every cached read for the collection. An update does NOT change
// collection membership, so we merge the changed fields into:
//   - the document cache (doc:<path>:<id>)
//   - the unfiltered full-collection query cache (kept warm — the expensive one)
// Filtered/ordered query caches and count caches for the collection are dropped,
// since a field change can move a doc in/out of a filtered result or change a
// filtered count.
export function patchDocUpdateInCaches(path: string, docId: string, updateData: any) {
  const norm = normalizeForCache(updateData);

  const docKey = `doc:${path}:${docId}`;
  const docEntry = firestoreCache[docKey];
  if (docEntry?.data?.exists && docEntry.data.data) {
    docEntry.data.data = { ...docEntry.data.data, ...norm };
    staleFallbackCache[docKey] = docEntry.data;
  }

  const baseKey = baseCollectionQueryKey(path);
  const qEntry = firestoreCache[baseKey];
  if (qEntry?.data?.docs && Array.isArray(qEntry.data.docs)) {
    const d = qEntry.data.docs.find((x: any) => x.id === docId);
    if (d) {
      d.data = { ...d.data, ...norm };
      staleFallbackCache[baseKey] = qEntry.data;
    }
  }

  dropFilteredCaches(path, baseKey);
  scheduleStaleCacheSave();
}

// Apply a document SET (create or full overwrite) to the caches instead of
// invalidating every cached read. A set replaces the whole document, so we
// replace the doc cache and the doc's entry in the unfiltered full-collection
// query cache — or APPEND it if it's a new document (membership +1). This keeps
// the expensive full-collection cache warm across creates.
export function patchDocSetInCaches(path: string, docId: string, fullData: any) {
  const norm = normalizeForCache(fullData);

  const docKey = `doc:${path}:${docId}`;
  const docEntry = firestoreCache[docKey];
  if (docEntry) {
    docEntry.data = { exists: true, data: norm };
    docEntry.timestamp = Date.now();
    staleFallbackCache[docKey] = docEntry.data;
  }

  const baseKey = baseCollectionQueryKey(path);
  const qEntry = firestoreCache[baseKey];
  if (qEntry?.data?.docs && Array.isArray(qEntry.data.docs)) {
    const idx = qEntry.data.docs.findIndex((x: any) => x.id === docId);
    if (idx >= 0) {
      qEntry.data.docs[idx] = { id: docId, data: norm };
    } else {
      qEntry.data.docs.push({ id: docId, data: norm });
      qEntry.data.empty = false;
    }
    staleFallbackCache[baseKey] = qEntry.data;
  }

  dropFilteredCaches(path, baseKey);
  scheduleStaleCacheSave();
}

// Apply a document DELETE to the caches: mark the doc cache as not-found and
// remove the doc from the unfiltered full-collection query cache (membership
// -1), keeping that cache warm instead of forcing a full re-scan on next read.
export function patchDocDeleteInCaches(path: string, docId: string) {
  const docKey = `doc:${path}:${docId}`;
  const docEntry = firestoreCache[docKey];
  if (docEntry) {
    docEntry.data = { exists: false, data: undefined };
    docEntry.timestamp = Date.now();
    staleFallbackCache[docKey] = docEntry.data;
  }

  const baseKey = baseCollectionQueryKey(path);
  const qEntry = firestoreCache[baseKey];
  if (qEntry?.data?.docs && Array.isArray(qEntry.data.docs)) {
    qEntry.data.docs = qEntry.data.docs.filter((x: any) => x.id !== docId);
    qEntry.data.empty = qEntry.data.docs.length === 0;
    staleFallbackCache[baseKey] = qEntry.data;
  }

  dropFilteredCaches(path, baseKey);
  scheduleStaleCacheSave();
}

// Test-only: wipe all in-memory cache state so each test starts clean.
export function __resetCache() {
  for (const k in firestoreCache) delete firestoreCache[k];
  for (const k in staleFallbackCache) delete staleFallbackCache[k];
  for (const k in pendingQueries) delete pendingQueries[k];
  for (const k in pendingDocs) delete pendingDocs[k];
  for (const k in pendingCounts) delete pendingCounts[k];
}
