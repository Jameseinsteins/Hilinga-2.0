import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";

export type TouristQrStatus = "active" | "disabled" | "revoked";
export type TouristVisitStatus = "recorded" | "duplicate";

export type TouristPassport = {
  ownerUid: string;
  touristCode: string;
  firstName: string;
  lastName: string;
  profilePhoto: string;
  language: string;
  interests: string[];
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
  userLanguage: string;
  userInterests: string[];
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

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.");
  }
}

function now() {
  return new Date().toISOString();
}

function randomToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

function userProfileCode(userId: string) {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `HLG-U-${String(hash % 1_000_000).padStart(6, "0")}`;
}

function normalizePassport(ownerUid: string, value: Partial<TouristPassport>): TouristPassport {
  const timestamp = now();
  return {
    ownerUid,
    touristCode: value.touristCode?.replace(/^HLG-T-/, "HLG-U-") || userProfileCode(ownerUid),
    firstName: value.firstName || "",
    lastName: value.lastName || "",
    profilePhoto: value.profilePhoto || "",
    language: value.language || "English",
    interests: Array.isArray(value.interests) ? value.interests.filter((item): item is string => typeof item === "string") : [],
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

// ── Offline cache (localStorage) ──

const PASSPORT_CACHE_PREFIX = "hilinga:passport:";

function passportCacheKey(ownerUid: string): string {
  return `${PASSPORT_CACHE_PREFIX}${ownerUid}`;
}

function isOfflineError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes("offline") || msg.includes("failed to get document") || msg.includes("client is offline")) return true;
  if (msg.includes("network") || msg.includes("timed out") || msg.includes("timeout") || msg.includes("fetch failed")) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}

function loadPassportFromCache(ownerUid: string): TouristPassport | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(passportCacheKey(ownerUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TouristPassport>;
    return normalizePassport(ownerUid, parsed);
  } catch {
    return null;
  }
}

function savePassportToCache(passport: TouristPassport): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(passportCacheKey(passport.ownerUid), JSON.stringify(passport));
  } catch {}
}

// ── Supabase row types & converters ──

type TouristProfileRow = {
  owner_uid: string;
  tourist_code: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_photo: string | null;
  language: string | null;
  interests: string[] | null;
  nationality: string | null;
  country: string | null;
  region: string | null;
  province: string | null;
  city: string | null;
  verification_status: string | null;
  qr_token: string | null;
  qr_status: string | null;
  consent_enabled: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type TouristQrCodeRow = {
  qr_token: string;
  owner_uid: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TouristVisitLogRow = {
  id: string;
  business_id: string;
  tourist_id: string | null;
  tourist_code: string | null;
  tourist_name: string | null;
  tourist_country: string | null;
  tourist_province: string | null;
  user_language: string | null;
  user_interests: string[] | null;
  business_name: string | null;
  business_location: string | null;
  qr_token: string | null;
  scanned_by: string | null;
  visited_at: string | null;
  scan_method: string | null;
  status: string | null;
  created_at: string | null;
};

function passportToSupabaseRow(passport: TouristPassport): Record<string, unknown> {
  return {
    owner_uid: passport.ownerUid,
    tourist_code: passport.touristCode,
    first_name: passport.firstName,
    last_name: passport.lastName,
    profile_photo: passport.profilePhoto,
    language: passport.language,
    interests: passport.interests,
    nationality: passport.nationality,
    country: passport.country,
    region: passport.region,
    province: passport.province,
    city: passport.city,
    verification_status: passport.verificationStatus,
    qr_token: passport.qrToken,
    qr_status: passport.qrStatus,
    consent_enabled: passport.consentEnabled,
  };
}

function supabaseRowToPassport(row: TouristProfileRow): TouristPassport {
  return normalizePassport(row.owner_uid, {
    ownerUid: row.owner_uid,
    touristCode: row.tourist_code ?? undefined,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    profilePhoto: row.profile_photo ?? undefined,
    language: row.language ?? undefined,
    interests: row.interests ?? undefined,
    nationality: row.nationality ?? undefined,
    country: row.country ?? undefined,
    region: row.region ?? undefined,
    province: row.province ?? undefined,
    city: row.city ?? undefined,
    verificationStatus: (row.verification_status as TouristPassport["verificationStatus"]) ?? undefined,
    qrToken: row.qr_token ?? undefined,
    qrStatus: (row.qr_status as TouristQrStatus) ?? undefined,
    consentEnabled: row.consent_enabled ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  });
}

function supabaseVisitRowToVisit(row: TouristVisitLogRow): TouristVisit {
  return {
    id: row.id,
    touristId: String(row.tourist_id || ""),
    touristCode: String(row.tourist_code || ""),
    touristName: String(row.tourist_name || ""),
    touristCountry: String(row.tourist_country || ""),
    touristProvince: String(row.tourist_province || ""),
    userLanguage: String(row.user_language || "English"),
    userInterests: Array.isArray(row.user_interests) ? row.user_interests.filter((item): item is string => typeof item === "string") : [],
    businessId: String(row.business_id || ""),
    businessName: String(row.business_name || "Hilinga business"),
    businessLocation: String(row.business_location || ""),
    qrToken: String(row.qr_token || ""),
    scannedBy: String(row.scanned_by || ""),
    visitedAt: String(row.visited_at || row.created_at || now()),
    scanMethod: row.scan_method === "manual" ? "manual" : "camera",
    status: row.status === "duplicate" ? "duplicate" : "recorded",
    createdAt: String(row.created_at || row.visited_at || now()),
  };
}

async function supabaseCommitPassport(passport: TouristPassport, revokedToken?: string): Promise<TouristPassport> {
  const profileRow = passportToSupabaseRow(passport);
  const { error: profileError } = (await withSupabaseTimeout(
    supabase!.from("tourist_profiles").upsert(profileRow as never, { onConflict: "owner_uid" }),
    "Supabase tourist profile save timed out.",
  )) as { error: { message: string } | null };
  if (profileError) throw new Error(profileError.message);

  const qrRow = {
    qr_token: passport.qrToken,
    owner_uid: passport.ownerUid,
    status: passport.qrStatus,
  };
  const { error: qrError } = (await withSupabaseTimeout(
    supabase!.from("tourist_qr_codes").upsert(qrRow as never, { onConflict: "qr_token" }),
    "Supabase tourist QR save timed out.",
  )) as { error: { message: string } | null };
  if (qrError) throw new Error(qrError.message);

  if (revokedToken && revokedToken !== passport.qrToken) {
    const revokedRow = {
      qr_token: revokedToken,
      owner_uid: passport.ownerUid,
      status: "revoked" as const,
    };
    const { error: revokedError } = (await withSupabaseTimeout(
      supabase!.from("tourist_qr_codes").upsert(revokedRow as never, { onConflict: "qr_token" }),
      "Supabase revoked QR save timed out.",
    )) as { error: { message: string } | null };
    if (revokedError) throw new Error(revokedError.message);
  }
  savePassportToCache(passport);
  return passport;
}

async function commitPassport(passport: TouristPassport, revokedToken?: string) {
  requireSupabase();
  try {
    return await supabaseCommitPassport(passport, revokedToken);
  } catch (error) {
    if (isOfflineError(error)) {
      console.warn("[tourist-passport] Supabase offline — QR will sync when back online:", error);
      savePassportToCache(passport);
      return passport;
    }
    throw error as Error;
  }
}

export async function getTouristPassport(ownerUid: string) {
  requireSupabase();
  const cached = loadPassportFromCache(ownerUid);
  try {
    const { data, error } = (await withSupabaseTimeout(
      supabase!.from("tourist_profiles").select("*").eq("owner_uid", ownerUid).maybeSingle(),
      "Supabase tourist passport fetch timed out.",
    )) as { data: TouristProfileRow | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    if (data) {
      const passport = supabaseRowToPassport(data);
      savePassportToCache(passport);
      return passport;
    }
    if (cached) return cached;
    return null;
  } catch (error) {
    if (isOfflineError(error)) {
      if (cached) return cached;
      throw new Error("You are offline. Connect once to load your Profile QR — it will then work offline from cache.");
    }
    // For non-offline errors, still return cache if available (transient Supabase error)
    if (cached) {
      console.warn("[tourist-passport] Supabase getTouristPassport using cache after error:", error);
      return cached;
    }
    throw error as Error;
  }
}

export async function ensureTouristPassport(
  ownerUid: string,
  displayName: string,
  profilePhoto = "",
  accountProfile: { language?: string; interests?: string[]; nationality?: string; country?: string; country_iso2?: string } = {},
) {
  const existing = await getTouristPassport(ownerUid);
  const normalizedName = displayName.trim();
  const [firstName = "Hilinga User", ...rest] = normalizedName.split(/\s+/).filter(Boolean);
  if (existing) {
    return commitPassport(
      normalizePassport(ownerUid, {
        ...existing,
        ...(normalizedName ? { firstName, lastName: rest.join(" ") } : {}),
        profilePhoto: profilePhoto || existing.profilePhoto,
        language: accountProfile.language || existing.language,
        interests: accountProfile.interests ?? existing.interests,
        nationality: accountProfile.nationality || existing.nationality,
        country: accountProfile.country || existing.country,
      }),
    );
  }

  const created = normalizePassport(ownerUid, {
    touristCode: userProfileCode(ownerUid),
    firstName,
    lastName: rest.join(" "),
    profilePhoto,
    language: accountProfile.language || "English",
    interests: accountProfile.interests ?? [],
    nationality: accountProfile.nationality || "Filipino",
    country: accountProfile.country || "Philippines",
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
  if (!current) throw new Error("Set up your user profile before regenerating the Profile QR.");
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
  if (!trimmed) return "";
  // Try to parse as URL first — handles http://host/?profile_qr=TOKEN#business/visitors
  try {
    const url = new URL(trimmed, "https://hilinga.app");
    const paramToken = url.searchParams.get("profile_qr") || url.searchParams.get("tourist_token") || url.searchParams.get("qr_token") || url.searchParams.get("token");
    if (paramToken) {
      const cleaned = paramToken.replace(/[^A-Za-z0-9]/g, "");
      if (cleaned) return cleaned;
    }
    // also check hash fragment for token
    if (url.hash) {
      const hashMatch = url.hash.match(/(?:profile_qr|tourist_token|qr_token|token)=([A-Za-z0-9]+)/i);
      if (hashMatch?.[1]) return hashMatch[1];
    }
  } catch {}
  const match = trimmed.match(/(?:qr\/(?:profile|tourist)\/|(?:profile_qr|tourist_token|qr_token|token)=|hilinga:(?:profile|tourist):)([A-Za-z0-9]+)/i);
  if (match?.[1]) return match[1];
  // If it looks like a plain HLG tourist code, return it as-is (handled by resolveTouristQr fallback)
  const hlgMatch = trimmed.match(/HLG\s*-\s*U\s*-?\s*\d{4,8}/i);
  if (hlgMatch) return hlgMatch[0].replace(/[^A-Za-z0-9]/g, "");
  return trimmed.replace(/[^A-Za-z0-9]/g, "");
}

export async function resolveTouristQr(value: string) {
  requireSupabase();
  let token = tokenFromTouristQrValue(value);
  // Allow HLG tourist code as alternative input (e.g. HLG-U-123456) — resolve via tourist_profiles
  const isHlgCode = /^HLG[A-Za-z0-9]{6,12}$/i.test(token) || /^HLGU\d{4,8}$/i.test(token);
  if (isHlgCode) {
    // Try lookup by tourist_code directly
    try {
      const { data: codeData, error: codeError } = (await withSupabaseTimeout(
        supabase!.from("tourist_profiles").select("*").eq("tourist_code", token).maybeSingle(),
        "Supabase tourist code lookup timed out.",
      )) as { data: TouristProfileRow | null; error: { message: string } | null };
      if (!codeError && codeData) {
        const passportByCode = supabaseRowToPassport(codeData);
        if (passportByCode.qrStatus === "active" && passportByCode.consentEnabled) {
          // verify QR is still active in qr_codes table
          const { data: qrCheck } = (await withSupabaseTimeout(
            supabase!.from("tourist_qr_codes").select("*").eq("qr_token", passportByCode.qrToken).maybeSingle(),
            "Supabase QR check timed out.",
          )) as { data: TouristQrCodeRow | null; error: { message: string } | null };
          if (qrCheck && qrCheck.status === "active") return passportByCode;
        }
      }
      // also try with dash format HLG-U-xxxxxx
      const dashed = token.replace(/^HLGU/i, "HLG-U-");
      if (dashed !== token) {
        const { data: codeData2 } = (await withSupabaseTimeout(
          supabase!.from("tourist_profiles").select("*").eq("tourist_code", dashed).maybeSingle(),
          "Supabase tourist code lookup timed out.",
        )) as { data: TouristProfileRow | null; error: { message: string } | null };
        if (codeData2) {
          const passportByCode2 = supabaseRowToPassport(codeData2);
          if (passportByCode2.qrStatus === "active" && passportByCode2.consentEnabled) return passportByCode2;
        }
      }
    } catch {}
    // fall through to token error with helpful message
    throw new Error("That HLG code was not found or is not active. Use the QR link or 32-character token shown with your Profile QR.");
  }
  if (!/^[A-Za-z0-9]{24,128}$/.test(token)) {
    throw new Error("That QR code does not contain a valid Hilinga profile token. Paste the full QR link (with profile_qr=...) or the 32-character token — not just the HLG-U-... display code.");
  }
  const { data: qrData, error: qrError } = (await withSupabaseTimeout(
    supabase!.from("tourist_qr_codes").select("*").eq("qr_token", token).maybeSingle(),
    "Supabase QR resolve timed out.",
  )) as { data: TouristQrCodeRow | null; error: { message: string } | null };
  if (qrError) throw new Error(qrError.message);
  if (!qrData || qrData.status !== "active") {
    throw new Error("This Hilinga Profile QR is disabled, expired, or invalid.");
  }
  const ownerUid = String(qrData.owner_uid || "");
  const passport = ownerUid ? await getTouristPassport(ownerUid) : null;
  if (!passport || passport.qrToken !== token || passport.qrStatus !== "active" || !passport.consentEnabled) {
    throw new Error("This Profile QR is no longer active.");
  }
  return passport;
}

export async function findRecentTouristVisit(touristId: string, businessId: string) {
  requireSupabase();
  const cutoffIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = (await withSupabaseTimeout(
    supabase!
      .from("tourist_visit_logs")
      .select("*")
      .eq("business_id", businessId)
      .eq("tourist_id", touristId)
      .gte("visited_at", cutoffIso)
      .order("visited_at", { ascending: false })
      .limit(10),
    "Supabase findRecentTouristVisit timed out.",
  )) as { data: TouristVisitLogRow[] | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  if (data && data.length > 0) {
    const sorted = data.map(supabaseVisitRowToVisit).sort((a, b) => String(b.visitedAt).localeCompare(String(a.visitedAt)));
    return sorted[0] || null;
  }
  return null;
}

export async function recordTouristVisit(input: {
  passport: TouristPassport;
  businessId: string;
  businessName: string;
  businessLocation: string;
  scannedBy: string;
  scanMethod: "camera" | "manual";
}) {
  requireSupabase();
  const previous = await findRecentTouristVisit(input.passport.ownerUid, input.businessId);
  if (previous) return { visit: previous as TouristVisit, duplicate: true };
  const timestamp = now();
  const visit: Omit<TouristVisit, "id"> = {
    touristId: input.passport.ownerUid,
    touristCode: input.passport.touristCode,
    touristName: `${input.passport.firstName} ${input.passport.lastName}`.trim(),
    touristCountry: input.passport.country,
    touristProvince: input.passport.province,
    userLanguage: input.passport.language,
    userInterests: input.passport.interests,
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

  const row = {
    id,
    business_id: visit.businessId,
    tourist_id: visit.touristId,
    tourist_code: visit.touristCode,
    tourist_name: visit.touristName,
    tourist_country: visit.touristCountry,
    tourist_province: visit.touristProvince,
    user_language: visit.userLanguage,
    user_interests: visit.userInterests,
    business_name: visit.businessName,
    business_location: visit.businessLocation,
    qr_token: visit.qrToken,
    scanned_by: visit.scannedBy,
    visited_at: visit.visitedAt,
    scan_method: visit.scanMethod,
    status: visit.status,
    created_at: visit.createdAt,
  };
  const { error } = (await withSupabaseTimeout(
    supabase!.from("tourist_visit_logs").insert(row as never),
    "Supabase recordTouristVisit timed out.",
  )) as { error: { message: string } | null };
  if (error) throw new Error(error.message);
  return { visit: { id, ...visit }, duplicate: false };
}

function supabaseSubscribeToBusinessVisits(
  businessId: string,
  onVisits: (items: TouristVisit[]) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchAll() {
    try {
      const { data, error } = (await withSupabaseTimeout(
        supabase!.from("tourist_visit_logs").select("*").eq("business_id", businessId).order("visited_at", { ascending: false }).limit(100),
        "Supabase business visits fetch timed out.",
      )) as { data: TouristVisitLogRow[] | null; error: { message: string } | null };
      if (cancelled) return;
      if (error) {
        onError(new Error(error.message));
        return;
      }
      const mapped = (data ?? []).map(supabaseVisitRowToVisit).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
      onVisits(mapped);
    } catch (err) {
      if (cancelled) return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  void fetchAll();

  try {
    channel = supabase!
      .channel(`tourist-visits:business:${businessId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tourist_visit_logs", filter: `business_id=eq.${businessId}` },
        () => {
          void fetchAll();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void fetchAll();
      });
  } catch {
    channel = null;
  }

  return () => {
    cancelled = true;
    if (channel) void supabase!.removeChannel(channel);
  };
}

function supabaseSubscribeToTouristVisits(
  touristId: string,
  onVisits: (items: TouristVisit[]) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchAll() {
    try {
      const { data, error } = (await withSupabaseTimeout(
        supabase!.from("tourist_visit_logs").select("*").eq("tourist_id", touristId).order("visited_at", { ascending: false }).limit(100),
        "Supabase tourist visits fetch timed out.",
      )) as { data: TouristVisitLogRow[] | null; error: { message: string } | null };
      if (cancelled) return;
      if (error) {
        onError(new Error(error.message));
        return;
      }
      const mapped = (data ?? []).map(supabaseVisitRowToVisit).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
      onVisits(mapped);
    } catch (err) {
      if (cancelled) return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  void fetchAll();

  try {
    channel = supabase!
      .channel(`tourist-visits:tourist:${touristId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tourist_visit_logs", filter: `tourist_id=eq.${touristId}` },
        () => {
          void fetchAll();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void fetchAll();
      });
  } catch {
    channel = null;
  }

  return () => {
    cancelled = true;
    if (channel) void supabase!.removeChannel(channel);
  };
}

export function subscribeToBusinessVisits(
  businessId: string,
  onVisits: (items: TouristVisit[]) => void,
  onError: (error: Error) => void,
) {
  requireSupabase();
  return supabaseSubscribeToBusinessVisits(businessId, onVisits, onError);
}

export function subscribeToTouristVisits(
  touristId: string,
  onVisits: (items: TouristVisit[]) => void,
  onError: (error: Error) => void,
) {
  requireSupabase();
  return supabaseSubscribeToTouristVisits(touristId, onVisits, onError);
}

export function touristQrUrl(token: string) {
  const configuredOrigin = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim();
  const fallbackOrigin = typeof window === "undefined" ? "https://hilinga.app" : window.location.origin;
  const url = new URL("/", configuredOrigin || fallbackOrigin);
  url.searchParams.set("profile_qr", token);
  url.hash = "business/visitors";
  return url.toString();
}
