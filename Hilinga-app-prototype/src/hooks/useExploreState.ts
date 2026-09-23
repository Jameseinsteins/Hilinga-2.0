/**
 * Custom hook for Explore screen state management
 *
 * Consolidates filtering, search, and item selection state.
 * Makes the Explore component more readable and prevents unnecessary re-renders.
 */

import { useCallback, useState } from "react";
import type { CommunityPost } from "@/lib/community-feed";

export type ExploreKind = "All" | "Places" | "Businesses" | "Events" | "Experiences";
export type ExploreView = "For you" | "All" | "Latest";

export interface ExploreItem {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  kind: Exclude<ExploreKind, "All">;
  savedKind: string;
  visits: number;
  imageKey: string;
  source: string;
  latitude: number;
  longitude: number;
  detail?: string;
  location?: string;
  logoSource?: string;
  businessScale?: "Small business" | "Big enterprise";
  registered?: boolean;
  ownerUid?: string;
}

export interface ExploreState {
  filter: string;
  kind: ExploreKind;
  view: ExploreView;
  query: string;
  savedIds: Set<string>;
  pendingId: string | null;
  error: string | null;
  selected: ExploreItem | null;
  collection: { title: string; eyebrow: string; itemIds: string[] } | null;
  reviews: CommunityPost[];
  reviewsLoading: boolean;
  reviewError: string | null;
  reviewText: string;
  reviewRating: number | null;
  reviewPosting: boolean;
  reviewDeleteTarget: CommunityPost | null;
  inquiryOpen: boolean;
  inquiryMessage: string;
  inquirySending: boolean;
  inquiryError: string | null;
  inquirySent: boolean;
}

export interface ExploreActions {
  setFilter: (filter: string) => void;
  setKind: (kind: ExploreKind) => void;
  setView: (view: ExploreView) => void;
  setQuery: (query: string) => void;
  setSavedIds: (ids: Set<string>) => void;
  setPendingId: (id: string | null) => void;
  setError: (error: string | null) => void;
  setSelected: (item: ExploreItem | null) => void;
  setCollection: (collection: { title: string; eyebrow: string; itemIds: string[] } | null) => void;
  setReviews: (reviews: CommunityPost[]) => void;
  setReviewsLoading: (loading: boolean) => void;
  setReviewError: (error: string | null) => void;
  setReviewText: (text: string) => void;
  setReviewRating: (rating: number | null) => void;
  setReviewPosting: (posting: boolean) => void;
  setReviewDeleteTarget: (target: CommunityPost | null) => void;
  setInquiryOpen: (open: boolean) => void;
  setInquiryMessage: (message: string) => void;
  setInquirySending: (sending: boolean) => void;
  setInquiryError: (error: string | null) => void;
  setInquirySent: (sent: boolean) => void;

  // Compound actions
  resetReviewForm: () => void;
  resetInquiryForm: () => void;
}

export function useExploreState(): [ExploreState, ExploreActions] {
  const [filter, setFilter] = useState("All");
  const [kind, setKind] = useState<ExploreKind>("All");
  const [view, setView] = useState<ExploreView>("For you");
  const [query, setQuery] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExploreItem | null>(null);
  const [collection, setCollection] = useState<{ title: string; eyebrow: string; itemIds: string[] } | null>(null);
  const [reviews, setReviews] = useState<CommunityPost[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState<number | null>(null);
  const [reviewPosting, setReviewPosting] = useState(false);
  const [reviewDeleteTarget, setReviewDeleteTarget] = useState<CommunityPost | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryMessage, setInquiryMessage] = useState("");
  const [inquirySending, setInquirySending] = useState(false);
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [inquirySent, setInquirySent] = useState(false);

  const resetReviewForm = useCallback(() => {
    setReviewText("");
    setReviewRating(null);
    setReviewError(null);
    setReviewPosting(false);
  }, []);

  const resetInquiryForm = useCallback(() => {
    setInquiryOpen(false);
    setInquiryMessage("");
    setInquiryError(null);
    setInquirySent(false);
  }, []);

  const state: ExploreState = {
    filter,
    kind,
    view,
    query,
    savedIds,
    pendingId,
    error,
    selected,
    collection,
    reviews,
    reviewsLoading,
    reviewError,
    reviewText,
    reviewRating,
    reviewPosting,
    reviewDeleteTarget,
    inquiryOpen,
    inquiryMessage,
    inquirySending,
    inquiryError,
    inquirySent,
  };

  const actions: ExploreActions = {
    setFilter,
    setKind,
    setView,
    setQuery,
    setSavedIds,
    setPendingId,
    setError,
    setSelected,
    setCollection,
    setReviews,
    setReviewsLoading,
    setReviewError,
    setReviewText,
    setReviewRating,
    setReviewPosting,
    setReviewDeleteTarget,
    setInquiryOpen,
    setInquiryMessage,
    setInquirySending,
    setInquiryError,
    setInquirySent,
    resetReviewForm,
    resetInquiryForm,
  };

  return [state, actions];
}
