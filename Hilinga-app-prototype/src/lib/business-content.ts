import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";

import { firestore } from "@/lib/firebase";

export type BusinessPostCategory = "Photos & Videos" | "Events" | "Promotions";

export type BusinessPost = {
  id: string;
  ownerUid?: string;
  sourceId?: string;
  businessId: string;
  businessName: string;
  businessCategory: string;
  businessLocation: string;
  businessLogoUrl: string;
  category: BusinessPostCategory;
  title: string;
  detail: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  eventDate?: string;
  eventLocation?: string;
  promotionOffer?: string;
  promotionEnds?: string;
  createdAt: string;
};

export type PublishBusinessPostInput = Omit<BusinessPost, "id" | "businessId"> & {
  ownerUid: string;
  sourceId: string;
};

export type BusinessPageInfo = {
  name: string;
  businessScale: "Small business" | "Big enterprise";
  category: string;
  location: string;
  phone: string;
  email: string;
  hours: string;
  about: string;
  coverUrl: string;
  logoUrl: string;
};

type StoredBusinessPage = Partial<BusinessPageInfo> & {
  ownerUid?: string;
  createdAt?: string;
  updatedAt?: string;
  latitude?: number;
  longitude?: number;
};

export type RegisteredSmallBusiness = {
  id: string;
  ownerUid: string;
  name: string;
  businessScale: "Small business" | "Big enterprise";
  category: string;
  location: string;
  phone: string;
  email: string;
  hours: string;
  about: string;
  coverUrl: string;
  logoUrl: string;
  latitude: number;
  longitude: number;
};

export type StoredBusinessItem = Omit<BusinessPost, "id" | "ownerUid" | "sourceId" | "businessId" | "businessName" | "businessCategory" | "businessLocation" | "businessLogoUrl" | "category" | "mediaUrl" | "mediaType"> & {
  id: string;
  category?: BusinessPostCategory;
  kind?: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
};

export const BUSINESS_CONTENT_CHANGED_EVENT = "hilinga:business-content-changed";

const businessPostsCollection = collection(firestore, "businessPosts");
const businessesCollection = collection(firestore, "businesses");

const ALBAY_TOWN_COORDINATES: Array<{ patterns: RegExp[]; lat: number; lng: number }> = [
  { patterns: [/cagsawa/i, /daraga/i, /busay/i, /anislag/i], lat: 13.1417, lng: 123.7150 },
  { patterns: [/boulevard/i, /embarcadero/i, /port/i, /dap-dap/i], lat: 13.1430, lng: 123.7550 },
  { patterns: [/legazpi/i, /peñaranda/i, /rizal/i, /gogon/i, /imperial/i, /maroroy/i, /rawis/i], lat: 13.1391, lng: 123.7438 },
  { patterns: [/camalig/i, /sumlang/i, /quituinan/i, /hoyop/i], lat: 13.1511, lng: 123.6667 },
  { patterns: [/guinobatan/i, /masaraga/i], lat: 13.1903, lng: 123.6010 },
  { patterns: [/ligao/i, /kawa-kawa/i, /kawakawa/i], lat: 13.2411, lng: 123.5358 },
  { patterns: [/mayon skyline/i, /tabaco/i], lat: 13.3575, lng: 123.7333 },
  { patterns: [/bacacay/i, /misibis/i, /cagraray/i], lat: 13.2933, lng: 123.7917 },
  { patterns: [/tiwi/i, /joroan/i], lat: 13.4570, lng: 123.6800 },
  { patterns: [/santo domingo/i, /sto\.? domingo/i], lat: 13.2356, lng: 123.7744 },
  { patterns: [/polangui/i], lat: 13.2950, lng: 123.4860 },
  { patterns: [/oas/i], lat: 13.2580, lng: 123.5010 },
  { patterns: [/libon/i], lat: 13.3000, lng: 123.4350 },
  { patterns: [/jovellar/i, /quitinday/i], lat: 13.0760, lng: 123.6020 },
  { patterns: [/malilipot/i], lat: 13.3150, lng: 123.7380 },
  { patterns: [/malinao/i], lat: 13.4090, lng: 123.6930 },
  { patterns: [/manito/i], lat: 13.1200, lng: 123.8700 },
];

function cloudPostId(ownerUid: string, sourceId: string) {
  return `${ownerUid}_${sourceId}`;
}

function normalizeBusinessPage(page: Partial<BusinessPageInfo>): BusinessPageInfo {
  return {
    name: page.name?.trim() || "Local business",
    businessScale: page.businessScale === "Big enterprise" ? "Big enterprise" : "Small business",
    category: page.category?.trim() || "Local Business",
    location: page.location?.trim() || "Legazpi City, Albay",
    phone: page.phone?.trim() || "",
    email: page.email?.trim() || "",
    hours: page.hours?.trim() || "Hours not provided",
    about: page.about?.trim() || "A locally registered business on Hilinga.",
    coverUrl: page.coverUrl ?? "",
    logoUrl: page.logoUrl ?? "",
  };
}

function toRegisteredBusiness(ownerUid: string, value: StoredBusinessPage): RegisteredSmallBusiness {
  const page = normalizeBusinessPage(value);
  const coords = typeof value.latitude === "number" && typeof value.longitude === "number"
    ? { latitude: value.latitude, longitude: value.longitude }
    : getAddressCoordinates(page.location, ownerUid);
  return {
    id: `registered-${ownerUid}`,
    ownerUid,
    ...page,
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
}

export async function saveBusinessPage(ownerUid: string, page: BusinessPageInfo) {
  const normalized = normalizeBusinessPage(page);
  if (normalized.coverUrl.length > 450_000 || normalized.logoUrl.length > 220_000) {
    throw new Error("The business photos are too large for the free cloud database.");
  }
  const pageRef = doc(firestore, "businesses", ownerUid);
  const existing = await getDoc(pageRef);
  const savedAt = new Date().toISOString();
  const coords = getAddressCoordinates(normalized.location, ownerUid);
  const stored = {
    ownerUid,
    ...normalized,
    latitude: coords.latitude,
    longitude: coords.longitude,
    createdAt: existing.exists() && typeof existing.data().createdAt === "string" ? existing.data().createdAt : savedAt,
    updatedAt: savedAt,
  };
  await setDoc(pageRef, stored);
  return normalizeBusinessPage(stored);
}

export async function ensureBusinessPage(ownerUid: string, fallback: BusinessPageInfo) {
  const snapshot = await getDoc(doc(firestore, "businesses", ownerUid));
  if (snapshot.exists()) {
    return normalizeBusinessPage(snapshot.data() as StoredBusinessPage);
  }
  return saveBusinessPage(ownerUid, fallback);
}

export async function hasBusinessPage(ownerUid: string) {
  return (await getDoc(doc(firestore, "businesses", ownerUid))).exists();
}

export function subscribeToOwnedBusinessPage(
  ownerUid: string,
  onPage: (page: BusinessPageInfo) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(doc(firestore, "businesses", ownerUid), (snapshot) => {
    if (!snapshot.exists()) return;
    onPage(normalizeBusinessPage(snapshot.data() as StoredBusinessPage));
  }, onError);
}

function toBusinessPost(id: string, value: Omit<BusinessPost, "id">): BusinessPost {
  return { ...value, id };
}

export async function publishBusinessPost(input: PublishBusinessPostInput) {
  const id = cloudPostId(input.ownerUid, input.sourceId);
  if (input.mediaType === "video" || input.mediaUrl.startsWith("data:video/")) {
    throw new Error("Video posts require paid file storage. Use a photo on the free plan.");
  }
  if (!input.mediaUrl.startsWith("data:image/") && !/^https:\/\//i.test(input.mediaUrl)) {
    throw new Error("Choose a valid post photo.");
  }
  if (input.mediaUrl.length > 700_000) {
    throw new Error("That photo is too large for the free cloud database.");
  }
  const post: Omit<BusinessPost, "id"> = {
    ownerUid: input.ownerUid,
    sourceId: input.sourceId,
    businessId: `registered-${input.ownerUid}`,
    businessName: input.businessName.trim(),
    businessCategory: input.businessCategory.trim(),
    businessLocation: input.businessLocation.trim(),
    businessLogoUrl: input.businessLogoUrl,
    category: input.category,
    title: input.title.trim(),
    detail: input.detail.trim(),
    mediaUrl: input.mediaUrl,
    mediaType: "image",
    createdAt: input.createdAt,
    ...(input.eventDate ? { eventDate: input.eventDate } : {}),
    ...(input.eventLocation ? { eventLocation: input.eventLocation.trim() } : {}),
    ...(input.promotionOffer ? { promotionOffer: input.promotionOffer.trim() } : {}),
    ...(input.promotionEnds ? { promotionEnds: input.promotionEnds } : {}),
  };
  await setDoc(doc(firestore, "businessPosts", id), post);
  return toBusinessPost(id, post);
}

export function subscribeToPublishedBusinessPosts(
  onPosts: (posts: BusinessPost[]) => void,
  onError: (error: Error) => void,
) {
  const postsQuery = query(businessPostsCollection, orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(postsQuery, (snapshot) => {
    publishedBusinessPostCache = snapshot.docs.map((snapshotDoc) => toBusinessPost(
      snapshotDoc.id,
      snapshotDoc.data() as Omit<BusinessPost, "id">,
    ));
    onPosts(publishedBusinessPostCache);
    window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT));
  }, onError);
}

export function subscribeToOwnedBusinessPosts(
  ownerUid: string,
  onPosts: (posts: BusinessPost[]) => void,
  onError: (error: Error) => void,
) {
  const postsQuery = query(businessPostsCollection, where("ownerUid", "==", ownerUid));
  return onSnapshot(postsQuery, (snapshot) => {
    onPosts(snapshot.docs.map((snapshotDoc) => toBusinessPost(
      snapshotDoc.id,
      snapshotDoc.data() as Omit<BusinessPost, "id">,
    )).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, onError);
}

export function getAddressCoordinates(address: string, ownerId: string): { latitude: number; longitude: number } {
  const match = ALBAY_TOWN_COORDINATES.find((item) => item.patterns.some((pattern) => pattern.test(address)));
  const baseLat = match?.lat ?? 13.1391;
  const baseLng = match?.lng ?? 123.7438;

  let hash = 0;
  for (let i = 0; i < ownerId.length; i += 1) {
    hash = (hash * 31 + ownerId.charCodeAt(i)) & 0xffffffff;
  }
  const offsetLat = (((hash % 80) - 40) * 0.0002);
  const offsetLng = ((((hash >> 3) % 80) - 40) * 0.0002);

  return {
    latitude: Math.round((baseLat + offsetLat) * 10000) / 10000,
    longitude: Math.round((baseLng + offsetLng) * 10000) / 10000,
  };
}

let registeredBusinessCache: RegisteredSmallBusiness[] = [];
let publishedBusinessPostCache: BusinessPost[] = [];

export function readRegisteredBusinesses() {
  return registeredBusinessCache;
}

export function readRegisteredSmallBusinesses() {
  return readRegisteredBusinesses().filter((business) => business.businessScale === "Small business");
}

export function subscribeToRegisteredBusinesses(
  onBusinesses: (businesses: RegisteredSmallBusiness[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(businessesCollection, (snapshot) => {
    registeredBusinessCache = snapshot.docs
      .map((snapshotDoc) => toRegisteredBusiness(snapshotDoc.id, snapshotDoc.data() as StoredBusinessPage))
      .sort((a, b) => a.name.localeCompare(b.name));
    onBusinesses(registeredBusinessCache);
    window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT));
  }, onError);
}

export function readPublishedBusinessPosts() {
  return publishedBusinessPostCache;
}
