from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sessions: Mapped[list["SessionRow"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class SessionRow(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    input_source: Mapped[str] = mapped_column(String(16))
    device_info: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["UserRow"] = relationship(back_populates="sessions")
    turns: Mapped[list["TurnRow"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    frames: Mapped[list["FrameRow"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class TurnRow(Base):
    __tablename__ = "turns"
    __table_args__ = (UniqueConstraint("session_id", "turn_id", name="uq_turn_session_turn"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), ForeignKey("sessions.session_id"), index=True)
    turn_id: Mapped[str] = mapped_column(String(64), index=True)
    user_text: Mapped[str] = mapped_column(Text)
    assistant_text: Mapped[str] = mapped_column(Text, default="")
    vision_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["SessionRow"] = relationship(back_populates="turns")


class FrameRow(Base):
    __tablename__ = "frames"
    __table_args__ = (UniqueConstraint("session_id", "frame_id", name="uq_frame_session_frame"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), ForeignKey("sessions.session_id"), index=True)
    frame_id: Mapped[str] = mapped_column(String(64), index=True)
    input_source: Mapped[str] = mapped_column(String(16))
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    captured_at: Mapped[str] = mapped_column(String(64), default="")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cache_hit: Mapped[int] = mapped_column(Integer, default=0)
    summarized_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    summary_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["SessionRow"] = relationship(back_populates="frames")
