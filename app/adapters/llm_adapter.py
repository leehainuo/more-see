from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.adapters.langchain_ark import build_chat_model, extract_text_content
from app.core.config import settings
from app.graphs import build_conversation_messages
from app.state.session_store import TurnRecord


def _truncate(text: str, limit: int = 48) -> str:
    return text if len(text) <= limit else f"{text[:limit]}..."


def _build_fallback_reply(
    user_text: str,
    vision_summary: str | None,
    history_turns: list[TurnRecord],
) -> str:
    history_summary = ""
    if history_turns:
        last_turn = history_turns[-1]
        history_summary = (
            f"上一轮你提到“{_truncate(last_turn.user_text)}”，"
            f"我当时回复了“{_truncate(last_turn.assistant_text or '本轮尚未完成回复')}”。"
        )

    return (
        "我已收到你的问题，并保留了当前多模态上下文。"
        f"本轮语音内容是：{user_text}。"
        f"{'' if not vision_summary else f' 画面补充信息为：{vision_summary}。'}"
        f"{history_summary}"
        "当前火山文本模型暂不可用，我先给出保守建议："
        "请继续明确你的目标、对象或下一步操作，我会基于已有上下文继续协助你。"
    )


class LlmAdapter:
    async def stream_reply(
        self,
        user_text: str,
        vision_summary: str | None,
        history_turns: list[TurnRecord],
        session_summary: str | None = None,
        semantic_snippets: list[str] | None = None,
        force_no_vision: bool = False,
    ) -> AsyncIterator[str]:
        if settings.llm_provider == "volcengine":
            try:
                messages = await build_conversation_messages(
                    user_text=user_text,
                    vision_summary=vision_summary,
                    session_summary=session_summary,
                    semantic_snippets=semantic_snippets,
                    force_no_vision=force_no_vision,
                    history_turns=history_turns,
                )
                chat_model = build_chat_model(model=settings.ark_llm_model, temperature=0.5)

                async for chunk in chat_model.astream(messages):
                    content = extract_text_content(chunk.content)
                    if content:
                        yield content
                return
            except Exception:
                pass

        full_text = _build_fallback_reply(user_text, vision_summary, history_turns)
        chunk_size = 20
        for index in range(0, len(full_text), chunk_size):
            await asyncio.sleep(0)
            yield full_text[index : index + chunk_size]


llm_adapter = LlmAdapter()
