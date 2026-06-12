from __future__ import annotations

import asyncio
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
                "message": "模拟流式回答即将开始，用于联调对话区。",
            }
        )
        await self.stream_mock_reply(websocket, session.session_id)
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

    async def stream_mock_reply(self, websocket: WebSocket, session_id: str) -> None:
        chunks = [
            "你好，我已经完成 WebSocket 会话初始化。",
            "下一步可以在这个通道上接入语音分段、关键帧抓取和多模态上下文。",
            "当前回复为模拟流式输出，用于验证前端消息渲染与连接状态。",
        ]

        full_text = ""
        for chunk in chunks:
            await asyncio.sleep(0.18)
            full_text += chunk
            await websocket.send_json(
                {
                    "type": "llm.delta",
                    "sessionId": session_id,
                    "text": chunk,
                }
            )

        await websocket.send_json(
            {
                "type": "llm.done",
                "sessionId": session_id,
                "fullText": full_text,
            }
        )


session_service = SessionService()
