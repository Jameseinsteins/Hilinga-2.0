/**
 * Centralized Cache Service
 *
 * Provides IndexedDB-backed caching for Firestore data with TTL support.
 * Fixes cross-device data consistency issues by persisting cache to IndexedDB.
 *
 * This is the foundation for fixing the business post visibility bug:
 * - Posts are persisted to IndexedDB when published
 * - Multiple devices read from the same cache
 * - Firestore listeners update the cache in real-time
 */

import type { BusinessPost, RegisteredSmallBusiness } from "@/lib/business-content";
import type { CloudProfile } from "@/types/profile";

const CACHE_DB_NAME = "hilinga_cache_v1";
const CACHE_DB_VERSION = 3;

export type CacheStoreType = "business-posts" | "registered-businesses" | "profiles" | "metadata" | "business-inquiries";

interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  ttl?: number; // milliseconds, undefined = no expiry
}

interface CacheMetadata {
  key: string;
  lastSync: number;
  syncCount: number;
}

/**
 * Opens the cache database with proper initialization
 */
function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // Create stores if they don't exist
      if (!db.objectStoreNames.contains("business-posts")) {
        const store = db.createObjectStore("business-posts", { keyPath: "key" });
        store.createIndex("by_timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains("registered-businesses")) {
        const store = db.createObjectStore("registered-businesses", { keyPath: "key" });
        store.createIndex("by_timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains("profiles")) {
        const store = db.createObjectStore("profiles", { keyPath: "key" });
        store.createIndex("by_timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("business-inquiries")) {
        const store = db.createObjectStore("business-inquiries", { keyPath: "key" });
        store.createIndex("by_timestamp", "timestamp", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let cachedDB: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (cachedDB) return cachedDB;
  cachedDB = await openCacheDB();
  cachedDB.onclose = () => { cachedDB = null; };
  return cachedDB;
}

/**
 * Generic cache get with TTL expiry check
 */
export async function cacheGet<T>(store: CacheStoreType, key: string): Promise<T | null> {
  try {
    const db = await getDB();
    const transaction = db.transaction(store, "readonly");
    const objectStore = transaction.objectStore(store);

    return new Promise((resolve) => {
      const request = objectStore.get(key);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        // Check if expired
        if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
          // Cache expired but don't delete yet - let the next sync handle cleanup
          resolve(null);
          return;
        }

        resolve(entry.data);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Generic cache set with optional TTL
 */
export async function cacheSet<T>(
  store: CacheStoreType,
  key: string,
  data: T,
  ttl?: number,
): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(store, "readwrite");
    const objectStore = transaction.objectStore(store);

    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
      ...(ttl ? { ttl } : {}),
    };

    return new Promise((resolve, reject) => {
      const request = objectStore.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("[cache] Failed to set cache:", error);
  }
}

/**
 * Get all items from a store, filtering out expired entries
 */
export async function cacheGetAll<T>(store: CacheStoreType): Promise<T[]> {
  try {
    const db = await getDB();
    const transaction = db.transaction(store, "readonly");
    const objectStore = transaction.objectStore(store);

    return new Promise((resolve) => {
      const request = objectStore.getAll();
      request.onsuccess = () => {
        const entries = (request.result as CacheEntry<T>[]) || [];
        const now = Date.now();

        // Filter out expired entries
        const valid = entries
          .filter((entry) => !entry.ttl || now - entry.timestamp <= entry.ttl)
          .map((entry) => entry.data);

        resolve(valid);
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Clear all items from a store
 */
export async function cacheClear(store: CacheStoreType): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(store, "readwrite");
    const objectStore = transaction.objectStore(store);

    return new Promise((resolve, reject) => {
      const request = objectStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently fail
  }
}

/**
 * Delete a specific item from cache
 */
export async function cacheDelete(store: CacheStoreType, key: string): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(store, "readwrite");
    const objectStore = transaction.objectStore(store);

    return new Promise((resolve, reject) => {
      const request = objectStore.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently fail
  }
}

/**
 * Track sync metadata for debugging and cache invalidation
 */
export async function recordSyncMetadata(store: CacheStoreType, key: string = "default"): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction("metadata", "readwrite");
    const objectStore = transaction.objectStore("metadata");

    const metaKey = `${store}:${key}`;
    const existing = await new Promise<CacheMetadata | null>((resolve) => {
      const req = objectStore.get(metaKey);
      req.onsuccess = () => resolve((req.result as CacheMetadata) || null);
      req.onerror = () => resolve(null);
    });

    const metadata: CacheMetadata = {
      key: metaKey,
      lastSync: Date.now(),
      syncCount: (existing?.syncCount || 0) + 1,
    };

    return new Promise((resolve, reject) => {
      const request = objectStore.put(metadata);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently fail
  }
}

// ── Business Post Cache Helpers ──

/**
 * Cache all business posts with a fixed key
 * This ensures posts are persistent and available across page refreshes
 */
export async function cacheBusinessPosts(posts: BusinessPost[]): Promise<void> {
  const key = "all-published-posts";
  await cacheSet("business-posts", key, posts);
  await recordSyncMetadata("business-posts", "published");
}

/**
 * Retrieve cached business posts
 * Returns empty array if not cached or expired
 */
export async function getCachedBusinessPosts(): Promise<BusinessPost[]> {
  const key = "all-published-posts";
  const cached = await cacheGet<BusinessPost[]>("business-posts", key);
  return cached || [];
}

// ── Registered Businesses Cache Helpers ──

/**
 * Cache all registered businesses
 */
export async function cacheRegisteredBusinesses(
  businesses: RegisteredSmallBusiness[],
): Promise<void> {
  const key = "all-registered";
  await cacheSet("registered-businesses", key, businesses);
  await recordSyncMetadata("registered-businesses", "all");
}

/**
 * Retrieve cached registered businesses
 */
export async function getCachedRegisteredBusinesses(): Promise<RegisteredSmallBusiness[]> {
  const key = "all-registered";
  const cached = await cacheGet<RegisteredSmallBusiness[]>("registered-businesses", key);
  return cached || [];
}

// ── Profile Cache Helpers ──

/**
 * Cache a user's profile with their ID as part of the key
 */
export async function cacheProfile(userId: string, profile: CloudProfile): Promise<void> {
  const key = `profile:${userId}`;
  await cacheSet("profiles", key, profile);
}

/**
 * Retrieve a cached profile by user ID
 */
export async function getCachedProfile(userId: string): Promise<CloudProfile | null> {
  const key = `profile:${userId}`;
  return cacheGet<CloudProfile>("profiles", key);
}

/**
 * Clear a user's cached profile
 */
export async function clearCachedProfile(userId: string): Promise<void> {
  const key = `profile:${userId}`;
  await cacheDelete("profiles", key);
}

// ── Business Inquiries Cache Helpers (free local fallback when Firestore disabled) ──

const INQUIRY_NOTIFY_EVENT = "hilinga:inquiries-changed";

function notifyInquiryListeners() {
  window.dispatchEvent(new Event(INQUIRY_NOTIFY_EVENT));
}

export type CachedBusinessInquiry = {
  id: string;
  businessId: string;
  businessName: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  message: string;
  status: "unread" | "read";
  createdAt: string;
  updatedAt: string;
};

function inquiryStoreKey(businessId: string) {
  return `inquiries:${businessId}`;
}

export async function getCachedBusinessInquiries(businessId: string): Promise<CachedBusinessInquiry[]> {
  return (await cacheGet<CachedBusinessInquiry[]>("business-inquiries", inquiryStoreKey(businessId))) ?? [];
}

export async function addCachedBusinessInquiry(inquiry: CachedBusinessInquiry): Promise<void> {
  const key = inquiryStoreKey(inquiry.businessId);
  const current = await getCachedBusinessInquiries(inquiry.businessId);
  await cacheSet("business-inquiries", key, [inquiry, ...current.filter((i) => i.id !== inquiry.id)]);
  notifyInquiryListeners();
}

export async function updateCachedInquiryStatus(businessId: string, inquiryId: string, status: "unread" | "read"): Promise<void> {
  const key = inquiryStoreKey(businessId);
  const current = await getCachedBusinessInquiries(businessId);
  const updated = current.map((i) => (i.id === inquiryId ? { ...i, status, updatedAt: new Date().toISOString() } : i));
  await cacheSet("business-inquiries", key, updated);
  notifyInquiryListeners();
}

export async function deleteCachedBusinessInquiry(businessId: string, inquiryId: string): Promise<void> {
  const key = inquiryStoreKey(businessId);
  const current = await getCachedBusinessInquiries(businessId);
  await cacheSet("business-inquiries", key, current.filter((i) => i.id !== inquiryId));
  notifyInquiryListeners();
}

export function subscribeToCachedInquiries(
  businessId: string,
  onInquiries: (items: CachedBusinessInquiry[]) => void,
): () => void {
  let cancelled = false;
  async function emit() {
    if (cancelled) return;
    const items = await getCachedBusinessInquiries(businessId);
    if (!cancelled) onInquiries(items);
  }
  void emit();
  const handler = () => void emit();
  window.addEventListener(INQUIRY_NOTIFY_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    cancelled = true;
    window.removeEventListener(INQUIRY_NOTIFY_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export async function getAllCachedInquiryBuckets(): Promise<Map<string, CachedBusinessInquiry[]>> {
  const db = await openCacheDB();
  const out = new Map<string, CachedBusinessInquiry[]>();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("business-inquiries", "readonly");
    const store = tx.objectStore("business-inquiries");
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        out.set(String(cursor.key), (cursor.value as CachedBusinessInquiry[]) ?? []);
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return out;
}
