import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.audio_service import audio_service
from app.services.session_service import session_service
from app.services.vision_service import vision_service

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
            elif event_type == "audio.chunk":
                await audio_service.handle_audio_chunk(websocket, data)
            elif event_type == "frame.capture":
                await vision_service.handle_frame_capture(websocket, data)
            elif event_type == "turn.commit":
                await audio_service.handle_turn_commit(websocket, data)
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
