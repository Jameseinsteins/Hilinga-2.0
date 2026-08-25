import {
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { firestore } from "@/lib/firebase";

export type TouristQrStatus = "active" | "disabled" | "revoked";
export type TouristVisitStatus = "recorded" | "duplicate";

export type TouristPassport = {
  ownerUid: string;
  touristCode: string;
  firstName: string;
  lastName: string;
  profilePhoto: string;
  nationality: string;
  country: string;
  region: string;
  province: string;
  city: string;
  verificationStatus: "verified" | "pending";
  qrToken: string;
  qrStatus: TouristQrStatus;
  consentEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TouristVisit = {
  id: string;
  touristId: string;
  touristCode: string;
  touristName: string;
  touristCountry: string;
  touristProvince: string;
  businessId: string;
  businessName: string;
  businessLocation: string;
  qrToken: string;
  scannedBy: string;
  visitedAt: string;
  scanMethod: "camera" | "manual";
  status: TouristVisitStatus;
  createdAt: string;
};

const profiles = collection(firestore, "touristProfiles");
const qrCodes = collection(firestore, "touristQrCodes");
const visits = collection(firestore, "touristVisitLogs");

function now() {
  return new Date().toISOString();
}

function randomToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

function touristCode(userId: string) {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `HLG-T-${String(hash % 1_000_000).padStart(6, "0")}`;
}

function normalizePassport(ownerUid: string, value: Partial<TouristPassport>): TouristPassport {
  const timestamp = now();
  return {
    ownerUid,
    touristCode: value.touristCode || touristCode(ownerUid),
    firstName: value.firstName || "",
    lastName: value.lastName || "",
    profilePhoto: value.profilePhoto || "",
    nationality: value.nationality || "Filipino",
    country: value.country || "Philippines",
    region: value.region || "",
    province: value.province || "",
    city: value.city || "",
    verificationStatus: value.verificationStatus === "pending" ? "pending" : "verified",
    qrToken: value.qrToken || randomToken(),
    qrStatus: value.qrStatus === "active" || value.qrStatus === "revoked" ? value.qrStatus : "disabled",
    consentEnabled: value.consentEnabled === true,
    createdAt: value.createdAt || timestamp,
    updatedAt: value.updatedAt || timestamp,
  };
}

function qrRegistryRecord(passport: TouristPassport, status = passport.qrStatus) {
  return {
    ownerUid: passport.ownerUid,
    status,
    createdAt: passport.createdAt,
    updatedAt: passport.updatedAt,
  };
}

async function commitPassport(passport: TouristPassport, revokedToken?: string) {
  const batch = writeBatch(firestore);
  batch.set(doc(profiles, passport.ownerUid), passport, { merge: true });
  batch.set(doc(qrCodes, passport.qrToken), qrRegistryRecord(passport), { merge: true });
  if (revokedToken && revokedToken !== passport.qrToken) {
    batch.set(doc(qrCodes, revokedToken), qrRegistryRecord(passport, "revoked"), { merge: true });
  }
  await batch.commit();
  return passport;
}

export async function getTouristPassport(ownerUid: string) {
  const snapshot = await getDoc(doc(profiles, ownerUid));
  return snapshot.exists() ? normalizePassport(ownerUid, snapshot.data() as Partial<TouristPassport>) : null;
}

export async function ensureTouristPassport(ownerUid: string, displayName: string, profilePhoto = "") {
  const existing = await getTouristPassport(ownerUid);
  // Re-write both sides of the QR relationship so older or partially-created
  // passports recover from a missing token lookup document automatically.
  if (existing) return commitPassport(existing);

  const [firstName = "Traveler", ...rest] = displayName.trim().split(/\s+/).filter(Boolean);
  const created = normalizePassport(ownerUid, {
    touristCode: touristCode(ownerUid),
    firstName,
    lastName: rest.join(" "),
    profilePhoto,
    qrStatus: "disabled",
    consentEnabled: false,
  });
  return commitPassport(created);
}

export async function saveTouristPassport(ownerUid: string, input: Partial<TouristPassport>) {
  const current = await getTouristPassport(ownerUid);
  const saved = normalizePassport(ownerUid, { ...current, ...input, updatedAt: now() });
  return commitPassport(saved, current?.qrToken !== saved.qrToken ? current?.qrToken : undefined);
}

export async function regenerateTouristQr(ownerUid: string) {
  const current = await getTouristPassport(ownerUid);
  if (!current) throw new Error("Set up your tourist profile before regenerating the QR.");
  const regenerated = normalizePassport(ownerUid, {
    ...current,
    qrToken: randomToken(),
    qrStatus: "active",
    consentEnabled: true,
    updatedAt: now(),
  });
  return commitPassport(regenerated, current.qrToken);
}

export async function setTouristQrStatus(ownerUid: string, status: TouristQrStatus, consentEnabled = status === "active") {
  return saveTouristPassport(ownerUid, { qrStatus: status, consentEnabled });
}

export function tokenFromTouristQrValue(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/(?:qr\/tourist\/|tourist_token=|hilinga:tourist:)([A-Za-z0-9]+)/i);
  return match?.[1] || trimmed.replace(/[^A-Za-z0-9]/g, "");
}

export async function resolveTouristQr(value: string) {
  const token = tokenFromTouristQrValue(value);
  if (!/^[A-Za-z0-9]{24,128}$/.test(token)) {
    throw new Error("That QR code does not contain a valid Hilinga tourist token.");
  }
  const qrSnapshot = await getDoc(doc(qrCodes, token));
  if (!qrSnapshot.exists() || qrSnapshot.data().status !== "active") {
    throw new Error("This Hilinga QR is disabled, expired, or invalid.");
  }
  const ownerUid = String(qrSnapshot.data().ownerUid || "");
  const passport = ownerUid ? await getTouristPassport(ownerUid) : null;
  if (!passport || passport.qrToken !== token || passport.qrStatus !== "active" || !passport.consentEnabled) {
    throw new Error("This tourist QR is no longer active.");
  }
  return passport;
}

export async function findRecentTouristVisit(touristId: string, businessId: string) {
  const snapshot = await getDocs(query(
    visits,
    where("businessId", "==", businessId),
    where("touristId", "==", touristId),
    limit(10),
  ));
  const cutoff = Date.now() - 30 * 60 * 1000;
  const recent = snapshot.docs
    .map((item) => ({ id: item.id, ...(item.data() as Partial<TouristVisit>) }))
    .filter((item) => item.touristId === touristId)
    .filter((item) => item.visitedAt && new Date(item.visitedAt).getTime() >= cutoff)
    .sort((a, b) => String(b.visitedAt).localeCompare(String(a.visitedAt)))[0];
  return recent || null;
}

export async function recordTouristVisit(input: {
  passport: TouristPassport;
  businessId: string;
  businessName: string;
  businessLocation: string;
  scannedBy: string;
  scanMethod: "camera" | "manual";
}) {
  const previous = await findRecentTouristVisit(input.passport.ownerUid, input.businessId);
  if (previous) return { visit: previous as TouristVisit, duplicate: true };
  const timestamp = now();
  const visit: Omit<TouristVisit, "id"> = {
    touristId: input.passport.ownerUid,
    touristCode: input.passport.touristCode,
    touristName: `${input.passport.firstName} ${input.passport.lastName}`.trim(),
    touristCountry: input.passport.country,
    touristProvince: input.passport.province,
    businessId: input.businessId,
    businessName: input.businessName,
    businessLocation: input.businessLocation,
    qrToken: input.passport.qrToken,
    scannedBy: input.scannedBy,
    visitedAt: timestamp,
    scanMethod: input.scanMethod,
    status: "recorded",
    createdAt: timestamp,
  };
  const id = crypto.randomUUID();
  await setDoc(doc(visits, id), visit);
  return { visit: { id, ...visit }, duplicate: false };
}

function toVisit(id: string, value: Record<string, unknown>): TouristVisit {
  return {
    id,
    touristId: String(value.touristId || ""),
    touristCode: String(value.touristCode || ""),
    touristName: String(value.touristName || ""),
    touristCountry: String(value.touristCountry || ""),
    touristProvince: String(value.touristProvince || ""),
    businessId: String(value.businessId || ""),
    businessName: String(value.businessName || "Hilinga business"),
    businessLocation: String(value.businessLocation || ""),
    qrToken: String(value.qrToken || ""),
    scannedBy: String(value.scannedBy || ""),
    visitedAt: String(value.visitedAt || value.createdAt || now()),
    scanMethod: value.scanMethod === "manual" ? "manual" : "camera",
    status: value.status === "duplicate" ? "duplicate" : "recorded",
    createdAt: String(value.createdAt || value.visitedAt || now()),
  };
}

export function subscribeToBusinessVisits(businessId: string, onVisits: (items: TouristVisit[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(visits, where("businessId", "==", businessId), limit(100)), (snapshot) => {
    onVisits(snapshot.docs.map((item) => toVisit(item.id, item.data())).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)));
  }, onError);
}

export function subscribeToTouristVisits(touristId: string, onVisits: (items: TouristVisit[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(visits, where("touristId", "==", touristId), limit(100)), (snapshot) => {
    onVisits(snapshot.docs.map((item) => toVisit(item.id, item.data())).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)));
  }, onError);
}

export function touristQrUrl(token: string) {
  const configuredOrigin = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim();
  const fallbackOrigin = typeof window === "undefined" ? "https://hilinga.app" : window.location.origin;
  const url = new URL("/", configuredOrigin || fallbackOrigin);
  url.searchParams.set("tourist_token", token);
  url.hash = "business/visitors";
  return url.toString();
}
