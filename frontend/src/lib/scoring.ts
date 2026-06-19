// frontend/src/lib/scoring.ts
//
// Client-side score computation — mirrors backend/server.py simulate().
// Server validates the submitted composite within a ±10 tolerance window.
// Keep GENRE_COMPATIBILITY in sync with server.py if it ever changes.

import type { Building, CatalogItem } from "../api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScoreBreakdown = {
  stage_score: number;      // weighted 0–30
  crowd_flow: number;       // weighted 0–20
  vendor_coverage: number;  // weighted 0–20
  utility_coverage: number; // weighted 0–15
  aesthetic: number;        // weighted 0–15
  chemistry_bonus: number;  // 0–10
  composite: number;        // final 0–120
};

// ---------------------------------------------------------------------------
// Genre compatibility matrix — must stay in sync with server.py
// ---------------------------------------------------------------------------

const GENRE_COMPATIBILITY: Record<string, Record<string, number>> = {
  indie:  { indie: 1.0, rock: 0.8, pop: 0.6, edm: 0.3, hiphop: 0.4 },
  edm:    { edm: 1.0, hiphop: 0.7, pop: 0.5, indie: 0.3, rock: 0.3 },
  hiphop: { hiphop: 1.0, edm: 0.7, pop: 0.7, indie: 0.4, rock: 0.3 },
  rock:   { rock: 1.0, indie: 0.8, pop: 0.4, edm: 0.3, hiphop: 0.3 },
  pop:    { pop: 1.0, indie: 0.6, hiphop: 0.7, edm: 0.5, rock: 0.4 },
};

// Artist boost data — mirrors ARTISTS in server.py
const ARTIST_DATA: Record<string, { genre: string; boost: number }> = {
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
// Chemistry helper — exported so planning.tsx can show the chemistry bar
// ---------------------------------------------------------------------------

export function computeChemistry(lineupGenres: string[]): number {
  if (lineupGenres.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < lineupGenres.length; i++) {
    for (let j = i + 1; j < lineupGenres.length; j++) {
      total += GENRE_COMPATIBILITY[lineupGenres[i]]?.[lineupGenres[j]] ?? 0;
      pairs++;
    }
  }
  return pairs > 0 ? (total / pairs) * 10 : 0;
}

// ---------------------------------------------------------------------------
// Genre layout bonus — faithful port of backend/festival_simulation.py's
// apply_genre_bonus(). Must stay in sync with that file: same five genres,
// same thresholds, same lack of re-capping at 100 after a multiplicative
// bonus (the server doesn't re-cap either, so neither does this).
// Without this, the client's composite estimate silently drifts from the
// server's the moment a genre bonus condition is actually met, since the
// server applies it but the client previously had no idea it existed.
// ---------------------------------------------------------------------------

type GenreLayoutValues = {
  crowdFlow: number;
  stageScore: number;
  vendorCoverage: number;
  utilityCoverage: number;
  aesthetic: number;
};

function applyGenreLayoutBonus(
  genre: string | null,
  buildings: Building[],
  catalogById: Map<string, CatalogItem>,
  values: GenreLayoutValues,
): GenreLayoutValues {
  const genreKey = (genre ?? "").trim().toLowerCase();
  const out = { ...values };
  const categoryOf = (b: Building) => catalogById.get(b.catalog_id)?.category;

  if (genreKey === "indie") {
    if (values.crowdFlow > 70) {
      out.crowdFlow = values.crowdFlow * 1.15;
    }
  } else if (genreKey === "edm") {
    const stageCount = buildings.filter((b) => categoryOf(b) === "stage").length;
    if (stageCount === 1 && values.stageScore > 20) {
      out.stageScore = values.stageScore * 1.20;
    }
  } else if (genreKey === "rock") {
    const stageCount = buildings.filter((b) => categoryOf(b) === "stage").length;
    if (stageCount > 1) {
      out.stageScore = values.stageScore + Math.min(3, (stageCount - 1) * 3);
    }
  } else if (genreKey === "hiphop") {
    const vendorCatalogIds = new Set(
      buildings.filter((b) => categoryOf(b) === "vendor").map((b) => b.catalog_id),
    );
    if (vendorCatalogIds.size >= 3) {
      out.vendorCoverage = values.vendorCoverage * 1.15;
    }
  } else if (genreKey === "pop") {
    if (values.aesthetic > 12) {
      out.crowdFlow = values.crowdFlow * 1.10;
      out.stageScore = values.stageScore * 1.10;
      out.vendorCoverage = values.vendorCoverage * 1.10;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main scoring function — called by planning.tsx live bar and SimulationOverlay
// ---------------------------------------------------------------------------

export function computeScore(
  buildings: Building[],
  lineup: string[],
  festivalGenre: string | null,
  catalog: CatalogItem[],
): ScoreBreakdown {
  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  const ready = buildings.filter((b) => b.status === "ready");
  const inProgress = buildings.filter((b) => b.status === "building");

  const stages    = ready.filter((b) => catalogById.get(b.catalog_id)?.category === "stage");
  const vendors   = ready.filter((b) => catalogById.get(b.catalog_id)?.category === "vendor");
  const utilities = ready.filter((b) => catalogById.get(b.catalog_id)?.category === "utility");
  const decors    = ready.filter((b) => catalogById.get(b.catalog_id)?.category === "decor");

  // ── Penalty ──────────────────────────────────────────────────────────────
  const penalty = Math.min(20, inProgress.length * 4);

  // ── Stage score ──────────────────────────────────────────────────────────
  const stageRaw = stages.reduce((sum, b) => sum + (catalogById.get(b.catalog_id)?.score ?? 0), 0);
  let stageScore = Math.min(100, stages.length > 0 ? stageRaw * 1.2 : 0);

  // Artist lineup boost + genre matching
  let lineupBoost = 0;
  let matched = 0;
  for (const aid of lineup) {
    const art = ARTIST_DATA[aid];
    if (!art) continue;
    lineupBoost += art.boost;
    if (festivalGenre && (festivalGenre === "mixed" || art.genre === festivalGenre)) {
      matched++;
    }
  }
  stageScore = Math.min(100, stageScore + lineupBoost);

  // Genre bonus
  let genreBonus = 0;
  if (lineup.length > 0 && festivalGenre) {
    const lineupGenres = lineup.map((id) => ARTIST_DATA[id]?.genre).filter(Boolean) as string[];
    const uniqueGenres = new Set(lineupGenres);
    if (matched === lineup.length && festivalGenre !== "mixed") {
      genreBonus = 10; // pure genre
    } else if (festivalGenre === "mixed" && uniqueGenres.size >= 3) {
      genreBonus = 8;  // mixed bag bonus
    }
  }

  // ── Chemistry bonus ───────────────────────────────────────────────────────
  const lineupGenres = lineup.map((id) => ARTIST_DATA[id]?.genre).filter(Boolean) as string[];
  const chemistryBonus = computeChemistry(lineupGenres);

  // ── Crowd flow ────────────────────────────────────────────────────────────
  let crowdFlow = 30; // default when no buildings
  if (ready.length >= 2) {
    let totalDist = 0;
    let pairs = 0;
    for (let i = 0; i < ready.length; i++) {
      for (let j = i + 1; j < ready.length; j++) {
        const dx = ready[i].x - ready[j].x;
        const dy = ready[i].y - ready[j].y;
        totalDist += Math.sqrt(dx * dx + dy * dy);
        pairs++;
      }
    }
    const avgDist = totalDist / pairs;
    crowdFlow = Math.max(0, Math.min(100, Math.round((avgDist / 5.0) * 100)));
  }

  // ── Vendor coverage ───────────────────────────────────────────────────────
  // Mirrors server.py exactly: full coverage needs 3 vendors per stage.
  let vendorCoverage: number;
  if (stages.length > 0) {
    vendorCoverage = Math.min(100, Math.round((vendors.length / (3 * stages.length)) * 100));
  } else {
    vendorCoverage = Math.min(60, vendors.length * 15);
  }

  // ── Utility coverage ──────────────────────────────────────────────────────
  // Mirrors server.py exactly: full coverage needs 2 utilities per stage.
  let utilityCoverage: number;
  if (stages.length > 0) {
    utilityCoverage = Math.min(100, Math.round((utilities.length / (2 * stages.length)) * 100));
  } else {
    utilityCoverage = Math.min(60, utilities.length * 20);
  }

  // ── Aesthetic ─────────────────────────────────────────────────────────────
  const decorRaw = decors.reduce((sum, b) => sum + (catalogById.get(b.catalog_id)?.score ?? 0), 0);
  const aesthetic = Math.min(100, decorRaw * 6);

  // ── Genre layout bonus ───────────────────────────────────────────────────
  // Matches server.py's call exactly: checked against ALL buildings (not just
  // `ready`), same as state["buildings"] is passed server-side. A stage still
  // under construction can swing the EDM/Rock bonus even though it doesn't
  // contribute to stage_score yet — that's a quirk of the server's own logic,
  // not something to "fix" here; this port's job is to match it.
  const bonused = applyGenreLayoutBonus(festivalGenre, buildings, catalogById, {
    crowdFlow,
    stageScore,
    vendorCoverage,
    utilityCoverage,
    aesthetic,
  });
  crowdFlow = bonused.crowdFlow;
  stageScore = bonused.stageScore;
  vendorCoverage = bonused.vendorCoverage;
  utilityCoverage = bonused.utilityCoverage;
  const finalAesthetic = bonused.aesthetic;

  // ── Composite (weighted) ──────────────────────────────────────────────────
  const composite = Math.max(0, Math.round(
    stageScore    * 0.30
    + crowdFlow   * 0.20
    + vendorCoverage  * 0.20
    + utilityCoverage * 0.15
    + finalAesthetic  * 0.15
    - penalty
    + genreBonus
    + chemistryBonus,
  ));

  return {
    stage_score:      Math.round(stageScore    * 0.30),
    crowd_flow:       Math.round(crowdFlow     * 0.20),
    vendor_coverage:  Math.round(vendorCoverage  * 0.20),
    utility_coverage: Math.round(utilityCoverage * 0.15),
    aesthetic:        Math.round(finalAesthetic * 0.15),
    chemistry_bonus:  Math.round(chemistryBonus * 10) / 10,
    composite,
  };
}
