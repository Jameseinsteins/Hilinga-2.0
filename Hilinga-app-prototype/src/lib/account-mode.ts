export type AccountMode = "explore" | "business";

const PENDING_MODE_KEY = "hilinga_pending_account_mode";
const LAST_MODE_KEY = "hilinga_last_account_mode";
const USER_MODE_PREFIX = "hilinga_account_mode_v1:";

function isAccountMode(value: string | null): value is AccountMode {
  return value === "explore" || value === "business";
}

export function selectAccountMode(mode: AccountMode) {
  localStorage.setItem(PENDING_MODE_KEY, mode);
  localStorage.setItem(LAST_MODE_KEY, mode);
}

export function getLastAccountMode(): AccountMode {
  const mode = localStorage.getItem(LAST_MODE_KEY);
  return isAccountMode(mode) ? mode : "explore";
}

export function resolveAccountMode(userId: string, cloudMode?: AccountMode): AccountMode {
  // A pending mode means the user explicitly selected a mode on the login/signup
  // screen. It must take priority over whatever is stored in the cloud profile,
  // otherwise switching modes (e.g. explore → business) at login is ignored.
  const pendingMode = localStorage.getItem(PENDING_MODE_KEY);
  if (isAccountMode(pendingMode)) {
    localStorage.setItem(`${USER_MODE_PREFIX}${userId}`, pendingMode);
    localStorage.setItem(LAST_MODE_KEY, pendingMode);
    localStorage.removeItem(PENDING_MODE_KEY);
    return pendingMode;
  }

  // No pending selection — honour the cloud profile value and sync it locally.
  if (cloudMode && isAccountMode(cloudMode)) {
    localStorage.setItem(`${USER_MODE_PREFIX}${userId}`, cloudMode);
    localStorage.setItem(LAST_MODE_KEY, cloudMode);
    return cloudMode;
  }

  const savedMode = localStorage.getItem(`${USER_MODE_PREFIX}${userId}`);
  return isAccountMode(savedMode) ? savedMode : "explore";
}
