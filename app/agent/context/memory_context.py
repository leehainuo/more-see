from __future__ import annotations

from dataclasses import dataclass

from langchain_core.messages import SystemMessage

_MAX_SEMANTIC_SNIPPETS = 6


@dataclass(slots=True)
class ConversationMemoryContext:
    session_summary: str | None
    semantic_snippets: list[str]


def build_memory_context(
    *,
    session_summary: str | None,
    semantic_snippets: list[str] | None,
) -> ConversationMemoryContext:
    normalized_summary = (session_summary or "").strip() or None
    normalized_snippets = [snippet.strip() for snippet in (semantic_snippets or []) if snippet.strip()]
    return ConversationMemoryContext(
        session_summary=normalized_summary,
        semantic_snippets=normalized_snippets[:_MAX_SEMANTIC_SNIPPETS],
    )


def build_memory_context_messages(memory_context: ConversationMemoryContext) -> list[SystemMessage]:
    messages: list[SystemMessage] = []
    if memory_context.session_summary:
        messages.append(SystemMessage(content=f"会话摘要（供参考）：{memory_context.session_summary}"))
    if memory_context.semantic_snippets:
        rendered = "\n".join([f"- {snippet}" for snippet in memory_context.semantic_snippets])
        messages.append(SystemMessage(content=f"与本次问题相关的历史记忆：\n{rendered}"))
    return messages
