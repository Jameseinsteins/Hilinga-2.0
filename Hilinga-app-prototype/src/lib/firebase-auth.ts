import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { auth } from "@/lib/firebase";
import { initializeCloudProfile } from "@/lib/cloud-profile";
import type { AccountMode } from "@/lib/account-mode";

export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (!credential.user.emailVerified) {
    await signOut(auth);
    throw new Error("Confirm your email before signing in.");
  }
}

export async function createEmailAccount(email: string, password: string, accountMode: AccountMode) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await initializeCloudProfile(credential.user.uid, "", accountMode);
  await sendEmailVerification(credential.user);
  await signOut(auth);
}

export async function requestPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export function readableAuthError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";

  const messages: Record<string, string> = {
    "auth/email-already-in-use": "An account already uses this email address.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/network-request-failed": "Check your internet connection and try again.",
    "auth/popup-blocked": "Allow pop-ups for this site, then try again.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/weak-password": "Choose a stronger password with at least 6 characters.",
  };

  return messages[code] ??
    (error instanceof Error ? error.message : "Please try again.");
}
