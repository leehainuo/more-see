from __future__ import annotations

import uuid

from fastapi import WebSocket

from app.state.session_store import session_store


class SessionService:
    async def send_connection_ready(self, websocket: WebSocket) -> None:
        await websocket.send_json(
            {
                "type": "connection.ready",
                "message": "WebSocket connection established.",
            }
        )

    async def handle_session_start(self, websocket: WebSocket, payload: dict) -> str:
        session_id = payload.get("sessionId") or str(uuid.uuid4())
        input_source = payload.get("inputSource", "camera")
        device_info = payload.get("deviceInfo", {})

        session = session_store.create_session(
            session_id=session_id,
            input_source=input_source,
            device_info=device_info,
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
                "message": "会话已开始，请对着麦克风说话，静音 1.5 秒后将自动提交识别。",
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
        await websocket.send_json(
            {
                "type": "session.closed",
                "sessionId": session_id,
                "message": "Session closed.",
            }
        )

session_service = SessionService()
