from __future__ import annotations

from app.core.config import settings


def estimate_asr_cost_yuan(*, duration_ms: int) -> float:
    if duration_ms <= 0:
        return 0.0
    return (duration_ms / 3_600_000) * float(settings.cost_asr_price_yuan_per_hour)


def estimate_tts_cost_yuan(*, char_count: int) -> float:
    if char_count <= 0:
        return 0.0
    return (char_count / 10_000) * float(settings.cost_tts_price_yuan_per_10k_chars)
