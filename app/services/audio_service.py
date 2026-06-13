from __future__ import annotations

import logging
import re
import uuid
import asyncio

from fastapi import WebSocket

from app.adapters.asr_adapter import asr_adapter, is_fallback_transcript
from app.state.session_store import session_store
from app.services.asr_stream_service import asr_stream_service
from app.services.conversation_service import conversation_service
from app.services.vision_service import vision_service

logger = logging.getLogger(__name__)
_PARTIAL_MIN_DURATION_MS = 300
_PARTIAL_MIN_CHUNKS = 2
_BARGE_IN_CONFIRM_HITS = 2
_BARGE_IN_LONG_PARTIAL_LEN = 6
_VISION_TOTAL_BUDGET_SECONDS = 12.0
_NORMALIZE_TEXT_RE = re.compile(r"""[\s，。！？；：、“”"'`~!@#$%^&*()_+\-=\[\]{};:\\|,.<>/?《》【】（）]""")


def _normalize_speech_text(text: str) -> str:
    return _NORMALIZE_TEXT_RE.sub("", text.lower())


def _is_likely_echo_transcript(partial_transcript: str, assistant_transcript: str) -> bool:
    normalized_partial = _normalize_speech_text(partial_transcript)
    if len(normalized_partial) < 2:
        return False

    assistant_tail = _normalize_speech_text(assistant_transcript)[-48:]
    if not assistant_tail:
        return False

    return normalized_partial in assistant_tail


def _is_stable_partial_transcript(current_transcript: str, previous_transcript: str) -> bool:
    current = _normalize_speech_text(current_transcript)
    previous = _normalize_speech_text(previous_transcript)
    if len(current) < 2 or len(previous) < 2:
        return False
    return current in previous or previous in current


class AudioService:
    async def handle_audio_chunk(self, websocket: WebSocket, payload: dict) -> None:
        session_id = payload.get("sessionId")
        if not session_id:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "missing_session_id",
                    "message": "上传音频分段时必须提供 sessionId。",
                }
            )
            return

        chunk = session_store.add_audio_chunk(
            session_id=session_id,
            chunk_id=payload.get("chunkId", str(uuid.uuid4())),
            mime_type=payload.get("mimeType", "audio/webm"),
            base64_audio=payload.get("base64Audio", ""),
            duration_ms=int(payload.get("durationMs", 0)),
        )
        if chunk is None:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "session_not_found",
                    "message": "会话不存在，请先开始会话再上传音频。",
                }
            )
            return
        asyncio.create_task(
            asr_stream_service.push_audio_chunk(
                session_id=session_id,
                mime_type=chunk.mime_type,
                base64_audio=chunk.base64_audio,
            )
        )

    def should_probe_barge_in(self, session_id: str) -> bool:
        session = session_store.get_assistant_state(session_id)
        if session is None or not session.assistant_speaking:
            return False

        chunk_count = len(session.audio_chunks)
        if chunk_count < _PARTIAL_MIN_CHUNKS or chunk_count <= session.last_partial_chunk_count:
            return False

        total_duration_ms = sum(chunk.duration_ms for chunk in session.audio_chunks)
        return total_duration_ms >= _PARTIAL_MIN_DURATION_MS

    async def probe_barge_in(self, session_id: str) -> dict[str, str | int] | None:
        session = session_store.get_assistant_state(session_id)
        if session is None or not session.assistant_speaking:
            return None

        chunks = list(session.audio_chunks)
        if len(chunks) < _PARTIAL_MIN_CHUNKS:
            return None

        total_duration_ms = sum(chunk.duration_ms for chunk in chunks)
        if total_duration_ms < _PARTIAL_MIN_DURATION_MS:
            return None

        if len(chunks) <= session.last_partial_chunk_count:
            return None

        result = await asr_adapter.transcribe_partial(chunks)
        transcript = str(result.get("transcript", "")).strip()
        if not transcript:
            session_store.update_partial_probe_state(session_id, chunk_count=len(chunks))
            return None

        provider = str(result.get("provider", "volcengine"))
        stable_hits = 1
        verdict = "candidate"
        normalized_partial = _normalize_speech_text(transcript)

        if _is_likely_echo_transcript(transcript, session.assistant_transcript):
            stable_hits = 0
            verdict = "echo"
        else:
            if _is_stable_partial_transcript(transcript, session.last_partial_transcript):
                stable_hits = session.partial_stable_hits + 1

            if stable_hits >= _BARGE_IN_CONFIRM_HITS or len(normalized_partial) >= _BARGE_IN_LONG_PARTIAL_LEN:
                verdict = "confirmed"

        session_store.update_partial_probe_state(
            session_id,
            chunk_count=len(chunks),
            transcript=transcript,
            stable_hits=stable_hits,
        )
        if verdict == "confirmed":
            session_store.reset_partial_probe_state(session_id)

        return {
            "sessionId": session_id,
            "transcript": transcript,
            "provider": provider,
            "durationMs": int(result.get("durationMs", total_duration_ms)),
            "chunkCount": int(result.get("chunkCount", len(chunks))),
            "verdict": verdict,
        }

    async def handle_turn_commit(self, websocket: WebSocket, payload: dict) -> None:
        commit_started_at = asyncio.get_running_loop().time()
        session_id = payload.get("sessionId")
        if not session_id:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "missing_session_id",
                    "message": "提交语音轮次时必须提供 sessionId。",
                }
            )
            return

        turn_id = payload.get("turnId", str(uuid.uuid4()))
        include_vision = bool(payload.get("includeVision", False))
        frame_id = payload.get("frameId")
        vision_task: asyncio.Task[dict[str, str | bool] | None] | None = None
        if include_vision:
            if isinstance(frame_id, str) and frame_id:
                vision_task = asyncio.create_task(
                    vision_service.summarize_frame(session_id=session_id, turn_id=turn_id, frame_id=frame_id)
                )
            else:
                vision_task = asyncio.create_task(vision_service.summarize_latest_frame(session_id, turn_id))

        chunks = session_store.consume_audio_chunks(session_id)
        if not chunks:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "empty_audio",
                    "message": "当前没有可识别的音频分段，请先开始说话。",
                }
            )
            return

        try:
            transcript = await asr_stream_service.finalize(session_id=session_id)
            if transcript is None:
                result = await asr_adapter.transcribe(chunks)
            else:
                result = {
                    "transcript": transcript,
                    "provider": "volcengine",
                    "durationMs": sum(chunk.duration_ms for chunk in chunks),
                    "chunkCount": len(chunks),
                }
        except Exception as exc:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "asr_failed",
                    "message": str(exc),
                }
            )
            return

        vision_summary: str | None = None

        logger.info(
            "audio turn commit: session_id=%s turn_id=%s chunk_count=%s duration_ms=%s provider=%s include_vision=%s",
            session_id,
            turn_id,
            result["chunkCount"],
            result["durationMs"],
            result["provider"],
            include_vision,
        )

        await websocket.send_json(
            {
                "type": "asr.result",
                "sessionId": session_id,
                "turnId": turn_id,
                "transcript": result["transcript"],
                "provider": result["provider"],
                "durationMs": result["durationMs"],
                "chunkCount": result["chunkCount"],
            }
        )

        if str(result["provider"]) != "volcengine" or is_fallback_transcript(str(result["transcript"])):
            diagnostic_message = str(
                result.get("diagnosticMessage")
                or "本轮语音识别未成功，已跳过 AI 回复与语音播报。请重试录音，或直接输入文字。"
            )
            logger.warning(
                "audio turn skipped after asr fallback: session_id=%s turn_id=%s diagnostic_code=%s diagnostic=%s",
                session_id,
                turn_id,
                result.get("diagnosticCode", "unknown"),
                diagnostic_message,
            )
            await websocket.send_json(
                {
                    "type": "session.status",
                    "sessionId": session_id,
                    "level": "warning",
                    "message": (
                        f"本轮语音识别未成功，已跳过 AI 回复与语音播报。"
                        f"{diagnostic_message}"
                    ),
                }
            )
            return

        if include_vision:
            vision_result: dict[str, str | bool] | None = None
            if vision_task is not None:
                try:
                    remaining = max(0.0, _VISION_TOTAL_BUDGET_SECONDS - (asyncio.get_running_loop().time() - commit_started_at))
                    vision_result = await asyncio.wait_for(
                        asyncio.shield(vision_task),
                        timeout=remaining,
                    )
                except asyncio.TimeoutError:
                    vision_result = None
            else:
                if isinstance(frame_id, str) and frame_id:
                    vision_result = await vision_service.summarize_frame(
                        session_id=session_id,
                        turn_id=turn_id,
                        frame_id=frame_id,
                    )
                else:
                    vision_result = await vision_service.summarize_latest_frame(session_id, turn_id)
            if vision_result is None:
                await websocket.send_json(
                    {
                        "type": "vision.error",
                        "sessionId": session_id,
                        "turnId": turn_id,
                        "code": "vision_not_ready",
                        "message": "本轮关键帧视觉摘要尚未就绪，本次先基于语音内容回答。",
                    }
                )
            else:
                vision_summary = str(vision_result["summary"])
                logger.info(
                    "vision summary attached to turn: session_id=%s turn_id=%s frame_id=%s provider=%s",
                    session_id,
                    turn_id,
                    vision_result.get("frameId"),
                    vision_result.get("provider"),
                )
                await websocket.send_json(
                    {
                        "type": "vision.result",
                        **vision_result,
                    }
                )
        elif vision_task is not None:
            vision_task.cancel()

        await conversation_service.stream_turn_reply(
            websocket=websocket,
            session_id=session_id,
            turn_id=turn_id,
            transcript=str(result["transcript"]),
            vision_summary=vision_summary,
            force_no_vision=include_vision and vision_summary is None,
            asr_duration_ms=int(result.get("durationMs", 0) or 0),
            asr_provider=str(result.get("provider") or ""),
        )

    async def handle_partial_request(self, websocket: WebSocket, payload: dict) -> None:
        session_id = payload.get("sessionId")
        request_id = str(payload.get("requestId", ""))
        if not session_id or not request_id:
            return

        result = await self.probe_barge_in(session_id)
        if result is None:
            return

        await websocket.send_json(
            {
                "type": "asr.partial",
                "sessionId": session_id,
                "requestId": request_id,
                "transcript": result["transcript"],
                "provider": result["provider"],
                "durationMs": result["durationMs"],
                "chunkCount": result["chunkCount"],
                "verdict": result["verdict"],
            }
        )


audio_service = AudioService()
