export type CloudProfile = {
  id: string;
  account_mode?: "explore" | "business";
  display_name: string;
  avatar_path: string | null;
  interests: string[];
  language: string;
  budget_min: number | null;
  budget_max: number | null;
  notifications_enabled: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type CloudProfileInput = Pick<
  CloudProfile,
  | "id"
  | "account_mode"
  | "display_name"
  | "avatar_path"
  | "interests"
  | "language"
  | "budget_min"
  | "budget_max"
  | "notifications_enabled"
  | "onboarding_completed"
>;
