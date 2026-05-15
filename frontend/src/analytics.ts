import { logEvent } from "firebase/analytics";
import { getFirebaseAnalytics } from "./firebase";

async function log(name: string, params?: Record<string, unknown>) {
  try {
    const analytics = await getFirebaseAnalytics();
    if (!analytics) return;
    logEvent(analytics, name, params as any);
  } catch (e) {
    console.warn("[Analytics] logEvent failed:", name, e);
  }
}

export const Analytics = {
  sessionStart: () =>
    log("session_start"),

  buildingPlaced: (catalogId: string, category: string, tier: number, cost: number) =>
    log("building_placed", { catalog_id: catalogId, category, tier, cost }),

  buildingSpedUp: (catalogId: string, coinsSpent: number) =>
    log("building_sped_up", { catalog_id: catalogId, coins_spent: coinsSpent }),

  buildingDemolished: (catalogId: string, category: string) =>
    log("building_demolished", { catalog_id: catalogId, category }),

  festivalRun: (grade: string, score: number, cycle: number, coinsEarned: number, xpEarned: number) =>
    log("festival_run", { grade, score, cycle, coins_earned: coinsEarned, xp_earned: xpEarned }),

  genreSelected: (genre: string) =>
    log("genre_selected", { genre }),

  artistBooked: (artistId: string, genre: string, tier: number, fee: number) =>
    log("artist_booked", { artist_id: artistId, genre, tier, fee }),

  artistUnbooked: (artistId: string) =>
    log("artist_unbooked", { artist_id: artistId }),

  dayAdvanced: (day: number, cycle: number) =>
    log("day_advanced", { day, cycle }),

  screenView: (screenName: string) =>
    log("screen_view", { firebase_screen: screenName, firebase_screen_class: screenName }),

  tutorialStep: (step: number, stepName: string) =>
    log("tutorial_step", { step, step_name: stepName }),

  newSave: () =>
    log("new_save"),

  resetSave: () =>
    log("reset_save"),

  errorOccurred: (errorCode: string, errorMessage: string, context: string) =>
    log("app_error", { error_code: errorCode, error_message: errorMessage.slice(0, 100), context }),

  // Legacy/anti-churn signals — fire exactly once per trigger
  legacyTierUnlocked: (tier: string, reputationScore: number) =>
    log("legacy_tier_unlocked", { tier, reputation_score: reputationScore }),

  milestoneEarned: (milestoneId: string, eventsPlayed: number) =>
    log("milestone_earned", { milestone_id: milestoneId, events_played: eventsPlayed }),
};
