from __future__ import annotations

import asyncio
import re

from fastapi import WebSocket

from app.adapters.llm_adapter import llm_adapter
from app.config import settings
from app.persistence.service import persistence_service
from app.state.session_store import session_store
from app.services.tts_service import tts_service

_SENTENCE_END_RE = re.compile(r"(?<=[，,。！？!?；;：:\n])")
_TTS_SOFT_CHUNK_SIZE = 24
_TTS_HARD_CHUNK_SIZE = 36


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
        history_turns = session_store.get_recent_turns(session_id, limit=3)
        session_store.save_turn(
            session_id=session_id,
            turn_id=turn_id,
            user_text=transcript,
            vision_summary=vision_summary,
        )
        session_store.set_assistant_transcript(session_id, "")
        session_store.set_assistant_speaking(session_id, False)

        sentence_queue: asyncio.Queue[str | None] = asyncio.Queue()
        tts_task = asyncio.create_task(
            self._stream_tts_for_turn(
                websocket=websocket,
                session_id=session_id,
                turn_id=turn_id,
                sentence_queue=sentence_queue,
            )
        )

        await websocket.send_json(
            {
                "type": "session.status",
                "sessionId": session_id,
                "level": "info",
                "message": "正在结合语音、视觉和会话上下文生成回复。",
            }
        )

        chunks: list[str] = []
        pending_tts_text = ""
        try:
            async for delta in llm_adapter.stream_reply(
                user_text=transcript,
                vision_summary=vision_summary,
                force_no_vision=force_no_vision,
                history_turns=history_turns,
            ):
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
                pending_tts_text += delta
                completed_sentences, pending_tts_text = self._split_completed_sentences(pending_tts_text)
                for sentence in completed_sentences:
                    await sentence_queue.put(sentence)

            if pending_tts_text.strip():
                await sentence_queue.put(pending_tts_text.strip())

            full_text = "".join(chunks)
            session_store.complete_turn(session_id=session_id, turn_id=turn_id, assistant_text=full_text)
            session_store.set_assistant_transcript(session_id, full_text)
            persistence_service.record_turn(
                session_id=session_id,
                turn_id=turn_id,
                user_text=transcript,
                assistant_text=full_text,
                vision_summary=vision_summary,
                asr_duration_ms=asr_duration_ms,
                asr_provider=asr_provider,
                tts_char_count=len(full_text),
                tts_provider="volcengine" if settings.tts_provider == "volcengine" else "fallback",
            )

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
            await sentence_queue.put(None)
            await tts_task
            await websocket.send_json(
                {
                    "type": "session.status",
                    "sessionId": session_id,
                    "level": "info",
                    "message": "多模态回复与语音播报均已完成，通话保持监听。",
                }
            )
        except asyncio.CancelledError:
            tts_task.cancel()
            raise

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
        chunk_sequence = 0
        try:
            while True:
                sentence = await sentence_queue.get()
                if sentence is None:
                    break

                async for chunk in tts_service.stream_synthesize(sentence):
                    if not stream_started:
                        stream_started = True
                        session_store.set_assistant_speaking(session_id, True)
                        await websocket.send_json(
                            {
                                "type": "tts.start",
                                "sessionId": session_id,
                                "turnId": turn_id,
                                "provider": chunk["provider"],
                                "mimeType": chunk["mimeType"],
                                "sampleRate": chunk["sampleRate"],
                            }
                        )

                    chunk_sequence += 1
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
        except asyncio.CancelledError:
            raise
        finally:
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
