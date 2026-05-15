/**
 * scoring.test.ts
 *
 * Verifies computeScore() output matches server.py simulate() within ±2
 * composite points on identical inputs.
 *
 * Expected values below were derived by running the identical Python math
 * manually and by cross-checking the algorithm step-by-step.
 *
 * Test coverage:
 *  1. Empty grid                    → composite = 0
 *  2. Single stage, no extras       → composite = 9
 *  3. Perfect festival, pure genre  → composite = 110  (≥90 requirement met)
 *  4. Mixed genre, 3 artists        → composite = 72   (mid-range)
 *  5. In-progress penalty applied   → composite = 24
 */

import { computeScore } from "./scoring";
import type { ScoreBreakdown } from "./scoring";
import type { Building, CatalogItem } from "../api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CATALOG: CatalogItem[] = [
  { id: "stage_small",  name: "Open Mic Stage",    category: "stage",   tier: 1, cost: 200,  build_time: 180,  phase: 1, score: 10,  footprint: 1, color: "#FF0055" },
  { id: "stage_indie",  name: "Indie Stage",        category: "stage",   tier: 2, cost: 800,  build_time: 600,  phase: 2, score: 25,  footprint: 1, color: "#FF3377" },
  { id: "stage_main",   name: "Main Stage",         category: "stage",   tier: 4, cost: 6000, build_time: 1800, phase: 6, score: 100, footprint: 1, color: "#FF0055" },
  { id: "food_truck",   name: "Food Truck",         category: "vendor",  tier: 1, cost: 100,  build_time: 180,  phase: 1, score: 5,   footprint: 1, color: "#FF9900" },
  { id: "drink_bar",    name: "Drink Bar",          category: "vendor",  tier: 2, cost: 250,  build_time: 240,  phase: 1, score: 8,   footprint: 1, color: "#FFB347" },
  { id: "restroom",     name: "Restroom Block",     category: "utility", tier: 1, cost: 80,   build_time: 180,  phase: 1, score: 4,   footprint: 1, color: "#00FFFF" },
  { id: "neon_arch",    name: "Neon Arch",          category: "decor",   tier: 1, cost: 60,   build_time: 180,  phase: 1, score: 3,   footprint: 1, color: "#00FF66" },
  { id: "art_statue",   name: "Art Statue",         category: "decor",   tier: 4, cost: 1500, build_time: 900,  phase: 5, score: 20,  footprint: 1, color: "#FFD700" },
];

let _uid = 0;
function makeBuilding(
  catalog_id: string,
  x: number,
  y: number,
  status: "ready" | "building" = "ready",
): Building {
  return { id: `b${++_uid}`, catalog_id, x, y, placed_at: 0, ready_at: 0, status };
}

/** Assert client composite is within ±2 of expected server value. */
function expectNearServer(result: ScoreBreakdown, expected: number): void {
  expect(result.composite).toBeGreaterThanOrEqual(expected - 2);
  expect(result.composite).toBeLessThanOrEqual(expected + 2);
}

// ---------------------------------------------------------------------------
// Test 1 — Empty grid
// No buildings → all dimensions are zero.
// Server rejects this call; client returns zeros defensively.
// Expected composite: 0
// ---------------------------------------------------------------------------
test("TC1 empty grid returns composite 0", () => {
  const result = computeScore([], [], null, CATALOG);

  expect(result.stage_score).toBe(0);
  expect(result.crowd_flow).toBe(0);
  expect(result.vendor_coverage).toBe(0);
  expect(result.utility_coverage).toBe(0);
  expect(result.aesthetic).toBe(0);
  expect(result.composite).toBe(0);

  expectNearServer(result, 0); // server would also produce 0
});

// ---------------------------------------------------------------------------
// Test 2 — Single ready stage, no artists, no extras
// stage_small score=10 → rawStage = min(100, 10 × 1.2) = 12
// 1 building → crowd_flow fallback = 30
// vendor = 0/(3×1) = 0, utility = 0/(2×1) = 0, aesthetic = 0
// composite = trunc(12×.30 + 30×.20 + 0 + 0 + 0) = trunc(3.6 + 6) = trunc(9.6) = 9
// Expected composite: 9
// ---------------------------------------------------------------------------
test("TC2 single ready stage with no extras returns composite 9", () => {
  const buildings = [makeBuilding("stage_small", 0, 0)];
  const result = computeScore(buildings, [], null, CATALOG);

  // Weighted stage: 12 × 0.30 = 3.6
  expect(result.stage_score).toBeCloseTo(3.6, 5);
  // Weighted crowd (fallback 30): 30 × 0.20 = 6
  expect(result.crowd_flow).toBeCloseTo(6, 5);
  expect(result.vendor_coverage).toBe(0);
  expect(result.utility_coverage).toBe(0);
  expect(result.aesthetic).toBe(0);
  expect(result.composite).toBe(9);

  expectNearServer(result, 9);
});

// ---------------------------------------------------------------------------
// Test 3 — Perfect festival: main stage + full vendors/utilities/decor,
//          pure-EDM lineup (glow_riot + pulse_drop + neon_wolves)
//
// Buildings (7, all ready, spread across grid):
//   stage_main(1,6) | food_truck×3 at (3,0)(7,0)(0,3) |
//   restroom×2 at (7,7)(4,4) | art_statue(0,7)
//
// Calculation:
//   rawStage   = min(100, 100×1.2) = 100 + boost(8+18+38)=64 → min(100,164)=100
//   rawCrowd   = trunc(avgDist/5×100) → avg≈5.67 → min(100,113)=100
//   rawVendor  = trunc(3/(3×1)×100) = 100
//   rawUtility = trunc(2/(2×1)×100) = 100
//   rawAesthetic = min(100, 20×6) = 100  (art_statue score=20)
//   genreBonus = 10 (pure EDM, all 3 artists match)
//   penalty    = 0
//   composite  = trunc(30+20+20+15+15 + 10) = 110
//
// Requirement: composite ≥ 90  ✓
// Expected composite (server): 110
// ---------------------------------------------------------------------------
test("TC3 perfect festival with pure-EDM lineup returns composite >= 90 and matches server", () => {
  const buildings = [
    makeBuilding("stage_main",  1, 6),
    makeBuilding("food_truck",  3, 0),
    makeBuilding("food_truck",  7, 0),
    makeBuilding("food_truck",  0, 3),
    makeBuilding("restroom",    7, 7),
    makeBuilding("restroom",    4, 4),
    makeBuilding("art_statue",  0, 7),
  ];
  const lineup = ["glow_riot", "pulse_drop", "neon_wolves"];
  const result = computeScore(buildings, lineup, "edm", CATALOG);

  expect(result.composite).toBeGreaterThanOrEqual(90);

  // Spot-check weighted dimensions at max
  expect(result.stage_score).toBeCloseTo(30, 1);      // 100 × 0.30
  expect(result.vendor_coverage).toBeCloseTo(20, 1);   // 100 × 0.20
  expect(result.utility_coverage).toBeCloseTo(15, 1);  // 100 × 0.15
  expect(result.aesthetic).toBeCloseTo(15, 1);          // 100 × 0.15

  expectNearServer(result, 110); // server returns 110
});

// ---------------------------------------------------------------------------
// Test 4 — Mixed genre, 3 distinct genres (genre_bonus = 8)
//
// Buildings (5, all ready):
//   stage_indie(0,7) | drink_bar×2 at (3,0)(7,3) | restroom×2 at (0,0)(7,7)
//
// Lineup: glow_riot(edm) + velvet_echo(indie) + blk_captain(hiphop) → 3 genres
// Genre: "mixed"
//
// Calculation:
//   rawStage   = min(100, 25×1.2)=30 + boost(8+8+8)=24 → 54
//   rawCrowd   = min(100, trunc(avgDist/5×100)) → avg≈6.73 → min(100,134)=100
//   rawVendor  = trunc(2/(3×1)×100) = trunc(66.7) = 66
//   rawUtility = trunc(2/(2×1)×100) = 100
//   rawAesthetic = 0
//   genreBonus = 8 (mixed, 3+ distinct genres in lineup)
//   penalty    = 0
//   composite  = trunc(54×.30 + 100×.20 + 66×.20 + 100×.15 + 0×.15 + 8)
//              = trunc(16.2 + 20 + 13.2 + 15 + 0 + 8)
//              = trunc(72.4) = 72
//
// Expected composite (server): 72  →  mid-range ✓
// ---------------------------------------------------------------------------
test("TC4 mixed-genre festival with 3 genres returns mid-range composite and matches server", () => {
  const buildings = [
    makeBuilding("stage_indie", 0, 7),
    makeBuilding("drink_bar",   3, 0),
    makeBuilding("drink_bar",   7, 3),
    makeBuilding("restroom",    0, 0),
    makeBuilding("restroom",    7, 7),
  ];
  const lineup = ["glow_riot", "velvet_echo", "blk_captain"]; // edm, indie, hiphop
  const result = computeScore(buildings, lineup, "mixed", CATALOG);

  expect(result.composite).toBeGreaterThan(40);
  expect(result.composite).toBeLessThan(85);

  expectNearServer(result, 72);
});

// ---------------------------------------------------------------------------
// Test 5 — In-progress penalty
//
// 1 ready main stage + 3 in-progress food trucks (penalty = 3×4 = 12)
//
// Calculation:
//   rawStage   = min(100, 100×1.2) = 100
//   rawCrowd   = 30 (1 ready building → fallback)
//   rawVendor  = 0 (no ready vendors)
//   rawUtility = 0
//   rawAesthetic = 0
//   penalty    = min(20, 3×4) = 12
//   composite  = trunc(100×.30 + 30×.20 + 0 + 0 + 0 - 12 + 0)
//              = trunc(30 + 6 - 12) = trunc(24) = 24
//
// Expected composite (server): 24
// ---------------------------------------------------------------------------
test("TC5 in-progress buildings apply penalty and match server", () => {
  const buildings = [
    makeBuilding("stage_main",  0, 0, "ready"),
    makeBuilding("food_truck",  5, 5, "building"),
    makeBuilding("food_truck",  5, 0, "building"),
    makeBuilding("food_truck",  0, 5, "building"),
  ];
  const result = computeScore(buildings, [], null, CATALOG);

  expect(result.composite).toBe(24);

  expectNearServer(result, 24);
});
