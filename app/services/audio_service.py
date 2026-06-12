from __future__ import annotations

import logging
import uuid

from fastapi import WebSocket

from app.adapters.asr_adapter import asr_adapter, is_fallback_transcript
from app.state.session_store import session_store
from app.services.conversation_service import conversation_service
from app.services.vision_service import vision_service

logger = logging.getLogger(__name__)


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

        session = session_store.get_session(session_id)
        await websocket.send_json(
            {
                "type": "session.status",
                "sessionId": session_id,
                "level": "info",
                "message": f"已缓存 {len(session.audio_chunks)} 段音频，等待静音自动提交。",
            }
        )

    async def handle_turn_commit(self, websocket: WebSocket, payload: dict) -> None:
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
            result = await asr_adapter.transcribe(chunks)
        except Exception as exc:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "asr_failed",
                    "message": str(exc),
                }
            )
            return

        turn_id = payload.get("turnId", str(uuid.uuid4()))
        include_vision = bool(payload.get("includeVision", False))
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
            vision_result = await vision_service.summarize_latest_frame(session_id, turn_id)
            if vision_result is None:
                await websocket.send_json(
                    {
                        "type": "vision.error",
                        "sessionId": session_id,
                        "turnId": turn_id,
                        "code": "missing_frame",
                        "message": "当前轮次未捕获到关键帧，本次仅返回语音识别结果。",
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

        await conversation_service.stream_turn_reply(
            websocket=websocket,
            session_id=session_id,
            turn_id=turn_id,
            transcript=str(result["transcript"]),
            vision_summary=vision_summary,
        )


audio_service = AudioService()
