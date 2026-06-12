from __future__ import annotations

from app.adapters.volcengine_asr import volcengine_asr_client
from app.config import settings
from app.state.session_store import AudioChunk


def _build_fallback_transcript(total_duration_ms: int) -> str:
    seconds = max(total_duration_ms / 1000, 0.1)
    return (
        f"已收到约 {seconds:.1f} 秒语音，但当前火山语音识别暂不可用。"
        "我先保留本轮提问，你可以检查语音配置后重试，或直接继续输入文字问题。"
    )


class AsrAdapter:
    async def transcribe(self, chunks: list[AudioChunk]) -> dict[str, str | int]:
        total_duration_ms = sum(chunk.duration_ms for chunk in chunks)
        if settings.asr_provider == "volcengine":
            try:
                transcript = await volcengine_asr_client.transcribe_chunks(chunks)
                return {
                    "transcript": transcript,
                    "provider": "volcengine",
                    "durationMs": total_duration_ms,
                    "chunkCount": len(chunks),
                }
            except Exception:
                pass

        transcript = _build_fallback_transcript(total_duration_ms)
        return {
            "transcript": transcript,
            "provider": "fallback",
            "durationMs": total_duration_ms,
            "chunkCount": len(chunks),
        }


asr_adapter = AsrAdapter()
