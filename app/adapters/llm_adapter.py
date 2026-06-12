from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.config import settings
from app.state.session_store import TurnRecord


def _truncate(text: str, limit: int = 48) -> str:
    return text if len(text) <= limit else f"{text[:limit]}..."


class LlmAdapter:
    async def stream_reply(
        self,
        user_text: str,
        vision_summary: str | None,
        history_turns: list[TurnRecord],
    ) -> AsyncIterator[str]:
        if settings.llm_provider == "mock":
            history_summary = ""
            if history_turns:
                last_turn = history_turns[-1]
                history_summary = (
                    f"上一轮你提到“{_truncate(last_turn.user_text)}”，"
                    f"我当时回复了“{_truncate(last_turn.assistant_text or '尚未完成回复')}”。"
                )

            full_text = (
                "我已经结合本轮语音识别结果与视觉上下文完成分析。"
                f"你的当前输入是：{user_text}"
                f"{'' if not vision_summary else f' 画面信息补充为：{vision_summary}'}"
                f"{history_summary}"
                "基于这些上下文，我建议继续围绕当前画面中的主体、动作和你的追问目标展开下一轮交互。"
                "当前仍在使用 mock LLM 流式回复，后续可切换到 DeepSeek 或通义千问文本模型。"
            )
            chunk_size = 20
            for index in range(0, len(full_text), chunk_size):
                await asyncio.sleep(0)
                yield full_text[index : index + chunk_size]
            return

        raise NotImplementedError(
            f"暂未实现 LLM 提供商 {settings.llm_provider}，请先使用 mock 模式联调。"
        )


llm_adapter = LlmAdapter()
