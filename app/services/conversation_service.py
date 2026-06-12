from __future__ import annotations

from fastapi import WebSocket

from app.adapters.llm_adapter import llm_adapter
from app.state.session_store import session_store


class ConversationService:
    async def stream_turn_reply(
        self,
        websocket: WebSocket,
        session_id: str,
        turn_id: str,
        transcript: str,
        vision_summary: str | None = None,
    ) -> None:
        history_turns = session_store.get_recent_turns(session_id, limit=3)
        session_store.save_turn(
            session_id=session_id,
            turn_id=turn_id,
            user_text=transcript,
            vision_summary=vision_summary,
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
        async for delta in llm_adapter.stream_reply(
            user_text=transcript,
            vision_summary=vision_summary,
            history_turns=history_turns,
        ):
            chunks.append(delta)
            await websocket.send_json(
                {
                    "type": "llm.delta",
                    "sessionId": session_id,
                    "turnId": turn_id,
                    "text": delta,
                }
            )

        full_text = "".join(chunks)
        session_store.complete_turn(session_id=session_id, turn_id=turn_id, assistant_text=full_text)

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
                "message": "多模态回复已完成，可以继续下一轮提问。",
            }
        )


conversation_service = ConversationService()
