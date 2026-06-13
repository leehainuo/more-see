from __future__ import annotations

from datetime import datetime

from sqlalchemy import desc, select, text, update
from sqlalchemy.orm import selectinload
from sqlalchemy.dialects.mysql import insert as mysql_insert

from app.persistence.db import session_scope
from app.persistence.models import Base, FrameRow, SessionRow, TurnRow, UserRow


class PersistenceRepository:
    async def ensure_schema(self) -> None:
        from app.persistence.db import get_engine

        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            try:
                await conn.execute(text("ALTER TABLE users ADD COLUMN is_super INTEGER NOT NULL DEFAULT 0"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE turns ADD COLUMN asr_duration_ms INTEGER NOT NULL DEFAULT 0"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE turns ADD COLUMN asr_provider VARCHAR(32) NULL"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE turns ADD COLUMN tts_char_count INTEGER NOT NULL DEFAULT 0"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE turns ADD COLUMN tts_provider VARCHAR(32) NULL"))
            except Exception:
                pass

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
            stmt = mysql_insert(SessionRow).values(
                session_id=session_id,
                user_id=user_id,
                input_source=input_source,
                device_info=device_info,
                created_at=self._parse_dt(created_at),
                updated_at=self._parse_dt(updated_at),
            )
            stmt = stmt.on_duplicate_key_update(
                user_id=stmt.inserted.user_id,
                input_source=stmt.inserted.input_source,
                device_info=stmt.inserted.device_info,
                updated_at=stmt.inserted.updated_at,
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
            stmt = mysql_insert(UserRow).values(
                username=username,
                password_hash=password_hash,
                is_super=0,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            stmt = stmt.on_duplicate_key_update(updated_at=stmt.inserted.updated_at)
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
            stmt = mysql_insert(TurnRow).values(
                session_id=session_id,
                turn_id=turn_id,
                user_text=user_text,
                assistant_text=assistant_text,
                vision_summary=vision_summary,
                asr_duration_ms=asr_duration_ms,
                asr_provider=asr_provider,
                tts_char_count=tts_char_count,
                tts_provider=tts_provider,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            stmt = stmt.on_duplicate_key_update(
                user_text=stmt.inserted.user_text,
                assistant_text=stmt.inserted.assistant_text,
                vision_summary=stmt.inserted.vision_summary,
                asr_duration_ms=stmt.inserted.asr_duration_ms,
                asr_provider=stmt.inserted.asr_provider,
                tts_char_count=stmt.inserted.tts_char_count,
                tts_provider=stmt.inserted.tts_provider,
                updated_at=stmt.inserted.updated_at,
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
            stmt = mysql_insert(FrameRow).values(
                session_id=session_id,
                frame_id=frame_id,
                input_source=input_source,
                width=width,
                height=height,
                captured_at=captured_at,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            stmt = stmt.on_duplicate_key_update(
                input_source=stmt.inserted.input_source,
                width=stmt.inserted.width,
                height=stmt.inserted.height,
                captured_at=stmt.inserted.captured_at,
                updated_at=stmt.inserted.updated_at,
            )
            await session.execute(stmt)
            await session.execute(
                update(SessionRow).where(SessionRow.session_id == session_id).values(updated_at=datetime.utcnow())
            )
            await session.commit()

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

    async def list_sessions(self, *, user_id: int, limit: int = 20, offset: int = 0) -> list[SessionRow]:
        async with session_scope() as session:
            result = await session.scalars(
                select(SessionRow)
                .where(SessionRow.user_id == user_id)
                .order_by(desc(SessionRow.updated_at))
                .limit(limit)
                .offset(offset)
            )
            return list(result)

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

    async def list_all_sessions_with_details(self, *, limit: int = 50, offset: int = 0) -> list[SessionRow]:
        async with session_scope() as session:
            result = await session.scalars(
                select(SessionRow)
                .options(selectinload(SessionRow.turns), selectinload(SessionRow.frames))
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

    @staticmethod
    def _parse_dt(value: str) -> datetime:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return datetime.utcnow()


persistence_repository = PersistenceRepository()
