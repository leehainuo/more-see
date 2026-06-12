from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from app.adapters.langchain_ark import build_chat_model, extract_text_content
from app.config import settings
from app.state.session_store import FrameSnapshot


def _build_fallback_summary(frame: FrameSnapshot) -> str:
    orientation = "横向" if frame.width >= frame.height else "纵向"
    return (
        f"当前关键帧来自{frame.input_source}，分辨率约为 {frame.width}x{frame.height}，属于{orientation}画面。"
        "火山视觉模型暂不可用，我先记录了本轮画面输入，但不会对细节做不可靠推断。"
    )


class VisionAdapter:
    async def summarize(self, frame: FrameSnapshot) -> dict[str, str | bool]:
        if settings.vision_provider == "volcengine":
            try:
                image_url = f"data:image/jpeg;base64,{frame.image_base64}"
                chat_model = build_chat_model(model=settings.ark_vision_model, temperature=0.2)
                response = await chat_model.ainvoke(
                    [
                        SystemMessage(
                            content=(
                                "你是一个视觉理解助手。"
                                "请基于用户上传的关键帧输出一段简洁中文摘要，控制在80字以内，"
                                "聚焦主体、动作、场景和提问相关的信息。"
                            )
                        ),
                        HumanMessage(
                            content=[
                                {
                                    "type": "text",
                                    "text": (
                                        f"这是来自 {frame.input_source} 的关键帧，分辨率为"
                                        f" {frame.width}x{frame.height}。请输出本轮视觉摘要。"
                                    ),
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": image_url,
                                        "detail": "low",
                                    },
                                },
                            ]
                        ),
                    ]
                )
                summary = extract_text_content(response.content).strip()
                if summary:
                    return {
                        "summary": summary,
                        "provider": "volcengine",
                        "cacheHit": False,
                    }
            except Exception:
                pass

        return {
            "summary": _build_fallback_summary(frame),
            "provider": "fallback",
            "cacheHit": False,
        }


vision_adapter = VisionAdapter()
