import json
import asyncio
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.deps.auth import get_current_user_id_ws
from app.cache.session_lock_service import session_lock_service
from app.services.audio_service import audio_service
from app.services.asr_stream_service import asr_stream_service
from app.services.session_service import session_service
from app.services.vision_service import vision_service

router = APIRouter()


async def _send_ws_error(websocket: WebSocket, *, code: str, message: str) -> None:
    await websocket.send_json(
        {
            "type": "error",
            "code": code,
            "message": message,
        }
    )


@router.websocket("/ws/session")
async def session_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        user_id = await get_current_user_id_ws(websocket)
    except RuntimeError:
        return
    await session_service.send_connection_ready(websocket)
    active_turn_task: asyncio.Task[None] | None = None
    active_turn_session_id: str | None = None
    active_turn_id: str | None = None
    locked_session_id: str | None = None
    lock_token: str | None = None
    lock_stop_event: asyncio.Event | None = None
    lock_heartbeat_task: asyncio.Task[None] | None = None

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
        interrupted_session_id = active_turn_session_id
        interrupted_turn_id = active_turn_id
        active_turn_task.cancel()
        try:
            await active_turn_task
        except asyncio.CancelledError:
            pass
        if interrupted_session_id and interrupted_turn_id:
            await websocket.send_json(
                {
                    "type": "assistant.interrupted",
                    "sessionId": interrupted_session_id,
                    "turnId": interrupted_turn_id,
                    "reason": reason,
                }
            )
        active_turn_task = None
        active_turn_session_id = None
        active_turn_id = None

    async def release_session_lock() -> None:
        nonlocal locked_session_id, lock_token, lock_stop_event, lock_heartbeat_task
        if lock_stop_event is not None:
            lock_stop_event.set()
        if lock_heartbeat_task is not None and not lock_heartbeat_task.done():
            lock_heartbeat_task.cancel()
            try:
                await lock_heartbeat_task
            except asyncio.CancelledError:
                pass
        if locked_session_id and lock_token:
            await session_lock_service.release(session_id=locked_session_id, token=lock_token)
        locked_session_id = None
        lock_token = None
        lock_stop_event = None
        lock_heartbeat_task = None

    async def handle_session_start_event(data: dict) -> None:
        nonlocal locked_session_id, lock_token, lock_stop_event, lock_heartbeat_task
        requested_session_id = data.get("sessionId") or str(uuid.uuid4())
        if locked_session_id and locked_session_id != requested_session_id:
            await release_session_lock()
        if locked_session_id is None:
            token = await session_lock_service.acquire(session_id=requested_session_id)
            if token is None:
                await _send_ws_error(
                    websocket,
                    code="session_locked",
                    message="会话正在被其他连接占用，请稍后重试。",
                )
                return
            locked_session_id = requested_session_id
            lock_token = token
            lock_stop_event = asyncio.Event()
            lock_heartbeat_task = asyncio.create_task(
                session_lock_service.run_heartbeat(
                    session_id=requested_session_id,
                    token=token,
                    stop_event=lock_stop_event,
                )
            )

        await session_service.handle_session_start(
            websocket,
            {**data, "sessionId": requested_session_id},
            user_id=user_id,
        )

    async def handle_turn_commit_event(data: dict) -> None:
        nonlocal active_turn_task, active_turn_session_id, active_turn_id
        if active_turn_task is not None and not active_turn_task.done():
            await websocket.send_json(
                {
                    "type": "session.status",
                    "sessionId": data.get("sessionId"),
                    "level": "info",
                    "message": "AI 正在回复中，请等待当前语音播报结束后再开始下一轮。",
                }
            )
            return
        active_turn_session_id = data.get("sessionId")
        active_turn_id = data.get("turnId")
        active_turn_task = asyncio.create_task(audio_service.handle_turn_commit(websocket, data))
        active_turn_task.add_done_callback(clear_active_turn)

    async def handle_assistant_interrupt_event(data: dict) -> None:
        await cancel_active_turn("barge_in")
        await websocket.send_json(
            {
                "type": "session.status",
                "sessionId": data.get("sessionId"),
                "level": "info",
                "message": "已停止当前播报，开始监听你的下一轮发言。",
            }
        )

    async def handle_partial_request_event(data: dict) -> None:
        session_id = data.get("sessionId")
        if not session_id:
            return
        if not audio_service.should_probe_barge_in(str(session_id)):
            return
        result = await audio_service.handle_partial_request(websocket, data)
        if result is not None and result.get("verdict") == "confirmed":
            await cancel_active_turn("barge_in")

    async def handle_session_end_event(data: dict) -> None:
        await cancel_active_turn("session_end")
        if data.get("sessionId"):
            await asr_stream_service.cancel(session_id=str(data.get("sessionId")))
        await session_service.handle_session_end(websocket, data)
        await release_session_lock()

    try:
        while True:
            if lock_stop_event is not None and lock_stop_event.is_set():
                await cancel_active_turn("session_lock_lost")
                await websocket.close(code=4409)
                await release_session_lock()
                return
            payload = await websocket.receive_text()
            try:
                data = json.loads(payload)
            except json.JSONDecodeError:
                await _send_ws_error(websocket, code="invalid_json", message="WebSocket 消息必须是合法 JSON。")
                continue

            event_type = data.get("type")

            # 主循环只负责协议解析与事件分发，具体行为下沉到独立处理函数，降低连接态与业务逻辑的耦合。
            if event_type == "session.start":
                await handle_session_start_event(data)
            elif event_type == "audio.chunk":
                await audio_service.handle_audio_chunk(websocket, data)
            elif event_type == "frame.capture":
                await vision_service.handle_frame_capture(websocket, data)
            elif event_type == "turn.commit":
                await handle_turn_commit_event(data)
            elif event_type == "session.ping":
                await session_service.handle_ping(websocket, data)
            elif event_type == "assistant.interrupt":
                await handle_assistant_interrupt_event(data)
            elif event_type == "asr.partial.request":
                await handle_partial_request_event(data)
            elif event_type == "session.end":
                await handle_session_end_event(data)
            else:
                await _send_ws_error(websocket, code="unsupported_event", message=f"暂不支持事件类型：{event_type!s}")
    except WebSocketDisconnect:
        if active_turn_task is not None and not active_turn_task.done():
            active_turn_task.cancel()
        if active_turn_session_id:
            await asr_stream_service.cancel(session_id=active_turn_session_id)
        await release_session_lock()
        return
