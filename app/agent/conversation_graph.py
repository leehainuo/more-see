from __future__ import annotations

from langchain_core.messages import BaseMessage
from langgraph.graph import END, START, StateGraph

from app.agent.messages import ConversationMessageState, build_messages
from app.agent.session_store import TurnRecord

ConversationGraphState = ConversationMessageState


_graph_builder = StateGraph(ConversationGraphState)
_graph_builder.add_node("prepare_messages", build_messages)
_graph_builder.add_edge(START, "prepare_messages")
_graph_builder.add_edge("prepare_messages", END)
conversation_graph = _graph_builder.compile()


async def build_conversation_messages(
    *,
    user_text: str,
    vision_summary: str | None,
    session_summary: str | None = None,
    semantic_snippets: list[str] | None = None,
    force_no_vision: bool = False,
    history_turns: list[TurnRecord],
) -> list[BaseMessage]:
    result = await conversation_graph.ainvoke(
        {
            "user_text": user_text,
            "vision_summary": vision_summary,
            "session_summary": session_summary,
            "semantic_snippets": semantic_snippets or [],
            "force_no_vision": force_no_vision,
            "history_turns": history_turns,
            "messages": [],
        }
    )
    return list(result["messages"])
