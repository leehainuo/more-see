from __future__ import annotations

from app.config import settings
from app.state.session_store import AudioChunk


class AsrAdapter:
    async def transcribe(self, chunks: list[AudioChunk]) -> dict[str, str | int]:
        total_duration_ms = sum(chunk.duration_ms for chunk in chunks)
        if settings.asr_provider == "mock":
            seconds = max(total_duration_ms / 1000, 0.1)
            transcript = (
                f"模拟识别结果：已收到约 {seconds:.1f} 秒语音。"
                "当前环境未配置真实 ASR 服务，接入密钥后可替换为云端识别。"
            )
            return {
                "transcript": transcript,
                "provider": "mock",
                "durationMs": total_duration_ms,
                "chunkCount": len(chunks),
            }

        raise NotImplementedError(
            f"暂未实现 ASR 提供商 {settings.asr_provider}，请先使用 mock 模式联调。"
        )


asr_adapter = AsrAdapter()
