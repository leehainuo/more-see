from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class SessionState:
    session_id: str
    input_source: str
    device_info: dict[str, str | None] = field(default_factory=dict)
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

    def remove_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


session_store = SessionStore()
