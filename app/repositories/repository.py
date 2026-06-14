from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, desc, func, select, text, update
from sqlalchemy.orm import selectinload
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.repositories.db import session_scope
from app.repositories.models import Base, FrameRow, MemoryChunkRow, SessionRow, TurnRow, UserRow


class PersistenceRepository:
    @staticmethod
    def _build_session_filters(
        *,
        user_id: int | None = None,
        query: str | None = None,
        input_source: str | None = None,
        status: str | None = None,
        updated_from: datetime | None = None,
        updated_to: datetime | None = None,
    ) -> list[object]:
        filters: list[object] = []
        normalized_query = (query or "").strip()
        normalized_input_source = (input_source or "").strip()
        normalized_status = (status or "").strip()

        if user_id is not None:
            filters.append(SessionRow.user_id == user_id)
        if normalized_query:
            filters.append(SessionRow.session_id.ilike(f"%{normalized_query}%"))
        if normalized_input_source in {"camera", "screen"}:
            filters.append(SessionRow.input_source == normalized_input_source)
        if normalized_status == "active":
            filters.append(SessionRow.ended_at.is_(None))
        elif normalized_status == "ended":
            filters.append(SessionRow.ended_at.is_not(None))
        if updated_from is not None:
            filters.append(SessionRow.updated_at >= updated_from)
        if updated_to is not None:
            filters.append(SessionRow.updated_at < updated_to)

        return filters

    async def ensure_schema(self) -> None:
        from app.repositories.db import get_engine

        engine = get_engine()
        async with engine.begin() as conn:
            if engine.dialect.name != "postgresql":
                raise RuntimeError("当前已切换为 PostgreSQL 持久化，请配置 POSTGRESQL/asyncpg DSN。")
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)
            try:
                await conn.execute(
                    text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super INTEGER NOT NULL DEFAULT 0")
                )
            except Exception:
                pass
            try:
                await conn.execute(
                    text("ALTER TABLE turns ADD COLUMN IF NOT EXISTS asr_duration_ms INTEGER NOT NULL DEFAULT 0")
                )
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE turns ADD COLUMN IF NOT EXISTS asr_provider VARCHAR(32) NULL"))
            except Exception:
                pass
            try:
                await conn.execute(
                    text("ALTER TABLE turns ADD COLUMN IF NOT EXISTS tts_char_count INTEGER NOT NULL DEFAULT 0")
                )
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE turns ADD COLUMN IF NOT EXISTS tts_provider VARCHAR(32) NULL"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_summary TEXT NULL"))
            except Exception:
                pass

    def _build_upsert_stmt(self, *, model, values: dict, update_values: dict, conflict_cols: list[str]):
        stmt = pg_insert(model).values(**values)
        index_elements = [getattr(model, col) for col in conflict_cols]
        return stmt.on_conflict_do_update(index_elements=index_elements, set_=update_values)

    async def upsert_session(
        self,
        *,
        session_id: str,
        user_id: int,
        input_source: str,
        device_info: dict,
        created_at: str,
        updated_at: str,
    ) -> None:
        async with session_scope() as session:
            values = {
                "session_id": session_id,
                "user_id": user_id,
                "input_source": input_source,
                "device_info": device_info,
                "created_at": self._parse_dt(created_at),
                "updated_at": self._parse_dt(updated_at),
            }
            stmt = self._build_upsert_stmt(
                model=SessionRow,
                values=values,
                update_values={
                    "user_id": values["user_id"],
                    "input_source": values["input_source"],
                    "device_info": values["device_info"],
                    "updated_at": values["updated_at"],
                },
                conflict_cols=["session_id"],
            )
            await session.execute(stmt)
            await session.commit()

    async def mark_session_ended(self, *, session_id: str) -> None:
        async with session_scope() as session:
            await session.execute(
                update(SessionRow)
                .where(SessionRow.session_id == session_id)
                .values(ended_at=datetime.utcnow(), updated_at=datetime.utcnow())
            )
            await session.commit()

    async def create_user(self, *, username: str, password_hash: str) -> UserRow | None:
        async with session_scope() as session:
            values = {
                "username": username,
                "password_hash": password_hash,
                "is_super": 0,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            stmt = self._build_upsert_stmt(
                model=UserRow,
                values=values,
                update_values={"updated_at": values["updated_at"]},
                conflict_cols=["username"],
            )
            await session.execute(stmt)
            await session.commit()
            return await session.scalar(select(UserRow).where(UserRow.username == username))

    async def get_user_by_username(self, *, username: str) -> UserRow | None:
        async with session_scope() as session:
            return await session.scalar(select(UserRow).where(UserRow.username == username))

    async def get_user_by_id(self, *, user_id: int) -> UserRow | None:
        async with session_scope() as session:
            return await session.scalar(select(UserRow).where(UserRow.id == user_id))

    async def upsert_turn(
        self,
        *,
        session_id: str,
        turn_id: str,
        user_text: str,
        assistant_text: str,
        vision_summary: str | None,
        asr_duration_ms: int,
        asr_provider: str | None,
        tts_char_count: int,
        tts_provider: str | None,
    ) -> None:
        async with session_scope() as session:
            values = {
                "session_id": session_id,
                "turn_id": turn_id,
                "user_text": user_text,
                "assistant_text": assistant_text,
                "vision_summary": vision_summary,
                "asr_duration_ms": asr_duration_ms,
                "asr_provider": asr_provider,
                "tts_char_count": tts_char_count,
                "tts_provider": tts_provider,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            stmt = self._build_upsert_stmt(
                model=TurnRow,
                values=values,
                update_values={
                    "user_text": values["user_text"],
                    "assistant_text": values["assistant_text"],
                    "vision_summary": values["vision_summary"],
                    "asr_duration_ms": values["asr_duration_ms"],
                    "asr_provider": values["asr_provider"],
                    "tts_char_count": values["tts_char_count"],
                    "tts_provider": values["tts_provider"],
                    "updated_at": values["updated_at"],
                },
                conflict_cols=["session_id", "turn_id"],
            )
            await session.execute(stmt)
            await session.execute(
                update(SessionRow).where(SessionRow.session_id == session_id).values(updated_at=datetime.utcnow())
            )
            await session.commit()

    async def upsert_frame(
        self,
        *,
        session_id: str,
        frame_id: str,
        input_source: str,
        width: int,
        height: int,
        captured_at: str,
    ) -> None:
        async with session_scope() as session:
            values = {
                "session_id": session_id,
                "frame_id": frame_id,
                "input_source": input_source,
                "width": width,
                "height": height,
                "captured_at": captured_at,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            stmt = self._build_upsert_stmt(
                model=FrameRow,
                values=values,
                update_values={
                    "input_source": values["input_source"],
                    "width": values["width"],
                    "height": values["height"],
                    "captured_at": values["captured_at"],
                    "updated_at": values["updated_at"],
                },
                conflict_cols=["session_id", "frame_id"],
            )
            await session.execute(stmt)
            await session.execute(
                update(SessionRow).where(SessionRow.session_id == session_id).values(updated_at=datetime.utcnow())
            )
            await session.commit()

    async def update_session_summary(self, *, session_id: str, summary: str) -> None:
        async with session_scope() as session:
            await session.execute(
                update(SessionRow)
                .where(SessionRow.session_id == session_id)
                .values(session_summary=summary, updated_at=datetime.utcnow())
            )
            await session.commit()

    async def insert_memory_chunk(
        self,
        *,
        memory_id: str,
        user_id: int,
        session_id: str,
        turn_id: str,
        role: str,
        content: str,
        embedding: list[float],
    ) -> None:
        async with session_scope() as session:
            values = {
                "memory_id": memory_id,
                "user_id": user_id,
                "session_id": session_id,
                "turn_id": turn_id,
                "role": role,
                "content": content,
                "embedding": embedding,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            stmt = self._build_upsert_stmt(
                model=MemoryChunkRow,
                values=values,
                update_values={
                    "content": values["content"],
                    "embedding": values["embedding"],
                    "updated_at": values["updated_at"],
                },
                conflict_cols=["user_id", "memory_id"],
            )
            await session.execute(stmt)
            await session.commit()

    async def search_memory_chunks(
        self,
        *,
        user_id: int,
        query_embedding: list[float],
        limit: int = 3,
    ) -> list[MemoryChunkRow]:
        async with session_scope() as session:
            result = await session.scalars(
                select(MemoryChunkRow)
                .where(MemoryChunkRow.user_id == user_id)
                .order_by(MemoryChunkRow.embedding.l2_distance(query_embedding))
                .limit(limit)
            )
            return list(result)

    async def update_frame_summary(
        self,
        *,
        session_id: str,
        frame_id: str,
        summary: str | None,
        provider: str | None,
        cache_hit: bool,
        summarized_at: str | None,
        summary_error: str | None,
    ) -> None:
        async with session_scope() as session:
            row_id = await session.scalar(
                select(FrameRow.id).where(FrameRow.session_id == session_id, FrameRow.frame_id == frame_id)
            )
            if row_id is None:
                await session.commit()
                return
            await session.execute(
                update(FrameRow)
                .where(FrameRow.id == row_id)
                .values(
                    summary=summary,
                    provider=provider,
                    cache_hit=1 if cache_hit else 0,
                    summarized_at=summarized_at,
                    summary_error=summary_error,
                    updated_at=datetime.utcnow(),
                )
            )
            await session.execute(
                update(SessionRow).where(SessionRow.session_id == session_id).values(updated_at=datetime.utcnow())
            )
            await session.commit()

    async def list_sessions(
        self,
        *,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
        query: str | None = None,
        input_source: str | None = None,
        status: str | None = None,
        updated_from: datetime | None = None,
        updated_to: datetime | None = None,
    ) -> list[SessionRow]:
        async with session_scope() as session:
            filters = self._build_session_filters(
                user_id=user_id,
                query=query,
                input_source=input_source,
                status=status,
                updated_from=updated_from,
                updated_to=updated_to,
            )
            result = await session.scalars(
                select(SessionRow)
                .where(*filters)
                .order_by(desc(SessionRow.updated_at))
                .limit(limit)
                .offset(offset)
            )
            return list(result)

    async def count_sessions(
        self,
        *,
        user_id: int,
        query: str | None = None,
        input_source: str | None = None,
        status: str | None = None,
        updated_from: datetime | None = None,
        updated_to: datetime | None = None,
    ) -> int:
        async with session_scope() as session:
            filters = self._build_session_filters(
                user_id=user_id,
                query=query,
                input_source=input_source,
                status=status,
                updated_from=updated_from,
                updated_to=updated_to,
            )
            value = await session.scalar(select(func.count(SessionRow.id)).where(*filters))
            return int(value or 0)

    async def list_sessions_with_details(
        self, *, user_id: int, limit: int = 20, offset: int = 0
    ) -> list[SessionRow]:
        async with session_scope() as session:
            result = await session.scalars(
                select(SessionRow)
                .options(selectinload(SessionRow.turns), selectinload(SessionRow.frames))
                .where(SessionRow.user_id == user_id)
                .order_by(desc(SessionRow.updated_at))
                .limit(limit)
                .offset(offset)
            )
            return list(result)

    async def count_all_sessions(
        self,
        *,
        query: str | None = None,
        input_source: str | None = None,
        status: str | None = None,
        updated_from: datetime | None = None,
        updated_to: datetime | None = None,
    ) -> int:
        async with session_scope() as session:
            filters = self._build_session_filters(
                query=query,
                input_source=input_source,
                status=status,
                updated_from=updated_from,
                updated_to=updated_to,
            )
            value = await session.scalar(select(func.count(SessionRow.id)).where(*filters))
            return int(value or 0)

    async def list_all_sessions_with_details(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        query: str | None = None,
        input_source: str | None = None,
        status: str | None = None,
        updated_from: datetime | None = None,
        updated_to: datetime | None = None,
    ) -> list[SessionRow]:
        async with session_scope() as session:
            filters = self._build_session_filters(
                query=query,
                input_source=input_source,
                status=status,
                updated_from=updated_from,
                updated_to=updated_to,
            )
            result = await session.scalars(
                select(SessionRow)
                # 使用 selectinload 预加载 turns/frames，避免遍历会话列表时逐条回表触发 N+1
                .options(selectinload(SessionRow.turns), selectinload(SessionRow.frames))
                .where(*filters)
                .order_by(desc(SessionRow.updated_at))
                .limit(limit)
                .offset(offset)
            )
            return list(result)

    async def get_session_detail(self, *, user_id: int, session_id: str) -> SessionRow | None:
        async with session_scope() as session:
            return await session.scalar(
                select(SessionRow)
                # 使用 selectinload 预加载 turns/frames，避免循环查询子表导致 N+1
                .options(selectinload(SessionRow.turns), selectinload(SessionRow.frames))
                .where(SessionRow.user_id == user_id, SessionRow.session_id == session_id)
            )

    async def get_session_detail_admin(self, *, session_id: str) -> SessionRow | None:
        async with session_scope() as session:
            return await session.scalar(
                select(SessionRow)
                .options(selectinload(SessionRow.turns), selectinload(SessionRow.frames))
                .where(SessionRow.session_id == session_id)
            )

    async def delete_session(self, *, user_id: int, session_id: str) -> bool:
        async with session_scope() as session:
            # 批量删除 memory/turn/frame/session，避免逐条查询删除带来的额外往返和 N+1 风险
            deleted_session_count = await session.scalar(
                select(func.count(SessionRow.id)).where(SessionRow.user_id == user_id, SessionRow.session_id == session_id)
            )
            if not deleted_session_count:
                await session.commit()
                return False

            await session.execute(delete(MemoryChunkRow).where(MemoryChunkRow.user_id == user_id, MemoryChunkRow.session_id == session_id))
            await session.execute(delete(TurnRow).where(TurnRow.session_id == session_id))
            await session.execute(delete(FrameRow).where(FrameRow.session_id == session_id))
            await session.execute(delete(SessionRow).where(SessionRow.user_id == user_id, SessionRow.session_id == session_id))
            await session.commit()
            return True

    @staticmethod
    def _parse_dt(value: str) -> datetime:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return datetime.utcnow()


persistence_repository = PersistenceRepository()
