from __future__ import annotations

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

        raise NotImplementedError(
            f"暂未实现视觉提供商 {settings.vision_provider}，请先使用 mock 模式联调。"
        )


vision_adapter = VisionAdapter()
