import type { ItineraryDay } from "@/lib/database";
import type { RegisteredSmallBusiness } from "@/lib/business-content";

type PBudget = "Budget" | "Moderate" | "Premium" | string;
type PPace = "Relaxed" | "Balanced" | "Packed" | string;

const MAX_DAYS = 7;

type PlannerActivity = { title: string; icon: string; base: string };

function businessActivity(business: RegisteredSmallBusiness): PlannerActivity {
  const category = business.category.toLowerCase();
  const icon = /food|cafe|coffee|restaurant|bakery/.test(category) ? "restaurant"
    : /hotel|stay|resort|inn|accommodation/.test(category) ? "hotel"
      : /tour|travel|activity|adventure/.test(category) ? "tour"
        : /shop|retail|craft|market/.test(category) ? "storefront" : "storefront";
  return {
    title: business.name,
    icon,
    base: `${business.about} Visit this registered Hilinga small business in ${business.location}. Business hours: ${business.hours}.`,
  };
}

export function buildPromptItinerary(
  prompt: string,
  days = 2,
  budget: PBudget = "Moderate",
  pace: PPace = "Balanced",
  registeredBusinesses: RegisteredSmallBusiness[] = []
): ItineraryDay[] {
  const dayCount = Math.max(1, Math.min(MAX_DAYS, days));
  const maxStops = pace === "Relaxed" ? 2 : pace === "Packed" ? 4 : 3;
  const p = prompt.toLowerCase();

  const exactTimes = ["8:30 AM", "11:30 AM", "2:30 PM", "5:30 PM"];
  const flexibleTimes = ["Morning", "Late morning", "Afternoon", "Evening"];

  // All titles below are verified database entries — must match
  // api/_lib/allowlist.ts CATALOG_TITLES and registered business names.
  const candidateActivities: PlannerActivity[] = [];

  if (/atv|adventure|ride|trail|extreme|thrill/i.test(p)) {
    candidateActivities.push({ title: "Mayon ATV Adventure", icon: "sports_motorsports", base: "Ride along rugged volcanic trails up to the 2006 Black Lava Wall with breathtaking Mayon vistas." });
  }
  if (/cagsawa|ruin|historic|heritage|history|monument/i.test(p)) {
    candidateActivities.push({ title: "Cagsawa Ruins", icon: "photo_camera", base: "Witness the iconic 1814 church belfry against Mayon Volcano and explore the cultural marker." });
  }
  if (/church|daraga|spiritual|cathedral/i.test(p)) {
    candidateActivities.push({ title: "Daraga faith and heritage trail", icon: "church", base: "Visit this 18th-century Baroque church perched on Santa Maria Hill offering sweeping coastal views." });
  }
  if (/lake|sumlang|raft|bamboo|relax|peace/i.test(p)) {
    candidateActivities.push({ title: "Sumlang Lake", icon: "water_drop", base: "Glide on a traditional bamboo raft over peaceful waters reflecting Mayon Volcano." });
  }
  if (/waterfall|falls|vera|spring|swim|cascade/i.test(p)) {
    candidateActivities.push({ title: "Vera Falls", icon: "water_drop", base: "Take a refreshing nature dip beneath the lush forested falls in Malinao." });
  }
  if (/quitinday|hill/i.test(p)) {
    candidateActivities.push({ title: "Quitinday Hills", icon: "explore", base: "Walk through rolling green knolls with 360-degree views of Albay's mini chocolate hills." });
  }
  if (/cave|hoyop/i.test(p)) {
    candidateActivities.push({ title: "Hoyop-Hoyopan Cave", icon: "explore", base: "Explore the prehistoric limestone cavern in Camalig with ancient stalactites." });
  }
  if (/food|cuisine|eat|dining|bicol express|pinangat|spicy|restaurant/i.test(p)) {
    candidateActivities.push({ title: "Market shopping and Bicolano tasting", icon: "restaurant", base: "Savor rich coconut milk dishes: spicy Bicol Express, Camalig pinangat, and chili ice cream." });
  }
  if (/boulevard|sunset|coast|walk|seaside|port/i.test(p)) {
    candidateActivities.push({ title: "Sunset at Legazpi Boulevard", icon: "beach_access", base: "Take in the sea breeze along the scenic coastal boulevard with views of the Albay Gulf." });
  }
  if (/park|wildlife|family|kid|children|zoo/i.test(p)) {
    candidateActivities.push({ title: "Albay Park & Wildlife", icon: "family_restroom", base: "Enjoy a leisurely walk through shaded picnic grounds with native flora and gentle nature trails." });
  }
  if (/shop|souvenir|market|pili|craft|gift/i.test(p)) {
    candidateActivities.push({ title: "Local market and crafts", icon: "shopping_bag", base: "Pick up glazed pili nuts, spicy snacks, and handwoven abaca products from local artisans." });
  }

  const standardActivities: PlannerActivity[] = [
    { title: "Cagsawa Ruins", icon: "photo_camera", base: "Iconic Mayon Volcano photo point and heritage ruins in Daraga." },
    { title: "Market shopping and Bicolano tasting", icon: "restaurant", base: "Experience legendary Bicol Express and Camalig pinangat." },
    { title: "Mayon ATV Adventure", icon: "sports_motorsports", base: "Thrilling all-terrain trail around Mayon's lava trails." },
    { title: "Sumlang Lake", icon: "water_drop", base: "Picturesque bamboo raft cruise on calm lakeside waters." },
    { title: "Daraga faith and heritage trail", icon: "church", base: "Historic 1773 Franciscan church overlooking Albay Gulf." },
    { title: "Sunset at Legazpi Boulevard", icon: "beach_access", base: "Seaside relaxation and evening Bicolano dining." },
    { title: "Quitinday Hills", icon: "landscape", base: "Spectacular 360-degree views of Albay's mini chocolate hills." },
    { title: "Local market and crafts", icon: "shopping_bag", base: "Discover pili treats and handwoven abaca goods." },
  ];

  const businessActivities: PlannerActivity[] = registeredBusinesses.map((b) => businessActivity(b));

  const allActivities = [
    ...candidateActivities,
    ...businessActivities.slice(0, 3),
    ...standardActivities,
  ].filter((act, idx, arr) => arr.findIndex((x) => x.title === act.title) === idx);

  let actIdx = 0;
  return Array.from({ length: dayCount }, (_, dayIdx) => {
    const dayStops = Array.from({ length: maxStops }, (_, stopIdx) => {
      const act = allActivities[actIdx % allActivities.length];
      actIdx += 1;
      const budgetNote = budget === "Budget" ? "Estimated \u20B1300\u2013\u20B1700 per person." : budget === "Premium" ? "Estimated \u20B11,500+ per person." : "Estimated \u20B1700\u2013\u20B11,500 per person.";
      return {
        time: exactTimes[stopIdx] || flexibleTimes[stopIdx] || "Daytime",
        title: act.title,
        note: `${act.base} ${budgetNote}`,
        icon: act.icon,
      };
    });
    const dayTitles = [
      "Arrival & Iconic Mayon Highlights",
      "Bicol Flavors & Nature Trails",
      "Lakeside Views & Culture Discovery",
      "Waterfalls, Hills & Coastal Escape",
      "Hidden Caves & Rural Wonder",
      "Scenic Heights & Artisan Heritage",
      "Waterfront Sunrise & Souvenir Farewell",
    ];
    return {
      day: dayIdx + 1,
      title: dayTitles[dayIdx] || `Day ${dayIdx + 1}: Albay Exploration`,
      stops: dayStops,
    };
  });
}
