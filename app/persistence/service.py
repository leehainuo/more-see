from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.persistence.repository import persistence_repository

logger = logging.getLogger(__name__)


class PersistenceService:
    def __init__(self) -> None:
        pass

    async def ensure_schema(self) -> None:
        if not settings.mysql_auto_create_tables:
            return
        await persistence_repository.ensure_schema()

    async def shutdown(self) -> None:
        from app.persistence.db import shutdown_engine

        await shutdown_engine()

    def record_session_started(
        self,
        *,
        session_id: str,
        user_id: int,
        input_source: str,
        device_info: dict,
        created_at: str,
        updated_at: str,
    ) -> None:
        asyncio.create_task(
            self._safe_call(
                persistence_repository.upsert_session(
                    session_id=session_id,
                    user_id=user_id,
                    input_source=input_source,
                    device_info=device_info,
                    created_at=created_at,
                    updated_at=updated_at,
                )
            )
        )

    def record_session_ended(self, *, session_id: str) -> None:
        asyncio.create_task(self._safe_call(persistence_repository.mark_session_ended(session_id=session_id)))

    def record_turn(
        self,
        *,
        session_id: str,
        turn_id: str,
        user_text: str,
        assistant_text: str,
        vision_summary: str | None,
        asr_duration_ms: int,
        asr_provider: str | None,
        tts_char_count: int,
        tts_provider: str | None,
    ) -> None:
        asyncio.create_task(
            self._safe_call(
                persistence_repository.upsert_turn(
                    session_id=session_id,
                    turn_id=turn_id,
                    user_text=user_text,
                    assistant_text=assistant_text,
                    vision_summary=vision_summary,
                    asr_duration_ms=asr_duration_ms,
                    asr_provider=asr_provider,
                    tts_char_count=tts_char_count,
                    tts_provider=tts_provider,
                )
            )
        )

    def record_frame_capture(
        self,
        *,
        session_id: str,
        frame_id: str,
        input_source: str,
        width: int,
        height: int,
        captured_at: str,
    ) -> None:
        asyncio.create_task(
            self._safe_call(
                persistence_repository.upsert_frame(
                    session_id=session_id,
                    frame_id=frame_id,
                    input_source=input_source,
                    width=width,
                    height=height,
                    captured_at=captured_at,
                )
            )
        )

    def record_frame_summary(
        self,
        *,
        session_id: str,
        frame_id: str,
        summary: str | None,
        provider: str | None,
        cache_hit: bool,
        summarized_at: str | None,
        summary_error: str | None,
    ) -> None:
        asyncio.create_task(
            self._safe_call(
                persistence_repository.update_frame_summary(
                    session_id=session_id,
                    frame_id=frame_id,
                    summary=summary,
                    provider=provider,
                    cache_hit=cache_hit,
                    summarized_at=summarized_at,
                    summary_error=summary_error,
                )
            )
        )

    async def _safe_call(self, coro: asyncio.Future) -> None:
        try:
            await coro
        except Exception as exc:
            logger.warning("mysql persistence failed: %s", exc)


persistence_service = PersistenceService()
