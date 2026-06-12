from __future__ import annotations

from fastapi import WebSocket

from app.adapters.vision_adapter import vision_adapter
from app.state.session_store import FrameSnapshot, session_store


class VisionService:
    async def handle_frame_capture(self, websocket: WebSocket, payload: dict) -> None:
        session_id = payload.get("sessionId")
        if not session_id:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "missing_session_id",
                    "message": "上传关键帧时必须提供 sessionId。",
                }
            )
            return

        frame = session_store.add_frame(
            session_id=session_id,
            frame_id=payload.get("frameId", ""),
            input_source=payload.get("inputSource", "camera"),
            image_base64=payload.get("imageBase64", ""),
            width=int(payload.get("width", 0)),
            height=int(payload.get("height", 0)),
            captured_at=payload.get("capturedAt", ""),
        )
        if frame is None:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "session_not_found",
                    "message": "会话不存在，请先开始会话再上传关键帧。",
                }
            )
            return

        await websocket.send_json(
            {
                "type": "frame.stored",
                "sessionId": session_id,
                "frameId": frame.frame_id,
                "inputSource": frame.input_source,
                "width": frame.width,
                "height": frame.height,
                "capturedAt": frame.captured_at,
                "message": "关键帧已缓存，等待在本轮提交时参与视觉理解。",
            }
        )

    async def summarize_latest_frame(self, session_id: str, turn_id: str) -> dict[str, str | bool] | None:
        frame = session_store.get_latest_frame(session_id)
        if frame is None:
            return None

        result = await vision_adapter.summarize(frame)
        return {
            "sessionId": session_id,
            "turnId": turn_id,
            "frameId": frame.frame_id,
            "summary": result["summary"],
            "provider": result["provider"],
            "cacheHit": result["cacheHit"],
            "capturedAt": frame.captured_at,
        }

    def get_latest_frame(self, session_id: str) -> FrameSnapshot | None:
        return session_store.get_latest_frame(session_id)


vision_service = VisionService()
