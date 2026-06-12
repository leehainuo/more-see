import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.session_service import session_service

router = APIRouter()


@router.websocket("/ws/session")
async def session_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    await session_service.send_connection_ready(websocket)

    try:
        while True:
            payload = await websocket.receive_text()
            try:
                data = json.loads(payload)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "invalid_json",
                        "message": "WebSocket 消息必须是合法 JSON。",
                    }
                )
                continue

            event_type = data.get("type")

            if event_type == "session.start":
                await session_service.handle_session_start(websocket, data)
            elif event_type == "session.ping":
                await session_service.handle_ping(websocket, data)
            elif event_type == "session.end":
                await session_service.handle_session_end(websocket, data)
            else:
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "unsupported_event",
                        "message": f"暂不支持事件类型：{event_type!s}",
                    }
                )
    except WebSocketDisconnect:
        return
