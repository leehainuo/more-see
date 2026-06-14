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
from app.services.intent_service import classify_user_intent
from app.services.vision_service import vision_service

logger = logging.getLogger(__name__)
uvicorn_logger = logging.getLogger("uvicorn.error")
_PARTIAL_MIN_DURATION_MS = 420
_PARTIAL_MIN_CHUNKS = 3
_BARGE_IN_CONFIRM_HITS = 3
_BARGE_IN_LONG_PARTIAL_LEN = 8
_VISION_WAIT_TIMEOUT_SECONDS = 15.0
_VISION_WAIT_TIMEOUT_PRECISE_TEXT_SECONDS = 18.0
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


def _resolve_vision_wait_timeout_seconds(*, requires_precise_text_extraction: bool) -> float:
    return (
        _VISION_WAIT_TIMEOUT_PRECISE_TEXT_SECONDS
        if requires_precise_text_extraction
        else _VISION_WAIT_TIMEOUT_SECONDS
    )


class AudioService:
    @staticmethod
    async def _send_error(websocket: WebSocket, *, code: str, message: str) -> None:
        await websocket.send_json(
            {
                "type": "error",
                "code": code,
                "message": message,
            }
        )

    @staticmethod
    async def _send_asr_result(
        websocket: WebSocket,
        *,
        session_id: str,
        turn_id: str,
        result: dict[str, str | int],
    ) -> None:
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

    async def _resolve_asr_result(self, session_id: str, chunks: list) -> dict[str, str | int]:
        transcript = await asr_stream_service.finalize(session_id=session_id)
        if transcript is None:
            return await asr_adapter.transcribe(chunks)
        return {
            "transcript": transcript,
            "provider": "volcengine",
            "durationMs": sum(chunk.duration_ms for chunk in chunks),
            "chunkCount": len(chunks),
        }

    async def _handle_asr_fallback(
        self,
        websocket: WebSocket,
        *,
        session_id: str,
        turn_id: str,
        result: dict[str, str | int],
    ) -> bool:
        if str(result["provider"]) == "volcengine" and not is_fallback_transcript(str(result["transcript"])):
            return False

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
        return True

    @staticmethod
    def _create_vision_task(
        *,
        session_id: str,
        turn_id: str,
        frame_id: str | None,
        intent_route,
    ) -> asyncio.Task[dict[str, str | bool] | None]:
        if isinstance(frame_id, str) and frame_id:
            return asyncio.create_task(
                vision_service.summarize_frame(
                    session_id=session_id,
                    turn_id=turn_id,
                    frame_id=frame_id,
                    intent_route=intent_route,
                )
            )
        return asyncio.create_task(
            vision_service.summarize_latest_frame(
                session_id,
                turn_id,
                intent_route=intent_route,
            )
        )

    async def _resolve_vision_summary(
        self,
        websocket: WebSocket,
        *,
        session_id: str,
        turn_id: str,
        frame_id: str | None,
        intent_route,
    ) -> str | None:
        vision_task = self._create_vision_task(
            session_id=session_id,
            turn_id=turn_id,
            frame_id=frame_id,
            intent_route=intent_route,
        )
        try:
            # 视觉摘要与主链路并发等待，超时后直接降级，避免整轮对话被视觉模型拖慢。
            vision_result = await asyncio.wait_for(
                asyncio.shield(vision_task),
                timeout=_resolve_vision_wait_timeout_seconds(
                    requires_precise_text_extraction=intent_route.requires_precise_text_extraction
                ),
            )
        except asyncio.TimeoutError:
            vision_result = None

        if vision_result is None:
            latest_frame = vision_service.get_latest_frame(session_id)
            if latest_frame is not None and latest_frame.summary_error:
                logger.warning(
                    "vision provider failed: session_id=%s turn_id=%s frame_id=%s error=%s",
                    session_id,
                    turn_id,
                    latest_frame.frame_id,
                    latest_frame.summary_error,
                )
                await websocket.send_json(
                    {
                        "type": "vision.error",
                        "sessionId": session_id,
                        "turnId": turn_id,
                        "code": "vision_provider_failed",
                        "message": (
                            "视觉摘要生成失败，可能是额度不足、模型不可用或网络异常。"
                            f"错误信息：{latest_frame.summary_error}"
                        ),
                    }
                )
                return None

            logger.warning(
                "vision not ready: session_id=%s turn_id=%s payload_frame_id=%s has_latest_frame=%s",
                session_id,
                turn_id,
                frame_id,
                latest_frame is not None,
            )
            await websocket.send_json(
                {
                    "type": "vision.error",
                    "sessionId": session_id,
                    "turnId": turn_id,
                    "code": "vision_not_ready",
                    "message": "本轮关键帧视觉摘要尚未就绪，本次先基于语音内容回答。",
                }
            )
            return None

        logger.info(
            "vision summary attached to turn: session_id=%s turn_id=%s frame_id=%s provider=%s intent=%s",
            session_id,
            turn_id,
            vision_result.get("frameId"),
            vision_result.get("provider"),
            intent_route.name,
        )
        await websocket.send_json(
            {
                "type": "vision.result",
                **vision_result,
            }
        )
        return str(vision_result["summary"])

    async def handle_audio_chunk(self, websocket: WebSocket, payload: dict) -> None:
        session_id = payload.get("sessionId")
        if not session_id:
            await self._send_error(websocket, code="missing_session_id", message="上传音频分段时必须提供 sessionId。")
            return

        chunk = session_store.add_audio_chunk(
            session_id=session_id,
            chunk_id=payload.get("chunkId", str(uuid.uuid4())),
            mime_type=payload.get("mimeType", "audio/webm"),
            base64_audio=payload.get("base64Audio", ""),
            duration_ms=int(payload.get("durationMs", 0)),
        )
        if chunk is None:
            await self._send_error(websocket, code="session_not_found", message="会话不存在，请先开始会话再上传音频。")
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

        logger.debug(
            "partial probe verdict: session_id=%s chunk_count=%s duration_ms=%s transcript=%s stable_hits=%s verdict=%s",
            session_id,
            len(chunks),
            total_duration_ms,
            transcript,
            stable_hits,
            verdict,
        )

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
        session_id = payload.get("sessionId")
        if not session_id:
            await self._send_error(websocket, code="missing_session_id", message="提交语音轮次时必须提供 sessionId。")
            return

        turn_id = payload.get("turnId", str(uuid.uuid4()))
        include_vision = bool(payload.get("includeVision", False))
        frame_id = payload.get("frameId")
        if include_vision:
            uvicorn_logger.warning(
                "turn.commit include_vision: session_id=%s turn_id=%s frame_id=%s",
                session_id,
                turn_id,
                frame_id,
            )
        chunks = session_store.consume_audio_chunks(session_id)
        if not chunks:
            await self._send_error(websocket, code="empty_audio", message="当前没有可识别的音频分段，请先开始说话。")
            return

        try:
            # 先优先消费流式 ASR 的最终结果，只有流式链路没有产出时才回落到离线识别。
            result = await self._resolve_asr_result(session_id, chunks)
        except Exception as exc:
            await self._send_error(websocket, code="asr_failed", message=str(exc))
            return

        vision_summary: str | None = None
        intent_route = classify_user_intent(str(result["transcript"]))

        logger.info(
            "audio turn commit: session_id=%s turn_id=%s chunk_count=%s duration_ms=%s provider=%s include_vision=%s intent=%s",
            session_id,
            turn_id,
            result["chunkCount"],
            result["durationMs"],
            result["provider"],
            include_vision,
            intent_route.name,
        )

        await self._send_asr_result(websocket, session_id=session_id, turn_id=turn_id, result=result)

        if await self._handle_asr_fallback(websocket, session_id=session_id, turn_id=turn_id, result=result):
            return

        if include_vision:
            vision_summary = await self._resolve_vision_summary(
                websocket,
                session_id=session_id,
                turn_id=turn_id,
                frame_id=frame_id,
                intent_route=intent_route,
            )

        # 对话生成与 TTS 推流统一交给 conversation_service，音频服务只负责本轮输入解析与上下文补齐。
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

    async def handle_partial_request(self, websocket: WebSocket, payload: dict) -> dict[str, str | int] | None:
        session_id = payload.get("sessionId")
        request_id = str(payload.get("requestId", ""))
        if not session_id or not request_id:
            return None

        result = await self.probe_barge_in(session_id)
        if result is None:
            return None

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
        return result


audio_service = AudioService()
