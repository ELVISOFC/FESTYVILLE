def apply_genre_bonus(breakdown: dict, genre: str, buildings: list) -> dict:
    """
    Apply a genre-specific bonus to the breakdown based on conditions and buildings.

    Args:
        breakdown (dict): Consists of festival dimensions (e.g., crowd_flow_raw, stage_score_raw, etc.).
        genre (str): The music genre (e.g., Indie, EDM, Rock, HipHop, Pop).
        buildings (list): List of building objects, which may include details like type or subtype.

    Returns:
        dict: Updated breakdown with fields 'bonus_label' or 'bonus_missed' added.
    """

    bonus_applied = False
    bonus_label = None
    bonus_missed = None

    if genre == "Indie":
        if breakdown.get("crowd_flow_raw", 0) > 70:
            breakdown["crowd_flow"] = breakdown.get("crowd_flow", 0) * 1.15
            bonus_applied = True
            bonus_label = "Indie bonus applied: +15% crowd flow"
        else:
            bonus_missed = "Indie condition failed: crowd_flow_raw <= 70"

    elif genre == "EDM":
        stage_count = sum(1 for b in buildings if b.get("type") == "stage")
        if stage_count == 1 and breakdown.get("stage_score_raw", 0) > 20:
            breakdown["stage_score"] = breakdown.get("stage_score", 0) * 1.20
            bonus_applied = True
            bonus_label = "EDM bonus applied: +20% stage score"
        else:
            bonus_missed = "EDM condition failed: not exactly 1 stage or stage_score_raw <= 20"

    elif genre == "Rock":
        stage_count = sum(1 for b in buildings if b.get("type") == "stage")
        if stage_count > 1:
            bonus_points = min(3, (stage_count - 1) * 3)
            breakdown["stage_score"] = breakdown.get("stage_score", 0) + bonus_points
            bonus_applied = True
            bonus_label = f"Rock bonus applied: +{bonus_points} stage score"
        else:
            bonus_missed = "Rock condition failed: stage_count <= 1"
    
    elif genre == "HipHop":
        vendor_subtypes = {b.get("subtype") for b in buildings if b.get("type") == "vendor"}
        if len(vendor_subtypes) >= 3:
            breakdown["vendor_coverage"] = breakdown.get("vendor_coverage", 0) * 1.15
            bonus_applied = True
            bonus_label = "HipHop bonus applied: +15% vendor coverage"
        else:
            bonus_missed = "HipHop condition failed: less than 3 distinct vendor subtypes"

    elif genre == "Pop":
        if breakdown.get("aesthetic_raw", 0) > 12:
            for key in ["crowd_flow", "stage_score", "vendor_coverage"]:
                breakdown[key] = breakdown.get(key, 0) * 1.10
            bonus_applied = True
            bonus_label = "Pop bonus applied: +10% all dimensions"
        else:
            bonus_missed = "Pop condition failed: aesthetic_raw <= 12"

    # Set the appropriate label based on whether the bonus was applied or missed.
    if bonus_applied:
        breakdown["bonus_label"] = bonus_label
    else:
        breakdown["bonus_missed"] = bonus_missed

    return breakdown