from __future__ import annotations

import pytest

from app.adapters import llm_adapter as llm_module
from app.adapters import vision_adapter as vision_module
from app.adapters.ark_adapter import extract_text_content
from app.config import settings
from app.state.session_store import FrameSnapshot, TurnRecord


def test_extract_text_content_supports_string_and_array() -> None:
    assert extract_text_content("hello") == "hello"
    assert extract_text_content(
        [
            {"type": "text", "text": "你好"},
            {"type": "output_text", "text": "世界"},
        ]
    ) == "你好世界"


async def _fake_stream_chat_completion(_payload: dict):
    yield {"choices": [{"delta": {"content": "第一段"}}]}
    yield {"choices": [{"delta": {"content": "第二段"}}]}


async def _fake_create_chat_completion(_payload: dict):
    return {"choices": [{"message": {"content": "这是一段火山视觉摘要"}}]}


@pytest.mark.asyncio
async def test_llm_adapter_volcengine_stream(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "volcengine")
    monkeypatch.setattr(llm_module, "stream_chat_completion", _fake_stream_chat_completion)

    chunks: list[str] = []
    async for chunk in llm_module.llm_adapter.stream_reply(
        user_text="用户的问题",
        vision_summary="一张测试图片",
        history_turns=[TurnRecord(turn_id="turn-1", user_text="上一轮", assistant_text="上一轮回复")],
    ):
        chunks.append(chunk)

    assert "".join(chunks) == "第一段第二段"


@pytest.mark.asyncio
async def test_vision_adapter_volcengine_summary(monkeypatch) -> None:
    monkeypatch.setattr(settings, "vision_provider", "volcengine")
    monkeypatch.setattr(vision_module, "create_chat_completion", _fake_create_chat_completion)

    result = await vision_module.vision_adapter.summarize(
        FrameSnapshot(
            frame_id="frame-1",
            input_source="camera",
            image_base64="ZmFrZQ==",
            width=1280,
            height=720,
            captured_at="2026-06-12T12:00:00Z",
        )
    )

    assert result["provider"] == "volcengine"
    assert result["summary"] == "这是一段火山视觉摘要"
