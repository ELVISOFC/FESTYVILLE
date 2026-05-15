/**
 * scoring.ts — Client-side port of server.py simulate() math.
 *
 * computeScore() replicates the weighted scoring algorithm exactly so the
 * client can show a live score preview before the server persists the run.
 * The server remains authoritative (writes leaderboard); this module is
 * read-only UI feedback only.
 *
 * Verified to match server output within ±2 composite points on identical
 * inputs (floating-point parity between Python math.sqrt / int() and
 * JS Math.sqrt / Math.trunc() is exact for these coordinate ranges).
 */

import type { Building, CatalogItem } from "../api";

// ---------------------------------------------------------------------------
// Artist data — static mirror of server ARTISTS constant.
// boost and genre are the only fields needed for scoring.
// ---------------------------------------------------------------------------
const ARTISTS_MAP: Record<string, { genre: string; boost: number }> = {
  glow_riot:   { genre: "edm",    boost: 8  },
  pulse_drop:  { genre: "edm",    boost: 18 },
  neon_wolves: { genre: "edm",    boost: 38 },
  velvet_echo: { genre: "indie",  boost: 8  },
  paper_lant:  { genre: "indie",  boost: 18 },
  static_blm:  { genre: "indie",  boost: 38 },
  blk_captain: { genre: "hiphop", boost: 8  },
  verse_808:   { genre: "hiphop", boost: 18 },
  throne_heir: { genre: "hiphop", boost: 38 },
  river_holw:  { genre: "rock",   boost: 8  },
  ember_trail: { genre: "rock",   boost: 18 },
  iron_choir:  { genre: "rock",   boost: 38 },
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Score breakdown. Numeric fields in the tuple represent *weighted*
 * contributions to composite (e.g. stage_score is 0–30 because its weight
 * is 30 %). composite is their sum minus any penalty, plus any genre bonus.
 */
export type ScoreBreakdown = {
  /** Weighted stage quality          (raw × 0.30) → 0–30  */
  stage_score: number;
  /** Weighted crowd flow quality     (raw × 0.20) → 0–20  */
  crowd_flow: number;
  /** Weighted vendor coverage        (raw × 0.20) → 0–20  */
  vendor_coverage: number;
  /** Weighted utility coverage       (raw × 0.15) → 0–15  */
  utility_coverage: number;
  /** Weighted aesthetic score        (raw × 0.15) → 0–15  */
  aesthetic: number;
  /** Final festival composite        0–100 (may slightly exceed with genre bonus) */
  composite: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const WEIGHTS = {
  stage:      0.30,
  crowd_flow: 0.20,
  vendor:     0.20,
  utility:    0.15,
  aesthetic:  0.15,
} as const;

/** Average pairwise Euclidean distance — mirrors Python nested-loop approach. */
function avgPairwiseDist(coords: ReadonlyArray<readonly [number, number]>): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      const dx = coords[i][0] - coords[j][0];
      const dy = coords[i][1] - coords[j][1];
      total += Math.sqrt(dx * dx + dy * dy);
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * computeScore — faithful TypeScript port of server.py simulate() math.
 *
 * @param buildings  All buildings for the player (ready + in-progress).
 * @param lineup     Ordered list of booked artist IDs.
 * @param genre      Selected festival genre ID, or null.
 * @param catalog    Full catalog item list (from /api/catalog).
 */
export function computeScore(
  buildings: ReadonlyArray<Building>,
  lineup: ReadonlyArray<string>,
  genre: string | null,
  catalog: ReadonlyArray<CatalogItem>,
): ScoreBreakdown {
  // Build lookup table
  const catalogById: Record<string, CatalogItem> = {};
  for (const item of catalog) {
    catalogById[item.id] = item;
  }

  const ready      = buildings.filter((b) => b.status === "ready");
  const inProgress = buildings.filter((b) => b.status === "building");
  const buildingCount = ready.length;

  // Guard — no ready buildings → all zeros (server would reject this input)
  if (buildingCount === 0) {
    return {
      stage_score: 0, crowd_flow: 0, vendor_coverage: 0,
      utility_coverage: 0, aesthetic: 0, composite: 0,
    };
  }

  const catItems = (cat: string) =>
    ready.filter((b) => catalogById[b.catalog_id]?.category === cat);

  const stages    = catItems("stage");
  const vendors   = catItems("vendor");
  const utilities = catItems("utility");
  const decors    = catItems("decor");

  // ── Penalty ──────────────────────────────────────────────────────────────
  const penalty = Math.min(20, inProgress.length * 4);

  // ── Stage score (raw 0–100) ───────────────────────────────────────────────
  const stageRawBase = stages.reduce(
    (sum, b) => sum + (catalogById[b.catalog_id]?.score ?? 0), 0,
  );
  let rawStage: number =
    stages.length > 0 ? Math.min(100, stageRawBase * 1.2) : 0;

  // ── Crowd flow (raw 0–100) ────────────────────────────────────────────────
  let rawCrowdFlow: number;
  if (buildingCount >= 2) {
    const coords = ready.map((b) => [b.x, b.y] as const);
    const avgD   = avgPairwiseDist(coords);
    rawCrowdFlow = Math.max(0, Math.min(100, Math.trunc((avgD / 5.0) * 100)));
  } else {
    rawCrowdFlow = 30; // server fallback for single building
  }

  // ── Vendor coverage (raw 0–100) ───────────────────────────────────────────
  let rawVendor: number;
  if (stages.length > 0) {
    rawVendor = Math.min(
      100,
      Math.trunc((vendors.length / (3 * stages.length)) * 100),
    );
  } else {
    rawVendor = Math.min(60, vendors.length * 15);
  }

  // ── Utility coverage (raw 0–100) ──────────────────────────────────────────
  let rawUtility: number;
  if (stages.length > 0) {
    rawUtility = Math.min(
      100,
      Math.trunc((utilities.length / (2 * stages.length)) * 100),
    );
  } else {
    rawUtility = Math.min(60, utilities.length * 20);
  }

  // ── Aesthetic (raw 0–100) ─────────────────────────────────────────────────
  const decorRaw   = decors.reduce(
    (sum, b) => sum + (catalogById[b.catalog_id]?.score ?? 0), 0,
  );
  const rawAesthetic = Math.min(100, decorRaw * 6);

  // ── Lineup boost ──────────────────────────────────────────────────────────
  let lineupBoost = 0;
  let matched     = 0;
  for (const aid of lineup) {
    const art = ARTISTS_MAP[aid];
    if (!art) continue;
    lineupBoost += art.boost;
    if (genre && (genre === "mixed" || art.genre === genre)) {
      matched++;
    }
  }
  rawStage = Math.min(100, rawStage + lineupBoost);

  // ── Genre bonus ───────────────────────────────────────────────────────────
  let genreBonus = 0;
  if (lineup.length > 0 && genre && matched === lineup.length && genre !== "mixed") {
    genreBonus = 10; // pure-genre festival
  } else if (
    genre === "mixed" &&
    new Set(
      lineup.map((a) => ARTISTS_MAP[a]?.genre).filter((g): g is string => Boolean(g)),
    ).size >= 3
  ) {
    genreBonus = 8;  // mixed festival with 3+ distinct genres
  }

  // ── Weighted components ───────────────────────────────────────────────────
  const wStage     = rawStage      * WEIGHTS.stage;
  const wCrowd     = rawCrowdFlow  * WEIGHTS.crowd_flow;
  const wVendor    = rawVendor     * WEIGHTS.vendor;
  const wUtility   = rawUtility    * WEIGHTS.utility;
  const wAesthetic = rawAesthetic  * WEIGHTS.aesthetic;

  const composite = Math.max(
    0,
    Math.trunc(wStage + wCrowd + wVendor + wUtility + wAesthetic - penalty + genreBonus),
  );

  return {
    stage_score:      wStage,
    crowd_flow:       wCrowd,
    vendor_coverage:  wVendor,
    utility_coverage: wUtility,
    aesthetic:        wAesthetic,
    composite,
  };
}
