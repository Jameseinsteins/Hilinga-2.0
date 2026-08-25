import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";

import { firestore } from "@/lib/firebase";

export type BusinessInquiryStatus = "unread" | "read";

export type BusinessInquiry = {
  id: string;
  businessId: string;
  businessName: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  message: string;
  status: BusinessInquiryStatus;
  createdAt: Date;
  updatedAt: Date;
};

const inquiries = collection(firestore, "businessInquiries");
const likes = collection(firestore, "businessPostLikes");
const profileViews = collection(firestore, "businessProfileViews");

function timestampDate(value: unknown) {
  return value && typeof (value as Timestamp).toDate === "function"
    ? (value as Timestamp).toDate()
    : new Date(0);
}

function toInquiry(id: string, value: Record<string, unknown>): BusinessInquiry {
  return {
    id,
    businessId: String(value.businessId || ""),
    businessName: String(value.businessName || "Hilinga business"),
    senderUid: String(value.senderUid || ""),
    senderName: String(value.senderName || "Hilinga traveler"),
    senderEmail: String(value.senderEmail || ""),
    message: String(value.message || ""),
    status: value.status === "read" ? "read" : "unread",
    createdAt: timestampDate(value.createdAt),
    updatedAt: timestampDate(value.updatedAt),
  };
}

export async function sendBusinessInquiry(input: {
  businessId: string;
  businessName: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  message: string;
}) {
  const message = input.message.trim();
  if (message.length < 10) throw new Error("Write at least 10 characters so the business can help you.");
  if (message.length > 1500) throw new Error("Keep your message under 1,500 characters.");

  await addDoc(inquiries, {
    businessId: input.businessId,
    businessName: input.businessName.trim(),
    senderUid: input.senderUid,
    senderName: input.senderName.trim().slice(0, 80),
    senderEmail: input.senderEmail.trim().slice(0, 160),
    message,
    status: "unread",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToBusinessInquiries(
  businessId: string,
  onInquiries: (items: BusinessInquiry[]) => void,
  onError: (error: Error) => void,
) {
  const inquiryQuery = query(inquiries, where("businessId", "==", businessId), limit(100));
  return onSnapshot(inquiryQuery, (snapshot) => {
    onInquiries(snapshot.docs
      .map((item) => toInquiry(item.id, item.data()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  }, onError);
}

export async function setBusinessInquiryStatus(inquiryId: string, status: BusinessInquiryStatus) {
  await updateDoc(doc(inquiries, inquiryId), { status, updatedAt: serverTimestamp() });
}

export async function deleteBusinessInquiry(inquiryId: string) {
  await deleteDoc(doc(inquiries, inquiryId));
}

function likeId(postId: string, userId: string) {
  return `${postId}_${userId}`;
}

export function subscribeToLikedBusinessPosts(
  userId: string,
  onLikedIds: (postIds: Set<string>) => void,
  onError: (error: Error) => void,
) {
  const likesQuery = query(likes, where("userId", "==", userId), limit(500));
  return onSnapshot(likesQuery, (snapshot) => {
    onLikedIds(new Set(snapshot.docs.map((item) => String(item.data().postId || "")).filter(Boolean)));
  }, onError);
}

export async function setBusinessPostLiked(postId: string, userId: string, liked: boolean) {
  const reference = doc(likes, likeId(postId, userId));
  if (!liked) {
    await deleteDoc(reference);
    return;
  }
  await setDoc(reference, { postId, userId, createdAt: serverTimestamp() });
}

export async function recordBusinessProfileView(input: {
  businessId: string;
  businessName: string;
  viewerUid: string;
}) {
  const viewId = `${input.businessId}_${input.viewerUid}`;
  await setDoc(doc(profileViews, viewId), {
    businessId: input.businessId,
    businessName: input.businessName,
    viewerUid: input.viewerUid,
    viewedAt: serverTimestamp(),
  });
}

export function subscribeToBusinessProfileViewCount(
  businessId: string,
  onCount: (count: number) => void,
  onError: (error: Error) => void,
) {
  const viewsQuery = query(profileViews, where("businessId", "==", businessId), limit(1000));
  return onSnapshot(viewsQuery, (snapshot) => onCount(snapshot.size), onError);
}
