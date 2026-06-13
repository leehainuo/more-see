from __future__ import annotations

import uuid

from fastapi import WebSocket

from app.persistence.repository import persistence_repository
from app.state.session_store import session_store
from app.persistence.service import persistence_service


class SessionService:
    async def send_connection_ready(self, websocket: WebSocket) -> None:
        await websocket.send_json(
            {
                "type": "connection.ready",
                "message": "WebSocket connection established.",
            }
        )

    async def handle_session_start(self, websocket: WebSocket, payload: dict, *, user_id: int) -> str:
        session_id = payload.get("sessionId") or str(uuid.uuid4())
        input_source = payload.get("inputSource", "camera")
        device_info = payload.get("deviceInfo", {})

        existing = await persistence_repository.get_session_detail(user_id=user_id, session_id=session_id)
        if existing is not None:
            session = session_store.create_session(
                session_id=session_id,
                user_id=user_id,
                input_source=existing.input_source,
                device_info=existing.device_info,
            )
            session_store.set_session_summary(session_id, existing.session_summary)
            turns = sorted(existing.turns, key=lambda item: item.created_at)[-3:]
            for turn in turns:
                session_store.save_turn(session_id, turn.turn_id, turn.user_text, turn.vision_summary)
                if turn.assistant_text:
                    session_store.complete_turn(session_id, turn.turn_id, turn.assistant_text)
        else:
            session = session_store.create_session(
                session_id=session_id,
                user_id=user_id,
                input_source=input_source,
                device_info=device_info,
            )
            session_store.set_session_summary(session_id, None)
        persistence_service.record_session_started(
            session_id=session.session_id,
            user_id=user_id,
            input_source=session.input_source,
            device_info=session.device_info,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )

        await websocket.send_json(
            {
                "type": "session.ready",
                "sessionId": session.session_id,
                "inputSource": session.input_source,
                "createdAt": session.created_at,
                "message": "Session lifecycle is ready.",
            }
        )
        await websocket.send_json(
            {
                "type": "session.status",
                "sessionId": session.session_id,
                "level": "info",
                "message": "会话已开始，系统会持续监听，停顿约 1.2 秒后自动提交当前发言。",
            }
        )
        return session.session_id

    async def handle_ping(self, websocket: WebSocket, payload: dict) -> None:
        session_id = payload.get("sessionId")
        if session_id:
            session_store.touch_session(session_id)
        await websocket.send_json(
            {
                "type": "session.pong",
                "sessionId": session_id,
            }
        )

    async def handle_session_end(self, websocket: WebSocket, payload: dict) -> None:
        session_id = payload.get("sessionId")
        if not session_id:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "missing_session_id",
                    "message": "结束会话时必须提供 sessionId。",
                }
            )
            return

        session_store.remove_session(session_id)
        persistence_service.record_session_ended(session_id=session_id)
        await websocket.send_json(
            {
                "type": "session.closed",
                "sessionId": session_id,
                "message": "Session closed.",
            }
        )

session_service = SessionService()
