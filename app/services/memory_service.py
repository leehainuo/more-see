from __future__ import annotations

import asyncio
import uuid

from langchain_core.messages import HumanMessage, SystemMessage

from app.adapters.embedding_adapter import embedding_adapter
from app.adapters.langchain_ark import build_chat_model, extract_text_content
from app.config import settings
from app.persistence.repository import persistence_repository
from app.state.session_store import TurnRecord, session_store


class MemoryService:
    async def retrieve_semantic_snippets(self, *, user_id: int, query: str) -> list[str]:
        if not settings.memory_semantic_enabled:
            return []
        embedding = await embedding_adapter.embed_query(query)
        if embedding is None:
            return []
        rows = await persistence_repository.search_memory_chunks(
            user_id=user_id,
            query_embedding=embedding,
            limit=max(1, settings.memory_semantic_top_k),
        )
        snippets: list[str] = []
        for row in rows:
            value = str(row.content).strip()
            if value:
                snippets.append(value)
        return snippets

    def record_turn_completed(
        self,
        *,
        session_id: str,
        turn_id: str,
        user_text: str,
        assistant_text: str,
        vision_summary: str | None,
    ) -> None:
        asyncio.create_task(
            self._update_session_summary(
                session_id=session_id,
                turn_id=turn_id,
                user_text=user_text,
                assistant_text=assistant_text,
                vision_summary=vision_summary,
            )
        )
        asyncio.create_task(
            self._upsert_semantic_memory(
                session_id=session_id,
                turn_id=turn_id,
                user_text=user_text,
                assistant_text=assistant_text,
                vision_summary=vision_summary,
            )
        )

    async def _update_session_summary(
        self,
        *,
        session_id: str,
        turn_id: str,
        user_text: str,
        assistant_text: str,
        vision_summary: str | None,
    ) -> None:
        if not settings.memory_summary_enabled:
            return
        session = session_store.get_session(session_id)
        if session is None:
            return
        interval = max(1, settings.memory_summary_turn_interval)
        if len(session.turns) % interval != 0 and session.session_summary:
            return
        recent_turns = list(session.turns[-interval:])
        summary = await self._generate_session_summary(
            previous_summary=session.session_summary,
            recent_turns=recent_turns,
            max_chars=max(80, settings.memory_summary_max_chars),
        )
        if not summary:
            return
        session_store.set_session_summary(session_id, summary)
        await persistence_repository.update_session_summary(session_id=session_id, summary=summary)

    async def _generate_session_summary(
        self,
        *,
        previous_summary: str | None,
        recent_turns: list[TurnRecord],
        max_chars: int,
    ) -> str | None:
        if not settings.ark_api_key:
            return None
        if not recent_turns:
            return None
        prompt_turns = "\n\n".join(
            [
                f"用户：{turn.user_text}\n助手：{turn.assistant_text or ''}".strip()
                for turn in recent_turns
                if turn.user_text.strip()
            ]
        ).strip()
        if not prompt_turns:
            return None

        chat_model = build_chat_model(model=settings.ark_llm_model, temperature=0.2)
        response = await chat_model.ainvoke(
            [
                SystemMessage(
                    content=(
                        "你是会话摘要器，负责将对话压缩为可供后续多轮对话继续使用的摘要。"
                        "摘要要求：中文、信息密度高、可复用，长度不超过指定上限；"
                        "只保留用户目标、关键事实、已完成结论与待办，不要复述闲聊。"
                    )
                ),
                HumanMessage(
                    content=(
                        f"已有摘要（可能为空）：\n{previous_summary or ''}\n\n"
                        f"请结合最近对话增量更新摘要（上限 {max_chars} 字）：\n{prompt_turns}"
                    )
                ),
            ]
        )
        text = extract_text_content(response.content).strip()
        if not text:
            return None
        return text[:max_chars]

    async def _upsert_semantic_memory(
        self,
        *,
        session_id: str,
        turn_id: str,
        user_text: str,
        assistant_text: str,
        vision_summary: str | None,
    ) -> None:
        if not settings.memory_semantic_enabled:
            return
        session = session_store.get_session(session_id)
        if session is None or session.user_id is None:
            return
        if not user_text.strip() or not assistant_text.strip():
            return
        embedding_text = f"用户：{user_text}\n助手：{assistant_text}"
        if vision_summary:
            embedding_text = f"{embedding_text}\n视觉摘要：{vision_summary}"
        embedding = await embedding_adapter.embed_query(embedding_text)
        if embedding is None:
            return
        memory_id = f"{session_id}-{turn_id}-{uuid.uuid4().hex[:10]}"
        await persistence_repository.insert_memory_chunk(
            memory_id=memory_id,
            user_id=int(session.user_id),
            session_id=session_id,
            turn_id=turn_id,
            role="turn",
            content=embedding_text,
            embedding=embedding,
        )


memory_service = MemoryService()

