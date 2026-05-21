// frontend/src/legacy.ts
//
// Legacy & Reputation helpers — client-side only.
// Tier thresholds mirror server.py derive_tier() exactly.
// Keep in sync if thresholds change server-side.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LegacyTier = "unknown" | "local" | "regional" | "national" | "legendary";

export type MilestoneData = {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  reward_rep: number;
};

// ---------------------------------------------------------------------------
// Tier thresholds — mirrors server.py TIER_THRESHOLDS
// ---------------------------------------------------------------------------

export const TIER_THRESHOLDS: Record<LegacyTier, number> = {
  unknown:   0,
  local:     500,
  regional:  2000,
  national:  5000,
  legendary: 10000,
};

export const TIER_ORDER: LegacyTier[] = [
  "unknown",
  "local",
  "regional",
  "national",
  "legendary",
];

// ---------------------------------------------------------------------------
// Tier display metadata
// ---------------------------------------------------------------------------

export const TIER_META: Record<LegacyTier, { label: string; color: string; emoji: string }> = {
  unknown:   { label: "Unknown",   color: "#94A3B8", emoji: "❓" },
  local:     { label: "Local",     color: "#00FF66", emoji: "🏘️" },
  regional:  { label: "Regional",  color: "#00FFFF", emoji: "🏙️" },
  national:  { label: "National",  color: "#FFD700", emoji: "🌟" },
  legendary: { label: "Legendary", color: "#FF0055", emoji: "🏆" },
};

// ---------------------------------------------------------------------------
// Milestone data — mirrors server.py MILESTONES
// ---------------------------------------------------------------------------

export const MILESTONES: MilestoneData[] = [
  { id: "ms_first_festival", name: "First Festival",   desc: "Run your very first festival",               emoji: "🎪", reward_rep: 10 },
  { id: "ms_five_events",    name: "Veteran Promoter", desc: "Run 5 festivals",                            emoji: "🎟️", reward_rep: 25 },
  { id: "ms_ten_events",     name: "Festival Circuit", desc: "Run 10 festivals",                           emoji: "🌟", reward_rep: 50 },
  { id: "ms_first_a_grade",  name: "Top Billing",      desc: "Earn your first A grade or better",          emoji: "🅰️", reward_rep: 20 },
  { id: "ms_first_s_grade",  name: "Headliner",        desc: "Earn a perfect S grade",                     emoji: "🏆", reward_rep: 60 },
  { id: "ms_three_artists",  name: "Booker",           desc: "Book 3 artists in a single festival",        emoji: "🎤", reward_rep: 15 },
  { id: "ms_perfect_crowd",  name: "Crowd Whisperer",  desc: "Achieve perfect crowd flow in a festival",   emoji: "👥", reward_rep: 30 },
  { id: "ms_pure_genre",     name: "Purist",           desc: "Run a pure-genre festival",                  emoji: "🎵", reward_rep: 20 },
  { id: "ms_local_tier",     name: "Local Hero",       desc: "Reach the Local tier (Phase 2)",             emoji: "🏘️", reward_rep: 25 },
  { id: "ms_regional_tier",  name: "Regional Star",    desc: "Reach the Regional tier (Phase 3)",          emoji: "🏙️", reward_rep: 40 },
];

export const MILESTONES_BY_ID = new Map(MILESTONES.map((m) => [m.id, m]));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive tier from reputation score — mirrors server.py derive_tier(). */
export function deriveTier(reputationScore: number): LegacyTier {
  if (reputationScore >= 10000) return "legendary";
  if (reputationScore >= 5000)  return "national";
  if (reputationScore >= 2000)  return "regional";
  if (reputationScore >= 500)   return "local";
  return "unknown";
}

/** Progress to next tier: returns 0–1 fill fraction and points remaining. */
export function tierProgress(reputationScore: number): {
  pct: number;
  current: LegacyTier;
  next: LegacyTier | null;
  pointsToNext: number;
} {
  const current = deriveTier(reputationScore);
  const currentIdx = TIER_ORDER.indexOf(current);
  const next = currentIdx < TIER_ORDER.length - 1 ? TIER_ORDER[currentIdx + 1] : null;

  if (!next) return { pct: 1, current, next: null, pointsToNext: 0 };

  const from = TIER_THRESHOLDS[current];
  const to   = TIER_THRESHOLDS[next];
  const pct  = Math.min(1, (reputationScore - from) / (to - from));
  const pointsToNext = Math.max(0, to - reputationScore);

  return { pct, current, next, pointsToNext };
}
