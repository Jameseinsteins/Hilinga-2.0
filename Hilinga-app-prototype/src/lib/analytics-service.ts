import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";
export type Unsubscribe = () => void;

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static fromDate(d: Date) { return new Timestamp(Math.floor(d.getTime()/1000), (d.getTime()%1000)*1e6); }
  toDate() { return new Date(this.seconds*1000 + this.nanoseconds/1e6); }
  toMillis() { return this.seconds*1000 + this.nanoseconds/1e6; }
  static now() { return Timestamp.fromDate(new Date()); }
}

export type AnalyticsPeriod = "day" | "week" | "month" | "year";

export interface BusinessVisitorStats {
  totalVisitors: number;
  uniqueCountries: number;
  uniqueProvinces: number;
  topCountries: Array<{ country: string; count: number }>;
  topProvinces: Array<{ province: string; count: number }>;
  dailyBreakdown: Array<{ date: string; count: number }>;
  lastUpdated: Date;
}

export interface AdminTouristStats {
  totalTourists: number;
  totalVisits: number;
  uniqueCountries: number;
  topCountries: Array<{ country: string; count: number }>;
  topProvinces: Array<{ province: string; count: number }>;
  monthlyTrend: Array<{ month: string; count: number }>;
  peakMonth: { month: string; count: number } | null;
  lastUpdated: Date;
}

interface TouristVisit {
  id?: string;
  businessId: string;
  visitedAt: string;
  touristCountry: string;
  touristProvince: string;
  touristCode: string;
  touristName: string;
  userLanguage: string;
  userInterests: string[];
  scannedBy: string;
  scanMethod: "camera" | "manual";
  status: "recorded" | "duplicate";
  createdAt: string;
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.");
  }
}

export function toDate(value: unknown): Date {
  if (value && typeof (value as Timestamp).toDate === "function") {
    return (value as Timestamp).toDate();
  }
  return new Date(0);
}

function getDateRange(period: AnalyticsPeriod, referenceDate: Date = new Date()) {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);

  const start = new Date(referenceDate);
  switch (period) {
    case "day":
      start.setHours(0, 0, 0, 0);
      break;
    case "week":
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "year":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

// ── Supabase row type & converters ──
type SupabaseVisitRow = {
  id: string;
  business_id: string | null;
  visited_at: string | null;
  tourist_country: string | null;
  tourist_province: string | null;
  tourist_code: string | null;
  tourist_name: string | null;
  user_language: string | null;
  user_interests: string[] | null;
  scanned_by: string | null;
  scan_method: string | null;
  status: string | null;
  created_at: string | null;
};

function supabaseRowToVisit(row: SupabaseVisitRow): TouristVisit & { id: string } {
  return {
    id: row.id,
    businessId: row.business_id ?? "",
    visitedAt: row.visited_at ?? row.created_at ?? new Date(0).toISOString(),
    touristCountry: row.tourist_country ?? "Unknown",
    touristProvince: row.tourist_province ?? "Unknown",
    touristCode: row.tourist_code ?? "",
    touristName: row.tourist_name ?? "",
    userLanguage: row.user_language ?? "English",
    userInterests: Array.isArray(row.user_interests) ? row.user_interests.filter((v): v is string => typeof v === "string") : [],
    scannedBy: row.scanned_by ?? "",
    scanMethod: row.scan_method === "manual" ? "manual" : "camera",
    status: row.status === "duplicate" ? "duplicate" : "recorded",
    createdAt: row.created_at ?? row.visited_at ?? new Date(0).toISOString(),
  };
}

function aggregateBusinessStats(visitDocs: Array<TouristVisit & { id: string }>): BusinessVisitorStats {
  const countries = new Map<string, number>();
  const provinces = new Map<string, number>();
  const dailyBreakdown = new Map<string, number>();

  visitDocs.forEach((visit) => {
    const country = visit.touristCountry || "Unknown";
    countries.set(country, (countries.get(country) || 0) + 1);
    const province = visit.touristProvince || "Unknown";
    provinces.set(province, (provinces.get(province) || 0) + 1);
    const date = new Date(visit.visitedAt);
    const dateKey = date.toISOString().split("T")[0];
    dailyBreakdown.set(dateKey, (dailyBreakdown.get(dateKey) || 0) + 1);
  });

  const topCountries = Array.from(countries.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const topProvinces = Array.from(provinces.entries())
    .map(([province, count]) => ({ province, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const dailyBreakdownArray = Array.from(dailyBreakdown.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalVisitors: visitDocs.length,
    uniqueCountries: countries.size,
    uniqueProvinces: provinces.size,
    topCountries,
    topProvinces,
    dailyBreakdown: dailyBreakdownArray,
    lastUpdated: new Date(),
  };
}

function aggregateAdminStats(visitDocs: Array<TouristVisit & { id: string }>): AdminTouristStats {
  const currentDate = new Date();
  const monthlyData = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - i);
    const monthKey = d.toISOString().substring(0, 7);
    monthlyData.set(monthKey, 0);
  }

  const countries = new Map<string, number>();
  const provinces = new Map<string, number>();

  visitDocs.forEach((visit) => {
    const country = visit.touristCountry || "Unknown";
    countries.set(country, (countries.get(country) || 0) + 1);
    const province = visit.touristProvince || "Unknown";
    provinces.set(province, (provinces.get(province) || 0) + 1);
    const visitDate = new Date(visit.visitedAt);
    const monthKey = visitDate.toISOString().substring(0, 7);
    if (monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, (monthlyData.get(monthKey) || 0) + 1);
    }
  });

  const topCountries = Array.from(countries.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const topProvinces = Array.from(provinces.entries())
    .map(([province, count]) => ({ province, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const monthlyTrend = Array.from(monthlyData.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
  let peakMonth: { month: string; count: number } | null = null;
  if (monthlyTrend.length > 0) {
    peakMonth = monthlyTrend.reduce((max, current) => (current.count > max.count ? current : max));
  }

  return {
    totalTourists: countries.size,
    totalVisits: visitDocs.length,
    uniqueCountries: countries.size,
    topCountries,
    topProvinces,
    monthlyTrend,
    peakMonth,
    lastUpdated: new Date(),
  };
}

// ── Supabase adapters ──
async function supabaseGetBusinessVisits(businessId: string, start: string, end: string) {
  const { data, error } = await withSupabaseTimeout(
    supabase!.from("tourist_visit_logs").select("*").eq("business_id", businessId).gte("visited_at", start).lte("visited_at", end).order("visited_at", { ascending: false }).limit(2000),
    "Supabase business visits fetch timed out.",
  );
  if (error) throw new Error(error.message);
  return (data as SupabaseVisitRow[]).map(supabaseRowToVisit);
}

async function supabaseGetAllVisits() {
  const { data, error } = await withSupabaseTimeout(
    supabase!.from("tourist_visit_logs").select("*").order("visited_at", { ascending: false }).limit(2000),
    "Supabase admin visits fetch timed out.",
  );
  if (error) throw new Error(error.message);
  return (data as SupabaseVisitRow[]).map(supabaseRowToVisit);
}

function supabaseSubscribeToBusinessAnalytics(
  businessId: string,
  onData: (stats: BusinessVisitorStats) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
  const { start, end } = getDateRange("month");

  async function fetchAndEmit() {
    try {
      const visits = await supabaseGetBusinessVisits(businessId, start, end);
      if (cancelled) return;
      onData(aggregateBusinessStats(visits));
    } catch (err) {
      if (cancelled) return;
      const error = err instanceof Error ? err : new Error(String(err));
      if (onError) onError(new Error(`Analytics subscription failed: ${error.message}`));
      else console.warn("[analytics] supabase business analytics failed:", error);
    }
  }

  void fetchAndEmit();

  try {
    channel = supabase!
      .channel(`tvl:business:${businessId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tourist_visit_logs", filter: `business_id=eq.${businessId}` },
        () => {
          void fetchAndEmit();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void fetchAndEmit();
      });
  } catch {
    channel = null;
  }

  return () => {
    cancelled = true;
    if (channel) void supabase!.removeChannel(channel);
  };
}

function supabaseSubscribeToAdminAnalytics(
  onData: (stats: AdminTouristStats) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchAndEmit() {
    try {
      const visits = await supabaseGetAllVisits();
      if (cancelled) return;
      onData(aggregateAdminStats(visits));
    } catch (err) {
      if (cancelled) return;
      const error = err instanceof Error ? err : new Error(String(err));
      if (onError) onError(new Error(`Admin analytics subscription failed: ${error.message}`));
      else console.warn("[analytics] supabase admin analytics failed:", error);
    }
  }

  void fetchAndEmit();

  try {
    channel = supabase!
      .channel(`tvl:admin:all:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tourist_visit_logs" },
        () => {
          void fetchAndEmit();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void fetchAndEmit();
      });
  } catch {
    channel = null;
  }

  return () => {
    cancelled = true;
    if (channel) void supabase!.removeChannel(channel);
  };
}

export async function getBusinessVisitorStats(
  businessId: string,
  period: AnalyticsPeriod = "month",
): Promise<BusinessVisitorStats> {
  requireSupabase();
  const { start, end } = getDateRange(period);
  const visits = await supabaseGetBusinessVisits(businessId, start, end);
  return aggregateBusinessStats(visits);
}

export async function getAdminTouristStats(): Promise<AdminTouristStats> {
  requireSupabase();
  const visitDocs = await supabaseGetAllVisits();
  return aggregateAdminStats(visitDocs);
}

export function subscribeToBusinessAnalytics(
  businessId: string,
  onData: (stats: BusinessVisitorStats) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSupabase();
  return supabaseSubscribeToBusinessAnalytics(businessId, onData, onError);
}

export function subscribeToAdminAnalytics(
  onData: (stats: AdminTouristStats) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSupabase();
  return supabaseSubscribeToAdminAnalytics(onData, onError);
}
