const DB_NAME = "hilinga";
const DB_VERSION = 3;

export type SavedKind = "Places" | "Itineraries" | "Businesses" | "Events";

export type SavedItem = {
  id: string;
  title: string;
  subtitle: string;
  kind: SavedKind;
  imageKey: string | null;
  createdAt: string;
};

export type Profile = {
  displayName: string;
  language: string;
  budgetMin: number | null;
  budgetMax: number | null;
  interests: string[];
  notificationsEnabled: boolean;
};

export type TripPlan = {
  id: string;
  title: string;
  preferences: {
    durationHours: number;
    budget: number | null;
    transportation: string;
    interests: string[];
    walkingAbility: string;
  };
  itinerary?: ItineraryDay[];
  createdAt: string;
};

export type ItineraryStop = {
  time: string;
  title: string;
  note: string;
  icon: string;
  id?: string;
  place?: { latitude: number; longitude: number } | string;
  durationMinutes?: number;
  cost?: number;
  latitude?: number;
  longitude?: number;
};

export type ItineraryDay = {
  day: number;
  title: string;
  stops: ItineraryStop[];
};

// ── IndexedDB wrapper ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("profiles")) {
        db.createObjectStore("profiles", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("saved_items")) {
        const store = db.createObjectStore("saved_items", { keyPath: "id" });
        store.createIndex("by_kind", "kind", { unique: false });
      }
      if (!db.objectStoreNames.contains("trip_plans")) {
        db.createObjectStore("trip_plans", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("app_settings")) {
        db.createObjectStore("app_settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("user_saved_items")) {
        const store = db.createObjectStore("user_saved_items", {
          keyPath: ["userId", "id"],
        });
        store.createIndex("by_user", "userId", { unique: false });
      }
      if (!db.objectStoreNames.contains("user_trip_plans")) {
        const store = db.createObjectStore("user_trip_plans", {
          keyPath: ["userId", "id"],
        });
        store.createIndex("by_user", "userId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let cachedDB: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (cachedDB) return cachedDB;
  cachedDB = await openDB();
  cachedDB.onclose = () => { cachedDB = null; };
  return cachedDB;
}

function tx<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function txAll<T>(
  db: IDBDatabase,
  storeName: string,
  fn: (store: IDBObjectStore) => IDBRequest<T[]>,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

// ── Migrations ──

export async function migrateDatabase(db: IDBDatabase) {
  // Ensure default profile row exists
  const profileTx = db.transaction("profiles", "readwrite");
  const profileStore = profileTx.objectStore("profiles");
  const existing = await new Promise<Profile | undefined>((resolve, reject) => {
    const req = profileStore.get(1);
    req.onsuccess = () => resolve(req.result as Profile | undefined);
    req.onerror = () => reject(req.error);
  });

  if (!existing) {
    const defaultProfile = {
      id: 1,
      displayName: "",
      language: "English",
      budgetMin: null,
      budgetMax: null,
      interests: [],
      notificationsEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const req = profileStore.put(defaultProfile);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

// ── Profile ──

export async function getProfile(db: IDBDatabase): Promise<Profile> {
  const row = await tx(db, "profiles", "readonly", (store) => store.get(1));
  return {
    displayName: row?.displayName ?? "",
    language: row?.language ?? "English",
    budgetMin: row?.budgetMin ?? null,
    budgetMax: row?.budgetMax ?? null,
    interests: Array.isArray(row?.interests) ? row.interests : [],
    notificationsEnabled: row?.notificationsEnabled ?? true,
  };
}

export async function updateProfile(db: IDBDatabase, profile: Profile) {
  await tx(db, "profiles", "readwrite", (store) =>
    store.put({
      id: 1,
      ...profile,
      updatedAt: new Date().toISOString(),
    }),
  );
}

// ── Trip Plans ──

export async function getTripPlans(db: IDBDatabase): Promise<TripPlan[]> {
  const rows = await txAll(db, "trip_plans", (store) => store.getAll());
  return rows
    .map((row: Record<string, unknown>) => ({
      id: String(row.id),
      title: row.title as string,
      preferences: row.preferences as TripPlan["preferences"],
      itinerary: Array.isArray(row.itinerary) ? row.itinerary as ItineraryDay[] : [],
      createdAt: row.createdAt as string,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createTripPlan(
  db: IDBDatabase,
  title: string,
  preferences: TripPlan["preferences"],
  itinerary: ItineraryDay[] = [],
) {
  const plan = {
    title: title.trim(),
    preferences,
    itinerary,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return tx(db, "trip_plans", "readwrite", (store) => store.add(plan));
}

export async function deleteTripPlan(db: IDBDatabase, id: number) {
  await tx(db, "trip_plans", "readwrite", (store) => store.delete(id));
}

// ── Saved Items ──

type SavedItemRow = SavedItem;

export async function getSavedItems(
  db: IDBDatabase,
  kind?: SavedKind,
): Promise<SavedItem[]> {
  if (kind) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("saved_items", "readonly");
      const store = transaction.objectStore("saved_items");
      const index = store.index("by_kind");
      const request = index.getAll(kind);
      request.onsuccess = () => {
        const items = (request.result as SavedItemRow[])
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  }
  const rows = await txAll<SavedItemRow>(db, "saved_items", (store) => store.getAll());
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSavedIds(db: IDBDatabase): Promise<Set<string>> {
  const rows = await txAll<SavedItemRow>(db, "saved_items", (store) => store.getAll());
  return new Set(rows.map((row) => row.id));
}

export async function saveItem(
  db: IDBDatabase,
  item: Omit<SavedItem, "createdAt">,
) {
  const record: SavedItem = {
    ...item,
    createdAt: new Date().toISOString(),
  };
  await tx(db, "saved_items", "readwrite", (store) => store.put(record));
}

export async function removeSavedItem(db: IDBDatabase, id: string) {
  await tx(db, "saved_items", "readwrite", (store) => store.delete(id));
}

// ── Settings ──

export async function getSetting(db: IDBDatabase, key: string) {
  const row = await tx(db, "app_settings", "readonly", (store) => store.get(key));
  return (row as { value: string } | undefined)?.value ?? null;
}

export async function setSetting(db: IDBDatabase, key: string, value: string) {
  await tx(db, "app_settings", "readwrite", (store) =>
    store.put({ key, value }),
  );
}

// ── Reset ──

export async function resetLocalAccount(db: IDBDatabase) {
  const transaction = db.transaction(
    [
      "trip_plans",
      "saved_items",
      "user_trip_plans",
      "user_saved_items",
      "app_settings",
      "profiles",
    ],
    "readwrite",
  );

  transaction.objectStore("trip_plans").clear();
  transaction.objectStore("saved_items").clear();
  transaction.objectStore("user_trip_plans").clear();
  transaction.objectStore("user_saved_items").clear();
  transaction.objectStore("app_settings").clear();

  const defaultProfile = {
    id: 1,
    displayName: "",
    language: "English",
    budgetMin: null,
    budgetMax: null,
    interests: [],
    notificationsEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  transaction.objectStore("profiles").put(defaultProfile);

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
