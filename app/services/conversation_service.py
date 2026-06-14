from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket

from app.integrations.llm.llm_adapter import llm_adapter
from app.core.config import settings
from app.services.persistence_service import persistence_service
from app.agent.session_store import session_store
from app.services.memory_service import memory_service
from app.services.tts_service import tts_service

_SENTENCE_END_RE = re.compile(r"(?<=[，,。！？!?；;：:\n])")
_TTS_SOFT_CHUNK_SIZE = 24
_TTS_HARD_CHUNK_SIZE = 36


@dataclass(slots=True)
class TurnReplyContext:
    history_turns: list[dict[str, Any]]
    session_summary: str | None
    semantic_snippets: list[str]


@dataclass(slots=True)
class TtsPipeline:
    sentence_queue: asyncio.Queue[str | None]
    task: asyncio.Task[None]


class ConversationService:
    async def stream_turn_reply(
        self,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        transcript: str,
        vision_summary: str | None = None,
        force_no_vision: bool = False,
        asr_duration_ms: int = 0,
        asr_provider: str | None = None,
    ) -> None:
        reply_context = await self._prepare_turn_context(
            session_id=session_id,
            turn_id=turn_id,
            transcript=transcript,
            vision_summary=vision_summary,
        )
        tts_pipeline = self._start_tts_pipeline(websocket=websocket, session_id=session_id, turn_id=turn_id)

        await self._emit_generation_started(websocket=websocket, session_id=session_id)

        try:
            # 主流程只保留编排职责，具体的上下文装配、LLM 增量消费和 TTS 管线细节都下沉到独立步骤。
            full_text = await self._stream_llm_reply(
                websocket=websocket,
                session_id=session_id,
                turn_id=turn_id,
                transcript=transcript,
                vision_summary=vision_summary,
                force_no_vision=force_no_vision,
                reply_context=reply_context,
                sentence_queue=tts_pipeline.sentence_queue,
            )
            self._finalize_turn(
                session_id=session_id,
                turn_id=turn_id,
                user_text=transcript,
                assistant_text=full_text,
                vision_summary=vision_summary,
                asr_duration_ms=asr_duration_ms,
                asr_provider=asr_provider,
            )
            await self._emit_reply_completed(
                websocket=websocket,
                session_id=session_id,
                turn_id=turn_id,
                full_text=full_text,
                tts_pipeline=tts_pipeline,
            )
        except asyncio.CancelledError:
            tts_pipeline.task.cancel()
            raise

    async def _prepare_turn_context(
        self,
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
            semantic_snippets = await self._load_semantic_snippets(
                session_user_id=session.user_id,
                transcript=transcript,
            )

        return TurnReplyContext(
            history_turns=history_turns,
            session_summary=session_summary,
            semantic_snippets=semantic_snippets,
        )

    async def _load_semantic_snippets(self, *, session_user_id: int | None, transcript: str) -> list[str]:
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

    def _start_tts_pipeline(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
    ) -> TtsPipeline:
        sentence_queue: asyncio.Queue[str | None] = asyncio.Queue()
        task = asyncio.create_task(
            self._stream_tts_for_turn(
                websocket=websocket,
                session_id=session_id,
                turn_id=turn_id,
                sentence_queue=sentence_queue,
            )
        )
        return TtsPipeline(sentence_queue=sentence_queue, task=task)

    async def _emit_generation_started(self, *, websocket: WebSocket, session_id: str) -> None:
        await websocket.send_json(
            {
                "type": "session.status",
                "sessionId": session_id,
                "level": "info",
                "message": "正在结合语音、视觉和会话上下文生成回复。",
            }
        )

    async def _stream_llm_reply(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        transcript: str,
        vision_summary: str | None,
        force_no_vision: bool,
        reply_context: TurnReplyContext,
        sentence_queue: asyncio.Queue[str | None],
    ) -> str:
        chunks: list[str] = []
        pending_tts_text = ""

        async for delta in llm_adapter.stream_reply(
            user_text=transcript,
            vision_summary=vision_summary,
            session_summary=reply_context.session_summary,
            semantic_snippets=reply_context.semantic_snippets,
            force_no_vision=force_no_vision,
            history_turns=reply_context.history_turns,
        ):
            pending_tts_text = await self._handle_llm_delta(
                websocket=websocket,
                session_id=session_id,
                turn_id=turn_id,
                delta=delta,
                chunks=chunks,
                pending_tts_text=pending_tts_text,
                sentence_queue=sentence_queue,
            )

        if pending_tts_text.strip():
            await sentence_queue.put(pending_tts_text.strip())
        return "".join(chunks)

    async def _handle_llm_delta(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        delta: str,
        chunks: list[str],
        pending_tts_text: str,
        sentence_queue: asyncio.Queue[str | None],
    ) -> str:
        chunks.append(delta)
        session_store.append_assistant_transcript(session_id, delta)
        await websocket.send_json(
            {
                "type": "llm.delta",
                "sessionId": session_id,
                "turnId": turn_id,
                "text": delta,
            }
        )
        return await self._enqueue_tts_sentences_from_delta(
            pending_tts_text=pending_tts_text + delta,
            sentence_queue=sentence_queue,
        )

    async def _enqueue_tts_sentences_from_delta(
        self,
        *,
        pending_tts_text: str,
        sentence_queue: asyncio.Queue[str | None],
    ) -> str:
        completed_sentences, remaining_text = self._split_completed_sentences(pending_tts_text)
        for sentence in completed_sentences:
            await sentence_queue.put(sentence)
        return remaining_text

    def _finalize_turn(
        self,
        *,
        session_id: str,
        turn_id: str,
        user_text: str,
        assistant_text: str,
        vision_summary: str | None,
        asr_duration_ms: int,
        asr_provider: str | None,
    ) -> None:
        session_store.complete_turn(session_id=session_id, turn_id=turn_id, assistant_text=assistant_text)
        session_store.set_assistant_transcript(session_id, assistant_text)
        persistence_service.record_turn(
            session_id=session_id,
            turn_id=turn_id,
            user_text=user_text,
            assistant_text=assistant_text,
            vision_summary=vision_summary,
            asr_duration_ms=asr_duration_ms,
            asr_provider=asr_provider,
            tts_char_count=len(assistant_text),
            tts_provider="volcengine" if settings.tts_provider == "volcengine" else "fallback",
        )
        memory_service.record_turn_completed(
            session_id=session_id,
            turn_id=turn_id,
            user_text=user_text,
            assistant_text=assistant_text,
            vision_summary=vision_summary,
        )

    async def _emit_reply_completed(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        full_text: str,
        tts_pipeline: TtsPipeline,
    ) -> None:
        await websocket.send_json(
            {
                "type": "llm.done",
                "sessionId": session_id,
                "turnId": turn_id,
                "fullText": full_text,
            }
        )
        await websocket.send_json(
            {
                "type": "session.status",
                "sessionId": session_id,
                "level": "info",
                "message": "多模态文本回复已完成，语音仍在持续播报中。",
            }
        )
        await tts_pipeline.sentence_queue.put(None)
        await tts_pipeline.task
        await websocket.send_json(
            {
                "type": "session.status",
                "sessionId": session_id,
                "level": "info",
                "message": "多模态回复与语音播报均已完成，通话保持监听。",
            }
        )

    def _split_completed_sentences(self, buffer: str) -> tuple[list[str], str]:
        if not buffer.strip():
            return [], ""

        segments = _SENTENCE_END_RE.split(buffer)
        if len(segments) <= 1:
            if len(buffer) >= _TTS_HARD_CHUNK_SIZE:
                return [buffer[:_TTS_SOFT_CHUNK_SIZE].strip()], buffer[_TTS_SOFT_CHUNK_SIZE:]
            return [], buffer

        completed = [segment.strip() for segment in segments[:-1] if segment.strip()]
        pending = segments[-1]
        return completed, pending

    async def _stream_tts_for_turn(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        sentence_queue: asyncio.Queue[str | None],
    ) -> None:
        stream_started = False
        try:
            stream_started = await self._consume_tts_queue(
                websocket=websocket,
                session_id=session_id,
                turn_id=turn_id,
                sentence_queue=sentence_queue,
            )
        except asyncio.CancelledError:
            raise
        finally:
            await self._finish_tts_stream(
                websocket=websocket,
                session_id=session_id,
                turn_id=turn_id,
                stream_started=stream_started,
            )

    async def _consume_tts_queue(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        sentence_queue: asyncio.Queue[str | None],
    ) -> bool:
        stream_started = False
        chunk_sequence = 0
        while True:
            sentence = await sentence_queue.get()
            if sentence is None:
                return stream_started

            stream_started, chunk_sequence = await self._forward_tts_stream(
                websocket=websocket,
                session_id=session_id,
                turn_id=turn_id,
                sentence=sentence,
                stream_started=stream_started,
                chunk_sequence=chunk_sequence,
            )

    async def _forward_tts_stream(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        sentence: str,
        stream_started: bool,
        chunk_sequence: int,
    ) -> tuple[bool, int]:
        async for chunk in tts_service.stream_synthesize(sentence):
            if not stream_started:
                await self._emit_tts_start(
                    websocket=websocket,
                    session_id=session_id,
                    turn_id=turn_id,
                    provider=chunk["provider"],
                    mime_type=chunk["mimeType"],
                    sample_rate=chunk["sampleRate"],
                )
                stream_started = True

            chunk_sequence += 1
            await self._emit_tts_chunk(
                websocket=websocket,
                session_id=session_id,
                turn_id=turn_id,
                chunk_sequence=chunk_sequence,
                chunk=chunk,
            )
        return stream_started, chunk_sequence

    async def _emit_tts_start(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        provider: str,
        mime_type: str,
        sample_rate: int,
    ) -> None:
        session_store.set_assistant_speaking(session_id, True)
        await websocket.send_json(
            {
                "type": "tts.start",
                "sessionId": session_id,
                "turnId": turn_id,
                "provider": provider,
                "mimeType": mime_type,
                "sampleRate": sample_rate,
            }
        )

    async def _emit_tts_chunk(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        chunk_sequence: int,
        chunk: dict[str, Any],
    ) -> None:
        await websocket.send_json(
            {
                "type": "tts.chunk",
                "sessionId": session_id,
                "turnId": turn_id,
                "chunkSequence": chunk_sequence,
                "audioBase64": chunk["audioBase64"],
                "mimeType": chunk["mimeType"],
                "sampleRate": chunk["sampleRate"],
                "provider": chunk["provider"],
            }
        )

    async def _finish_tts_stream(
        self,
        *,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        stream_started: bool,
    ) -> None:
        session_store.set_assistant_speaking(session_id, False)
        if stream_started:
            await websocket.send_json(
                {
                    "type": "tts.done",
                    "sessionId": session_id,
                    "turnId": turn_id,
                }
            )


conversation_service = ConversationService()
