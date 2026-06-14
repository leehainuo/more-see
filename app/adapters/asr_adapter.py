from __future__ import annotations

import base64
import binascii
import logging
import struct

from app.adapters.volcengine_asr import volcengine_asr_client
from app.core.config import settings
from app.state.session_store import AudioChunk

_FALLBACK_TRANSCRIPT_MARKER = "火山语音识别暂不可用"
_SHORT_AUDIO_MS = 1000
_LOW_AUDIO_RMS = 0.003

logger = logging.getLogger(__name__)


def _build_fallback_transcript(total_duration_ms: int) -> str:
    seconds = max(total_duration_ms / 1000, 0.1)
    return (
        f"已收到约 {seconds:.1f} 秒语音，但当前火山语音识别暂不可用。"
        "我先保留本轮提问，你可以检查语音配置后重试，或直接继续输入文字问题。"
    )


def is_fallback_transcript(text: str) -> bool:
    return _FALLBACK_TRANSCRIPT_MARKER in text


def _estimate_pcm_audio_level(chunks: list[AudioChunk]) -> float | None:
    total_abs = 0
    sample_count = 0

    for chunk in chunks:
        if not chunk.mime_type.lower().startswith("audio/pcm"):
            return None
        try:
            audio_bytes = base64.b64decode(chunk.base64_audio)
        except (binascii.Error, ValueError):
            continue
        if len(audio_bytes) < 2:
            continue

        usable_length = len(audio_bytes) - (len(audio_bytes) % 2)
        for (sample,) in struct.iter_unpack("<h", audio_bytes[:usable_length]):
            total_abs += abs(sample)
            sample_count += 1

    if sample_count == 0:
        return None
    return total_abs / sample_count / 32768


def _build_diagnostic_message(
    *,
    code: str,
    total_duration_ms: int,
    chunk_count: int,
    audio_level: float | None,
    error_text: str | None = None,
) -> str:
    level_text = "unknown" if audio_level is None else f"{audio_level:.4f}"
    metrics = f"时长约 {total_duration_ms}ms，分片 {chunk_count} 段，估算平均音量 {level_text}。"

    if code == "short_audio":
        return f"语音片段偏短，可能还没形成完整句子就提交了。{metrics}"
    if code == "low_audio_level":
        return f"音量疑似过小或大部分是静音，火山 ASR 没拿到稳定人声。{metrics}"
    if code == "empty_transcript":
        return f"火山 ASR 已成功处理请求，但本轮没有返回文字结果。{metrics}"
    if code == "audio_decode_failed":
        return f"音频分片解码失败，服务端未拿到有效 PCM 数据。{metrics}"
    if code == "provider_error":
        detail = f" 原始错误：{error_text}" if error_text else ""
        return f"火山 ASR 调用失败。{metrics}{detail}"
    return f"本轮语音识别未成功。{metrics}"


def _build_failure_diagnostic(chunks: list[AudioChunk], total_duration_ms: int, error_text: str) -> tuple[str, str]:
    audio_level = _estimate_pcm_audio_level(chunks)

    if audio_level is None and chunks:
        return (
            "audio_decode_failed",
            _build_diagnostic_message(
                code="audio_decode_failed",
                total_duration_ms=total_duration_ms,
                chunk_count=len(chunks),
                audio_level=audio_level,
                error_text=error_text,
            ),
        )

    if total_duration_ms < _SHORT_AUDIO_MS:
        return (
            "short_audio",
            _build_diagnostic_message(
                code="short_audio",
                total_duration_ms=total_duration_ms,
                chunk_count=len(chunks),
                audio_level=audio_level,
            ),
        )

    if audio_level is not None and audio_level < _LOW_AUDIO_RMS:
        return (
            "low_audio_level",
            _build_diagnostic_message(
                code="low_audio_level",
                total_duration_ms=total_duration_ms,
                chunk_count=len(chunks),
                audio_level=audio_level,
            ),
        )

    if "未返回可用 transcript" in error_text:
        return (
            "empty_transcript",
            _build_diagnostic_message(
                code="empty_transcript",
                total_duration_ms=total_duration_ms,
                chunk_count=len(chunks),
                audio_level=audio_level,
            ),
        )

    return (
        "provider_error",
        _build_diagnostic_message(
            code="provider_error",
            total_duration_ms=total_duration_ms,
            chunk_count=len(chunks),
            audio_level=audio_level,
            error_text=error_text,
        ),
    )


class AsrAdapter:
    async def transcribe_partial(self, chunks: list[AudioChunk]) -> dict[str, str | int]:
        total_duration_ms = sum(chunk.duration_ms for chunk in chunks)
        if not chunks or settings.asr_provider != "volcengine":
            return {
                "transcript": "",
                "provider": "fallback",
                "durationMs": total_duration_ms,
                "chunkCount": len(chunks),
            }

        try:
            transcript = await volcengine_asr_client.transcribe_chunks(chunks)
        except Exception as exc:
            logger.info(
                "asr partial skipped: provider=volcengine chunk_count=%s duration_ms=%s error=%s",
                len(chunks),
                total_duration_ms,
                exc,
            )
            transcript = ""

        return {
            "transcript": transcript,
            "provider": "volcengine",
            "durationMs": total_duration_ms,
            "chunkCount": len(chunks),
        }

    async def transcribe(self, chunks: list[AudioChunk]) -> dict[str, str | int | float]:
        total_duration_ms = sum(chunk.duration_ms for chunk in chunks)
        audio_level = _estimate_pcm_audio_level(chunks)
        logger.info(
            "asr transcribe start: provider=%s chunk_count=%s duration_ms=%s estimated_audio_level=%s",
            settings.asr_provider,
            len(chunks),
            total_duration_ms,
            "unknown" if audio_level is None else f"{audio_level:.4f}",
        )
        if settings.asr_provider == "volcengine":
            try:
                transcript = await volcengine_asr_client.transcribe_chunks(chunks)
                logger.info(
                    "asr transcribe success: provider=volcengine chunk_count=%s duration_ms=%s transcript_length=%s estimated_audio_level=%s",
                    len(chunks),
                    total_duration_ms,
                    len(transcript),
                    "unknown" if audio_level is None else f"{audio_level:.4f}",
                )
                return {
                    "transcript": transcript,
                    "provider": "volcengine",
                    "durationMs": total_duration_ms,
                    "chunkCount": len(chunks),
                }
            except Exception as exc:
                diagnostic_code, diagnostic_message = _build_failure_diagnostic(
                    chunks,
                    total_duration_ms,
                    str(exc),
                )
                logger.warning(
                    "asr transcribe fallback: provider=volcengine code=%s chunk_count=%s duration_ms=%s estimated_audio_level=%s error=%s diagnostic=%s",
                    diagnostic_code,
                    len(chunks),
                    total_duration_ms,
                    "unknown" if audio_level is None else f"{audio_level:.4f}",
                    exc,
                    diagnostic_message,
                )
                transcript = _build_fallback_transcript(total_duration_ms)
                return {
                    "transcript": transcript,
                    "provider": "fallback",
                    "durationMs": total_duration_ms,
                    "chunkCount": len(chunks),
                    "diagnosticCode": diagnostic_code,
                    "diagnosticMessage": diagnostic_message,
                }

        transcript = _build_fallback_transcript(total_duration_ms)
        logger.warning(
            "asr transcribe fallback: provider=%s code=provider_disabled chunk_count=%s duration_ms=%s estimated_audio_level=%s diagnostic=%s",
            settings.asr_provider,
            len(chunks),
            total_duration_ms,
            "unknown" if audio_level is None else f"{audio_level:.4f}",
            f"当前 ASR 提供方不是火山或缺少必要配置。时长约 {total_duration_ms}ms，分片 {len(chunks)} 段。",
        )
        return {
            "transcript": transcript,
            "provider": "fallback",
            "durationMs": total_duration_ms,
            "chunkCount": len(chunks),
            "diagnosticCode": "provider_disabled",
            "diagnosticMessage": (
                f"当前 ASR 提供方不是火山或缺少必要配置。时长约 {total_duration_ms}ms，分片 {len(chunks)} 段。"
            ),
        }


asr_adapter = AsrAdapter()
