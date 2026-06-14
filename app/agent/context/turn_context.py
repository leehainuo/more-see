from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.agent.session_store import TurnRecord, session_store
from app.core.config import settings
from app.services.memory_service import memory_service


@dataclass(slots=True)
class TurnReplyContext:
    history_turns: list[TurnRecord]
    session_summary: str | None
    semantic_snippets: list[str]


async def build_turn_reply_context(
    *,
    session_id: str,
    turn_id: str,
    transcript: str,
    vision_summary: str | None,
) -> TurnReplyContext:
    history_turns = session_store.get_recent_turns(session_id, limit=3)
    session_store.save_turn(
        session_id=session_id,
        turn_id=turn_id,
        user_text=transcript,
        vision_summary=vision_summary,
    )
    session_store.set_assistant_transcript(session_id, "")
    session_store.set_assistant_speaking(session_id, False)

    session_summary: str | None = None
    semantic_snippets: list[str] = []
    session = session_store.get_session(session_id)
    if session is not None:
        session_summary = session.session_summary
        semantic_snippets = await _load_semantic_snippets(
            session_user_id=session.user_id,
            transcript=transcript,
        )

    return TurnReplyContext(
        history_turns=history_turns,
        session_summary=session_summary,
        semantic_snippets=semantic_snippets,
    )


async def _load_semantic_snippets(*, session_user_id: int | None, transcript: str) -> list[str]:
    if not settings.memory_semantic_enabled or session_user_id is None:
        return []

    try:
        return await asyncio.wait_for(
            memory_service.retrieve_semantic_snippets(
                user_id=int(session_user_id),
                query=transcript,
            ),
            timeout=1.6,
        )
    except Exception:
        return []
