import {
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

import { auth } from "@/lib/firebase";
import { initializeCloudProfile } from "@/lib/cloud-profile";
import type { AccountMode } from "@/lib/account-mode";

export {
  signInWithEmail,
  createEmailAccount,
  requestPasswordReset,
  readableAuthError,
} from "@/lib/firebase-auth";

export async function signInWithGoogle(accountMode: AccountMode) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  if (getAdditionalUserInfo(credential)?.isNewUser) {
    await initializeCloudProfile(
      credential.user.uid,
      credential.user.displayName ?? "",
      accountMode,
    );
  }
}
