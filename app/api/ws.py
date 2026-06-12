import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/session")
async def session_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_json(
        {
            "type": "session.ready",
            "sessionId": str(uuid.uuid4()),
            "message": "WebSocket skeleton is ready for the next phase.",
        }
    )

    try:
        while True:
            payload = await websocket.receive_text()
            data = json.loads(payload)
            event_type = data.get("type", "unknown")
            await websocket.send_json(
                {
                    "type": "system.echo",
                    "receivedType": event_type,
                    "message": "Stage 0 websocket channel is connected.",
                }
            )
    except WebSocketDisconnect:
        return
