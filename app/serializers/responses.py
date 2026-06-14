from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.persistence.models import FrameRow, SessionRow, TurnRow, UserRow
from app.services.cost_service import estimate_asr_cost_yuan, estimate_tts_cost_yuan


def _iso_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _sort_turns(turns: Iterable[TurnRow]) -> list[TurnRow]:
    return sorted(turns, key=lambda item: item.created_at)


def _sort_frames(frames: Iterable[FrameRow]) -> list[FrameRow]:
    return sorted(frames, key=lambda item: item.created_at)


def _count_vision_cache_hits(frames: Iterable[FrameRow]) -> int:
    return sum(1 for frame in frames if int(getattr(frame, "cache_hit", 0) or 0) == 1)


def serialize_auth_user(user: UserRow) -> dict[str, int | str]:
    return {
        "userId": user.id,
        "username": user.username,
        "isSuper": int(user.is_super),
    }


def serialize_session_list_item(row: SessionRow) -> dict[str, str | None]:
    return {
        "sessionId": row.session_id,
        "inputSource": row.input_source,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
        "endedAt": _iso_or_none(row.ended_at),
    }


def serialize_session_list_response(
    *,
    page: int,
    page_size: int,
    total: int,
    rows: Iterable[SessionRow],
) -> dict[str, int | list[dict[str, str | None]]]:
    return {
        "page": page,
        "pageSize": page_size,
        "total": total,
        "items": [serialize_session_list_item(row) for row in rows],
    }


def serialize_session_detail(row: SessionRow) -> dict[str, object]:
    turns = _sort_turns(row.turns)
    frames = _sort_frames(row.frames)
    return {
        "sessionId": row.session_id,
        "inputSource": row.input_source,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
        "endedAt": _iso_or_none(row.ended_at),
        "turns": [
            {
                "turnId": item.turn_id,
                "userText": item.user_text,
                "assistantText": item.assistant_text,
                "visionSummary": item.vision_summary,
                "createdAt": item.created_at.isoformat(),
                "updatedAt": item.updated_at.isoformat(),
            }
            for item in turns
        ],
        "frames": [
            {
                "frameId": item.frame_id,
                "inputSource": item.input_source,
                "width": item.width,
                "height": item.height,
                "capturedAt": item.captured_at,
                "summary": item.summary,
                "provider": item.provider,
                "cacheHit": bool(item.cache_hit),
                "summarizedAt": item.summarized_at,
                "summaryError": item.summary_error,
                "createdAt": item.created_at.isoformat(),
                "updatedAt": item.updated_at.isoformat(),
            }
            for item in frames
        ],
    }


def serialize_admin_cost_session_item(row: SessionRow) -> dict[str, object]:
    turns = _sort_turns(row.turns)
    frames = _sort_frames(row.frames)
    asr_duration_ms = sum(int(getattr(turn, "asr_duration_ms", 0) or 0) for turn in turns)
    tts_char_count = sum(int(getattr(turn, "tts_char_count", 0) or 0) for turn in turns)
    return {
        "sessionId": row.session_id,
        "inputSource": row.input_source,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
        "endedAt": _iso_or_none(row.ended_at),
        "asrDurationMs": asr_duration_ms,
        "ttsCharCount": tts_char_count,
        "asrCostYuan": estimate_asr_cost_yuan(duration_ms=asr_duration_ms),
        "ttsCostYuan": estimate_tts_cost_yuan(char_count=tts_char_count),
        "visionFrameCount": len(frames),
        "visionCacheHitCount": _count_vision_cache_hits(frames),
    }


def serialize_admin_cost_session_detail(row: SessionRow) -> dict[str, object]:
    turns = _sort_turns(row.turns)
    frames = _sort_frames(row.frames)
    serialized_turns: list[dict[str, object]] = []
    session_asr_duration_ms = 0
    session_tts_char_count = 0

    for turn in turns:
        asr_duration_ms = int(getattr(turn, "asr_duration_ms", 0) or 0)
        tts_char_count = int(getattr(turn, "tts_char_count", 0) or 0)
        session_asr_duration_ms += asr_duration_ms
        session_tts_char_count += tts_char_count
        serialized_turns.append(
            {
                "turnId": turn.turn_id,
                "createdAt": turn.created_at.isoformat(),
                "userText": turn.user_text,
                "assistantText": turn.assistant_text,
                "visionSummary": turn.vision_summary,
                "asrDurationMs": asr_duration_ms,
                "asrProvider": getattr(turn, "asr_provider", None),
                "ttsCharCount": tts_char_count,
                "ttsProvider": getattr(turn, "tts_provider", None),
                "asrCostYuan": estimate_asr_cost_yuan(duration_ms=asr_duration_ms),
                "ttsCostYuan": estimate_tts_cost_yuan(char_count=tts_char_count),
            }
        )

    return {
        "sessionId": row.session_id,
        "inputSource": row.input_source,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
        "endedAt": _iso_or_none(row.ended_at),
        "asrDurationMs": session_asr_duration_ms,
        "ttsCharCount": session_tts_char_count,
        "asrCostYuan": estimate_asr_cost_yuan(duration_ms=session_asr_duration_ms),
        "ttsCostYuan": estimate_tts_cost_yuan(char_count=session_tts_char_count),
        "visionFrameCount": len(frames),
        "visionCacheHitCount": _count_vision_cache_hits(frames),
        "turns": serialized_turns,
    }
