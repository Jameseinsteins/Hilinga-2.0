type FirebaseRequestUser = {
  uid: string;
  email: string;
  emailVerified: boolean;
};

export class ApiAuthenticationError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function bearerToken(req: any) {
  const authorization = String(req.headers?.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function authenticateFirebaseRequest(req: any): Promise<FirebaseRequestUser> {
  const token = bearerToken(req);
  if (!token) throw new ApiAuthenticationError(401, "AUTH_REQUIRED", "Sign in to use the AI planner.");

  const apiKey = String(process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || "").trim();
  if (!apiKey) {
    throw new ApiAuthenticationError(503, "AUTH_NOT_CONFIGURED", "Backend authentication is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const account = payload?.users?.[0];
    if (!response.ok || !account?.localId || account.disabled === true) {
      throw new ApiAuthenticationError(401, "INVALID_SESSION", "Your session has expired. Please sign in again.");
    }
    return {
      uid: String(account.localId),
      email: String(account.email || ""),
      emailVerified: account.emailVerified === true,
    };
  } catch (error) {
    if (error instanceof ApiAuthenticationError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiAuthenticationError(503, "AUTH_TIMEOUT", "Sign-in verification timed out. Please try again.");
    }
    throw new ApiAuthenticationError(503, "AUTH_UNAVAILABLE", "Sign-in verification is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}
