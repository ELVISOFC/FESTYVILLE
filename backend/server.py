import random
from typing import Optional, Dict, Any

# Ensure PlayerState class includes current_cycle_goal
class PlayerState:
    def __init__(self, player_id: str):
        self.player_id = player_id
        self.current_cycle_goal: Optional[dict] = None
        self.coins = 0
        self.reputation = 0
        self.genre_affinity = {"Indie": 0, "EDM": 0, "Rock": 0, "HipHop": 0, "Pop": 0}

# Define example goals
GOALS = {
    "infra": [
        {
            "id": "infra_1",
            "type": "infra",
            "label": "Build at least 2 vendor buildings.",
            "check": lambda state: sum(1 for b in state.get("buildings", []) if b.get("type") == "vendor") >= 2,
            "reward": {"coins": 100, "reputation": 10},
            "reward_label": "+100 coins, +10 reputation",
        },
        {
            "id": "infra_2",
            "type": "infra",
            "label": "Add a stage with a rating > 15.",
            "check": lambda state: any(b.get("type") == "stage" and b.get("rating", 0) > 15 for b in state.get("buildings", [])),
            "reward": {"coins": 150, "reputation": 15},
            "reward_label": "+150 coins, +15 reputation",
        },
    ],
    "lineup": [
        {
            "id": "lineup_1",
            "type": "lineup",
            "label": "Add an Indie artist.",
            "check": lambda state: any(a.get("genre") == "Indie" for a in state.get("lineup", [])),
            "reward": {"coins": 50, "reputation": 5},
            "reward_label": "+50 coins, +5 reputation",
        },
        {
            "id": "lineup_2",
            "type": "lineup",
            "label": "Book at least 3 artists.",
            "check": lambda state: len(state.get("lineup", [])) >= 3,
            "reward": {"coins": 120, "reputation": 8},
            "reward_label": "+120 coins, +8 reputation",
        },
    ],
    "score": [
        {
            "id": "score_1",
            "type": "score",
            "label": "Achieve a crowd_flow > 60.",
            "check": lambda state: state.get("crowd_flow", 0) > 60,
            "reward": {"coins": 80, "reputation": 10},
            "reward_label": "+80 coins, +10 reputation",
        },
        {
            "id": "score_2",
            "type": "score",
            "label": "Maintain stage_score > 40.",
            "check": lambda state: state.get("stage_score", 0) > 40,
            "reward": {"coins": 100, "reputation": 12},
            "reward_label": "+100 coins, +12 reputation",
        },
    ],
    "genre": [
        {
            "id": "genre_1",
            "type": "genre",
            "label": "Increase affinity for EDM by 5.",
            "check": lambda state: state.get("genre_affinity", {}).get("EDM", 0) >= 5,
            "reward": {"reputation": 15, "genre_affinity": {"EDM": 1}},
            "reward_label": "+15 reputation, +1 EDM affinity",
        },
        {
            "id": "genre_2",
            "type": "genre",
            "label": "Increase affinity for Rock by 5.",
            "check": lambda state: state.get("genre_affinity", {}).get("Rock", 0) >= 5,
            "reward": {"reputation": 15, "genre_affinity": {"Rock": 1}},
            "reward_label": "+15 reputation, +1 Rock affinity",
        },
    ],
}

def pick_cycle_goal(state: PlayerState, cycle_number: int) -> dict:
    """
    Picks a random goal based on the current cycle.

    Args:
        state (PlayerState): The player's state.
        cycle_number (int): The current cycle number.

    Returns:
        dict: A randomly selected goal of the appropriate type.
    """
    goal_types = ["infra", "lineup", "score", "genre"]
    selected_type = goal_types[cycle_number % len(goal_types)]

    # Seed random for consistency across a player and cycle
    random.seed(f"{state.player_id}_{cycle_number}")
    goal = random.choice(GOALS[selected_type])

    return goal

def apply_goal_reward(state: PlayerState, reward: dict):
    """
    Applies the rewards of a completed goal to the player's state.

    Args:
        state (PlayerState): The player's state.
        reward (dict): The reward dictionary from the goal.
    """
    state.coins += reward.get("coins", 0)
    state.reputation += reward.get("reputation", 0)

    for genre, points in reward.get("genre_affinity", {}).items():
        state.genre_affinity[genre] = state.genre_affinity.get(genre, 0) + points

def simulate(state: Dict[str, Any], cycle_number: int):
    """
    Simulate a cycle, checking goals and applying rewards.

    Args:
        state (dict): The game state, including PlayerState and environment data.
        cycle_number (int): The current cycle number.
    """
    player = state["player"]
    current_cycle_goal = player.current_cycle_goal

    # If there's no goal, pick a new one for the cycle reset
    if not current_cycle_goal:
        player.current_cycle_goal = pick_cycle_goal(player, cycle_number)

    # Check the goal and apply rewards if completed
    if player.current_cycle_goal:
        goal = player.current_cycle_goal
        if goal["check"](state):
            apply_goal_reward(player, goal["reward"])
            print(f"Goal completed: {goal['label']} ({goal['reward_label']})")
            player.current_cycle_goal = None  # Reset after completion
        else:
            print(f"Goal not met: {goal['label']}")