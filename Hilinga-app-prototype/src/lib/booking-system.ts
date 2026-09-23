/**
 * Booking Management System
 * Extends cloud-user-data with booking operations
 * Offline-first: IndexedDB is source of truth, Supabase-first sync with Firestore fallback (Phase 1)
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";

import type {
  Booking,
  BookingStatus,
  InstallmentSchedule,
  PaymentMethod,
  PaymentStatus,
  PaymentTransaction,
  PriceBreakdown,
} from "@/lib/payment-system";
import { firestore } from "@/lib/firebase";
import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";
import type { ItineraryDay } from "@/lib/database";

const FIREBASE_TIMEOUT_MS = 12_000;
const BOOKINGS_STORE = "user_bookings";
const PAYMENTS_STORE = "user_payments";
const ITINERARY_EDITS_STORE = "user_itinerary_edits";

type SyncState = "pending" | "synced";

type CachedBooking = Booking & {
  userId: string;
  updatedAt: string;
  syncState: SyncState;
  deleted?: boolean;
};

type CachedPayment = PaymentTransaction & {
  userId: string;
  syncState: SyncState;
};

type CachedItineraryEdit = {
  id: string;
  userId: string;
  bookingId: string;
  tripPlanId: string;
  insertPosition: number;
  newStop: ItineraryDay;
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
};

function withFirebaseTimeout<T>(operation: Promise<T>, message: string) {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), FIREBASE_TIMEOUT_MS);
  });
  return Promise.race([operation, timeoutPromise]).finally(() => clearTimeout(timeout));
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

async function replaceSyncedRows<T extends { syncState: SyncState }>(
  db: IDBDatabase,
  storeName: string,
  userId: string,
  remoteRows: T[],
) {
  const pending = (await userRows<T>(db, storeName, userId)).filter((row) => row.syncState === "pending");
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

function bookingsCollection(userId: string) {
  return collection(firestore, "users", userId, "bookings");
}

function paymentsCollection(userId: string) {
  return collection(firestore, "users", userId, "payments");
}

function itineraryEditsCollection(userId: string) {
  return collection(firestore, "users", userId, "itineraryEdits");
}

function bookingDocument(booking: Booking) {
  return {
    tripPlanId: booking.tripPlanId,
    status: booking.status,
    participants: booking.participants,
    startDate: booking.startDate,
    endDate: booking.endDate,
    pricing: booking.pricing,
    paymentId: booking.paymentId,
    paymentStatus: booking.paymentStatus,
    installments: booking.installments ?? [],
    confirmationNumber: booking.confirmationNumber,
    notes: booking.notes,
    createdAt: booking.createdAt,
    cancelledAt: booking.cancelledAt,
  };
}

function paymentDocument(payment: PaymentTransaction) {
  return {
    bookingId: payment.bookingId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    transactionId: payment.transactionId,
    receiptUrl: payment.receiptUrl,
    failureReason: payment.failureReason,
    retryCount: payment.retryCount,
    maxRetries: payment.maxRetries,
    processedAt: payment.processedAt,
    refundedAt: payment.refundedAt,
    createdAt: payment.createdAt,
  };
}

function itineraryEditDocument(edit: CachedItineraryEdit) {
  return {
    bookingId: edit.bookingId,
    tripPlanId: edit.tripPlanId,
    insertPosition: edit.insertPosition,
    newStop: edit.newStop,
    createdAt: edit.createdAt,
  };
}

// ── Supabase converters ──

function toSupabaseBookingRow(row: CachedBooking): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.userId,
    trip_plan_id: row.tripPlanId,
    status: row.status,
    participants: row.participants,
    start_date: row.startDate,
    end_date: row.endDate,
    pricing: row.pricing as unknown,
    payment_id: row.paymentId ?? null,
    payment_status: row.paymentStatus,
    installments: (row.installments ?? []) as unknown,
    confirmation_number: row.confirmationNumber,
    notes: row.notes ?? null,
    created_at: row.createdAt,
    cancelled_at: row.cancelledAt ?? null,
    updated_at: row.updatedAt,
    sync_state: row.syncState,
    deleted: !!row.deleted,
  };
}

function fromSupabaseBookingRow(data: Record<string, unknown>): CachedBooking {
  return {
    id: String(data.id),
    userId: String(data.user_id),
    tripPlanId: (data.trip_plan_id as string) ?? "",
    status: (data.status as BookingStatus) ?? "draft",
    participants: typeof data.participants === "number" ? data.participants : Number(data.participants) || 0,
    startDate: (data.start_date as string) ?? "",
    endDate: (data.end_date as string) ?? "",
    pricing: (data.pricing as PriceBreakdown) ?? {
      basePrice: 0,
      taxes: 0,
      fees: 0,
      total: 0,
      currencyCode: "USD",
      breakdown: [],
    },
    paymentId: (data.payment_id as string | null) ?? undefined,
    paymentStatus: (data.payment_status as PaymentStatus) ?? "pending",
    installments: Array.isArray(data.installments) ? (data.installments as InstallmentSchedule[]) : [],
    confirmationNumber: (data.confirmation_number as string) ?? "",
    notes: (data.notes as string | null) ?? undefined,
    createdAt: (data.created_at as string) ?? new Date().toISOString(),
    cancelledAt: (data.cancelled_at as string | null) ?? undefined,
    updatedAt: (data.updated_at as string) ?? (data.created_at as string) ?? new Date().toISOString(),
    syncState: (data.sync_state as SyncState) ?? "synced",
    deleted: Boolean(data.deleted),
  };
}

function toSupabasePaymentRow(row: CachedPayment): Record<string, unknown> {
  // payments.method is TEXT in Supabase schema, store stringified JSON for structured methods
  const methodValue =
    typeof row.method === "string" ? row.method : JSON.stringify(row.method);
  return {
    id: row.id,
    user_id: row.userId,
    booking_id: row.bookingId,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    method: methodValue,
    transaction_id: row.transactionId ?? null,
    receipt_url: row.receiptUrl ?? null,
    failure_reason: row.failureReason ?? null,
    retry_count: row.retryCount,
    max_retries: row.maxRetries,
    processed_at: row.processedAt ?? null,
    refunded_at: row.refundedAt ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    sync_state: row.syncState,
  };
}

function fromSupabasePaymentRow(data: Record<string, unknown>): CachedPayment {
  let methodParsed: PaymentTransaction["method"];
  const rawMethod = data.method;
  if (typeof rawMethod === "string") {
    try {
      const parsed = JSON.parse(rawMethod);
      if (parsed && typeof parsed === "object" && "type" in parsed) {
        methodParsed = parsed as PaymentTransaction["method"];
      } else {
        // plain string like "card" stored historically
        methodParsed = { type: rawMethod as PaymentMethod } as PaymentTransaction["method"];
      }
    } catch {
      methodParsed = { type: rawMethod as PaymentMethod } as PaymentTransaction["method"];
    }
  } else if (rawMethod && typeof rawMethod === "object") {
    methodParsed = rawMethod as PaymentTransaction["method"];
  } else {
    methodParsed = { type: "cash_on_arrival" } as PaymentTransaction["method"];
  }
  return {
    id: String(data.id),
    bookingId: String(data.booking_id ?? ""),
    userId: String(data.user_id),
    amount: typeof data.amount === "number" ? data.amount : Number(data.amount) || 0,
    currency: (data.currency as string) ?? "USD",
    status: (data.status as PaymentStatus) ?? "pending",
    method: methodParsed,
    transactionId: (data.transaction_id as string | null) ?? undefined,
    receiptUrl: (data.receipt_url as string | null) ?? undefined,
    failureReason: (data.failure_reason as string | null) ?? undefined,
    retryCount: typeof data.retry_count === "number" ? data.retry_count : Number(data.retry_count) || 0,
    maxRetries: typeof data.max_retries === "number" ? data.max_retries : Number(data.max_retries) || 3,
    createdAt: (data.created_at as string) ?? new Date().toISOString(),
    updatedAt: (data.updated_at as string) ?? (data.created_at as string) ?? new Date().toISOString(),
    processedAt: (data.processed_at as string | null) ?? undefined,
    refundedAt: (data.refunded_at as string | null) ?? undefined,
    syncState: (data.sync_state as SyncState) ?? "synced",
  };
}

function toSupabaseItineraryEditRow(row: CachedItineraryEdit): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.userId,
    booking_id: row.bookingId,
    trip_plan_id: row.tripPlanId,
    insert_position: row.insertPosition,
    new_stop: row.newStop as unknown,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    sync_state: row.syncState,
  };
}

function fromSupabaseItineraryEditRow(data: Record<string, unknown>): CachedItineraryEdit {
  return {
    id: String(data.id),
    userId: String(data.user_id),
    bookingId: (data.booking_id as string) ?? "",
    tripPlanId: (data.trip_plan_id as string) ?? "",
    insertPosition: typeof data.insert_position === "number" ? data.insert_position : Number(data.insert_position) || 0,
    newStop: (data.new_stop as ItineraryDay) ?? { day: 0, title: "", stops: [] },
    createdAt: (data.created_at as string) ?? new Date().toISOString(),
    updatedAt: (data.updated_at as string) ?? (data.created_at as string) ?? new Date().toISOString(),
    syncState: (data.sync_state as SyncState) ?? "synced",
  };
}

async function flushBookingRow(db: IDBDatabase, row: CachedBooking) {
  if (isSupabaseConfigured && supabase) {
    try {
      if (row.deleted) {
        const { error } = await withSupabaseTimeout(
          supabase.from("bookings").delete().eq("user_id", row.userId).eq("id", row.id),
          "Booking sync timed out.",
        );
        if (error) throw new Error(error.message);
      } else {
        const { error } = await withSupabaseTimeout(
          supabase.from("bookings").upsert(toSupabaseBookingRow(row) as never, { onConflict: "user_id,id" }),
          "Booking sync timed out.",
        );
        if (error) throw new Error(error.message);
      }
      if (row.deleted) await deleteRow(db, BOOKINGS_STORE, row.userId, row.id);
      else await putRow(db, BOOKINGS_STORE, { ...row, syncState: "synced" });
      return;
    } catch (error) {
      console.warn("[booking-system] Supabase booking sync failed, trying Firestore:", error);
      try {
        const reference = doc(bookingsCollection(row.userId), row.id);
        await withFirebaseTimeout(
          row.deleted ? deleteDoc(reference) : setDoc(reference, bookingDocument(row)),
          "Booking sync timed out.",
        );
        if (row.deleted) await deleteRow(db, BOOKINGS_STORE, row.userId, row.id);
        else await putRow(db, BOOKINGS_STORE, { ...row, syncState: "synced" });
        return;
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  const reference = doc(bookingsCollection(row.userId), row.id);
  await withFirebaseTimeout(
    row.deleted ? deleteDoc(reference) : setDoc(reference, bookingDocument(row)),
    "Booking sync timed out.",
  );
  if (row.deleted) await deleteRow(db, BOOKINGS_STORE, row.userId, row.id);
  else await putRow(db, BOOKINGS_STORE, { ...row, syncState: "synced" });
}

async function flushPaymentRow(db: IDBDatabase, row: CachedPayment) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("payments").upsert(toSupabasePaymentRow(row) as never, { onConflict: "user_id,id" }),
        "Payment sync timed out.",
      );
      if (error) throw new Error(error.message);
      await putRow(db, PAYMENTS_STORE, { ...row, syncState: "synced" });
      return;
    } catch (error) {
      console.warn("[booking-system] Supabase payment sync failed, trying Firestore:", error);
      try {
        const reference = doc(paymentsCollection(row.userId), row.id);
        await withFirebaseTimeout(
          setDoc(reference, paymentDocument(row)),
          "Payment sync timed out.",
        );
        await putRow(db, PAYMENTS_STORE, { ...row, syncState: "synced" });
        return;
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  const reference = doc(paymentsCollection(row.userId), row.id);
  await withFirebaseTimeout(
    setDoc(reference, paymentDocument(row)),
    "Payment sync timed out.",
  );
  await putRow(db, PAYMENTS_STORE, { ...row, syncState: "synced" });
}

async function flushItineraryEditRow(db: IDBDatabase, row: CachedItineraryEdit) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("itinerary_edits").upsert(toSupabaseItineraryEditRow(row) as never, { onConflict: "id" }),
        "Itinerary edit sync timed out.",
      );
      if (error) throw new Error(error.message);
      await putRow(db, ITINERARY_EDITS_STORE, { ...row, syncState: "synced" });
      return;
    } catch (error) {
      console.warn("[booking-system] Supabase itinerary-edit sync failed, trying Firestore:", error);
      try {
        const reference = doc(itineraryEditsCollection(row.userId), row.id);
        await withFirebaseTimeout(
          setDoc(reference, itineraryEditDocument(row)),
          "Itinerary edit sync timed out.",
        );
        await putRow(db, ITINERARY_EDITS_STORE, { ...row, syncState: "synced" });
        return;
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  const reference = doc(itineraryEditsCollection(row.userId), row.id);
  await withFirebaseTimeout(
    setDoc(reference, itineraryEditDocument(row)),
    "Itinerary edit sync timed out.",
  );
  await putRow(db, ITINERARY_EDITS_STORE, { ...row, syncState: "synced" });
}

async function tryFlush<T>(rows: T[], flush: (row: T) => Promise<void>) {
  await Promise.all(rows.map(async (row) => {
    try {
      await flush(row);
    } catch (error) {
      deferCloudSync(error, "[booking-system] Cloud sync deferred; local data retained.");
    }
  }));
}

// ── Booking Operations ──

export async function getBookings(db: IDBDatabase, userId: string): Promise<Booking[]> {
  const cached = await userRows<CachedBooking>(db, BOOKINGS_STORE, userId);
  await tryFlush(cached.filter((row) => row.syncState === "pending"), (row) => flushBookingRow(db, row));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase.from("bookings").select("*").eq("user_id", userId),
        "Bookings are taking too long to load.",
      );
      if (error) throw new Error(error.message);
      const remote = (data as Record<string, unknown>[] | null ?? []).map(fromSupabaseBookingRow);
      await replaceSyncedRows(db, BOOKINGS_STORE, userId, remote);
    } catch (error) {
      console.warn("[booking-system] Supabase bookings fetch failed, trying Firestore:", error);
      try {
        const snapshot = await withFirebaseTimeout(
          getDocs(bookingsCollection(userId)),
          "Bookings are taking too long to load.",
        );
        const remote = snapshot.docs.map((item) => ({
          ...(item.data() as Omit<Booking, "id" | "userId">),
          id: item.id,
          userId,
          updatedAt: (item.data().updatedAt as string) ?? (item.data().createdAt as string),
          syncState: "synced" as const,
        }));
        await replaceSyncedRows(db, BOOKINGS_STORE, userId, remote as unknown as CachedBooking[]);
      } catch (fallbackError) {
        deferCloudSync(fallbackError, "[booking-system] Using cached bookings.");
      }
    }
  } else {
    try {
      const snapshot = await withFirebaseTimeout(
        getDocs(bookingsCollection(userId)),
        "Bookings are taking too long to load.",
      );
      const remote = snapshot.docs.map((item) => ({
        ...(item.data() as Omit<Booking, "id" | "userId">),
        id: item.id,
        userId,
        updatedAt: (item.data().updatedAt as string) ?? (item.data().createdAt as string),
        syncState: "synced" as const,
      }));
      await replaceSyncedRows(db, BOOKINGS_STORE, userId, remote as unknown as CachedBooking[]);
    } catch (error) {
      deferCloudSync(error, "[booking-system] Using cached bookings.");
    }
  }

  return (await userRows<CachedBooking>(db, BOOKINGS_STORE, userId))
    .filter((booking) => !booking.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBooking(
  db: IDBDatabase,
  userId: string,
  tripPlanId: string,
  participants: number,
  startDate: string,
  endDate: string,
  pricing: PriceBreakdown,
  confirmationNumber: string,
): Promise<Booking> {
  const now = new Date().toISOString();
  const booking: Booking = {
    id: `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId,
    tripPlanId,
    status: "draft",
    participants,
    startDate,
    endDate,
    pricing,
    paymentStatus: "pending",
    confirmationNumber,
    createdAt: now,
    updatedAt: now,
  };

  const row: CachedBooking = {
    ...booking,
    syncState: "pending",
  };

  await putRow(db, BOOKINGS_STORE, row);
  try {
    await flushBookingRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[booking-system] Booking queued for sync.");
  }

  return booking;
}

export async function updateBookingStatus(
  db: IDBDatabase,
  userId: string,
  bookingId: string,
  status: BookingStatus,
  paymentStatus?: PaymentStatus,
): Promise<void> {
  const bookings = await userRows<CachedBooking>(db, BOOKINGS_STORE, userId);
  const existing = bookings.find((b) => b.id === bookingId);
  if (!existing) throw new Error("Booking not found");

  const now = new Date().toISOString();
  const row: CachedBooking = {
    ...existing,
    status,
    paymentStatus: paymentStatus ?? existing.paymentStatus,
    updatedAt: now,
    syncState: "pending",
  };

  await putRow(db, BOOKINGS_STORE, row);
  try {
    await flushBookingRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[booking-system] Booking status update queued for sync.");
  }
}

// Back-compat alias: some call sites import `updateBooking`; keep both names
export const updateBooking = updateBookingStatus;

export async function addInstallmentSchedule(
  db: IDBDatabase,
  userId: string,
  bookingId: string,
  installments: InstallmentSchedule[],
): Promise<void> {
  const bookings = await userRows<CachedBooking>(db, BOOKINGS_STORE, userId);
  const existing = bookings.find((b) => b.id === bookingId);
  if (!existing) throw new Error("Booking not found");

  const now = new Date().toISOString();
  const row: CachedBooking = {
    ...existing,
    installments,
    updatedAt: now,
    syncState: "pending",
  };

  await putRow(db, BOOKINGS_STORE, row);
  try {
    await flushBookingRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[booking-system] Installment schedule queued for sync.");
  }
}

export async function cancelBooking(
  db: IDBDatabase,
  userId: string,
  bookingId: string,
): Promise<void> {
  const bookings = await userRows<CachedBooking>(db, BOOKINGS_STORE, userId);
  const existing = bookings.find((b) => b.id === bookingId);
  if (!existing) throw new Error("Booking not found");

  const now = new Date().toISOString();
  const row: CachedBooking = {
    ...existing,
    status: "cancelled",
    cancelledAt: now,
    updatedAt: now,
    syncState: "pending",
  };

  await putRow(db, BOOKINGS_STORE, row);
  try {
    await flushBookingRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[booking-system] Booking cancellation queued for sync.");
  }
}

// ── Payment Operations ──

export async function getPayments(db: IDBDatabase, userId: string): Promise<PaymentTransaction[]> {
  const cached = await userRows<CachedPayment>(db, PAYMENTS_STORE, userId);
  await tryFlush(cached.filter((row) => row.syncState === "pending"), (row) => flushPaymentRow(db, row));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase.from("payments").select("*").eq("user_id", userId),
        "Payments are taking too long to load.",
      );
      if (error) throw new Error(error.message);
      const remote = (data as Record<string, unknown>[] | null ?? []).map(fromSupabasePaymentRow);
      await replaceSyncedRows(db, PAYMENTS_STORE, userId, remote);
    } catch (error) {
      console.warn("[booking-system] Supabase payments fetch failed, trying Firestore:", error);
      try {
        const snapshot = await withFirebaseTimeout(
          getDocs(paymentsCollection(userId)),
          "Payments are taking too long to load.",
        );
        const remote = snapshot.docs.map((item) => ({
          ...(item.data() as Omit<PaymentTransaction, "id" | "userId">),
          id: item.id,
          userId,
          syncState: "synced" as const,
        }));
        await replaceSyncedRows(db, PAYMENTS_STORE, userId, remote as unknown as CachedPayment[]);
      } catch (fallbackError) {
        deferCloudSync(fallbackError, "[booking-system] Using cached payments.");
      }
    }
  } else {
    try {
      const snapshot = await withFirebaseTimeout(
        getDocs(paymentsCollection(userId)),
        "Payments are taking too long to load.",
      );
      const remote = snapshot.docs.map((item) => ({
        ...(item.data() as Omit<PaymentTransaction, "id" | "userId">),
        id: item.id,
        userId,
        syncState: "synced" as const,
      }));
      await replaceSyncedRows(db, PAYMENTS_STORE, userId, remote as unknown as CachedPayment[]);
    } catch (error) {
      deferCloudSync(error, "[booking-system] Using cached payments.");
    }
  }

  return (await userRows<CachedPayment>(db, PAYMENTS_STORE, userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function recordPayment(
  db: IDBDatabase,
  userId: string,
  payment: PaymentTransaction,
): Promise<void> {
  const row: CachedPayment = {
    ...payment,
    userId,
    syncState: "pending",
  };

  await putRow(db, PAYMENTS_STORE, row);
  try {
    await flushPaymentRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[booking-system] Payment recorded for sync.");
  }
}

export async function getPaymentsByBooking(
  db: IDBDatabase,
  userId: string,
  bookingId: string,
): Promise<PaymentTransaction[]> {
  const payments = await getPayments(db, userId);
  return payments.filter((p) => p.bookingId === bookingId);
}

// ── Itinerary Edit Operations ──

export async function insertItineraryStop(
  db: IDBDatabase,
  userId: string,
  bookingId: string,
  tripPlanId: string,
  position: number,
  newStop: ItineraryDay,
): Promise<string> {
  const now = new Date().toISOString();
  const editId = `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const row: CachedItineraryEdit = {
    id: editId,
    userId,
    bookingId,
    tripPlanId,
    insertPosition: position,
    newStop,
    createdAt: now,
    updatedAt: now,
    syncState: "pending",
  };

  await putRow(db, ITINERARY_EDITS_STORE, row);

  try {
    await flushItineraryEditRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[booking-system] Itinerary edit queued for sync.");
  }

  return editId;
}

// Back-compat alias for task wording `addItineraryEdit`
export const addItineraryEdit = insertItineraryStop;

export async function getItineraryEdits(
  db: IDBDatabase,
  userId: string,
  bookingId: string,
): Promise<CachedItineraryEdit[]> {
  const cached = await userRows<CachedItineraryEdit>(db, ITINERARY_EDITS_STORE, userId);
  await tryFlush(cached.filter((row) => row.syncState === "pending"), (row) => flushItineraryEditRow(db, row));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase.from("itinerary_edits").select("*").eq("user_id", userId),
        "Itinerary edits are taking too long to load.",
      );
      if (error) throw new Error(error.message);
      const remote = (data as Record<string, unknown>[] | null ?? []).map(fromSupabaseItineraryEditRow);
      // Replace synced rows for this user (deletes all + restores pending), then filter by bookingId in memory
      await replaceSyncedRows(db, ITINERARY_EDITS_STORE, userId, remote);
    } catch (error) {
      console.warn("[booking-system] Supabase itinerary-edits fetch failed, trying Firestore:", error);
      try {
        const snapshot = await withFirebaseTimeout(
          getDocs(itineraryEditsCollection(userId)),
          "Itinerary edits are taking too long to load.",
        );
        const remote = snapshot.docs.map((item) => ({
          ...(item.data() as {
            bookingId: string;
            tripPlanId: string;
            insertPosition: number;
            newStop: ItineraryDay;
            createdAt: string;
          }),
          id: item.id,
          userId,
          updatedAt: (item.data().createdAt as string) ?? new Date().toISOString(),
          syncState: "synced" as const,
        }));
        await replaceSyncedRows(db, ITINERARY_EDITS_STORE, userId, remote as unknown as CachedItineraryEdit[]);
      } catch (fallbackError) {
        deferCloudSync(fallbackError, "[booking-system] Using cached itinerary edits.");
      }
    }
  } else {
    try {
      const snapshot = await withFirebaseTimeout(
        getDocs(itineraryEditsCollection(userId)),
        "Itinerary edits are taking too long to load.",
      );
      const remote = snapshot.docs.map((item) => ({
        ...(item.data() as {
          bookingId: string;
          tripPlanId: string;
          insertPosition: number;
          newStop: ItineraryDay;
          createdAt: string;
        }),
        id: item.id,
        userId,
        updatedAt: (item.data().createdAt as string) ?? new Date().toISOString(),
        syncState: "synced" as const,
      }));
      await replaceSyncedRows(db, ITINERARY_EDITS_STORE, userId, remote as unknown as CachedItineraryEdit[]);
    } catch (error) {
      deferCloudSync(error, "[booking-system] Using cached itinerary edits.");
    }
  }

  const edits = await userRows<CachedItineraryEdit>(db, ITINERARY_EDITS_STORE, userId);
  return edits
    .filter((e) => e.bookingId === bookingId)
    .sort((a, b) => a.insertPosition - b.insertPosition);
}

// ── Database Schema Setup ──

export function setupBookingTables(db: IDBDatabase) {

  if (!db.objectStoreNames.contains(BOOKINGS_STORE)) {
    const store = db.createObjectStore(BOOKINGS_STORE, {
      keyPath: ["userId", "id"],
    });
    store.createIndex("by_user", "userId", { unique: false });
  }

  if (!db.objectStoreNames.contains(PAYMENTS_STORE)) {
    const store = db.createObjectStore(PAYMENTS_STORE, {
      keyPath: ["userId", "id"],
    });
    store.createIndex("by_user", "userId", { unique: false });
  }

  if (!db.objectStoreNames.contains(ITINERARY_EDITS_STORE)) {
    const store = db.createObjectStore(ITINERARY_EDITS_STORE, {
      keyPath: ["userId", "id"],
    });
    store.createIndex("by_user", "userId", { unique: false });
  }
}
