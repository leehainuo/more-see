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
class FrameSnapshot:
    frame_id: str
    input_source: str
    image_base64: str
    width: int
    height: int
    captured_at: str
    stored_at: str = field(default_factory=utc_now_iso)


@dataclass
class TurnRecord:
    turn_id: str
    user_text: str
    assistant_text: str = ""
    vision_summary: str | None = None
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)


@dataclass
class SessionState:
    session_id: str
    input_source: str
    device_info: dict[str, str | None] = field(default_factory=dict)
    audio_chunks: list[AudioChunk] = field(default_factory=list)
    frames: list[FrameSnapshot] = field(default_factory=list)
    turns: list[TurnRecord] = field(default_factory=list)
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
        self._max_frames_per_session = 6

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

    def add_frame(
        self,
        session_id: str,
        frame_id: str,
        input_source: str,
        image_base64: str,
        width: int,
        height: int,
        captured_at: str,
    ) -> FrameSnapshot | None:
        session = self.touch_session(session_id)
        if session is None:
            return None

        frame = FrameSnapshot(
            frame_id=frame_id,
            input_source=input_source,
            image_base64=image_base64,
            width=width,
            height=height,
            captured_at=captured_at,
        )
        session.frames.append(frame)
        if len(session.frames) > self._max_frames_per_session:
            session.frames = session.frames[-self._max_frames_per_session :]
        return frame

    def get_latest_frame(self, session_id: str) -> FrameSnapshot | None:
        session = self.touch_session(session_id)
        if session is None or not session.frames:
            return None
        return session.frames[-1]

    def save_turn(
        self,
        session_id: str,
        turn_id: str,
        user_text: str,
        vision_summary: str | None = None,
    ) -> TurnRecord | None:
        session = self.touch_session(session_id)
        if session is None:
            return None

        existing_turn = next((turn for turn in session.turns if turn.turn_id == turn_id), None)
        if existing_turn is not None:
            existing_turn.user_text = user_text
            existing_turn.vision_summary = vision_summary
            existing_turn.updated_at = utc_now_iso()
            return existing_turn

        turn = TurnRecord(
            turn_id=turn_id,
            user_text=user_text,
            vision_summary=vision_summary,
        )
        session.turns.append(turn)
        return turn

    def complete_turn(self, session_id: str, turn_id: str, assistant_text: str) -> TurnRecord | None:
        session = self.touch_session(session_id)
        if session is None:
            return None

        turn = next((item for item in session.turns if item.turn_id == turn_id), None)
        if turn is None:
            return None

        turn.assistant_text = assistant_text
        turn.updated_at = utc_now_iso()
        return turn

    def get_recent_turns(self, session_id: str, limit: int = 3) -> list[TurnRecord]:
        session = self.touch_session(session_id)
        if session is None:
            return []
        if limit <= 0:
            return []
        return list(session.turns[-limit:])

    def remove_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


session_store = SessionStore()
