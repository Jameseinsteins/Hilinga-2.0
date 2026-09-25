// Nationality + country helpers for Hilinga Explore / Feed
// Flag = regional-indicator emoji from ISO 3166-1 alpha-2

export type NationalityOption = { label: string; value: string; country: string; iso2: string };

export const NATIONALITY_OPTIONS: NationalityOption[] = [
  { label: "Filipino", value: "Filipino", country: "Philippines", iso2: "PH" },
  { label: "American", value: "American", country: "United States", iso2: "US" },
  { label: "Japanese", value: "Japanese", country: "Japan", iso2: "JP" },
  { label: "Korean", value: "Korean", country: "South Korea", iso2: "KR" },
  { label: "Chinese", value: "Chinese", country: "China", iso2: "CN" },
  { label: "British", value: "British", country: "United Kingdom", iso2: "GB" },
  { label: "Australian", value: "Australian", country: "Australia", iso2: "AU" },
  { label: "Canadian", value: "Canadian", country: "Canada", iso2: "CA" },
  { label: "German", value: "German", country: "Germany", iso2: "DE" },
  { label: "French", value: "French", country: "France", iso2: "FR" },
  { label: "Indian", value: "Indian", country: "India", iso2: "IN" },
  { label: "Malaysian", value: "Malaysian", country: "Malaysia", iso2: "MY" },
  { label: "Indonesian", value: "Indonesian", country: "Indonesia", iso2: "ID" },
  { label: "Thai", value: "Thai", country: "Thailand", iso2: "TH" },
  { label: "Vietnamese", value: "Vietnamese", country: "Vietnam", iso2: "VN" },
  { label: "Singaporean", value: "Singaporean", country: "Singapore", iso2: "SG" },
  { label: "Emirati", value: "Emirati", country: "United Arab Emirates", iso2: "AE" },
  { label: "Saudi", value: "Saudi", country: "Saudi Arabia", iso2: "SA" },
  { label: "Brazilian", value: "Brazilian", country: "Brazil", iso2: "BR" },
  { label: "Mexican", value: "Mexican", country: "Mexico", iso2: "MX" },
  { label: "Spanish", value: "Spanish", country: "Spain", iso2: "ES" },
  { label: "Italian", value: "Italian", country: "Italy", iso2: "IT" },
  { label: "Dutch", value: "Dutch", country: "Netherlands", iso2: "NL" },
  { label: "Other", value: "Other", country: "Other", iso2: "UN" },
];

const BY_NATIONALITY = new Map(NATIONALITY_OPTIONS.map((o) => [o.value.toLowerCase(), o]));
const BY_COUNTRY = new Map(NATIONALITY_OPTIONS.map((o) => [o.country.toLowerCase(), o]));
const BY_ISO2 = new Map(NATIONALITY_OPTIONS.map((o) => [o.iso2.toLowerCase(), o]));

export function iso2ToFlag(iso2: string): string {
  const code = iso2.trim().toUpperCase();
  if (code.length !== 2) return "🏳️";
  if (code === "UN") return "🌐";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}

export function nationalityToOption(nationality?: string | null, country?: string | null): NationalityOption | null {
  if (nationality) {
    const hit = BY_NATIONALITY.get(nationality.trim().toLowerCase());
    if (hit) return hit;
  }
  if (country) {
    const hit = BY_COUNTRY.get(country.trim().toLowerCase());
    if (hit) return hit;
  }
  return null;
}

export function countryToFlag(country?: string | null, iso2?: string | null, nationality?: string | null): string {
  if (iso2) {
    const hitIso = BY_ISO2.get(iso2.trim().toLowerCase());
    if (hitIso) return iso2ToFlag(hitIso.iso2);
  }
  const opt = nationalityToOption(nationality ?? undefined, country ?? undefined);
  if (opt) return iso2ToFlag(opt.iso2);
  // fallback: try to derive iso2 from country name via Intl.DisplayNames where available
  if (country) {
    // Cheap heuristic: Philippines/Korea/etc already covered; otherwise globe
    return "🌐";
  }
  return "🌐";
}

export function formatNationality(nationality?: string | null, country?: string | null): string {
  const n = (nationality ?? "").trim();
  const c = (country ?? "").trim();
  if (n && c && n.toLowerCase() !== c.toLowerCase() && !c.toLowerCase().includes(n.toLowerCase().slice(0, 4))) {
    // e.g. Filipino · Philippines — keep compact as country
    return c;
  }
  if (c) return c;
  if (n) return n;
  return "Unknown";
}
