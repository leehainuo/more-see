from __future__ import annotations

from app.adapters.ark_adapter import create_chat_completion, extract_text_content
from app.config import settings
from app.state.session_store import FrameSnapshot


class VisionAdapter:
    async def summarize(self, frame: FrameSnapshot) -> dict[str, str | bool]:
        if settings.vision_provider == "mock":
            orientation = "横向" if frame.width >= frame.height else "纵向"
            summary = (
                f"模拟视觉摘要：已收到一张 {frame.width}x{frame.height} 的{orientation}{frame.input_source}关键帧，"
                "画面已进入本轮理解上下文。当前环境未配置真实视觉模型，后续可替换为 Qwen-VL 等视觉服务。"
            )
            return {
                "summary": summary,
                "provider": "mock",
                "cacheHit": False,
            }

        if settings.vision_provider == "volcengine":
            image_url = f"data:image/jpeg;base64,{frame.image_base64}"
            response = await create_chat_completion(
                {
                    "model": settings.ark_vision_model,
                    "temperature": 0.2,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "你是一个视觉理解助手。"
                                "请基于用户上传的关键帧输出一段简洁中文摘要，控制在80字以内，"
                                "聚焦主体、动作、场景和和提问相关的信息。"
                            ),
                        },
                        {
                            "role": "user",
                            "content": [
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
                            ],
                        },
                    ],
                }
            )
            summary = extract_text_content(response["choices"][0]["message"]["content"]).strip()
            if not summary:
                raise RuntimeError("火山视觉模型未返回可用摘要。")
            return {
                "summary": summary,
                "provider": "volcengine",
                "cacheHit": False,
            }

        raise NotImplementedError(
            f"暂未实现视觉提供商 {settings.vision_provider}，请先使用 mock 或 volcengine。"
        )


vision_adapter = VisionAdapter()
