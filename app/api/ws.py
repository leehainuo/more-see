import json
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.audio_service import audio_service
from app.services.asr_stream_service import asr_stream_service
from app.services.session_service import session_service
from app.services.vision_service import vision_service

router = APIRouter()


@router.websocket("/ws/session")
async def session_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    await session_service.send_connection_ready(websocket)
    active_turn_task: asyncio.Task[None] | None = None
    active_turn_session_id: str | None = None
    active_turn_id: str | None = None

    def clear_active_turn(task: asyncio.Task[None]) -> None:
        nonlocal active_turn_task, active_turn_session_id, active_turn_id
        if active_turn_task is not task:
            return
        active_turn_task = None
        active_turn_session_id = None
        active_turn_id = None

    async def cancel_active_turn(reason: str) -> None:
        nonlocal active_turn_task, active_turn_session_id, active_turn_id
        if active_turn_task is None or active_turn_task.done():
            return
        active_turn_task.cancel()
        try:
            await active_turn_task
        except asyncio.CancelledError:
            pass
        if active_turn_session_id and active_turn_id:
            await websocket.send_json(
                {
                    "type": "assistant.interrupted",
                    "sessionId": active_turn_session_id,
                    "turnId": active_turn_id,
                    "reason": reason,
                }
            )
        active_turn_task = None
        active_turn_session_id = None
        active_turn_id = None

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
                if active_turn_task is not None and not active_turn_task.done():
                    await websocket.send_json(
                        {
                            "type": "session.status",
                            "sessionId": data.get("sessionId"),
                            "level": "info",
                            "message": "AI 正在回复中，请等待当前语音播报结束后再开始下一轮。",
                        }
                    )
                    continue
                active_turn_session_id = data.get("sessionId")
                active_turn_id = data.get("turnId")
                active_turn_task = asyncio.create_task(audio_service.handle_turn_commit(websocket, data))
                active_turn_task.add_done_callback(clear_active_turn)
            elif event_type == "session.ping":
                await session_service.handle_ping(websocket, data)
            elif event_type == "assistant.interrupt":
                await websocket.send_json(
                    {
                        "type": "session.status",
                        "sessionId": data.get("sessionId"),
                        "level": "info",
                        "message": "当前已关闭打断功能，AI 会在播报完成后继续监听。",
                    }
                )
            elif event_type == "asr.partial.request":
                await websocket.send_json(
                    {
                        "type": "session.status",
                        "sessionId": data.get("sessionId"),
                        "level": "info",
                        "message": "当前已关闭打断功能，不再执行实时打断检测。",
                    }
                )
            elif event_type == "session.end":
                await cancel_active_turn("session_end")
                if data.get("sessionId"):
                    await asr_stream_service.cancel(session_id=str(data.get("sessionId")))
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
        if active_turn_task is not None and not active_turn_task.done():
            active_turn_task.cancel()
        if active_turn_session_id:
            await asr_stream_service.cancel(session_id=active_turn_session_id)
        return
