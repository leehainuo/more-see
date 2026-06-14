from __future__ import annotations

from typing import TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.agent.prompts import build_intent_system_message, get_conversation_system_prompt
from app.agent.session_store import TurnRecord
from app.integrations.speech.asr_adapter import is_fallback_transcript


class ConversationMessageState(TypedDict):
    user_text: str
    vision_summary: str | None
    force_no_vision: bool
    history_turns: list[TurnRecord]
    session_summary: str | None
    semantic_snippets: list[str]
    messages: list[BaseMessage]


def _format_turn_user_text(text: str, vision: str | None, *, force_no_vision: bool) -> str:
    rendered = f"用户语音转写：\n{text}"
    if vision and not force_no_vision:
        rendered = f"{rendered}\n本轮视觉摘要：{vision}"
    elif force_no_vision:
        rendered = f"{rendered}\n本轮视觉摘要：未就绪（请不要引用上一轮视觉内容）"
    return rendered


def build_messages(state: ConversationMessageState) -> dict[str, list[BaseMessage]]:
    messages: list[BaseMessage] = [SystemMessage(content=get_conversation_system_prompt())]

    intent_system_message = build_intent_system_message(state["user_text"])
    if intent_system_message is not None:
        messages.append(intent_system_message)

    session_summary = (state.get("session_summary") or "").strip()
    if session_summary:
        messages.append(SystemMessage(content=f"会话摘要（供参考）：{session_summary}"))

    semantic_snippets = [snippet.strip() for snippet in state.get("semantic_snippets", []) if snippet.strip()]
    if semantic_snippets:
        rendered = "\n".join([f"- {snippet}" for snippet in semantic_snippets[:6]])
        messages.append(SystemMessage(content=f"与本次问题相关的历史记忆：\n{rendered}"))

    for turn in state["history_turns"][-3:]:
        if is_fallback_transcript(turn.user_text):
            continue
        messages.append(
            HumanMessage(
                content=_format_turn_user_text(
                    turn.user_text,
                    turn.vision_summary,
                    force_no_vision=state["force_no_vision"],
                )
            )
        )
        if turn.assistant_text:
            messages.append(AIMessage(content=turn.assistant_text))

    messages.append(
        HumanMessage(
            content=_format_turn_user_text(
                state["user_text"],
                state["vision_summary"],
                force_no_vision=state["force_no_vision"],
            )
        )
    )

    return {"messages": messages}
