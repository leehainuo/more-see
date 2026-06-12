from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class AudioChunk:
    chunk_id: str
    mime_type: str
    base64_audio: str
    duration_ms: int
    received_at: str = field(default_factory=utc_now_iso)


@dataclass
class SessionState:
    session_id: str
    input_source: str
    device_info: dict[str, str | None] = field(default_factory=dict)
    audio_chunks: list[AudioChunk] = field(default_factory=list)
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def create_session(
        self,
        session_id: str,
        input_source: str,
        device_info: dict[str, str | None] | None = None,
    ) -> SessionState:
        session = SessionState(
            session_id=session_id,
            input_source=input_source,
            device_info=device_info or {},
        )
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> SessionState | None:
        return self._sessions.get(session_id)

    def touch_session(self, session_id: str) -> SessionState | None:
        session = self.get_session(session_id)
        if session is None:
            return None
        session.updated_at = utc_now_iso()
        return session

    def add_audio_chunk(
        self,
        session_id: str,
        chunk_id: str,
        mime_type: str,
        base64_audio: str,
        duration_ms: int,
    ) -> AudioChunk | None:
        session = self.touch_session(session_id)
        if session is None:
            return None
        chunk = AudioChunk(
            chunk_id=chunk_id,
            mime_type=mime_type,
            base64_audio=base64_audio,
            duration_ms=duration_ms,
        )
        session.audio_chunks.append(chunk)
        return chunk

    def consume_audio_chunks(self, session_id: str) -> list[AudioChunk]:
        session = self.touch_session(session_id)
        if session is None:
            return []
        chunks = list(session.audio_chunks)
        session.audio_chunks.clear()
        return chunks

    def remove_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


session_store = SessionStore()
