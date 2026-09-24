import type { ItineraryDay, SavedItem, SavedKind, TripPlan } from "@/lib/database";
import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";

const LEGACY_OWNER_KEY = "legacy_cloud_data_owner";
const SAVED_STORE = "user_saved_items";
const TRIPS_STORE = "user_trip_plans";

type SyncState = "pending" | "synced";
type CachedSavedItem = SavedItem & {
  userId: string;
  updatedAt: string;
  syncState: SyncState;
  deleted?: boolean;
};
type CachedTripPlan = TripPlan & {
  userId: string;
  updatedAt: string;
  syncState: SyncState;
  deleted?: boolean;
};

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.");
  }
}

function deferCloudSync(error: unknown, message: string) {
  console.warn(message, error);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function userRows<T>(db: IDBDatabase, storeName: string, userId: string) {
  const transaction = db.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).index("by_user").getAll(userId);
  return requestResult(request) as Promise<T[]>;
}

async function putRow(db: IDBDatabase, storeName: string, row: unknown) {
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(row);
  await transactionDone(transaction);
}

async function deleteRow(db: IDBDatabase, storeName: string, userId: string, id: string) {
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete([userId, id]);
  await transactionDone(transaction);
}

async function replaceSyncedRows(
  db: IDBDatabase,
  storeName: string,
  userId: string,
  remoteRows: Array<CachedSavedItem | CachedTripPlan>,
) {
  const pending = (await userRows<CachedSavedItem | CachedTripPlan>(db, storeName, userId)).filter(
    (row) => row.syncState === "pending",
  );
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const cursorRequest = store.index("by_user").openKeyCursor(IDBKeyRange.only(userId));
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
      return;
    }
    remoteRows.forEach((row) => store.put(row));
    pending.forEach((row) => store.put(row));
  };
  await transactionDone(transaction);
}

const migrationPromises = new Map<string, Promise<void>>();

function legacyRows<T>(db: IDBDatabase, storeName: string) {
  const transaction = db.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll()) as Promise<T[]>;
}

function migrateLegacyData(db: IDBDatabase, userId: string) {
  const existing = migrationPromises.get(userId);
  if (existing) return existing;
  const migration = (async () => {
    const [legacySaved, legacyTrips] = await Promise.all([
      legacyRows<SavedItem>(db, "saved_items"),
      legacyRows<Array<Omit<TripPlan, "id"> & { id: number | string }>[number]>(db, "trip_plans"),
    ]);
    const transaction = db.transaction(["app_settings", SAVED_STORE, TRIPS_STORE], "readwrite");
    const settings = transaction.objectStore("app_settings");
    const ownerRequest = settings.get(LEGACY_OWNER_KEY);
    ownerRequest.onsuccess = () => {
      if (ownerRequest.result) return;
      const now = new Date().toISOString();
      const savedStore = transaction.objectStore(SAVED_STORE);
      const tripStore = transaction.objectStore(TRIPS_STORE);
      legacySaved.forEach((item) =>
        savedStore.put({
          ...item,
          userId,
          updatedAt: item.createdAt || now,
          syncState: "pending",
        } satisfies CachedSavedItem),
      );
      legacyTrips.forEach((plan) =>
        tripStore.put({
          ...plan,
          id: String(plan.id).startsWith("legacy-") ? String(plan.id) : `legacy-${plan.id}`,
          userId,
          updatedAt: plan.createdAt || now,
          syncState: "pending",
        } satisfies CachedTripPlan),
      );
      settings.put({ key: LEGACY_OWNER_KEY, value: userId });
    };
    await transactionDone(transaction);
  })().catch((error) => {
    migrationPromises.delete(userId);
    throw error;
  });
  migrationPromises.set(userId, migration);
  return migration;
}

// ── Supabase converters ──

function toSupabaseSavedRow(row: CachedSavedItem): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    subtitle: row.subtitle,
    kind: row.kind,
    image_key: row.imageKey,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    sync_state: row.syncState,
    deleted: !!row.deleted,
  };
}

function fromSupabaseSavedRow(data: Record<string, unknown>): CachedSavedItem {
  return {
    id: String(data.id),
    title: (data.title as string) ?? "",
    subtitle: (data.subtitle as string) ?? "",
    kind: (data.kind as SavedKind) ?? "Places",
    imageKey: (data.image_key as string | null) ?? null,
    createdAt: (data.created_at as string) ?? new Date().toISOString(),
    userId: String(data.user_id),
    updatedAt: (data.updated_at as string) ?? (data.created_at as string) ?? new Date().toISOString(),
    syncState: (data.sync_state as SyncState) ?? "synced",
    deleted: Boolean(data.deleted),
  };
}

function toSupabaseTripRow(row: CachedTripPlan): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    preferences: row.preferences as unknown,
    itinerary: (row.itinerary ?? []) as unknown,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    sync_state: row.syncState,
    deleted: !!row.deleted,
  };
}

function fromSupabaseTripRow(data: Record<string, unknown>): CachedTripPlan {
  return {
    id: String(data.id),
    title: (data.title as string) ?? "",
    preferences: (data.preferences as TripPlan["preferences"]) ?? {
      durationHours: 0,
      budget: null,
      transportation: "",
      interests: [],
      walkingAbility: "",
    },
    itinerary: Array.isArray(data.itinerary) ? (data.itinerary as ItineraryDay[]) : [],
    createdAt: (data.created_at as string) ?? new Date().toISOString(),
    userId: String(data.user_id),
    updatedAt: (data.updated_at as string) ?? (data.created_at as string) ?? new Date().toISOString(),
    syncState: (data.sync_state as SyncState) ?? "synced",
    deleted: Boolean(data.deleted),
  };
}

async function flushSavedRow(db: IDBDatabase, row: CachedSavedItem) {
  requireSupabase();
  if (row.deleted) {
    const { error } = await withSupabaseTimeout(
      supabase!.from("saved_places").delete().eq("user_id", row.userId).eq("id", row.id),
      "Saved-place sync timed out.",
    );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await withSupabaseTimeout(
      supabase!.from("saved_places").upsert(toSupabaseSavedRow(row) as never, { onConflict: "user_id,id" }),
      "Saved-place sync timed out.",
    );
    if (error) throw new Error(error.message);
  }
  if (row.deleted) await deleteRow(db, SAVED_STORE, row.userId, row.id);
  else await putRow(db, SAVED_STORE, { ...row, syncState: "synced" });
}

async function flushTripRow(db: IDBDatabase, row: CachedTripPlan) {
  requireSupabase();
  if (row.deleted) {
    const { error } = await withSupabaseTimeout(
      supabase!.from("trip_plans").delete().eq("user_id", row.userId).eq("id", row.id),
      "Trip-plan sync timed out.",
    );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await withSupabaseTimeout(
      supabase!.from("trip_plans").upsert(toSupabaseTripRow(row) as never, { onConflict: "user_id,id" }),
      "Trip-plan sync timed out.",
    );
    if (error) throw new Error(error.message);
  }
  if (row.deleted) await deleteRow(db, TRIPS_STORE, row.userId, row.id);
  else await putRow(db, TRIPS_STORE, { ...row, syncState: "synced" });
}

async function tryFlush<T>(rows: T[], flush: (row: T) => Promise<void>) {
  await Promise.all(
    rows.map(async (row) => {
      try {
        await flush(row);
      } catch (error) {
        deferCloudSync(error, "[cloud-user-data] Cloud sync deferred; local data retained.");
      }
    }),
  );
}

export async function getSavedItems(db: IDBDatabase, userId: string, kind?: SavedKind): Promise<SavedItem[]> {
  requireSupabase();
  await migrateLegacyData(db, userId);
  const cached = await userRows<CachedSavedItem>(db, SAVED_STORE, userId);
  await tryFlush(
    cached.filter((row) => row.syncState === "pending"),
    (row) => flushSavedRow(db, row),
  );

  try {
    const { data, error } = await withSupabaseTimeout(
      supabase!.from("saved_places").select("*").eq("user_id", userId),
      "Saved places are taking too long to load.",
    );
    if (error) throw new Error(error.message);
    const remote = ((data as Record<string, unknown>[] | null) ?? []).map(fromSupabaseSavedRow);
    await replaceSyncedRows(db, SAVED_STORE, userId, remote as Array<CachedSavedItem | CachedTripPlan>);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Using cached saved places.");
  }

  return (await userRows<CachedSavedItem>(db, SAVED_STORE, userId))
    .filter((item) => !item.deleted && (!kind || item.kind === kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSavedIds(db: IDBDatabase, userId: string) {
  return new Set((await getSavedItems(db, userId)).map((item) => item.id));
}

export async function saveItem(db: IDBDatabase, userId: string, item: Omit<SavedItem, "createdAt">) {
  requireSupabase();
  await migrateLegacyData(db, userId);
  const now = new Date().toISOString();
  const row: CachedSavedItem = {
    ...item,
    userId,
    createdAt: now,
    updatedAt: now,
    syncState: "pending",
  };
  await putRow(db, SAVED_STORE, row);
  try {
    await flushSavedRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Saved place queued for sync.");
  }
}

export async function removeSavedItem(db: IDBDatabase, userId: string, id: string) {
  requireSupabase();
  await migrateLegacyData(db, userId);
  const existing = (await userRows<CachedSavedItem>(db, SAVED_STORE, userId)).find((item) => item.id === id);
  if (!existing) return;
  const row: CachedSavedItem = {
    ...existing,
    deleted: true,
    updatedAt: new Date().toISOString(),
    syncState: "pending",
  };
  await putRow(db, SAVED_STORE, row);
  try {
    await flushSavedRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Saved-place removal queued for sync.");
  }
}

export async function getTripPlans(db: IDBDatabase, userId: string): Promise<TripPlan[]> {
  requireSupabase();
  await migrateLegacyData(db, userId);
  const cached = await userRows<CachedTripPlan>(db, TRIPS_STORE, userId);
  await tryFlush(
    cached.filter((row) => row.syncState === "pending"),
    (row) => flushTripRow(db, row),
  );

  try {
    const { data, error } = await withSupabaseTimeout(
      supabase!.from("trip_plans").select("*").eq("user_id", userId),
      "Trip plans are taking too long to load.",
    );
    if (error) throw new Error(error.message);
    const remote = ((data as Record<string, unknown>[] | null) ?? []).map(fromSupabaseTripRow);
    await replaceSyncedRows(db, TRIPS_STORE, userId, remote as Array<CachedSavedItem | CachedTripPlan>);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Using cached trip plans.");
  }

  return (await userRows<CachedTripPlan>(db, TRIPS_STORE, userId))
    .filter((plan) => !plan.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createTripPlan(
  db: IDBDatabase,
  userId: string,
  title: string,
  preferences: TripPlan["preferences"],
  itinerary: ItineraryDay[] = [],
) {
  requireSupabase();
  await migrateLegacyData(db, userId);
  const now = new Date().toISOString();
  const row: CachedTripPlan = {
    id: globalThis.crypto?.randomUUID?.() ?? `trip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId,
    title: title.trim(),
    preferences,
    itinerary,
    createdAt: now,
    updatedAt: now,
    syncState: "pending",
  };
  await putRow(db, TRIPS_STORE, row);
  try {
    await flushTripRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Trip plan queued for sync.");
  }
  return row.id;
}

export async function deleteTripPlan(db: IDBDatabase, userId: string, id: string) {
  requireSupabase();
  await migrateLegacyData(db, userId);
  const existing = (await userRows<CachedTripPlan>(db, TRIPS_STORE, userId)).find((plan) => plan.id === id);
  if (!existing) return;
  const row: CachedTripPlan = {
    ...existing,
    deleted: true,
    updatedAt: new Date().toISOString(),
    syncState: "pending",
  };
  await putRow(db, TRIPS_STORE, row);
  try {
    await flushTripRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Trip-plan removal queued for sync.");
  }
}

export async function updateTripPlan(
  db: IDBDatabase,
  userId: string,
  id: string,
  updates: Partial<Pick<TripPlan, "title" | "preferences" | "itinerary">>,
) {
  requireSupabase();
  await migrateLegacyData(db, userId);
  const existing = (await userRows<CachedTripPlan>(db, TRIPS_STORE, userId)).find((plan) => plan.id === id);
  if (!existing) return;
  const now = new Date().toISOString();
  const row: CachedTripPlan = {
    ...existing,
    ...updates,
    updatedAt: now,
    syncState: "pending",
  };
  await putRow(db, TRIPS_STORE, row);
  try {
    await flushTripRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Trip-plan update queued for sync.");
  }
}
