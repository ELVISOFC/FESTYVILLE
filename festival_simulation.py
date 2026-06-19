def apply_genre_bonus(breakdown: dict, genre: str, buildings: list, catalog_by_id: dict) -> dict:
    """
    Apply a genre-specific bonus to the breakdown based on conditions and buildings.

    Args:
        breakdown (dict): Festival score dimensions (crowd_flow_raw, stage_score_raw,
            vendor_coverage_raw, aesthetic_raw, plus the working crowd_flow/stage_score/
            vendor_coverage/utility_coverage/aesthetic values that get boosted).
        genre (str): The festival's genre id — "indie", "edm", "rock", "hiphop", "pop",
            etc. PlayerState.genre is always stored lowercase (e.g. "edm", never "EDM"),
            so matching is normalized to lowercase here. Passing a differently-cased
            genre (or "mixed", which the caller already filters out before calling this)
            simply falls through to bonus_missed rather than silently never matching.
        buildings (list): List of placed Building dicts. Buildings only carry
            id/catalog_id/x/y/placed_at/ready_at/status — they do NOT carry "type",
            "category", or "subtype" directly. Category and vendor identity must be
            looked up via catalog_by_id[b["catalog_id"]].
        catalog_by_id (dict): CATALOG_BY_ID — maps catalog_id -> catalog item dict
            (which does have "category", e.g. "stage"/"vendor"/"utility"/"decor").

    Returns:
        dict: Updated breakdown with 'bonus_label' (on success) or 'bonus_missed'
        (on failure) added.
    """
    genre_key = (genre or "").strip().lower()

    def category_of(b: dict):
        item = catalog_by_id.get(b.get("catalog_id"))
        return item.get("category") if item else None

    bonus_applied = False
    bonus_label = None
    bonus_missed = None

    if genre_key == "indie":
        if breakdown.get("crowd_flow_raw", 0) > 70:
            breakdown["crowd_flow"] = breakdown.get("crowd_flow", 0) * 1.15
            bonus_applied = True
            bonus_label = "Indie bonus applied: +15% crowd flow"
        else:
            bonus_missed = "Indie condition failed: crowd_flow_raw <= 70"

    elif genre_key == "edm":
        stage_count = sum(1 for b in buildings if category_of(b) == "stage")
        if stage_count == 1 and breakdown.get("stage_score_raw", 0) > 20:
            breakdown["stage_score"] = breakdown.get("stage_score", 0) * 1.20
            bonus_applied = True
            bonus_label = "EDM bonus applied: +20% stage score"
        else:
            bonus_missed = "EDM condition failed: not exactly 1 stage or stage_score_raw <= 20"

    elif genre_key == "rock":
        stage_count = sum(1 for b in buildings if category_of(b) == "stage")
        if stage_count > 1:
            bonus_points = min(3, (stage_count - 1) * 3)
            breakdown["stage_score"] = breakdown.get("stage_score", 0) + bonus_points
            bonus_applied = True
            bonus_label = f"Rock bonus applied: +{bonus_points} stage score"
        else:
            bonus_missed = "Rock condition failed: stage_count <= 1"

    elif genre_key == "hiphop":
        # "Distinct vendor subtypes" = distinct vendor catalog items placed (food_truck,
        # drink_bar, merch_tent, vip_lounge, ...) — buildings have no separate "subtype"
        # field, so catalog_id IS the subtype here.
        vendor_catalog_ids = {
            b.get("catalog_id") for b in buildings if category_of(b) == "vendor"
        }
        if len(vendor_catalog_ids) >= 3:
            breakdown["vendor_coverage"] = breakdown.get("vendor_coverage", 0) * 1.15
            bonus_applied = True
            bonus_label = "HipHop bonus applied: +15% vendor coverage"
        else:
            bonus_missed = "HipHop condition failed: fewer than 3 distinct vendor types"

    elif genre_key == "pop":
        if breakdown.get("aesthetic_raw", 0) > 12:
            for key in ["crowd_flow", "stage_score", "vendor_coverage"]:
                breakdown[key] = breakdown.get(key, 0) * 1.10
            bonus_applied = True
            bonus_label = "Pop bonus applied: +10% all dimensions"
        else:
            bonus_missed = "Pop condition failed: aesthetic_raw <= 12"

    else:
        bonus_missed = f"No genre bonus defined for genre '{genre}'"

    if bonus_applied:
        breakdown["bonus_label"] = bonus_label
    else:
        breakdown["bonus_missed"] = bonus_missed

    return breakdown
