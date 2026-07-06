import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import * as fs from "fs";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import firebaseConfig from "./firebase-applet-config.json";

const { projectId, apiKey } = firebaseConfig as any;
const firestoreDatabaseId = (firebaseConfig as any).firestoreDatabaseId || "(default)";

function fromProto(value: any): any {
  if (!value) return null;
  if (value.fields) {
    const obj: any = {};
    for (const [key, val] of Object.entries(value.fields)) {
      obj[key] = fromProto(val);
    }
    return obj;
  }
  if (value.mapValue) {
    return fromProto(value.mapValue);
  }
  if (value.arrayValue) {
    const arr = value.arrayValue.values || [];
    return arr.map((v: any) => fromProto(v));
  }
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return parseInt(value.integerValue, 10);
  if ("doubleValue" in value) return parseFloat(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  return value;
}

function toProto(value: any): any {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(v => toProto(v))
      }
    };
  }
  if (typeof value === "object") {
    const fields: any = {};
    for (const [key, val] of Object.entries(value)) {
      if (val !== undefined && val !== "SERVER_TIMESTAMP_SENTINEL") {
        fields[key] = toProto(val);
      } else if (val === "SERVER_TIMESTAMP_SENTINEL") {
        fields[key] = { timestampValue: new Date().toISOString() };
      }
    }
    return {
      mapValue: { fields }
    };
  }
  return { stringValue: String(value) };
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required to scan invoices");
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

interface CacheEntry {
  timestamp: number;
  data: any;
}

const firestoreCache: { [key: string]: CacheEntry } = {};
const staleFallbackCache: { [key: string]: any } = {};
const CACHE_TTL_MS = 300000; // 5 minutes TTL
const pendingQueries: { [key: string]: Promise<any> } = {};
const pendingDocs: { [key: string]: Promise<any> } = {};

const STALE_CACHE_FILE = path.join(process.cwd(), "firestore_stale_cache.json");

// Load stale cache from disk on startup
try {
  if (fs.existsSync(STALE_CACHE_FILE)) {
    const content = fs.readFileSync(STALE_CACHE_FILE, "utf-8");
    Object.assign(staleFallbackCache, JSON.parse(content));
    console.log(`[Cache] Loaded ${Object.keys(staleFallbackCache).length} entries from disk stale cache fallback.`);
  }
} catch (err) {
  console.warn("[Cache] Failed to load disk stale cache:", err);
}

function saveStaleCacheToDisk() {
  try {
    fs.writeFileSync(STALE_CACHE_FILE, JSON.stringify(staleFallbackCache, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Cache] Failed to save disk stale cache:", err);
  }
}

const MAX_CONCURRENT_FIRESTORE_REQUESTS = 5;
let activeFirestoreRequests = 0;
const firestoreRequestQueue: (() => void)[] = [];

async function acquireFirestoreSemaphore() {
  if (activeFirestoreRequests < MAX_CONCURRENT_FIRESTORE_REQUESTS) {
    activeFirestoreRequests++;
    return;
  }
  await new Promise<void>(resolve => {
    firestoreRequestQueue.push(resolve);
  });
}

function releaseFirestoreSemaphore() {
  activeFirestoreRequests--;
  if (firestoreRequestQueue.length > 0) {
    activeFirestoreRequests++;
    const next = firestoreRequestQueue.shift();
    if (next) next();
  }
}

function getCached(key: string): any | null {
  const entry = firestoreCache[key];
  if (entry && (Date.now() - entry.timestamp < CACHE_TTL_MS)) {
    return entry.data;
  }
  return null;
}

function getCachedWithExpiredFallback(key: string): any | null {
  const entry = firestoreCache[key];
  if (entry) {
    return entry.data;
  }
  return null;
}

async function fetchWithRetry(url: string, options: any = {}, retries = 10, delay = 500): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if ((res.status === 429 || res.status >= 500) && retries > 0) {
      const jitter = Math.floor(Math.random() * delay);
      const sleepTime = delay + jitter;
      console.warn(`[Firestore REST] Request failed with status ${res.status}. Retrying in ${sleepTime}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, sleepTime));
      const nextDelay = Math.min(15000, delay * 2);
      return fetchWithRetry(url, options, retries - 1, nextDelay);
    }
    return res;
  } catch (err: any) {
    if (retries > 0) {
      const jitter = Math.floor(Math.random() * delay);
      const sleepTime = delay + jitter;
      console.warn(`[Firestore REST] Fetch failed: ${err?.message || err}. Retrying in ${sleepTime}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, sleepTime));
      const nextDelay = Math.min(15000, delay * 2);
      return fetchWithRetry(url, options, retries - 1, nextDelay);
    }
    throw err;
  }
}

function setCached(key: string, data: any) {
  firestoreCache[key] = {
    timestamp: Date.now(),
    data
  };
  staleFallbackCache[key] = data;
  saveStaleCacheToDisk();
}

function invalidateCache(colPath?: string) {
  if (!colPath) {
    for (const key in firestoreCache) {
      delete firestoreCache[key];
    }
    return;
  }
  const normalizedPath = colPath.replace(/^\/|\/$/g, "");
  for (const key in firestoreCache) {
    if (key.startsWith(`doc:${normalizedPath}:`) || key.startsWith(`query:${normalizedPath}:`)) {
      delete firestoreCache[key];
    }
  }
}

class AdminDocRef {
  constructor(private colPath: string, private docId: string) {}

  async get() {
    const path = this.colPath.replace(/^\/|\/$/g, "");
    const cacheKey = `doc:${path}:${this.docId}`;
    const cached = getCached(cacheKey);
    if (cached !== null) {
      return {
        exists: cached.exists,
        id: this.docId,
        data: () => cached.data
      };
    }

    if (pendingDocs[cacheKey]) {
      const res = await pendingDocs[cacheKey];
      return {
        exists: res.exists,
        id: this.docId,
        data: () => res.data
      };
    }

    const fetchPromise = (async () => {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/${path}/${this.docId}?key=${apiKey}`;
      try {
        await acquireFirestoreSemaphore();
        const res = await fetchWithRetry(url);
        if (res.status === 404) {
          const entry = { exists: false, data: undefined };
          setCached(cacheKey, entry);
          return entry;
        }
        if (!res.ok) {
          throw new Error(`Failed to get document: ${res.statusText}`);
        }
        const json = await res.json();
        const parsedData = fromProto(json);
        const entry = { exists: true, data: parsedData };
        setCached(cacheKey, entry);
        return entry;
      } catch (error: any) {
        console.error(`Error in AdminDocRef.get:`, error);
        const expiredFallback = getCachedWithExpiredFallback(cacheKey);
        if (expiredFallback) {
          console.warn(`[Cache Fallback] Recovered ${cacheKey} from expired cache due to error.`);
          return expiredFallback;
        }
        if (staleFallbackCache[cacheKey]) {
          console.warn(`[Stale Cache Fallback] Recovered ${cacheKey} from stale disk cache due to error.`);
          return staleFallbackCache[cacheKey];
        }
        throw error;
      } finally {
        releaseFirestoreSemaphore();
        delete pendingDocs[cacheKey];
      }
    })();

    pendingDocs[cacheKey] = fetchPromise;
    const result = await fetchPromise;
    return {
      exists: result.exists,
      id: this.docId,
      data: () => result.data
    };
  }

  async set(data: any) {
    const serialized = toProto(data);
    const docBody = {
      fields: serialized.mapValue?.fields || {}
    };
    const path = this.colPath.replace(/^\/|\/$/g, "");
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/${path}/${this.docId}?key=${apiKey}`;
    try {
      const res = await fetchWithRetry(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(docBody)
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to set document: ${res.statusText} - ${errorText}`);
      }
      invalidateCache(this.colPath);
      return await res.json();
    } catch (error: any) {
      console.error(`Error in AdminDocRef.set:`, error);
      throw error;
    }
  }

  async update(data: any) {
    const serialized = toProto(data);
    const docBody = {
      fields: serialized.mapValue?.fields || {}
    };
    const path = this.colPath.replace(/^\/|\/$/g, "");
    const fields = Object.keys(data);
    const queryParams = fields.map(f => `updateMask.fieldPaths=${f}`).join("&");
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/${path}/${this.docId}?key=${apiKey}${queryParams ? "&" + queryParams : ""}`;
    try {
      const res = await fetchWithRetry(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(docBody)
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to update document: ${res.statusText} - ${errorText}`);
      }
      invalidateCache(this.colPath);
      return await res.json();
    } catch (error: any) {
      console.error(`Error in AdminDocRef.update:`, error);
      throw error;
    }
  }

  async delete() {
    const path = this.colPath.replace(/^\/|\/$/g, "");
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/${path}/${this.docId}?key=${apiKey}`;
    try {
      const res = await fetchWithRetry(url, {
        method: "DELETE"
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to delete document: ${res.statusText} - ${errorText}`);
      }
      invalidateCache(this.colPath);
      return await res.json();
    } catch (error: any) {
      console.error(`Error in AdminDocRef.delete:`, error);
      throw error;
    }
  }
}

class AdminQuery {
  protected constraints: Array<{
    type: "where" | "orderBy" | "limit";
    field?: string;
    op?: string;
    val?: any;
    dir?: "asc" | "desc";
    limitVal?: number;
  }> = [];

  constructor(protected colPath: string) {}

  where(field: string, op: any, val: any) {
    this.constraints.push({ type: "where", field, op, val });
    return this;
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc") {
    this.constraints.push({ type: "orderBy", field, dir });
    return this;
  }

  limit(n: number) {
    this.constraints.push({ type: "limit", limitVal: n });
    return this;
  }

  async get() {
    const path = this.colPath.replace(/^\/|\/$/g, "");
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents:runQuery?key=${apiKey}`;

    const structuredQuery: any = {
      from: [{ collectionId: path }]
    };

    const filters: any[] = [];
    const orders: any[] = [];
    let limitVal: number | undefined = undefined;

    for (const c of this.constraints) {
      if (c.type === "where") {
        let opMapped = "EQUAL";
        const op = c.op;
        if (op === "==") opMapped = "EQUAL";
        else if (op === ">") opMapped = "GREATER_THAN";
        else if (op === ">=") opMapped = "GREATER_THAN_OR_EQUAL";
        else if (op === "<") opMapped = "LESS_THAN";
        else if (op === "<=") opMapped = "LESS_THAN_OR_EQUAL";
        else if (op === "in") opMapped = "IN";
        else if (op === "array-contains") opMapped = "ARRAY_CONTAINS";
        else if (op === "array-contains-any") opMapped = "ARRAY_CONTAINS_ANY";

        filters.push({
          fieldFilter: {
            field: { fieldPath: c.field },
            op: opMapped,
            value: toProto(c.val)
          }
        });
      } else if (c.type === "orderBy") {
        orders.push({
          field: { fieldPath: c.field },
          direction: c.dir === "desc" ? "DESCENDING" : "ASCENDING"
        });
      } else if (c.type === "limit") {
        limitVal = c.limitVal;
      }
    }

    if (filters.length > 0) {
      if (filters.length === 1) {
        structuredQuery.where = filters[0];
      } else {
        structuredQuery.where = {
          compositeFilter: {
            op: "AND",
            filters: filters
          }
        };
      }
    }

    if (orders.length > 0) {
      structuredQuery.orderBy = orders;
    }

    if (limitVal !== undefined) {
      structuredQuery.limit = limitVal;
    }

    const cacheKey = `query:${path}:${JSON.stringify(structuredQuery)}`;
    const cached = getCached(cacheKey);
    if (cached !== null) {
      return {
        empty: cached.empty,
        docs: cached.docs.map((d: any) => ({
          id: d.id,
          data: () => JSON.parse(JSON.stringify(d.data)),
          ref: { id: d.id }
        }))
      };
    }

    if (pendingQueries[cacheKey]) {
      const result = await pendingQueries[cacheKey];
      return {
        empty: result.empty,
        docs: result.docs.map((d: any) => ({
          id: d.id,
          data: () => JSON.parse(JSON.stringify(d.data)),
          ref: { id: d.id }
        }))
      };
    }

    const fetchPromise = (async () => {
      try {
        await acquireFirestoreSemaphore();
        const res = await fetchWithRetry(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ structuredQuery })
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to query documents: ${res.statusText} - ${errorText}`);
        }

        const results = await res.json();
        const docs: any[] = [];
        const cacheDocs: any[] = [];

        if (Array.isArray(results)) {
          for (const item of results) {
            if (item.document) {
              const docName = item.document.name;
              const docId = docName.substring(docName.lastIndexOf("/") + 1);
              const parsedData = fromProto(item.document);
              docs.push({
                id: docId,
                data: parsedData
              });
              cacheDocs.push({
                id: docId,
                data: parsedData
              });
            }
          }
        }

        const entry = { empty: docs.length === 0, docs: cacheDocs };
        setCached(cacheKey, entry);
        return entry;
      } catch (error: any) {
        console.error(`Error in AdminQuery.get:`, error);
        const expiredFallback = getCachedWithExpiredFallback(cacheKey);
        if (expiredFallback) {
          console.warn(`[Cache Fallback] Recovered ${cacheKey} query from expired cache due to error.`);
          return expiredFallback;
        }
        if (staleFallbackCache[cacheKey]) {
          console.warn(`[Stale Cache Fallback] Recovered ${cacheKey} query from stale disk cache due to error.`);
          return staleFallbackCache[cacheKey];
        }
        throw error;
      } finally {
        releaseFirestoreSemaphore();
        delete pendingQueries[cacheKey];
      }
    })();

    pendingQueries[cacheKey] = fetchPromise;
    const result = await fetchPromise;

    return {
      empty: result.empty,
      docs: result.docs.map((d: any) => ({
        id: d.id,
        data: () => JSON.parse(JSON.stringify(d.data)),
        ref: { id: d.id }
      }))
    };
  }
}

class AdminCollectionRef extends AdminQuery {
  doc(docId: string = crypto.randomUUID()) {
    return new AdminDocRef(this.colPath, docId);
  }

  async add(data: any) {
    const docRef = this.doc();
    await docRef.set(data);
    return docRef;
  }
}

const fdb = {
  collection(name: string) {
    return new AdminCollectionRef(name);
  }
};

const admin = {
  apps: { length: 1 },
  app: () => ({}),
  firestore: {
    FieldValue: {
      serverTimestamp: () => "SERVER_TIMESTAMP_SENTINEL"
    }
  }
};

// Initialize express app
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SECRET_KEY = process.env.JWT_SECRET_KEY || "default_local_development_secret_key_that_is_long_enough_32c";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.APP_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin (no Origin header) and explicitly allowed origins
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
}));

// Simple in-memory rate limiter for login
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function loginRateLimit(req: any, res: any, next: any) {
  const key = (req.body?.email || req.ip || 'unknown').toLowerCase();
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_LOGIN_ATTEMPTS) {
      const waitMin = Math.ceil((entry.resetAt - now) / 60000);
      return res.status(429).json({ detail: `Too many login attempts. Try again in ${waitMin} minute(s).` });
    }
    entry.count += 1;
  } else {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  }
  next();
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginAttempts) {
    if (now > v.resetAt) loginAttempts.delete(k);
  }
}, 5 * 60 * 1000).unref();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper to generate a valid minimal 1-page PDF dynamically custom-labeled with the filename!
function generateMinimalPDF(filename: string): Buffer {
  const title = "SANKEN OVERSEAS AIR PORTAL / TRAVEL DOCUMENT";
  const desc = "This is a secure system-generated Air Travel Document Scan/Invoice reference.";
  const docName = `Document Name: ${filename.replace(/[\(\)]/g, " ")}`;
  const status = "Status: Verified & Processed";
  const dateStr = `Timestamp: ${new Date().toUTCString()}`;

  // Stream text
  const streamText = `BT
/F1 16 Tf
72 712 Td
(${title}) Tj
/F1 11 Tf
0 -30 Td
(${desc}) Tj
/F2 10 Tf
0 -24 Td
(${docName}) Tj
0 -14 Td
(${status}) Tj
0 -14 Td
(${dateStr}) Tj
0 -24 Td
(------------------------------------------------------------------------------------------------------------------------) Tj
0 -24 Td
/F1 12 Tf
(AUTOMATED SYSTEM SCAN COPY) Tj
/F2 10 Tf
0 -18 Td
(The scanned file copy has been successfully archived in our cloud repository.) Tj
0 -12 Td
(For live database tracking, reference the assigned document name above.) Tj
ET`;

  const streamLength = streamText.length;

  const objects: string[] = [];
  objects.push(`%PDF-1.4\n`); // Header starts at index 0 (not in objects array to align offsets)
  
  // Object 1: Catalog
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  // Object 2: Pages list
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  // Object 3: Page Definition (Font Dictionary)
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n`;
  // Object 4: Content Stream
  const obj4 = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamText}\nendstream\nendobj\n`;

  // Now, calculate exact offsets
  let offset = 9; // "%PDF-1.4\n" is 9 bytes
  const offsets: number[] = [];
  
  offsets.push(offset);
  offset += obj1.length;
  
  offsets.push(offset);
  offset += obj2.length;
  
  offsets.push(offset);
  offset += obj3.length;
  
  offsets.push(offset);
  offset += obj4.length;

  const xrefOffset = offset;
  
  let xref = `xref\n0 5\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += String(off).padStart(10, '0') + " 00000 n \n";
  }
  
  const trailer = `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfStr = `%PDF-1.4\n` + obj1 + obj2 + obj3 + obj4 + xref + trailer;
  return Buffer.from(pdfStr, "utf-8");
}

// Serve dynamic PDF files for the relative/mock PDF filenames stored in the database
app.get("/*.pdf", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  
  const filename = decodeURIComponent(req.path.slice(1));
  
  // If Vite or Express static might serve an actual file, check if it exists on disk first in public/dist
  const p1 = path.join(process.cwd(), "public", filename);
  const p2 = path.join(process.cwd(), "dist", filename);
  if (fs.existsSync(p1) || fs.existsSync(p2)) {
    return next();
  }

  console.log(`[PDF Handler] Servings dynamically generated PDF for mock file: ${filename}`);
  try {
    const pdfBuf = generateMinimalPDF(filename);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(pdfBuf);
  } catch (err) {
    next(err);
  }
});

// Serve beautiful SVG placeholders for any relative/mock image filenames stored in the database
app.get(["/*.png", "/*.jpg", "/*.jpeg", "/*.gif"], (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();

  const filename = decodeURIComponent(req.path.slice(1));
  const p1 = path.join(process.cwd(), "public", filename);
  const p2 = path.join(process.cwd(), "dist", filename);
  if (fs.existsSync(p1) || fs.existsSync(p2)) {
    return next();
  }

  console.log(`[Image Handler] Servings dynamically generated SVG for mock file: ${filename}`);
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
    <rect width="100%" height="100%" fill="#f8fafc" rx="8"/>
    <rect x="20" y="20" width="360" height="260" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <path d="M160 80h80v40h-80z" fill="#0284c7" opacity="0.1"/>
    <circle cx="200" cy="100" r="15" fill="#0284c7" opacity="0.3"/>
    <text x="200" y="150" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">
      Archived Document Scan
    </text>
    <text x="200" y="175" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">
      ${filename}
    </text>
    <rect x="60" y="210" width="280" height="10" rx="3" fill="#cbd5e1"/>
    <rect x="60" y="230" width="200" height="10" rx="3" fill="#e2e8f0"/>
  </svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svg);
});

// Firestore Seed Check
async function seedDatabaseIfEmpty() {
  console.log('[Seed] Checking for default users...');
  const defaultUsers = [
    { email: "admin1@sanken.com", role: "ADMIN1", full_name: "Admin 1" },
    { email: "agent@sanken.com", role: "AGENT", full_name: "Travel Agent" },
    { email: "finance@sanken.com", role: "FINANCE", full_name: "Finance Officer" },
    { email: "admin@sanken.com", role: "ADMIN", full_name: "System Admin" },
    { email: "sadmin@sanken.com", role: "SADMIN", full_name: "Super Admin" }
  ];

  const passwordHash = bcrypt.hashSync("Welcome123!", 10);
  
  // Convert legacy HR if any
  const hrSnap = await fdb.collection('users').where('email', '==', 'hr@sanken.com').limit(1).get();
  if (!hrSnap.empty) {
    console.log('[Seed] Found legacy HR user, migrating to admin1...');
    const hrDoc = hrSnap.docs[0];
    await fdb.collection('users').doc(hrDoc.id).set({
      email: "admin1@sanken.com",
      role: "ADMIN1",
      full_name: "Admin 1",
      id: hrDoc.id,
      password_hash: passwordHash,
      is_active: true,
      must_change_password: true,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  for (const du of defaultUsers) {
    const userSnap = await fdb.collection('users').where('email', '==', du.email).limit(1).get();
    if (userSnap.empty) {
      console.log(`[Seed] Creating missing user: ${du.email}`);
      const id = crypto.randomUUID();
      await fdb.collection('users').doc(id).set({
        ...du,
        id,
        password_hash: passwordHash,
        is_active: true,
        must_change_password: true,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const userDoc = userSnap.docs[0];
      const data = userDoc.data();
      if (data.role !== du.role) {
        console.log(`[Seed] Updating user role for ${du.email} to ${du.role}`);
        await fdb.collection('users').doc(userDoc.id).update({ role: du.role });
      }
    }
  }

  // Seed some projects if empty
  const projectsSnap = await fdb.collection('projects').limit(1).get();
  if (projectsSnap.empty) {
    const projects = [
      { name: "Maldives Resort Proj", budget_allocated: 50000 },
      { name: "Dubai Expo Pavilion", budget_allocated: 120000 },
      { name: "Seychelles Airport", budget_allocated: 75000 }
    ];

    for (const p of projects) {
      const id = "PROJ-" + crypto.randomUUID();
      await fdb.collection('projects').doc(id).set({
        ...p,
        id,
        company: "Sanken Overseas",
        country: "Regional",
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  // Seed some options if empty
  const optionsSnap = await fdb.collection('options').limit(1).get();
  if (optionsSnap.empty) {
    const options = [
      { category: 'JOB_CATEGORY', value: 'Engineer' },
      { category: 'JOB_CATEGORY', value: 'Foreman' },
      { category: 'COMPANY', value: 'Sanken Overseas' },
      { category: 'TICKET_TYPE', value: 'ONE_WAY' },
      { category: 'TICKET_TYPE', value: 'RETURN' },
      { category: 'CURRENCY', value: 'USD' }
    ];

    for (const o of options) {
      const id = crypto.randomUUID();
      await fdb.collection('options').doc(id).set({ ...o, id });
    }
  }

  console.log('[Seed] Seeding and migration checks completed!');
}

seedDatabaseIfEmpty().catch(console.error);

// Authentication Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err: any, user: any) => {
    if (err) return res.sendStatus(401);
    req.user = user;
    next();
  });
};

// --- API ROUTES ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend API is running" });
});

// Auth Routes
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

app.post("/api/auth/login", loginRateLimit, async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const emailLower = data.email.toLowerCase();

    // Robust self-healing for default accounts
    const defaults: Record<string, { role: string; fullName: string }> = {
      "admin1@sanken.com": { role: "ADMIN1", fullName: "Admin 1" },
      "agent@sanken.com": { role: "AGENT", fullName: "Travel Agent" },
      "finance@sanken.com": { role: "FINANCE", fullName: "Finance Officer" },
      "admin@sanken.com": { role: "ADMIN", fullName: "System Admin" },
      "sadmin@sanken.com": { role: "SADMIN", fullName: "Super Admin" }
    };

    if (defaults[emailLower] && data.password === "Welcome123!") {
      const defaultUser = defaults[emailLower];
      const userSnap = await fdb.collection('users').where('email', '==', emailLower).limit(1).get();
      const passwordHash = bcrypt.hashSync("Welcome123!", 10);
      
      if (userSnap.empty) {
        const id = crypto.randomUUID();
        await fdb.collection('users').doc(id).set({
          email: emailLower,
          role: defaultUser.role,
          full_name: defaultUser.fullName,
          id,
          password_hash: passwordHash,
          is_active: true,
          must_change_password: true,
          created_at: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        const userDoc = userSnap.docs[0];
        const currentData = userDoc.data();
        if (currentData.role !== defaultUser.role || !bcrypt.compareSync("Welcome123!", currentData.password_hash)) {
          await fdb.collection('users').doc(userDoc.id).update({
            role: defaultUser.role,
            password_hash: passwordHash
          });
        }
      }
    }

    const usersSnap = await fdb.collection('users').where('email', '==', emailLower).limit(1).get();
    
    if (usersSnap.empty) {
      return res.status(401).json({ detail: "Invalid email or password. Please try again." });
    }
    
    const user = usersSnap.docs[0].data();
    
    if (!bcrypt.compareSync(data.password, user.password_hash)) {
      return res.status(401).json({ detail: "Invalid email or password. Please try again." });
    }
    
    loginAttempts.delete(emailLower);

    const token = jwt.sign({ sub: user.id, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
    res.json({
      access_token: token,
      token_type: "bearer",
      role: user.role,
      user_id: user.id,
      must_change_password: !!user.must_change_password
    });
  } catch (error: any) {
    console.error("Error during login:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: (error as any).errors });
    }
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached. Please try again tomorrow or upgrade the Firestore quota." });
    }
    res.status(400).json({ detail: `Bad Request: ${error?.message || "Please check the entered data."}` });
  }
});

app.post("/api/auth/change-password", authenticateToken, async (req: any, res: any) => {
  try {
    const data = z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(8)
    }).parse(req.body);
    
    const userDoc = await fdb.collection('users').doc(req.user.sub).get();
    if (!userDoc.exists) return res.status(404).json({ detail: "User not found." });
    const user = userDoc.data();
    
    if (!bcrypt.compareSync(data.current_password, user?.password_hash)) {
      return res.status(400).json({ detail: "Current password is incorrect." });
    }
    
    const hash = bcrypt.hashSync(data.new_password, 10);
    await fdb.collection('users').doc(req.user.sub).update({
      password_hash: hash,
      must_change_password: false
    });
    invalidateCache('users');
    
    res.json({ status: "password_changed" });
  } catch (error: any) {
    res.status(400).json({ detail: "Failed to change password." });
  }
});

// Tickets Routes
const checkTicketSizeLimit = (existingData: any, newData: any): boolean => {
  const merged = { ...existingData, ...newData };
  const bytes = JSON.stringify(merged).length;
  // Firestore limit is 1,048,576. 960,000 leaves adequate headroom for Firestore metadata tags.
  return bytes > 960000;
};

app.post("/api/tickets/bulk", authenticateToken, async (req: any, res: any) => {
  if (!['ADMIN1', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ detail: "Only Admin 1 or Admin can create tickets in bulk." });
  }

  const { shared, passengers } = req.body || {};
  if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
    return res.status(400).json({ detail: "Passengers list is required." });
  }

  // Basic validation of each passenger
  const uniquePpsInBatch = new Set<string>();
  for (const p of passengers) {
    if (!p.passenger_name || !p.passenger_name.trim()) {
      return res.status(400).json({ detail: "Passenger Name is required for all passengers." });
    }
    if (!p.pp_number || !p.pp_number.trim()) {
      return res.status(400).json({ detail: `Passport Number is required for passenger '${p.passenger_name}'.` });
    }
    const norm = p.pp_number.trim().toUpperCase();
    if (uniquePpsInBatch.has(norm)) {
      return res.status(400).json({ detail: `Duplicate Passport Number '${norm}' detected within this batch.` });
    }
    uniquePpsInBatch.add(norm);
  }

  try {
    // Check bypass list
    const bypassSnap = await fdb.collection('bypass_passports').get();
    const bypassedSet = new Set(bypassSnap.docs.map(doc => doc.id.toUpperCase()));

    // Check existing tickets for non-bypassed passports in parallel
    const ppsToCheck = Array.from(uniquePpsInBatch).filter(p => !bypassedSet.has(p));
    if (ppsToCheck.length > 0) {
      const checkPromises = ppsToCheck.map(norm => fdb.collection('tickets').where('pp_number', '==', norm).limit(1).get());
      const checkResults = await Promise.all(checkPromises);
      for (let i = 0; i < checkResults.length; i++) {
        if (!checkResults[i].empty) {
          return res.status(400).json({ detail: `A ticket with Passport Number '${ppsToCheck[i]}' already exists in the system.` });
        }
      }
    }

    // Prepare shared project IDs
    let pIds = shared.project_ids || [];
    let pId = shared.project_id || "";
    if (pIds.length > 0 && !pId) {
      pId = pIds[0];
    } else if (pId && pIds.length === 0) {
      pIds = [pId];
    }

    const createdIds: string[] = [];
    const writePromises: Promise<any>[] = [];

    for (const p of passengers) {
      const id = crypto.randomUUID();
      createdIds.push(id);

      const ticketData = {
        ...shared,
        project_ids: pIds,
        project_id: pId,
        passenger_name: p.passenger_name.trim(),
        pp_number: p.pp_number.trim().toUpperCase(),
        approved_rate: parseFloat(p.approved_rate) || 0,
        job_category: p.job_category ? p.job_category.trim() : (shared.job_category || ""),
        id,
        created_by_user_id: req.user.sub,
        status: 'IN_PROGRESS',
        stage1_completed: true,
        stage1_completed_at: admin.firestore.FieldValue.serverTimestamp(),
        stage2_completed: true,
        stage2_completed_at: admin.firestore.FieldValue.serverTimestamp(),
        flight_status: shared.flight_status || 'PENDING',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_by_user_id: req.user.sub
      };

      // Add to write list
      writePromises.push(fdb.collection('tickets').doc(id).set(ticketData));

      // Append activity log
      writePromises.push(fdb.collection('activity_logs').doc(crypto.randomUUID()).set({
        ticket_id: id,
        user_id: req.user.sub,
        action: "created",
        new_values: "status=IN_PROGRESS (Bulk Entry)",
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }));
    }

    await Promise.all(writePromises);

    res.json({ ids: createdIds, status: "created", count: passengers.length });
  } catch (e: any) {
    console.error("Error creating bulk tickets:", e);
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("too large") || msg.includes("limit") || msg.includes("size") || msg.includes("exceeds")) {
      return res.status(400).json({ detail: "The batch requests are too large. Please decrease passenger count or upload smaller compressed attachments." });
    }
    res.status(500).json({ detail: "An internal server error occurred while creating bulk tickets." });
  }
});

app.post("/api/tickets", authenticateToken, async (req: any, res: any) => {
  if (!['ADMIN1', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ detail: "Only Admin 1 or Admin can create tickets." });
  }
  const t = req.body;
  const id = crypto.randomUUID();
  
  if (!t.pp_number) {
    return res.status(400).json({ detail: "Passport Number is required." });
  }

  const ppNormalized = t.pp_number.trim().toUpperCase();
  
  try {
    // Check if passport is in the bypass list
    const bypassCheck = await fdb.collection('bypass_passports').doc(ppNormalized).get();
    const isBypassed = bypassCheck.exists;

    if (!isBypassed) {
      const existing = await fdb.collection('tickets').where('pp_number', '==', ppNormalized).get();
      if (!existing.empty) {
        return res.status(400).json({ detail: `A ticket with Passport Number '${ppNormalized}' already exists. Passport number must be unique (unless added to Admin Bypass Passports setting).` });
      }
    }

    t.pp_number = ppNormalized;

    if (t.project_ids && Array.isArray(t.project_ids) && t.project_ids.length > 0) {
      t.project_id = t.project_ids[0];
    } else if (t.project_id) {
      t.project_ids = [t.project_id];
    }

    const data = {
      ...t,
      id,
      created_by_user_id: req.user.sub,
      status: 'IN_PROGRESS',
      stage1_completed: true,
      stage1_completed_at: admin.firestore.FieldValue.serverTimestamp(),
      stage2_completed: true, // Auto-complete stage 2 if flight info present
      stage2_completed_at: admin.firestore.FieldValue.serverTimestamp(),
      flight_status: t.flight_status || 'PENDING',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by_user_id: req.user.sub
    };

    await fdb.collection('tickets').doc(id).set(data);

    await fdb.collection('activity_logs').doc(crypto.randomUUID()).set({
      ticket_id: id,
      user_id: req.user.sub,
      action: "created",
      new_values: "status=IN_PROGRESS",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ id, status: "created" });
  } catch (e: any) {
    console.error("Error creating ticket:", e);
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("too large") || msg.includes("limit") || msg.includes("size") || msg.includes("document_size") || msg.includes("exceeds")) {
      return res.status(400).json({ detail: "Attachments are too large. The combined size of files exceeds Firestore's 1MB limit. Please upload smaller or compressed PDFs/images." });
    }
    res.status(500).json({ detail: "An internal server error occurred while creating the ticket." });
  }
});

app.get("/api/tickets", authenticateToken, async (req: any, res: any) => {
  try {
    let q: any = fdb.collection('tickets');
    
    if (req.query.project_id) {
      q = q.where('project_id', '==', req.query.project_id);
    }
    if (req.query.flight_status) {
      q = q.where('flight_status', '==', req.query.flight_status);
    }
    
    q = q.orderBy('created_at', 'desc');
    
    const limit = parseInt(req.query.limit || '1000');
    q = q.limit(limit);
    
    const snap = await q.get();
    const tickets = snap.docs.map(doc => ({
      ...doc.data(),
      // Handle timestamps for JSON
      created_at: doc.data().created_at?.toDate?.()?.toISOString() || doc.data().created_at,
      updated_at: doc.data().updated_at?.toDate?.()?.toISOString() || doc.data().updated_at,
    }));
    
    res.json({ tickets, total: tickets.length });
  } catch (e: any) {
    console.error("Error fetching tickets:", e);
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error fetching tickets" });
  }
});

app.get("/api/tickets/:id", authenticateToken, async (req: any, res: any) => {
  try {
    const doc = await fdb.collection('tickets').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ detail: "Ticket not found" });
    
    const activitySnap = await fdb.collection('activity_logs')
      .where('ticket_id', '==', req.params.id)
      .orderBy('timestamp', 'desc')
      .get();
      
    const usersSnap = await fdb.collection('users').get();
    const usersMap = new Map<string, any>();
    usersSnap.docs.forEach(uDoc => {
      usersMap.set(uDoc.id, uDoc.data());
    });
    
    const activity = activitySnap.docs.map(aDoc => {
      const a = aDoc.data();
      const u = usersMap.get(a.user_id);
      return {
        ...a,
        user_name: u?.full_name || 'System',
        user_role: u?.role || '',
        timestamp: a.timestamp?.toDate?.()?.toISOString() || a.timestamp
      };
    });
    
    res.json({
      ticket: {
        ...doc.data(),
        id: doc.id
      },
      activity
    });
  } catch (e: any) {
    console.error("Error fetching ticket details:", e);
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error fetching ticket" });
  }
});

app.put("/api/tickets/:id", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN1' && req.user.role !== 'ADMIN' && req.user.role !== 'FINANCE') {
    return res.status(403).json({ detail: "Only Admin 1, Finance, or ADMIN can edit ticket details" });
  }
  
  const { id } = req.params;
  const t = req.body;
  
  try {
    const doc = await fdb.collection('tickets').doc(id).get();
    if (!doc.exists) return res.status(404).json({ detail: "Ticket not found" });
    const ticket = doc.data();
    
    if (ticket?.stage3_completed) {
      return res.status(403).json({ detail: "Cannot edit Stage 1 of a completed ticket. Reopen via Admin Settings first." });
    }

    if (t.pp_number) {
      const ppNormalized = t.pp_number.trim().toUpperCase();
      
      const bypassCheck = await fdb.collection('bypass_passports').doc(ppNormalized).get();
      const isBypassed = bypassCheck.exists;

      if (!isBypassed) {
        const existing = await fdb.collection('tickets').where('pp_number', '==', ppNormalized).get();
        const duplicate = existing.docs.find(d => d.id !== id);
        if (duplicate) {
          return res.status(400).json({ detail: `Passport Number '${ppNormalized}' is already in use by another ticket.` });
        }
      }
      t.pp_number = ppNormalized;
    }

    if (t.project_ids && Array.isArray(t.project_ids) && t.project_ids.length > 0) {
      t.project_id = t.project_ids[0];
    } else if (t.project_id) {
      t.project_ids = [t.project_id];
    }

    if (checkTicketSizeLimit(ticket, t)) {
      return res.status(400).json({ detail: "Attachments are too large. The combined size of files exceeds Firestore's 1MB limit. Please upload smaller or compressed PDFs/images." });
    }

    await fdb.collection('tickets').doc(id).update({
      ...t,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by_user_id: req.user.sub
    });

    await fdb.collection('activity_logs').doc(crypto.randomUUID()).set({
      ticket_id: id,
      user_id: req.user.sub,
      action: 'EDIT_STAGE1',
      new_values: JSON.stringify(t),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error editing ticket:", err);
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("too large") || msg.includes("limit") || msg.includes("size") || msg.includes("document_size") || msg.includes("exceeds")) {
      return res.status(400).json({ detail: "Attachments are too large. The combined size of files exceeds Firestore's 1MB limit. Please upload smaller or compressed PDFs/images." });
    }
    res.status(500).json({ detail: "Failed to edit ticket: " + err.message });
  }
});

app.delete("/api/tickets/:id", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: "Only Admin can delete tickets." });
  }

  const { id } = req.params;
  try {
    const doc = await fdb.collection('tickets').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ detail: "Ticket not found" });
    }

    await fdb.collection('tickets').doc(id).delete();

    // Delete tasks and activity logs for this ticket sequentially
    const tasksSnap = await fdb.collection('ticket_tasks').where('ticket_id', '==', id).get();
    for (const d of tasksSnap.docs) {
      await fdb.collection('ticket_tasks').doc(d.id).delete();
    }
    const logsSnap = await fdb.collection('activity_logs').where('ticket_id', '==', id).get();
    for (const d of logsSnap.docs) {
      await fdb.collection('activity_logs').doc(d.id).delete();
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting ticket:", err);
    res.status(500).json({ detail: "Failed to delete ticket: " + err.message });
  }
});

app.post("/api/tickets/:id/request-deletion", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Only Admin or Admin 1 can request deletion." });
  }

  const { id } = req.params;
  try {
    const doc = await fdb.collection('tickets').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ detail: "Ticket not found" });
    }

    await fdb.collection('deletion_requests').add({
      ticket_id: id,
      requested_by: req.user.email || 'unknown',
      requested_at: new Date(),
      status: 'PENDING'
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error creating deletion request:", err);
    res.status(500).json({ detail: "Failed to request ticket deletion: " + err.message });
  }
});

app.get("/api/deletion-requests", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: "Only Admin can view deletion requests." });
  }

  try {
    const snap = await fdb.collection('deletion_requests').where('status', '==', 'PENDING').get();
    const requests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(requests);
  } catch (err: any) {
    console.error("Error fetching deletion requests:", err);
    res.status(500).json({ detail: "Failed to fetch deletion requests: " + err.message });
  }
});

app.post("/api/deletion-requests/:requestId/approve", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') { // Only Master Admin can approve? The user said "ADMIN or ADMIN1". Let's assume ADMIN can approve.
    return res.status(403).json({ detail: "Only Admin can approve deletion requests." });
  }

  const { requestId } = req.params;
  try {
    const reqDoc = await fdb.collection('deletion_requests').doc(requestId).get();
    if (!reqDoc.exists) {
      return res.status(404).json({ detail: "Request not found" });
    }
    const requestData = reqDoc.data();
    const ticketId = requestData.ticket_id;

    // Perform actual deletion
    const doc = await fdb.collection('tickets').doc(ticketId).get();
    if (doc.exists) {
        await fdb.collection('tickets').doc(ticketId).delete();
        // Delete tasks and activity logs for this ticket sequentially
        const tasksSnap = await fdb.collection('ticket_tasks').where('ticket_id', '==', ticketId).get();
        for (const d of tasksSnap.docs) {
          await fdb.collection('ticket_tasks').doc(d.id).delete();
        }
        const logsSnap = await fdb.collection('activity_logs').where('ticket_id', '==', ticketId).get();
        for (const d of logsSnap.docs) {
          await fdb.collection('activity_logs').doc(d.id).delete();
        }
    }

    await fdb.collection('deletion_requests').doc(requestId).update({ status: 'APPROVED' });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error approving deletion request:", err);
    res.status(500).json({ detail: "Failed to approve deletion request: " + err.message });
  }
});

app.post("/api/deletion-requests/:requestId/reject", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: "Only Admin can reject deletion requests." });
  }

  const { requestId } = req.params;
  try {
    await fdb.collection('deletion_requests').doc(requestId).update({ status: 'REJECTED' });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error rejecting deletion request:", err);
    res.status(500).json({ detail: "Failed to reject deletion request: " + err.message });
  }
});

app.put("/api/tickets/:id/documents", authenticateToken, async (req: any, res: any) => {
  if (!['ADMIN1', 'AGENT', 'ADMIN', 'FINANCE'].includes(req.user.role)) {
    return res.status(403).json({ error: "Unauthorized to upload documents" });
  }

  const { id } = req.params;
  const { first_atbf, first_invoice, other_invoice, attached_images, first_invoice_number, other_invoice_number } = req.body;

  try {
    const docRef = fdb.collection('tickets').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Ticket not found" });
    const ticket = doc.data();
    
    const updateData: any = {
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by_user_id: req.user.sub
    };

    if (first_atbf !== undefined) updateData.first_atbf = first_atbf;
    if (first_invoice !== undefined) updateData.first_invoice = first_invoice;
    if (other_invoice !== undefined) updateData.other_invoice = other_invoice;
    if (attached_images !== undefined) updateData.attached_images = attached_images;
    if (first_invoice_number !== undefined) updateData.first_invoice_number = first_invoice_number;
    if (other_invoice_number !== undefined) updateData.other_invoice_number = other_invoice_number;

    if (checkTicketSizeLimit(ticket, updateData)) {
      return res.status(400).json({ error: "Attachments are too large. The combined size of all files on this ticket exceeds Firestore's 1MB limit. Please upload smaller or compressed PDFs/images." });
    }

    await docRef.update(updateData);

    await fdb.collection('activity_logs').doc(crypto.randomUUID()).set({
      ticket_id: id,
      user_id: req.user.sub,
      action: 'UPDATE_DOCUMENTS',
      new_values: `Updated document attachments and invoice numbers`,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error updating documents:", err);
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("too large") || msg.includes("limit") || msg.includes("size") || msg.includes("document_size") || msg.includes("exceeds")) {
      return res.status(400).json({ error: "Attachments are too large. The combined size of files exceeds Firestore's 1MB limit. Please upload smaller or compressed PDFs/images." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/scan-invoice", authenticateToken, async (req: any, res: any) => {
  const { fileData } = req.body;
  if (!fileData) {
    return res.status(400).json({ error: "No file data provided." });
  }

  try {
    const ai = getGeminiClient();

    // Extract mime type and raw base64
    const matches = fileData.match(/^data:([^;]+);base64,(.+)$/);
    let mimeType = "image/png";
    let base64Data = fileData;
    
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Data = matches[2];
    } else if (fileData.startsWith("data:")) {
      const parts = fileData.split(";base64,");
      if (parts.length === 2) {
        mimeType = parts[0].replace("data:", "");
        base64Data = parts[1];
      }
    }

    const docPart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    };

    const textPart = {
      text: `Analyze this invoice and extract only the invoice number. 
Return your output as a simple JSON object matching the following structure:
{
  "invoice_number": "the extracted invoice number"
}
If you cannot find an invoice number, look for terms like Invoice No, Invoice #, Inv No, Document Number, Reference, Bill No etc., and use that. If you really cannot find any appropriate invoice number, leave the field empty ("").
Do not include any explanation or markdown formatting blocks in your response. Just return the JSON object directly.`,
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [docPart, textPart] },
      config: {
        responseMimeType: "application/json",
      }
    });

    const resultText = response.text || "{}";
    try {
      const parsed = JSON.parse(resultText.trim());
      res.json({ success: true, invoice_number: parsed.invoice_number || "" });
    } catch (parseErr) {
      try {
        const cleaned = resultText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        res.json({ success: true, invoice_number: parsed.invoice_number || "" });
      } catch (innerParseErr) {
        // If the response is not valid JSON, search the response text with a regex as a fallback
        const match = resultText.match(/"invoice_number"\s*:\s*"([^"]+)"/);
        if (match && match[1]) {
          res.json({ success: true, invoice_number: match[1] });
        } else {
          res.json({ success: false, error: "Unable to parse invoice details. Please input the invoice number manually.", invoice_number: "" });
        }
      }
    }
  } catch (err: any) {
    console.error("Error scanning invoice with Gemini:", err);
    const errString = String(err?.message || JSON.stringify(err)).toLowerCase();
    let userMsg = "Failed to auto-scan invoice. Please key in the invoice number manually.";
    
    if (errString.includes("no pages") || errString.includes("has no pages")) {
      userMsg = "The uploaded PDF document has no readable pages or text. Please input the invoice number manually or select a high-contrast image scan instead.";
    } else if (errString.includes("invalid_argument") || errString.includes("400")) {
      userMsg = "The selected document is unsupported or corrupt. Please type the invoice number manually.";
    } else if (errString.includes("api_key") || errString.includes("api key") || errString.includes("auth")) {
      userMsg = "Gemini integration is temporarily misconfigured. Please check back later or fill the fields manually.";
    }
    
    res.json({ success: false, error: userMsg, invoice_number: "" });
  }
});

app.get("/api/tickets/:id/tasks", authenticateToken, async (req: any, res: any) => {
  try {
    const snap = await fdb.collection('ticket_tasks')
      .where('ticket_id', '==', req.params.id)
      .orderBy('created_at', 'desc')
      .get();
      
    const tasks = snap.docs.map(d => d.data());
    res.json(tasks);
  } catch (e: any) {
    res.status(500).json({ detail: "Error fetching tasks" });
  }
});

app.post("/api/tickets/:id/tasks", authenticateToken, async (req: any, res: any) => {
  const id = crypto.randomUUID();
  const t = req.body;
  try {
    const data = {
      ...t,
      id,
      ticket_id: req.params.id,
      created_by: req.user.sub,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      status: t.status || 'PENDING'
    };
    await fdb.collection('ticket_tasks').doc(id).set(data);
    res.json({ id, status: "created" });
  } catch (e: any) {
    res.status(500).json({ detail: "Error creating task" });
  }
});

app.put("/api/tasks/:taskId", authenticateToken, async (req: any, res: any) => {
  if (!['ADMIN1', 'AGENT', 'FINANCE', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ detail: "Unauthorized to modify tasks." });
  }
  const u = req.body;
  const updateData: any = {};
  
  if (u.status !== undefined) updateData.status = u.status;
  if (u.assigned_to_user_id !== undefined) updateData.assigned_to_user_id = u.assigned_to_user_id;
  if (u.assigned_to_role !== undefined) updateData.assigned_to_role = u.assigned_to_role;
  
  if (Object.keys(updateData).length === 0) return res.json({ status: "unchanged" });

  updateData.updated_at = admin.firestore.FieldValue.serverTimestamp();
  
  try {
    await fdb.collection('ticket_tasks').doc(req.params.taskId).update(updateData);
    res.json({ status: "updated" });
  } catch (e: any) {
    res.status(500).json({ detail: "Unable to complete request due to a database error. Please try again." });
  }
});

app.delete("/api/admin/reset-data", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: "Unauthorized. Only Admin can reset data." });
  }

  try {
    console.log('[Reset] Starting data clear...');
    const collections = ['tickets', 'activity_logs', 'ticket_tasks', 'bypass_passports', 'gdrive_logs', 'sharepoint_logs'];
    for (const col of collections) {
      console.log(`[Reset] Clearing collection: ${col}`);
      const snap = await fdb.collection(col).get();
      console.log(`[Reset] Found ${snap.docs.length} docs in ${col}`);
      for (const doc of snap.docs) {
        await fdb.collection(col).doc(doc.id).delete();
      }
    }
    console.log('[Reset] Data cleared successfully');
    res.json({ status: "success", message: "Data cleared" });
  } catch (err: any) {
    console.error("Error clearing data:", err);
    res.status(500).json({ detail: err.message });
  }
});

app.put("/api/tickets/:id/stage2", authenticateToken, async (req: any, res: any) => {
  if (!['ADMIN1', 'AGENT', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ detail: "Only Admin 1, Agent, or Admin roles can update flight status." });
  }
  
  try {
    const ticketDoc = await fdb.collection('tickets').doc(req.params.id).get();
    if (!ticketDoc.exists) return res.status(404).json({ detail: "Ticket not found" });
    const ticket = ticketDoc.data();
    
    if (!ticket?.stage1_completed) return res.status(403).json({ detail: "Admin 1 Entry (Stage 1) must be completed before Agent Update." });
    if (ticket?.stage3_completed && !['ADMIN', 'ADMIN1'].includes(req.user.role)) {
      return res.status(403).json({ detail: "This ticket is fully completed (Stage 3). Stage 2 cannot be edited." });
    }

    const u = req.body;
    const updateData: any = {
      ...u,
      stage2_completed: true,
      stage2_completed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: ticket?.stage3_completed ? (ticket.status || 'COMPLETED') : 'IN_PROGRESS',
      updated_by_user_id: req.user.sub,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    if (checkTicketSizeLimit(ticket, updateData)) {
      return res.status(400).json({ detail: "Attachments are too large. The combined size of all files exceeds Firestore's 1MB limit. Please upload smaller or compressed PDFs/images." });
    }

    await fdb.collection('tickets').doc(req.params.id).update(updateData);

    await fdb.collection('activity_logs').doc(crypto.randomUUID()).set({
      ticket_id: req.params.id,
      user_id: req.user.sub,
      action: "stage2_updated",
      new_values: `flight_status=${u.flight_status || ''}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ status: "updated", stage: 2 });
  } catch (err: any) {
    console.error("Error updating stage 2:", err);
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("too large") || msg.includes("limit") || msg.includes("size") || msg.includes("document_size") || msg.includes("exceeds")) {
      return res.status(400).json({ detail: "Attachments on this ticket are too large and exceed Firestore's 1MB limit. Please use smaller files." });
    }
    res.status(500).json({ detail: "Failed to update Stage 2 info: " + err.message });
  }
});

app.put("/api/tickets/:id/stage3", authenticateToken, async (req: any, res: any) => {
  if (!['FINANCE', 'ADMIN', 'ADMIN1'].includes(req.user.role)) {
    return res.status(403).json({ detail: "Only Finance, Admin 1, or Admin can update ERP entries." });
  }
  
  try {
    const doc = await fdb.collection('tickets').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ detail: "Ticket not found" });
    const ticket = doc.data();

    if (!ticket?.stage2_completed) return res.status(403).json({ detail: "Agent Update (Stage 2) must be completed before Entering ERP SYSTEM." });
    if (ticket?.stage3_completed) return res.status(403).json({ detail: "Stage 3 is already completed and locked." });

    const u = req.body;
    const isOther = (u.invoice_number && ticket?.other_invoice_number && String(u.invoice_number).trim() === String(ticket.other_invoice_number).trim());

    const updateData: any = {
      updated_by_user_id: req.user.sub,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    if (isOther) {
      updateData.other_po_number = u.po_number || '';
      updateData.other_project_pos = u.project_pos || {};
      updateData.other_po_date = u.po_date || '';
      updateData.other_invoice_date = u.invoice_date || '';
      updateData.other_invoice_amount = u.invoice_amount || '';
      updateData.other_po_status = u.po_status || '';
      updateData.other_po_remarks = u.po_remarks || '';
      if (u.po_status === 'payment done') {
        updateData.other_payment_date = u.payment_date || '';
        updateData.other_payment_invoice_numbers = u.payment_invoice_numbers || '';
        updateData.other_travel_agent = u.travel_agent || '';
      }
    } else {
      updateData.po_number = u.po_number || '';
      updateData.project_pos = u.project_pos || {};
      updateData.po_date = u.po_date || '';
      updateData.invoice_date = u.invoice_date || '';
      updateData.invoice_amount = u.invoice_amount || '';
      updateData.po_status = u.po_status || '';
      updateData.po_remarks = u.po_remarks || '';
      if (u.po_status === 'payment done') {
        updateData.payment_date = u.payment_date || '';
        updateData.payment_invoice_numbers = u.payment_invoice_numbers || '';
        updateData.travel_agent = u.travel_agent || '';
      }
    }

    const merged = { ...ticket, ...updateData };
    const firstInvoiceExists = !!merged.first_invoice_number;
    const otherInvoiceExists = !!merged.other_invoice_number;

    const firstDetailsEntered = !firstInvoiceExists || (
      merged.po_number && 
      merged.first_invoice_number && 
      merged.po_status && 
      merged.invoice_amount && 
      merged.po_date
    );

    const otherDetailsEntered = !otherInvoiceExists || (
      merged.other_po_number && 
      merged.other_invoice_number && 
      merged.other_po_status && 
      merged.other_invoice_amount && 
      merged.other_po_date
    );

    const allFinanceDetailsEntered = firstDetailsEntered && otherDetailsEntered;

    if (allFinanceDetailsEntered) {
      updateData.stage3_completed = true;
      updateData.stage3_completed_at = admin.firestore.FieldValue.serverTimestamp();
      updateData.status = 'COMPLETED';
    }

    if (checkTicketSizeLimit(ticket, updateData)) {
      return res.status(400).json({ detail: "Attachments are too large. The combined size of all files exceeds Firestore's 1MB limit. Please upload smaller or compressed PDFs/images." });
    }

    await fdb.collection('tickets').doc(req.params.id).update(updateData);

    await fdb.collection('activity_logs').doc(crypto.randomUUID()).set({
      ticket_id: req.params.id,
      user_id: req.user.sub,
      action: allFinanceDetailsEntered ? "stage3_completed" : "stage3_updated",
      new_values: `po_status=${u.po_status || ''}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ status: allFinanceDetailsEntered ? "completed" : "updated", stage: 3 });
  } catch (err: any) {
    console.error("Error updating stage 3:", err);
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("too large") || msg.includes("limit") || msg.includes("size") || msg.includes("document_size") || msg.includes("exceeds")) {
      return res.status(400).json({ detail: "Attachments on this ticket are too large and exceed Firestore's 1MB limit. Please use smaller files." });
    }
    res.status(500).json({ detail: "Failed to update Stage 3 info: " + err.message });
  }
});

app.put("/api/tickets/:id/payment-status", authenticateToken, async (req: any, res: any) => {
  try {
    const ticketDoc = await fdb.collection('tickets').doc(req.params.id).get();
    if (!ticketDoc.exists) return res.status(404).json({ detail: "The requested ticket could not be found." });
    const ticket = ticketDoc.data();
    if (!ticket?.stage3_completed) return res.status(403).json({ detail: "Entering ERP SYSTEM (Stage 3) must be completed before payment can be marked as done." });
    
    if (req.user.role !== 'ADMIN1' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ detail: "Only Admin 1 and ADMIN can update the payment status." });
    }

    const { po_status, payment_date, payment_invoice_numbers, travel_agent } = req.body;
    const updateData: any = { po_status };
    if (po_status === 'payment done') {
      updateData.payment_date = payment_date || new Date().toISOString().split('T')[0];
      if (payment_invoice_numbers) {
        updateData.payment_invoice_numbers = payment_invoice_numbers;
      }
      if (travel_agent) {
        updateData.travel_agent = travel_agent;
      }
    }

    // Collect all distinct invoice numbers from the current ticket
    const invoiceNumbers = Array.from(new Set([
      ticket.first_invoice_number,
      ticket.other_invoice_number,
      ticket.invoice_number
    ].map(s => String(s || '').trim()).filter(Boolean)));

    const targetTicketIds = new Set<string>([req.params.id]);

    if (invoiceNumbers.length > 0) {
      for (const inv of invoiceNumbers) {
        const snap1 = await fdb.collection('tickets').where('first_invoice_number', '==', inv).get();
        snap1.docs.forEach(d => {
          targetTicketIds.add(d.id);
        });
        const snap2 = await fdb.collection('tickets').where('other_invoice_number', '==', inv).get();
        snap2.docs.forEach(d => {
          targetTicketIds.add(d.id);
        });
        const snap3 = await fdb.collection('tickets').where('invoice_number', '==', inv).get();
        snap3.docs.forEach(d => {
          targetTicketIds.add(d.id);
        });
      }
    }

    for (const tid of targetTicketIds) {
      const tRef = fdb.collection('tickets').doc(tid);
      const tSnap = await tRef.get();
      if (tSnap.exists) {
        const tData = tSnap.data();
        if (checkTicketSizeLimit(tData, updateData)) {
          continue;
        }
        await tRef.update(updateData);

        await fdb.collection('activity_logs').doc(crypto.randomUUID()).set({
          id: crypto.randomUUID(),
          ticket_id: tid,
          user_id: req.user.sub,
          action: "payment_status_updated",
          new_values: `po_status=${po_status}, payment_date=${updateData.payment_date || ''}, payment_invoice_numbers=${payment_invoice_numbers || ''}, travel_agent=${travel_agent || ''}`,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    invalidateCache('tickets');

    res.json({ status: "updated", stage: 4, updated_count: targetTicketIds.size });
  } catch (error: any) {
    console.error("Error updating payment status:", error);
    const msg = (error?.message || "").toLowerCase();
    if (msg.includes("too large") || msg.includes("limit") || msg.includes("size") || msg.includes("document_size") || msg.includes("exceeds")) {
      return res.status(400).json({ detail: "Attachments on this ticket are too large and exceed Firestore's 1MB limit. Please use smaller files." });
    }
    res.status(500).json({ detail: "Failed to update payment status: " + error.message });
  }
});

app.put("/api/finance/bulk-po", authenticateToken, async (req: any, res: any) => {
  if (!['FINANCE', 'ADMIN', 'ADMIN1'].includes(req.user.role)) {
    return res.status(403).json({ detail: "Only Finance, Admin 1, or Admin can assign bulk PO numbers." });
  }

  const { invoice_number, po_number, project_pos, po_date, invoice_date, invoice_amount, invoice_amounts, po_status, po_remarks, payment_date, payment_invoice_numbers, travel_agent } = req.body;
  if (!invoice_number) {
    return res.status(400).json({ detail: "Invoice number reference is required." });
  }

  const normalizedInvoice = invoice_number ? String(invoice_number).trim() : "";

  try {
    const firstInvoiceSnap = await fdb.collection('tickets').where('first_invoice_number', '==', normalizedInvoice).get();
    const otherInvoiceSnap = await fdb.collection('tickets').where('other_invoice_number', '==', normalizedInvoice).get();

    const ticketIds: string[] = [];
    const updatePromises: Promise<any>[] = [];

    const addDocs = (snap: any) => {
      if (snap && snap.docs) {
        snap.docs.forEach((doc: any) => {
          if (!ticketIds.includes(doc.id)) {
            ticketIds.push(doc.id);
            const tRef = fdb.collection('tickets').doc(doc.id);
            const currentDocData = doc.data();
            
            const isOther = (currentDocData?.other_invoice_number === normalizedInvoice);
            
            const updatePayload: any = {
              updated_by_user_id: req.user.sub,
              updated_at: admin.firestore.FieldValue.serverTimestamp()
            };

            const todayStr = new Date().toISOString().split('T')[0];

            if (isOther) {
              updatePayload.other_po_number = po_number ? String(po_number).trim() : "";
              updatePayload.other_project_pos = project_pos || currentDocData?.other_project_pos || {};
              updatePayload.other_po_date = po_date || currentDocData?.other_po_date || todayStr;
              updatePayload.other_invoice_date = invoice_date || currentDocData?.other_invoice_date || todayStr;
              
              if (invoice_amounts && invoice_amounts[doc.id] !== undefined && invoice_amounts[doc.id] !== '') {
                updatePayload.other_invoice_amount = invoice_amounts[doc.id];
              } else if (invoice_amount !== undefined && invoice_amount !== '') {
                updatePayload.other_invoice_amount = invoice_amount;
              } else {
                const preEntered = currentDocData?.other_invoice_amount || currentDocData?.rescheduled_ticket_amount || currentDocData?.approved_rate || currentDocData?.price || "";
                if (preEntered) {
                  updatePayload.other_invoice_amount = String(preEntered);
                }
              }
              
              updatePayload.other_po_status = po_status || currentDocData?.other_po_status || "pending po approval";
              if (po_remarks !== undefined) updatePayload.other_po_remarks = po_remarks;
              updatePayload.other_invoice_number = normalizedInvoice;

              if (po_status === 'payment done') {
                updatePayload.other_payment_date = payment_date || todayStr;
                if (payment_invoice_numbers) {
                  updatePayload.other_payment_invoice_numbers = payment_invoice_numbers;
                }
                if (travel_agent) {
                  updatePayload.other_travel_agent = travel_agent;
                }
              }
            } else {
              updatePayload.po_number = po_number ? String(po_number).trim() : "";
              updatePayload.project_pos = project_pos || currentDocData?.project_pos || {};
              updatePayload.po_date = po_date || currentDocData?.po_date || todayStr;
              updatePayload.invoice_date = invoice_date || currentDocData?.invoice_date || todayStr;
              
              if (invoice_amounts && invoice_amounts[doc.id] !== undefined && invoice_amounts[doc.id] !== '') {
                updatePayload.invoice_amount = invoice_amounts[doc.id];
              } else if (invoice_amount !== undefined && invoice_amount !== '') {
                updatePayload.invoice_amount = invoice_amount;
              } else {
                const preEntered = currentDocData?.invoice_amount || currentDocData?.approved_rate || currentDocData?.price || "";
                if (preEntered) {
                  updatePayload.invoice_amount = String(preEntered);
                }
              }
              
              updatePayload.po_status = po_status || currentDocData?.po_status || "pending po approval";
              if (po_remarks !== undefined) updatePayload.po_remarks = po_remarks;
              updatePayload.invoice_number = normalizedInvoice;

              if (po_status === 'payment done') {
                updatePayload.payment_date = payment_date || todayStr;
                if (payment_invoice_numbers) {
                  updatePayload.payment_invoice_numbers = payment_invoice_numbers;
                }
                if (travel_agent) {
                  updatePayload.travel_agent = travel_agent;
                }
              }
            }

            const mergedTicket = { ...currentDocData, ...updatePayload };
            const firstInvoiceExists = !!mergedTicket.first_invoice_number;
            const otherInvoiceExists = !!mergedTicket.other_invoice_number;

            const firstDetailsEntered = !firstInvoiceExists || (
              mergedTicket.po_number && 
              mergedTicket.first_invoice_number && 
              mergedTicket.po_status && 
              mergedTicket.invoice_amount && 
              mergedTicket.po_date
            );

            const otherDetailsEntered = !otherInvoiceExists || (
              mergedTicket.other_po_number && 
              mergedTicket.other_invoice_number && 
              mergedTicket.other_po_status && 
              mergedTicket.other_invoice_amount && 
              mergedTicket.other_po_date
            );

            const allFinanceDetailsEntered = firstDetailsEntered && otherDetailsEntered;

            if (allFinanceDetailsEntered && currentDocData?.stage2_completed) {
              updatePayload.stage3_completed = true;
              updatePayload.stage3_completed_at = admin.firestore.FieldValue.serverTimestamp();
              updatePayload.status = 'COMPLETED';
            }

            updatePromises.push(tRef.update(updatePayload));
          }
        });
      }
    };

    addDocs(firstInvoiceSnap);
    addDocs(otherInvoiceSnap);

    if (ticketIds.length === 0) {
      return res.status(404).json({ detail: `No tickets found associated with invoice reference '${normalizedInvoice}'.` });
    }

    await Promise.all(updatePromises);

    for (const tid of ticketIds) {
      await fdb.collection('activity_logs').doc(crypto.randomUUID()).set({
        ticket_id: tid,
        user_id: req.user.sub,
        action: "bulk_po_assigned",
        new_values: `po_number=${po_number || ''}`,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ status: "success", updated_count: ticketIds.length });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ detail: "An error occurred while updating bulk PO status." });
  }
});

// Dashboard Endpoints
app.get("/api/dashboard/metrics", authenticateToken, async (req: any, res: any) => {
  try {
    const snap = await fdb.collection('tickets').get();
    const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = tickets.length;
    const processed = tickets.filter(t => t.stage3_completed).length;
    const no_show = tickets.filter(t => t.flight_status === 'NO_SHOW').length;
    
    let update_required = 0;
    const now = new Date().toISOString().split('T')[0];
    if (req.user.role === 'FINANCE') {
      const invoiceGroups: {
        [invoiceNo: string]: {
          invoice_number: string;
          po_number: string;
          tickets: any[];
        };
      } = {};

      tickets.forEach(ticket => {
        if (ticket.first_invoice_number && ticket.first_invoice_number.trim()) {
          const invNo = ticket.first_invoice_number.trim();
          if (!invoiceGroups[invNo]) {
            invoiceGroups[invNo] = {
              invoice_number: invNo,
              po_number: ticket.po_number || '',
              tickets: []
            };
          }
          if (!invoiceGroups[invNo].tickets.some((t: any) => t.id === ticket.id && t.invoice_type === 'first')) {
            invoiceGroups[invNo].tickets.push({
              ...ticket,
              invoice_type: 'first'
            });
          }
        }

        if (ticket.other_invoice_number && ticket.other_invoice_number.trim()) {
          const invNo = ticket.other_invoice_number.trim();
          if (!invoiceGroups[invNo]) {
            invoiceGroups[invNo] = {
              invoice_number: invNo,
              po_number: ticket.other_po_number || '',
              tickets: []
            };
          }
          if (!invoiceGroups[invNo].tickets.some((t: any) => t.id === ticket.id && t.invoice_type === 'other')) {
            invoiceGroups[invNo].tickets.push({
              ...ticket,
              invoice_type: 'other'
            });
          }
        }
      });

      const pendingTicketIds = new Set<string>();
      Object.values(invoiceGroups).forEach(group => {
        const subTickets = group.tickets || [];
        const activeAllocationUnits: { id: string; type: 'project' | 'company' }[] = [];

        const activePids = Array.from(
          new Set(
            subTickets
              .filter((t: any) => {
                const isProj = t.invoice_type === 'other'
                  ? (!t.rescheduled_cost_allocation || t.rescheduled_cost_allocation === 'project')
                  : (!t.cost_allocation || t.cost_allocation === 'project');
                return isProj;
              })
              .flatMap((t: any) => {
                if (Array.isArray(t.project_ids) && t.project_ids.length > 0) {
                  return t.project_ids;
                }
                return t.project_id ? [t.project_id] : [];
              })
              .filter(Boolean)
          )
        ) as string[];

        const activeCompanies = Array.from(
          new Set(
            subTickets
              .filter((t: any) => {
                const isComp = t.invoice_type === 'other'
                  ? t.rescheduled_cost_allocation === 'company'
                  : t.cost_allocation === 'company';
                return isComp;
              })
              .map((t: any) => t.company || 'Sanken Overseas')
              .filter(Boolean)
          )
        ) as string[];

        activePids.forEach((pid: string) => {
          activeAllocationUnits.push({ id: pid, type: 'project' });
        });

        activeCompanies.forEach((comp: string) => {
          activeAllocationUnits.push({ id: comp, type: 'company' });
        });

        const groupExistingProjectPos: Record<string, string> = {};
        subTickets.forEach((t: any) => {
          const pos = t.invoice_type === 'other' ? t.other_project_pos : t.project_pos;
          if (pos && typeof pos === 'object') {
            Object.assign(groupExistingProjectPos, pos);
          }
        });

        const hasAllPOsAssigned = activeAllocationUnits.length > 0
          ? activeAllocationUnits.every(unit => {
              const po = groupExistingProjectPos[unit.id];
              return po && po.trim() !== '';
            })
          : (group.po_number && group.po_number.trim() !== '');

        if (!hasAllPOsAssigned) {
          subTickets.forEach((t: any) => {
            if (t.id) {
              pendingTicketIds.add(String(t.id));
            }
          });
        }
      });

      update_required = pendingTicketIds.size;
    } else {
      update_required = tickets.filter(t => 
        ((!t.flight_status || t.flight_status === 'PENDING') && t.departure_date && t.departure_date < now) ||
        (['NO_SHOW', 'RESCHEDULED', 'CANCELLED'].includes(t.flight_status) && (!t.rescheduled_flight_status || t.rescheduled_flight_status === 'PENDING') && t.rescheduled_departure_date && t.rescheduled_departure_date < now)
      ).length;
    }
    
    let total_paid = 0;
    let total_pending = 0;
    tickets.forEach(t => {
      const amt1 = Number(t.invoice_amount) || 0;
      const amt2 = Number(t.rescheduled_ticket_amount) || 0;
      if (t.po_status === 'payment done') {
        total_paid += amt1 + amt2;
      } else if (t.po_status === 'pending po approval') {
        total_pending += amt1 + amt2;
      }
    });
    
    res.json({
      total_tickets: total,
      processed_tickets: processed,
      no_show_count: no_show,
      update_required_count: update_required,
      total_cost: total_paid,
      total_pending: total_pending,
      stage_breakdown: {
        stage1: tickets.filter(t => !t.stage1_completed).length,
        stage2: tickets.filter(t => !t.stage2_completed).length,
        stage3: tickets.filter(t => !t.stage3_completed).length,
      }
    });
  } catch (e: any) {
    console.error("Error fetching metrics:", e);
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error fetching metrics" });
  }
});

app.get("/api/dashboard/flight-status", authenticateToken, async (req, res) => {
  try {
    const snap = await fdb.collection('tickets').get();
    const result: any = {};
    snap.docs.forEach(doc => {
      const s = doc.data().flight_status || "Unknown";
      result[s] = (result[s] || 0) + 1;
    });
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching flight status:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error fetching flight status" });
  }
});

app.get("/api/dashboard/project-costs", authenticateToken, async (req, res) => {
  try {
    const pSnap = await fdb.collection('projects').get();
    const tSnap = await fdb.collection('tickets').get();
    const tickets = tSnap.docs.map(d => d.data());
    
    const projects = pSnap.docs.map(doc => {
      const p = doc.data();
      const pTickets = tickets.filter(t => t.project_id === p.id);
      
      let spent = 0;
      let pending = 0;

      pTickets.forEach(t => {
        // First attempt (Project)
        const isFirstProject = t.cost_allocation !== 'company';
        if (isFirstProject) {
          const amt = Number(t.invoice_amount) || 0;
          if (t.po_status === 'payment done') {
            spent += amt;
          } else if (t.po_status === 'pending po approval') {
            pending += amt;
          }
        }

        // Rescheduled attempt (Project)
        if (t.rescheduled_ticket_amount) {
          const isRescheduledProject = t.rescheduled_cost_allocation !== 'company';
          if (isRescheduledProject) {
            const amt = Number(t.rescheduled_ticket_amount) || 0;
            if (t.po_status === 'payment done') {
              spent += amt;
            } else if (t.po_status === 'pending po approval') {
              pending += amt;
            }
          }
        }
      });

      return {
        name: p.name,
        budget: p.budget_allocated || p.budget || 0,
        spent,
        pending
      };
    });

    // Calculate company spent and pending costs for tickets allocated to 'company'
    const companyMap: { [name: string]: { spent: number; pending: number } } = {};
    tickets.forEach(t => {
      // First attempt (Corporate)
      if (t.cost_allocation === 'company') {
        const comp = (t.company || 'Sanken Overseas').trim();
        if (!companyMap[comp]) {
          companyMap[comp] = { spent: 0, pending: 0 };
        }
        const amt = Number(t.invoice_amount) || 0;
        if (t.po_status === 'payment done') {
          companyMap[comp].spent += amt;
        } else if (t.po_status === 'pending po approval') {
          companyMap[comp].pending += amt;
        }
      }

      // Rescheduled attempt (Corporate)
      if (t.rescheduled_cost_allocation === 'company' && t.rescheduled_ticket_amount) {
        const comp = (t.company || 'Sanken Overseas').trim();
        if (!companyMap[comp]) {
          companyMap[comp] = { spent: 0, pending: 0 };
        }
        const amt = Number(t.rescheduled_ticket_amount) || 0;
        if (t.po_status === 'payment done') {
          companyMap[comp].spent += amt;
        } else if (t.po_status === 'pending po approval') {
          companyMap[comp].pending += amt;
        }
      }
    });

    const companies = Object.keys(companyMap).map(name => ({
      name,
      spent: companyMap[name].spent,
      pending: companyMap[name].pending
    }));

    res.json({ projects, companies });
  } catch (error: any) {
    console.error("Error fetching project costs:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error fetching project costs" });
  }
});


app.get("/api/users", authenticateToken, async (req: any, res: any) => {
  try {
    const snap = await fdb.collection('users').where('is_active', '==', true).get();
    res.json(snap.docs.map(d => {
      const u = d.data();
      delete u.password_hash;
      return u;
    }));
  } catch (error: any) {
    console.error("Error fetching users:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error fetching users" });
  }
});

app.post("/api/users", authenticateToken, async (req: any, res: any) => {
  if (req.user.role === 'ADMIN1') {
    const admin_email_header = req.headers['x-admin-email'];
    const admin_password_header = req.headers['x-admin-password'];
    
    const admin_email_raw = admin_email_header ? decodeURIComponent(admin_email_header) : (req.body?.admin_email || "");
    const admin_password_raw = admin_password_header ? decodeURIComponent(admin_password_header) : (req.body?.admin_password || "");

    const admin_email = (admin_email_raw || "").trim();
    const admin_password = (admin_password_raw || "").trim();

    if (!admin_email || !admin_password) {
      return res.status(400).json({ detail: "Admin credentials (email and password) are required for Admin 1 to authorize user addition." });
    }
    try {
      const emailLower = admin_email.toLowerCase();
      const adminUserSnap = await fdb.collection('users').where('email', '==', emailLower).limit(1).get();
      if (adminUserSnap.empty) {
        return res.status(401).json({ detail: "Invalid Admin credentials. User not found with this email." });
      }
      const adminUserData = adminUserSnap.docs[0].data();
      if (adminUserData.role !== 'ADMIN') {
        return res.status(403).json({ detail: "Unauthorized: The provided credentials do not belong to a Master Admin." });
      }
      const isMatch = bcrypt.compareSync(admin_password, adminUserData.password_hash);
      if (!isMatch) {
         return res.status(401).json({ detail: "Invalid Admin password." });
      }
    } catch (authErr: any) {
      console.error("Authorization check failed:", authErr);
      return res.status(500).json({ detail: "Internal authorization check failed." });
    }
  } else if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: "Admin only" });
  }

  try {
    const { email, full_name, password, role } = req.body;
    const emailLower = (email || "").toLowerCase().trim();
    if (!emailLower) {
      return res.status(400).json({ detail: "Email is required" });
    }

    const existingSnap = await fdb.collection('users').where('email', '==', emailLower).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ detail: `A user with the email "${emailLower}" already exists.` });
    }

    const id = crypto.randomUUID();
    const hash = bcrypt.hashSync(password, 10);
    await fdb.collection('users').doc(id).set({
      id, email: emailLower, full_name, role, password_hash: hash, is_active: true
    });
    invalidateCache('users');
    res.json({ id, status: "created" });
  } catch (error: any) {
    console.error("Error creating user:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error creating user" });
  }
});

app.delete("/api/users/:id", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: "Only Admin can delete/deactivate users." });
  }

  try {
    await fdb.collection('users').doc(req.params.id).update({ is_active: false });
    invalidateCache('users');
    res.json({ status: "deleted" });
  } catch (error: any) {
    console.error("Error deleting user:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error deleting user" });
  }
});

app.get("/api/options", authenticateToken, async (req: any, res: any) => {
  try {
    const snap = await fdb.collection('options').get();
    const rawOptions = snap.docs.map(d => d.data());
    
    // Self-healing: identify and remove duplicate options in Firestore database
    const uniqueMap = new Map<string, any>();
    const toDelete: string[] = [];
    const uniqueOptions: any[] = [];
    
    for (const opt of rawOptions) {
      const cat = (opt.category || '').trim();
      const val = (opt.value || '').trim().toLowerCase();
      const key = `${cat}:::${val}`;
      
      if (uniqueMap.has(key)) {
        if (opt.id) {
          toDelete.push(opt.id);
        }
      } else {
        uniqueMap.set(key, opt);
        uniqueOptions.push(opt);
      }
    }
    
    if (toDelete.length > 0) {
      console.log(`Self-healing: Found ${toDelete.length} duplicate options. Deleting duplicates from Firestore...`);
      const deletePromises = toDelete.map(id => 
        fdb.collection('options').doc(id).delete()
          .catch(err => console.error(`Error deleting duplicate option ${id}:`, err))
      );
      await Promise.all(deletePromises);
    }

    uniqueOptions.sort((a: any, b: any) => {
      const catComp = String(a.category || '').localeCompare(String(b.category || ''));
      if (catComp !== 0) return catComp;
      return String(a.value || '').localeCompare(String(b.value || ''));
    });
    res.json(uniqueOptions);
  } catch (error: any) {
    console.error("Error fetching options:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error fetching options" });
  }
});

app.post("/api/options", authenticateToken, async (req: any, res: any) => {
  try {
    const { category, value } = req.body;
    if (!category || !value || !value.trim()) {
      return res.status(400).json({ detail: "Category and value are required" });
    }
    const cleanValue = value.trim();
    
    // Check if duplicate already exists under the same category
    const snap = await fdb.collection('options')
      .where('category', '==', category)
      .get();
      
    const duplicate = snap.docs.find(d => {
      const dData = d.data();
      return dData && dData.value && String(dData.value).trim().toLowerCase() === cleanValue.toLowerCase();
    });
    
    if (duplicate) {
      return res.status(400).json({ detail: `This option already exists under the category.` });
    }

    const id = crypto.randomUUID();
    await fdb.collection('options').doc(id).set({ category, value: cleanValue, id });
    res.json({ id, status: "created" });
  } catch (error: any) {
    console.error("Error creating option:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error creating option" });
  }
});

app.put("/api/options/:id", authenticateToken, async (req: any, res: any) => {
  try {
    const { category, value } = req.body;
    if (category && value) {
      const cleanValue = value.trim();
      const snap = await fdb.collection('options')
        .where('category', '==', category)
        .get();
        
      const duplicate = snap.docs.find(d => {
        const dData = d.data();
        return d.id !== req.params.id && dData && dData.value && String(dData.value).trim().toLowerCase() === cleanValue.toLowerCase();
      });
      
      if (duplicate) {
        return res.status(400).json({ detail: `This option already exists under the category.` });
      }
      req.body.value = cleanValue;
    }
    await fdb.collection('options').doc(req.params.id).update(req.body);
    res.json({ status: "updated" });
  } catch (error: any) {
    console.error("Error updating option:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error updating option" });
  }
});

app.delete("/api/options/:id", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: "Only Admin can delete options." });
  }
  try {
    await fdb.collection('options').doc(req.params.id).delete();
    res.json({ status: "deleted" });
  } catch (error: any) {
    console.error("Error deleting option:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error deleting option" });
  }
});

app.get("/api/projects", authenticateToken, async (req: any, res: any) => {
  try {
    const snap = await fdb.collection('projects').get();
    const projects = snap.docs.map(d => d.data());
    projects.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
    res.json(projects);
  } catch (error: any) {
    console.error("Error fetching projects:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error fetching projects" });
  }
});

app.post("/api/projects", authenticateToken, async (req: any, res: any) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ detail: "Project name is required" });
    }
    const snap = await fdb.collection('projects').get();
    const duplicate = snap.docs.find(d => {
      const dName = (d.data().name || "").trim().toLowerCase();
      return dName === name.toLowerCase();
    });
    if (duplicate) {
      return res.status(400).json({ detail: `A project with the name "${name}" already exists.` });
    }

    const id = "PROJ-" + crypto.randomUUID();
    await fdb.collection('projects').doc(id).set({ ...req.body, name, id });
    invalidateCache();
    res.json({ id, ...req.body, name });
  } catch (error: any) {
    console.error("Error creating project:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error creating project" });
  }
});

app.put("/api/projects/:id", authenticateToken, async (req: any, res: any) => {
  try {
    const id = req.params.id;
    const name = (req.body.name || "").trim();
    if (name) {
      const snap = await fdb.collection('projects').get();
      const duplicate = snap.docs.find(d => {
        const dId = d.id;
        const dName = (d.data().name || "").trim().toLowerCase();
        return dId !== id && dName === name.toLowerCase();
      });
      if (duplicate) {
        return res.status(400).json({ detail: `A project with the name "${name}" already exists.` });
      }
    }
    await fdb.collection('projects').doc(id).update(req.body);
    invalidateCache();
    res.json({ id: req.params.id, ...req.body });
  } catch (error: any) {
    console.error("Error updating project:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error updating project" });
  }
});

app.delete("/api/projects/:id", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: "Only Admin can delete projects." });
  }
  try {
    await fdb.collection('projects').doc(req.params.id).delete();
    invalidateCache();
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting project:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded. The free tier quota has been reached." });
    }
    res.status(500).json({ detail: "Error deleting project" });
  }
});

// Bypass Passports Endpoints
app.get("/api/bypass-passports", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Only Admin or Admin 1 can read bypass list" });
  }
  try {
    const snap = await fdb.collection('bypass_passports').get();
    res.json(snap.docs.map(d => d.data()));
  } catch (error: any) {
    console.error("Error fetching bypass passports:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded." });
    }
    res.status(500).json({ detail: "Error fetching bypass passports" });
  }
});

app.post("/api/bypass-passports", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Only Admin or Admin 1 can modify bypass list" });
  }
  const { pp_number, name } = req.body;
  if (!pp_number || !pp_number.trim() || !name || !name.trim()) {
    return res.status(400).json({ detail: "Passport Number and Name are required." });
  }
  const ppNormalized = pp_number.trim().toUpperCase();
  try {
    const existing = await fdb.collection('bypass_passports').doc(ppNormalized).get();
    if (existing.exists) {
      return res.status(400).json({ detail: `Passport Number '${ppNormalized}' is already in the bypass list.` });
    }
    const id = ppNormalized;
    const data = {
      id,
      pp_number: ppNormalized,
      name: name.trim(),
      created_by_user_id: req.user.sub,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    await fdb.collection('bypass_passports').doc(id).set(data);
    res.json(data);
  } catch (error: any) {
    console.error("Error adding bypass passport:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded." });
    }
    res.status(500).json({ detail: "Error adding bypass passport" });
  }
});

app.delete("/api/bypass-passports/:id", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: "Only Admin can modify bypass list" });
  }
  try {
    const id = req.params.id.trim().toUpperCase();
    await fdb.collection('bypass_passports').doc(id).delete();
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting bypass passport:", error);
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted") || msg.includes("billing")) {
      return res.status(403).json({ detail: "Database Quota Exceeded." });
    }
    res.status(500).json({ detail: "Error deleting bypass passport" });
  }
});


// ==========================================
// SHAREPOINT INTEGRATION & AUTOMATION
// ==========================================

function parseSharePointUrl(siteUrl: string) {
  let urlClean = siteUrl.trim();
  if (!urlClean.startsWith("http://") && !urlClean.startsWith("https://")) {
    urlClean = "https://" + urlClean;
  }
  try {
    const parsed = new URL(urlClean);
    const hostname = parsed.hostname;
    let sitePath = parsed.pathname.replace(/^\/|\/$/g, "");
    if (sitePath) {
      if (!sitePath.startsWith("sites/")) {
        sitePath = "sites/" + sitePath;
      }
    }
    return { hostname, sitePath };
  } catch (e) {
    // Fallback if URL parsing fails
    return { hostname: siteUrl, sitePath: "" };
  }
}

async function getGraphAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");

  const response = await axios.post(tokenUrl, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    timeout: 10000
  });

  if (!response.data || !response.data.access_token) {
    throw new Error("Failed to retrieve Access Token from Microsoft identity provider.");
  }

  return response.data.access_token;
}

async function getSharePointSiteId(accessToken: string, hostname: string, sitePath: string): Promise<string> {
  let url = `https://graph.microsoft.com/v1.0/sites/${hostname}`;
  if (sitePath) {
    url = `https://graph.microsoft.com/v1.0/sites/${hostname}:/${sitePath}`;
  } else {
    url = `https://graph.microsoft.com/v1.0/sites/${hostname}:/`;
  }

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    timeout: 10000
  });

  if (!response.data || !response.data.id) {
    throw new Error("SharePoint Site could not be resolved from URL.");
  }

  return response.data.id;
}

async function uploadFileToSharePoint(
  accessToken: string,
  siteId: string,
  folderPath: string,
  fileName: string,
  content: string
): Promise<any> {
  const pathClean = folderPath.trim().replace(/^\/|\/$/g, "");
  let url = "";
  if (pathClean) {
    const encodedPath = pathClean.split("/").map(seg => encodeURIComponent(seg)).join("/");
    url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}/${encodeURIComponent(fileName)}:/content`;
  } else {
    url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURIComponent(fileName)}:/content`;
  }

  const response = await axios.put(url, content, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "text/csv; charset=utf-8"
    },
    timeout: 15000
  });

  return response.data;
}

function generateAirTicketSummaryCSVContent(tickets: any[], allProjects: any[]): string {
  const rows: string[] = [];
  rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
  rows.push(", Sanken Overseas (Pvt) Ltd,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
  rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
  rows.push(", F-ADM-002-ATSS  I  Revision No : 00  |  Issued Date: 31/12/2022,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
  rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
  rows.push(",Air Ticket Summary Sheet,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
  rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
  rows.push(`,Project,ALL,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,`);
  rows.push(`,Project Country,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,`);
  rows.push(`,Project Company,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,`);
  rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
  rows.push(",Item,PP number,Passenger Name,Job Category as per visa,Ticket Type (Economy/ Business),Ticket Arranged Date,Departure date,Arrival Date        (if return ticket is arranged),Company,Project,Travel agent,Route,Currency, Approved rate ,PO Number,Invoice Number,Invoice Amount without Tax,Payment Released Date,,,,,,,,,,,,,,,,,,,,,,,");

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}.${month}.${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  tickets.forEach((t, i) => {
    const proj = allProjects.find(p => p.id === t.project_id);
    const projName = proj ? proj.name : t.project_id;

    const row = [
      "", 
      i + 1,
      t.pp_number || '',
      t.passenger_name || '',
      t.job_category || '',
      t.ticket_type || '',
      formatDate(t.ticket_arranged_date),
      formatDate(t.departure_date),
      t.arrival_date ? formatDate(t.arrival_date) : 'N/A',
      t.company || '',
      projName || '',
      t.travel_agent || '',
      t.route || '',
      t.currency || '',
      t.approved_rate ? Number(t.approved_rate).toFixed(2) : '',
      t.po_number || '',
      t.invoice_number || '',
      t.invoice_amount ? Number(t.invoice_amount).toFixed(2) : '',
      formatDate(t.stage3_completed_at)
    ];
    
    const csvRow = row.map(cell => {
       const cellStr = String(cell);
       if (cellStr.includes(',') || cellStr.includes('\"')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
       }
       return cellStr;
    }).join(',');

    rows.push(csvRow + ",,,,,,,,,,,,,,,,,,,,,,,");
  });
  
  return rows.join("\n");
}

async function performGoogleDriveSync(config: any, triggerType: "auto" | "manual"): Promise<any> {
  const { accessToken, folderName } = config;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const fileName = `Air_Ticket_Summary_${yyyy}-${mm}-${dd}.csv`;

  try {
    if (!accessToken) {
      throw new Error("Missing Google Drive Access Token. Please link your Google Account in Settings.");
    }

    // 1. Resolve or Create Folder ID if folderName is provided
    let folderId = "";
    if (folderName && folderName.trim()) {
      const trimmedFolder = folderName.trim();
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and name='${encodeURIComponent(trimmedFolder)}' and trashed=false&fields=files(id)`;
      
      const searchRes = await axios.get(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (searchRes.data?.files && searchRes.data.files.length > 0) {
        folderId = searchRes.data.files[0].id;
      } else {
        // Create folder
        const createRes = await axios.post("https://www.googleapis.com/drive/v3/files", {
          name: trimmedFolder,
          mimeType: "application/vnd.google-apps.folder"
        }, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        });
        folderId = createRes.data?.id || "";
      }
    }

    // 2. Fetch tickets and projects
    const ticketSnap = await fdb.collection('tickets').get();
    const tickets = ticketSnap.docs.map(doc => doc.data());
    
    const projSnap = await fdb.collection('projects').get();
    const projects = projSnap.docs.map(doc => doc.data());

    // 3. Generate CSV
    const csvContent = generateAirTicketSummaryCSVContent(tickets, projects);

    // 4. Multi-part upload
    const metadata = {
      name: fileName,
      mimeType: "text/csv",
      parents: folderId ? [folderId] : undefined
    };

    const boundary = "boundary_sanken_air";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody = 
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/csv\r\n\r\n' +
      csvContent +
      closeDelimiter;

    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    const uploadRes = await axios.post(uploadUrl, multipartBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      }
    });

    const fileId = uploadRes.data?.id;

    // 5. Log success
    const logId = crypto.randomUUID();
    const logData = {
      id: logId,
      timestamp: new Date().toISOString(),
      status: "success",
      filename: fileName,
      triggerType: triggerType,
      webUrl: fileId ? `https://drive.google.com/file/d/${fileId}/view` : "https://drive.google.com",
      error: ""
    };
    await fdb.collection('gdrive_logs').doc(logId).set(logData);

    return logData;
  } catch (error: any) {
    const errorMsg = error?.response?.data?.error?.message || error?.message || String(error);
    console.error("Google Drive sync failed:", errorMsg);

    // Log failure
    const logId = crypto.randomUUID();
    const logData = {
      id: logId,
      timestamp: new Date().toISOString(),
      status: "failed",
      filename: fileName,
      triggerType: triggerType,
      webUrl: "",
      error: errorMsg
    };
    await fdb.collection('gdrive_logs').doc(logId).set(logData);

    throw new Error(errorMsg);
  }
}

async function performGoogleDriveDbBackup(config: any, triggerType: "auto" | "manual", userEmail: string): Promise<any> {
  const { accessToken, folderName } = config;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const hh = String(today.getHours()).padStart(2, '0');
  const min = String(today.getMinutes()).padStart(2, '0');
  const ss = String(today.getSeconds()).padStart(2, '0');
  const fileName = `sanken_air_db_backup_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.json`;

  try {
    if (!accessToken) {
      throw new Error("Missing Google Drive Access Token. Please link your Google Account in Settings.");
    }

    // 1. Resolve or Create Folder ID if folderName is provided
    let folderId = "";
    if (folderName && folderName.trim()) {
      const trimmedFolder = folderName.trim();
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and name='${encodeURIComponent(trimmedFolder)}' and trashed=false&fields=files(id)`;
      
      const searchRes = await axios.get(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (searchRes.data?.files && searchRes.data.files.length > 0) {
        folderId = searchRes.data.files[0].id;
      } else {
        // Create folder
        const createRes = await axios.post("https://www.googleapis.com/drive/v3/files", {
          name: trimmedFolder,
          mimeType: "application/vnd.google-apps.folder"
        }, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        });
        folderId = createRes.data?.id || "";
      }
    }

    // 2. Fetch all collections
    const collectionsToBackup = [
      'users',
      'tickets',
      'projects',
      'ticket_tasks',
      'options',
      'activity_logs',
      'bypass_passports',
      'sharepoint',
      'sharepoint_logs',
      'gdrive',
      'gdrive_logs',
      'gdrive_backup_logs'
    ];

    const backupData: Record<string, any[]> = {};

    for (const col of collectionsToBackup) {
      try {
        const snap = await fdb.collection(col).get();
        if (snap && snap.docs) {
          backupData[col] = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        } else {
          backupData[col] = [];
        }
      } catch (colError: any) {
        console.error(`[GDrive Backup] Failed to backup collection ${col}:`, colError);
        backupData[col] = [];
      }
    }

    const payload = {
      metadata: {
        exported_at: new Date().toISOString(),
        exported_by: userEmail || 'admin',
        database_id: firestoreDatabaseId || 'default',
        project_id: projectId || 'unknown'
      },
      data: backupData
    };

    const jsonContent = JSON.stringify(payload, null, 2);

    // 3. Multi-part upload
    const metadata = {
      name: fileName,
      mimeType: "application/json",
      parents: folderId ? [folderId] : undefined
    };

    const boundary = "boundary_sanken_air_backup";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody = 
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      jsonContent +
      closeDelimiter;

    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    const uploadRes = await axios.post(uploadUrl, multipartBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      }
    });

    const fileId = uploadRes.data?.id;

    // 4. Log success
    const logId = crypto.randomUUID();
    const logData = {
      id: logId,
      timestamp: new Date().toISOString(),
      status: "success",
      filename: fileName,
      triggerType: triggerType,
      webUrl: fileId ? `https://drive.google.com/file/d/${fileId}/view` : "https://drive.google.com",
      error: ""
    };
    await fdb.collection('gdrive_backup_logs').doc(logId).set(logData);

    return logData;
  } catch (error: any) {
    const errorMsg = error?.response?.data?.error?.message || error?.message || String(error);
    console.error("Google Drive database backup failed:", errorMsg);

    // Log failure
    const logId = crypto.randomUUID();
    const logData = {
      id: logId,
      timestamp: new Date().toISOString(),
      status: "failed",
      filename: fileName,
      triggerType: triggerType,
      webUrl: "",
      error: errorMsg
    };
    await fdb.collection('gdrive_backup_logs').doc(logId).set(logData);

    throw new Error(errorMsg);
  }
}

async function performSharePointSync(config: any, triggerType: "auto" | "manual"): Promise<any> {
  const { tenantId, clientId, clientSecret, siteUrl, folderPath } = config;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const fileName = `Air_Ticket_Summary_${yyyy}-${mm}-${dd}.csv`;

  try {
    if (!tenantId || !clientId || !clientSecret || !siteUrl) {
      throw new Error("Missing required SharePoint configuration (Tenant ID, Client ID, Client Secret, or Site URL).");
    }

    const { hostname, sitePath } = parseSharePointUrl(siteUrl);
    
    // 1. Get access token
    const token = await getGraphAccessToken(tenantId, clientId, clientSecret);
    
    // 2. Resolve Site ID
    const siteId = await getSharePointSiteId(token, hostname, sitePath);

    // 3. Fetch tickets and projects
    const ticketSnap = await fdb.collection('tickets').get();
    const tickets = ticketSnap.docs.map(doc => doc.data());
    
    const projSnap = await fdb.collection('projects').get();
    const projects = projSnap.docs.map(doc => doc.data());

    // 4. Generate CSV
    const csvContent = generateAirTicketSummaryCSVContent(tickets, projects);

    // 5. Upload to SharePoint
    const uploadResult = await uploadFileToSharePoint(token, siteId, folderPath || "", fileName, csvContent);

    // 6. Log success
    const logId = crypto.randomUUID();
    const logData = {
      id: logId,
      timestamp: new Date().toISOString(),
      status: "success",
      filename: fileName,
      triggerType: triggerType,
      webUrl: uploadResult.webUrl || `https://${hostname}`,
      error: ""
    };
    await fdb.collection('sharepoint_logs').doc(logId).set(logData);

    return logData;
  } catch (error: any) {
    const errorMsg = error?.response?.data?.error?.message || error?.message || String(error);
    console.error("SharePoint sync failed:", errorMsg);

    // Log failure
    const logId = crypto.randomUUID();
    const logData = {
      id: logId,
      timestamp: new Date().toISOString(),
      status: "failed",
      filename: fileName,
      triggerType: triggerType,
      webUrl: "",
      error: errorMsg
    };
    await fdb.collection('sharepoint_logs').doc(logId).set(logData);

    throw new Error(errorMsg);
  }
}

// Get SharePoint configuration
app.get("/api/sharepoint/config", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied. Only Admins can manage SharePoint sync settings." });
  }
  try {
    const configDoc = await fdb.collection('sharepoint').doc('config').get();
    let configData = {
      enabled: false,
      tenantId: "",
      clientId: "",
      clientSecret: "",
      siteUrl: "",
      folderPath: "Shared Documents/Air Tickets",
      timezoneOffset: 5.5, // Default CMB UTC+5:30
      uploadDay: 5,        // Friday
      uploadHour: 17       // 5:00 PM
    };

    if (configDoc.exists) {
      const data = configDoc.data();
      configData = {
        ...configData,
        ...data,
        // Hide secret
        clientSecret: data.clientSecret ? "••••••••" : ""
      };
    }
    res.json(configData);
  } catch (error: any) {
    console.error("Error fetching SharePoint config:", error);
    res.status(500).json({ detail: "Failed to fetch SharePoint configuration." });
  }
});

// Update SharePoint configuration
app.post("/api/sharepoint/config", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied. Only Admins can manage SharePoint sync settings." });
  }
  try {
    const body = req.body;
    let clientSecret = body.clientSecret;

    // Check if clientSecret is the masked placeholder. If so, preserve original
    if (clientSecret === "••••••••") {
      const existingDoc = await fdb.collection('sharepoint').doc('config').get();
      if (existingDoc.exists) {
        clientSecret = existingDoc.data().clientSecret || "";
      } else {
        clientSecret = "";
      }
    }

    const configData = {
      enabled: !!body.enabled,
      tenantId: (body.tenantId || "").trim(),
      clientId: (body.clientId || "").trim(),
      clientSecret: (clientSecret || "").trim(),
      siteUrl: (body.siteUrl || "").trim(),
      folderPath: (body.folderPath || "").trim(),
      timezoneOffset: Number(body.timezoneOffset ?? 5.5),
      uploadDay: Number(body.uploadDay ?? 5),
      uploadHour: Number(body.uploadHour ?? 17)
    };

    await fdb.collection('sharepoint').doc('config').set(configData);
    res.json({ success: true, message: "SharePoint settings updated successfully." });
  } catch (error: any) {
    console.error("Error saving SharePoint config:", error);
    res.status(500).json({ detail: "Failed to update SharePoint configuration." });
  }
});

// Manual sync trigger
app.post("/api/sharepoint/test", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied." });
  }
  try {
    const configDoc = await fdb.collection('sharepoint').doc('config').get();
    if (!configDoc.exists) {
      return res.status(400).json({ detail: "SharePoint integration is not configured yet." });
    }
    const config = configDoc.data();
    if (!config.clientSecret) {
      return res.status(400).json({ detail: "SharePoint configuration is missing Client Secret." });
    }

    const logData = await performSharePointSync(config, "manual");
    res.json({ success: true, log: logData });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Manual SharePoint synchronization failed." });
  }
});

// Get SharePoint Logs
app.get("/api/sharepoint/logs", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied." });
  }
  try {
    const logsSnap = await fdb.collection('sharepoint_logs').get();
    const logs = logsSnap.docs.map(doc => doc.data());
    const sorted = logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({ logs: sorted.slice(0, 100) }); // Limit to last 100 entries
  } catch (error: any) {
    console.error("Error fetching SharePoint logs:", error);
    res.status(500).json({ detail: "Failed to load sync logs." });
  }
});

// Get Google Drive configuration
app.get("/api/gdrive/config", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied. Only Admins can manage Google Drive sync settings." });
  }
  try {
    const configDoc = await fdb.collection('gdrive').doc('config').get();
    let configData = {
      enabled: false,
      folderName: "Air Tickets Backup",
      timezoneOffset: 5.5, // Default CMB UTC+5:30
      uploadDay: 5,        // Friday
      uploadHour: 17,       // 5:00 PM
      accessToken: "",
      linkedEmail: ""
    };

    if (configDoc.exists) {
      const data = configDoc.data();
      configData = {
        ...configData,
        ...data,
        accessToken: data.accessToken ? "••••••••" : ""
      };
    }
    res.json(configData);
  } catch (error: any) {
    console.error("Error fetching Google Drive config:", error);
    res.status(500).json({ detail: "Failed to fetch Google Drive configuration." });
  }
});

// Update Google Drive configuration
app.post("/api/gdrive/config", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied. Only Admins can manage Google Drive sync settings." });
  }
  try {
    const body = req.body;
    let accessToken = body.accessToken;

    if (accessToken === "••••••••") {
      const existingDoc = await fdb.collection('gdrive').doc('config').get();
      if (existingDoc.exists) {
        accessToken = existingDoc.data().accessToken || "";
      } else {
        accessToken = "";
      }
    }

    const configData = {
      enabled: !!body.enabled,
      folderName: (body.folderName || "Air Tickets Backup").trim(),
      timezoneOffset: Number(body.timezoneOffset ?? 5.5),
      uploadDay: Number(body.uploadDay ?? 5),
      uploadHour: Number(body.uploadHour ?? 17),
      accessToken: (accessToken || "").trim(),
      linkedEmail: (body.linkedEmail || "").trim()
    };

    await fdb.collection('gdrive').doc('config').set(configData);
    res.json({ success: true, message: "Google Drive settings updated successfully." });
  } catch (error: any) {
    console.error("Error saving Google Drive config:", error);
    res.status(500).json({ detail: "Failed to update Google Drive configuration." });
  }
});

// Manual Google Drive sync trigger
app.post("/api/gdrive/test", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied." });
  }
  try {
    const configDoc = await fdb.collection('gdrive').doc('config').get();
    if (!configDoc.exists) {
      return res.status(400).json({ detail: "Google Drive integration is not configured yet." });
    }
    const config = configDoc.data();
    if (!config.accessToken) {
      return res.status(400).json({ detail: "Google Drive is not linked. Please sign in with Google in Settings." });
    }

    const logData = await performGoogleDriveSync(config, "manual");
    res.json({ success: true, log: logData });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Manual Google Drive synchronization failed." });
  }
});

// Get Google Drive Logs
app.get("/api/gdrive/logs", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied." });
  }
  try {
    const logsSnap = await fdb.collection('gdrive_logs').get();
    const logs = logsSnap.docs.map(doc => doc.data());
    const sorted = logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({ logs: sorted.slice(0, 100) });
  } catch (error: any) {
    console.error("Error fetching Google Drive logs:", error);
    res.status(500).json({ detail: "Failed to load Google Drive sync logs." });
  }
});

// Manual Google Drive Database Backup trigger
app.post("/api/gdrive/backup", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied. Only Admins can trigger database backups." });
  }
  try {
    const configDoc = await fdb.collection('gdrive').doc('config').get();
    if (!configDoc.exists) {
      return res.status(400).json({ detail: "Google Drive integration is not configured yet. Please configure it under Cloud Exporters." });
    }
    const config = configDoc.data();
    if (!config.accessToken) {
      return res.status(400).json({ detail: "Google Drive is not linked. Please sign in with Google in Settings." });
    }

    const logData = await performGoogleDriveDbBackup(config, "manual", req.user.email || req.user.id || 'admin');
    res.json({ success: true, log: logData });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Manual database backup to Google Drive failed." });
  }
});

// Get Google Drive Database Backup Logs
app.get("/api/gdrive/backup-logs", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied." });
  }
  try {
    const logsSnap = await fdb.collection('gdrive_backup_logs').get();
    const logs = logsSnap.docs.map(doc => doc.data());
    const sorted = logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({ logs: sorted.slice(0, 100) });
  } catch (error: any) {
    console.error("Error fetching Google Drive backup logs:", error);
    res.status(500).json({ detail: "Failed to load Google Drive database backup logs." });
  }
});

// Full Database Backup & JSON Export
app.get("/api/admin/backup", authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'ADMIN1') {
    return res.status(403).json({ detail: "Access denied. Admin privileges required." });
  }

  try {
    const collectionsToBackup = [
      'users',
      'tickets',
      'projects',
      'ticket_tasks',
      'options',
      'activity_logs',
      'bypass_passports',
      'sharepoint',
      'sharepoint_logs'
    ];

    const backupData: Record<string, any[]> = {};

    for (const col of collectionsToBackup) {
      try {
        const snap = await fdb.collection(col).get();
        if (snap && snap.docs) {
          backupData[col] = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        } else {
          backupData[col] = [];
        }
      } catch (colError: any) {
        console.error(`[Backup] Failed to backup collection ${col}:`, colError);
        backupData[col] = [];
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sanken_air_db_backup_${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({
      metadata: {
        exported_at: new Date().toISOString(),
        exported_by: req.user.email || req.user.id || 'admin',
        database_id: firestoreDatabaseId || 'default',
        project_id: projectId || 'unknown'
      },
      data: backupData
    });
  } catch (error: any) {
    console.error('[Backup Error]:', error);
    res.status(500).json({ detail: 'Failed to generate full database backup: ' + error.message });
  }
});

// timezone offset helper
function getTargetTime(offset: number): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * offset));
}

// Background SharePoint and Google Drive automatic schedule check (every 30 minutes)
setInterval(async () => {
  // 1. SharePoint Schedule Check
  try {
    const configDoc = await fdb.collection('sharepoint').doc('config').get();
    if (configDoc.exists) {
      const config = configDoc.data();
      if (config.enabled) {
        const targetDate = getTargetTime(config.timezoneOffset ?? 5.5);
        const dayOfWeek = targetDate.getDay(); // 0 = Sun, ..., 5 = Fri, 6 = Sat
        const hour = targetDate.getHours();
        const scheduledDay = config.uploadDay ?? 5; // Friday default
        const scheduledHour = config.uploadHour ?? 17; // 5:00 PM default

        if (dayOfWeek === scheduledDay && hour >= scheduledHour) {
          const todayStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
          
          // Check if we already succeeded for todayStr
          const logsSnap = await fdb.collection('sharepoint_logs').get();
          const logs = logsSnap.docs.map(doc => doc.data());

          const alreadySucceeded = logs.some((l: any) => {
            if (l.status !== "success" || l.triggerType !== "auto") return false;
            try {
              const logDate = new Date(l.timestamp);
              const logUtc = logDate.getTime() + (logDate.getTimezoneOffset() * 60000);
              const logTargetDate = new Date(logUtc + (3600000 * (config.timezoneOffset ?? 5.5)));
              const logDateStr = `${logTargetDate.getFullYear()}-${String(logTargetDate.getMonth() + 1).padStart(2, '0')}-${String(logTargetDate.getDate()).padStart(2, '0')}`;
              return logDateStr === todayStr;
            } catch {
              return false;
            }
          });

          if (!alreadySucceeded) {
            console.log(`[SharePoint Automation] Initiating scheduled automatic report upload for date: ${todayStr}`);
            await performSharePointSync(config, "auto");
          }
        }
      }
    }
  } catch (error: any) {
    console.error("[SharePoint Automation] Background job error:", error);
  }

  // 2. Google Drive Schedule Check
  try {
    const configDoc = await fdb.collection('gdrive').doc('config').get();
    if (configDoc.exists) {
      const config = configDoc.data();
      if (config.enabled && config.accessToken) {
        const targetDate = getTargetTime(config.timezoneOffset ?? 5.5);
        const dayOfWeek = targetDate.getDay(); // 0 = Sun, ..., 5 = Fri, 6 = Sat
        const hour = targetDate.getHours();
        const scheduledDay = config.uploadDay ?? 5; // Friday default
        const scheduledHour = config.uploadHour ?? 17; // 5:00 PM default

        if (dayOfWeek === scheduledDay && hour >= scheduledHour) {
          const todayStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
          
          // Check if we already succeeded for todayStr
          const logsSnap = await fdb.collection('gdrive_logs').get();
          const logs = logsSnap.docs.map(doc => doc.data());

          const alreadySucceeded = logs.some((l: any) => {
            if (l.status !== "success" || l.triggerType !== "auto") return false;
            try {
              const logDate = new Date(l.timestamp);
              const logUtc = logDate.getTime() + (logDate.getTimezoneOffset() * 60000);
              const logTargetDate = new Date(logUtc + (3600000 * (config.timezoneOffset ?? 5.5)));
              const logDateStr = `${logTargetDate.getFullYear()}-${String(logTargetDate.getMonth() + 1).padStart(2, '0')}-${String(logTargetDate.getDate()).padStart(2, '0')}`;
              return logDateStr === todayStr;
            } catch {
              return false;
            }
          });

          if (!alreadySucceeded) {
            console.log(`[Google Drive Automation] Initiating scheduled automatic report upload for date: ${todayStr}`);
            await performGoogleDriveSync(config, "auto");
          }
        }
      }
    }
  } catch (error: any) {
    console.error("[Google Drive Automation] Background job error:", error);
  }
}, 30 * 60 * 1000).unref();


async function deduplicateProjectsOnStartup() {
  try {
    console.log("[Migration] Checking for duplicate projects...");
    const projectsSnap = await fdb.collection('projects').get();
    const projects = projectsSnap.docs.map(d => ({ docId: d.id, ...d.data() }));

    // Group projects by lowercase name
    const groups: { [name: string]: any[] } = {};
    projects.forEach(p => {
      const name = (p.name || '').trim().toLowerCase();
      if (!name) return;
      if (!groups[name]) {
        groups[name] = [];
      }
      groups[name].push(p);
    });

    let mergedCount = 0;
    for (const name in groups) {
      const group = groups[name];
      if (group.length > 1) {
        // Keep the first project as canonical
        const canonical = group[0];
        console.log(`[Migration] Found duplicate group for project "${canonical.name}". Canonical ID: ${canonical.id || canonical.docId}`);

        // Get duplicate IDs
        const duplicates = group.slice(1);
        const duplicateIds = duplicates.map(d => d.id || d.docId);

        // Fetch all tickets to check references
        const ticketsSnap = await fdb.collection('tickets').get();
        const tickets = ticketsSnap.docs.map(t => ({ docId: t.id, ...t.data() }));

        let ticketsUpdated = 0;
        for (const ticket of tickets) {
          let updated = false;
          let updatedTicketData = { ...ticket };
          delete (updatedTicketData as any).docId; // Keep document clean

          // 1. Check single project_id
          if (duplicateIds.includes(ticket.project_id)) {
            updatedTicketData.project_id = canonical.id || canonical.docId;
            updated = true;
          }

          // 2. Check project_ids array
          if (Array.isArray(ticket.project_ids)) {
            let nextIds = ticket.project_ids.map((id: string) => {
              if (duplicateIds.includes(id)) {
                return canonical.id || canonical.docId;
              }
              return id;
            });
            // Deduplicate the array
            nextIds = Array.from(new Set(nextIds));
            if (JSON.stringify(nextIds) !== JSON.stringify(ticket.project_ids)) {
              updatedTicketData.project_ids = nextIds;
              updated = true;
            }
          }

          // 3. Check project_pos mapping keys
          if (ticket.project_pos && typeof ticket.project_pos === 'object') {
            const nextPos: Record<string, string> = {};
            let posChanged = false;
            for (const [pId, poVal] of Object.entries(ticket.project_pos)) {
              if (duplicateIds.includes(pId)) {
                const targetId = canonical.id || canonical.docId;
                nextPos[targetId] = poVal as string;
                posChanged = true;
              } else {
                nextPos[pId] = poVal as string;
              }
            }
            if (posChanged) {
              updatedTicketData.project_pos = nextPos;
              updated = true;
            }
          }

          if (updated) {
            await fdb.collection('tickets').doc(ticket.docId).set(updatedTicketData);
            ticketsUpdated++;
          }
        }

        // Delete duplicates
        for (const d of duplicates) {
          await fdb.collection('projects').doc(d.docId).delete();
          console.log(`[Migration] Deleted duplicate project document: ${d.docId}`);
        }

        console.log(`[Migration] Merged duplicate group for "${canonical.name}". Updated ${ticketsUpdated} tickets.`);
        mergedCount++;
      }
    }

    if (mergedCount > 0) {
      console.log(`[Migration] Successfully deduplicated ${mergedCount} project groups.`);
      invalidateCache();
    } else {
      console.log("[Migration] No duplicate projects found.");
    }
  } catch (error) {
    console.error("[Migration] Error running project deduplication:", error);
  }
}

async function deduplicateUsersOnStartup() {
  try {
    console.log("[Migration] Checking for duplicate users...");
    const usersSnap = await fdb.collection('users').get();
    const users = usersSnap.docs.map(d => ({ docId: d.id, ...d.data() }));

    // Group users by lowercase email
    const groups: { [email: string]: any[] } = {};
    users.forEach(u => {
      const email = (u.email || '').trim().toLowerCase();
      if (!email) return;
      if (!groups[email]) {
        groups[email] = [];
      }
      groups[email].push(u);
    });

    let mergedCount = 0;
    for (const email in groups) {
      const group = groups[email];
      if (group.length > 1) {
        // Find Canonical: Prefer user that doesn't have password change required, or the first active one
        group.sort((a, b) => {
          if (a.must_change_password !== b.must_change_password) {
            return a.must_change_password ? 1 : -1;
          }
          if (a.is_active !== b.is_active) {
            return a.is_active ? -1 : 1;
          }
          return 0;
        });

        const canonical = group[0];
        const canonicalId = canonical.id || canonical.docId;
        console.log(`[Migration] Found duplicate group for user "${canonical.email}". Canonical ID: ${canonicalId}`);

        // Get duplicate IDs
        const duplicates = group.slice(1);
        const duplicateIds = duplicates.map(d => d.id || d.docId);

        // 1. Update tickets (created_by_user_id, updated_by_user_id)
        const ticketsSnap = await fdb.collection('tickets').get();
        const tickets = ticketsSnap.docs.map(t => ({ docId: t.id, ...t.data() }));
        let ticketsUpdated = 0;
        for (const ticket of tickets) {
          let updated = false;
          let updatedTicketData = { ...ticket };
          delete (updatedTicketData as any).docId;

          if (duplicateIds.includes(ticket.created_by_user_id)) {
            updatedTicketData.created_by_user_id = canonicalId;
            updated = true;
          }
          if (duplicateIds.includes(ticket.updated_by_user_id)) {
            updatedTicketData.updated_by_user_id = canonicalId;
            updated = true;
          }

          if (updated) {
            await fdb.collection('tickets').doc(ticket.docId).set(updatedTicketData);
            ticketsUpdated++;
          }
        }

        // 2. Update activity_logs (user_id)
        const logsSnap = await fdb.collection('activity_logs').get();
        const logs = logsSnap.docs.map(l => ({ docId: l.id, ...l.data() }));
        let logsUpdated = 0;
        for (const log of logs) {
          if (duplicateIds.includes(log.user_id)) {
            let updatedLogData = { ...log };
            delete (updatedLogData as any).docId;
            updatedLogData.user_id = canonicalId;
            await fdb.collection('activity_logs').doc(log.docId).set(updatedLogData);
            logsUpdated++;
          }
        }

        // 3. Update ticket_tasks (assigned_to_user_id, created_by)
        const tasksSnap = await fdb.collection('ticket_tasks').get();
        const tasks = tasksSnap.docs.map(t => ({ docId: t.id, ...t.data() }));
        let tasksUpdated = 0;
        for (const task of tasks) {
          let updated = false;
          let updatedTaskData = { ...task };
          delete (updatedTaskData as any).docId;

          if (duplicateIds.includes(task.assigned_to_user_id)) {
            updatedTaskData.assigned_to_user_id = canonicalId;
            updated = true;
          }
          if (duplicateIds.includes(task.created_by)) {
            updatedTaskData.created_by = canonicalId;
            updated = true;
          }

          if (updated) {
            await fdb.collection('ticket_tasks').doc(task.docId).set(updatedTaskData);
            tasksUpdated++;
          }
        }

        // 4. Update bypass_passports (created_by_user_id)
        const bypassSnap = await fdb.collection('bypass_passports').get();
        const bypasses = bypassSnap.docs.map(b => ({ docId: b.id, ...b.data() }));
        let bypassUpdated = 0;
        for (const bypass of bypasses) {
          if (duplicateIds.includes(bypass.created_by_user_id)) {
            let updatedBypassData = { ...bypass };
            delete (updatedBypassData as any).docId;
            updatedBypassData.created_by_user_id = canonicalId;
            await fdb.collection('bypass_passports').doc(bypass.docId).set(updatedBypassData);
            bypassUpdated++;
          }
        }

        // Delete duplicates
        for (const d of duplicates) {
          await fdb.collection('users').doc(d.docId).delete();
          console.log(`[Migration] Deleted duplicate user document: ${d.docId}`);
        }

        console.log(`[Migration] Merged duplicate user group for "${canonical.email}". Canonical: ${canonicalId}. Updated ${ticketsUpdated} tickets, ${logsUpdated} logs, ${tasksUpdated} tasks, ${bypassUpdated} bypasses.`);
        mergedCount++;
      }
    }

    if (mergedCount > 0) {
      console.log(`[Migration] Successfully deduplicated ${mergedCount} user groups.`);
      invalidateCache();
    } else {
      console.log("[Migration] No duplicate users found.");
    }
  } catch (error) {
    console.error("[Migration] Error running user deduplication:", error);
  }
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    // Run background deduplication on startup
    deduplicateProjectsOnStartup();
    deduplicateUsersOnStartup();
  });
}

startServer();
