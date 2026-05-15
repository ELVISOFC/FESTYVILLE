// Frontend mirror of backend LEGACY_TIERS (server.py) and MILESTONES.
// Kept hand-synced to match the menu.tsx ALL_ACHIEVEMENTS pattern.
// If these drift from the server, the visuals (progress bar, milestone grid)
// will be wrong — there's a code-review note to dedupe via an /api/legacy
// endpoint when the content moves into JSON files.

import type { Milestone } from "./api";

export type LegacyTier = "unknown" | "local" | "regional" | "national" | "legendary";

export const TIER_ORDER: LegacyTier[] = ["unknown", "local", "regional", "national", "legendary"];

export const TIER_THRESHOLDS: Record<LegacyTier, number> = {
  unknown: 0,
  local: 500,
  regional: 2000,
  national: 5000,
  legendary: 10000,
};

export const TIER_META: Record<
  LegacyTier,
  { label: string; color: string; tagline: string }
> = {
  unknown:   { label: "UNKNOWN",   color: "#888888", tagline: "Just another promoter looking for a break." },
  local:     { label: "LOCAL",     color: "#00FF66", tagline: "Your town knows your name." },
  regional:  { label: "REGIONAL",  color: "#00FFFF", tagline: "Crowds travel hours to be at your gates." },
  national:  { label: "NATIONAL",  color: "#FFD700", tagline: "Every booker takes your call." },
  legendary: { label: "LEGENDARY", color: "#FF0055", tagline: "You don't run festivals. You run the scene." },
};

export const GENRE_TINT: Record<string, string> = {
  edm:    "#00FFFF",
  indie:  "#00FF66",
  hiphop: "#FF9900",
  rock:   "#FF0055",
  pop:    "#FFD700",
};

// Mirror of backend MILESTONES (server.py). Order mirrors the canonical list.
export const ALL_MILESTONES: Milestone[] = [
  { id: "ms_first_festival", name: "First Festival",   desc: "Run your very first festival",              emoji: "🎪", reward_rep: 10 },
  { id: "ms_five_events",    name: "Veteran Promoter", desc: "Run 5 festivals",                           emoji: "🎟️", reward_rep: 25 },
  { id: "ms_ten_events",     name: "Festival Circuit", desc: "Run 10 festivals",                          emoji: "🌟", reward_rep: 50 },
  { id: "ms_first_a_grade",  name: "Top Billing",      desc: "Earn your first A grade or better",         emoji: "🅰️", reward_rep: 20 },
  { id: "ms_first_s_grade",  name: "Headliner",        desc: "Earn a perfect S grade",                    emoji: "🏆", reward_rep: 60 },
  { id: "ms_three_artists",  name: "Booker",           desc: "Book 3 artists in a single festival",       emoji: "🎤", reward_rep: 15 },
  { id: "ms_perfect_crowd",  name: "Crowd Whisperer",  desc: "Achieve perfect crowd flow in a festival",  emoji: "👥", reward_rep: 30 },
  { id: "ms_pure_genre",     name: "Purist",           desc: "Run a pure-genre festival",                 emoji: "🎵", reward_rep: 20 },
  { id: "ms_local_tier",     name: "Local Hero",       desc: "Reach the Local tier (Phase 2)",            emoji: "🏘️", reward_rep: 25 },
  { id: "ms_regional_tier",  name: "Regional Star",    desc: "Reach the Regional tier (Phase 3)",         emoji: "🏙️", reward_rep: 40 },
];

/** Returns {nextTier, currentFloor, nextThreshold, progress01}. If maxed out, progress01=1. */
export function tierProgress(tier: LegacyTier, score: number) {
  const idx = TIER_ORDER.indexOf(tier);
  const currentFloor = TIER_THRESHOLDS[tier];
  const nextTier = idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : currentFloor;
  const span = nextThreshold - currentFloor;
  const progress01 = span <= 0 ? 1 : Math.min(1, Math.max(0, (score - currentFloor) / span));
  return { nextTier, currentFloor, nextThreshold, progress01 };
}
