from __future__ import annotations

import asyncio
import hashlib
import logging
from collections import OrderedDict

from fastapi import WebSocket

from app.adapters.vision_adapter import vision_adapter
from app.config import settings
from app.persistence.service import persistence_service
from app.state.session_store import FrameSnapshot, session_store, utc_now_iso

logger = logging.getLogger(__name__)
uvicorn_logger = logging.getLogger("uvicorn.error")


class VisionService:
    def __init__(self) -> None:
        self._summary_tasks: dict[str, asyncio.Task[dict[str, str | bool]]] = {}
        self._summary_cache: OrderedDict[str, dict[str, str]] = OrderedDict()

    async def _summarize_frame(self, frame: FrameSnapshot) -> dict[str, str | bool]:
        cache_key = hashlib.sha256(frame.image_base64.encode("utf-8")).hexdigest()
        if settings.vision_cache_enabled:
            cached = self._summary_cache.get(cache_key)
            if cached is not None:
                self._summary_cache.move_to_end(cache_key)
                frame.summary = cached.get("summary") or ""
                frame.summary_provider = cached.get("provider") or "unknown"
                frame.summary_cache_hit = True
                frame.summary_error = None
                frame.summarized_at = utc_now_iso()
                persistence_service.record_frame_summary(
                    session_id=frame.session_id,
                    frame_id=frame.frame_id,
                    summary=frame.summary,
                    provider=frame.summary_provider,
                    cache_hit=True,
                    summarized_at=frame.summarized_at,
                    summary_error=None,
                )
                return {
                    "summary": frame.summary,
                    "provider": frame.summary_provider,
                    "cacheHit": True,
                }

        try:
            result = await vision_adapter.summarize(frame)
        except Exception as exc:
            frame.summary_error = str(exc)
            frame.summarized_at = utc_now_iso()
            persistence_service.record_frame_summary(
                session_id=frame.session_id,
                frame_id=frame.frame_id,
                summary=None,
                provider=None,
                cache_hit=False,
                summarized_at=frame.summarized_at,
                summary_error=frame.summary_error,
            )
            raise
        frame.summary = result["summary"]
        frame.summary_provider = result["provider"]
        frame.summary_cache_hit = bool(result.get("cacheHit", False))
        frame.summary_error = None
        frame.summarized_at = utc_now_iso()
        if settings.vision_cache_enabled and frame.summary is not None:
            self._summary_cache[cache_key] = {
                "summary": frame.summary,
                "provider": frame.summary_provider or "unknown",
            }
            self._summary_cache.move_to_end(cache_key)
            while len(self._summary_cache) > max(1, settings.vision_cache_max_entries):
                self._summary_cache.popitem(last=False)
        persistence_service.record_frame_summary(
            session_id=frame.session_id,
            frame_id=frame.frame_id,
            summary=frame.summary,
            provider=frame.summary_provider,
            cache_hit=bool(frame.summary_cache_hit),
            summarized_at=frame.summarized_at,
            summary_error=None,
        )
        return result

    async def handle_frame_capture(self, websocket: WebSocket, payload: dict) -> None:
        session_id = payload.get("sessionId")
        if not session_id:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "missing_session_id",
                    "message": "上传关键帧时必须提供 sessionId。",
                }
            )
            return

        uvicorn_logger.warning(
            "frame.capture received: session_id=%s frame_id=%s input_source=%s image_size=%s",
            session_id,
            payload.get("frameId", ""),
            payload.get("inputSource", "camera"),
            len(str(payload.get("imageBase64", ""))),
        )

        frame = session_store.add_frame(
            session_id=session_id,
            frame_id=payload.get("frameId", ""),
            input_source=payload.get("inputSource", "camera"),
            image_base64=payload.get("imageBase64", ""),
            width=int(payload.get("width", 0)),
            height=int(payload.get("height", 0)),
            captured_at=payload.get("capturedAt", ""),
        )
        if frame is None:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "session_not_found",
                    "message": "会话不存在，请先开始会话再上传关键帧。",
                }
            )
            return

        await websocket.send_json(
            {
                "type": "frame.stored",
                "sessionId": session_id,
                "frameId": frame.frame_id,
                "inputSource": frame.input_source,
                "width": frame.width,
                "height": frame.height,
                "capturedAt": frame.captured_at,
                "message": "关键帧已缓存，等待在本轮提交时参与视觉理解。",
            }
        )
        persistence_service.record_frame_capture(
            session_id=session_id,
            frame_id=frame.frame_id,
            input_source=frame.input_source,
            width=frame.width,
            height=frame.height,
            captured_at=frame.captured_at,
        )
        if frame.frame_id and frame.frame_id not in self._summary_tasks:
            task = asyncio.create_task(self._summarize_frame(frame))

            def _cleanup(_task: asyncio.Task[dict[str, str | bool]]) -> None:
                self._summary_tasks.pop(frame.frame_id, None)

            task.add_done_callback(_cleanup)
            self._summary_tasks[frame.frame_id] = task

    async def summarize_latest_frame(self, session_id: str, turn_id: str) -> dict[str, str | bool] | None:
        frame = session_store.get_latest_frame(session_id)
        return await self._summarize_frame_for_turn(session_id=session_id, turn_id=turn_id, frame=frame)

    async def summarize_frame(self, *, session_id: str, turn_id: str, frame_id: str) -> dict[str, str | bool] | None:
        frame = session_store.get_frame(session_id, frame_id)
        return await self._summarize_frame_for_turn(session_id=session_id, turn_id=turn_id, frame=frame)

    async def _summarize_frame_for_turn(
        self,
        *,
        session_id: str,
        turn_id: str,
        frame: FrameSnapshot | None,
    ) -> dict[str, str | bool] | None:
        if frame is None:
            return None

        try:
            task = self._summary_tasks.get(frame.frame_id)
            if task is not None and not task.done():
                await task
            elif frame.summary is None and frame.summary_error is None:
                await self._summarize_frame(frame)
        except Exception as exc:
            logger.warning(
                "vision summarize failed: session_id=%s turn_id=%s frame_id=%s error=%s",
                session_id,
                turn_id,
                frame.frame_id,
                str(exc),
            )
            return None

        return {
            "sessionId": session_id,
            "turnId": turn_id,
            "frameId": frame.frame_id,
            "summary": frame.summary or "",
            "provider": frame.summary_provider or "unknown",
            "cacheHit": bool(frame.summary_cache_hit),
            "capturedAt": frame.captured_at,
        }

    def get_latest_frame(self, session_id: str) -> FrameSnapshot | None:
        return session_store.get_latest_frame(session_id)


vision_service = VisionService()
