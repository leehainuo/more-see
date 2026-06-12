from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.adapters import llm_adapter as llm_module
from app.adapters import vision_adapter as vision_module
from app.adapters.langchain_ark import extract_text_content
from app.config import settings
from app.graphs.conversation_graph import build_conversation_messages
from app.state.session_store import FrameSnapshot, TurnRecord


def test_extract_text_content_supports_string_and_array() -> None:
    assert extract_text_content("hello") == "hello"
    assert extract_text_content(
        [
            {"type": "text", "text": "你好"},
            {"type": "output_text", "text": "世界"},
        ]
    ) == "你好世界"


class _FakeChunk:
    def __init__(self, content: object) -> None:
        self.content = content


class _FakeStreamingModel:
    async def astream(self, _messages):
        yield _FakeChunk("第一段")
        yield _FakeChunk([{"type": "text", "text": "第二段"}])


class _FakeInvokeModel:
    async def ainvoke(self, _messages):
        return _FakeChunk("这是一段火山视觉摘要")


async def _fake_build_conversation_messages(**_kwargs):
    return [HumanMessage(content="fake-user")]


@pytest.mark.asyncio
async def test_build_conversation_messages_uses_history_and_vision_summary() -> None:
    messages = await build_conversation_messages(
        user_text="用户的问题",
        vision_summary="画面里有一只猫",
        history_turns=[TurnRecord(turn_id="turn-1", user_text="上一轮", assistant_text="上一轮回复")],
    )

    assert isinstance(messages[0], SystemMessage)
    assert isinstance(messages[1], HumanMessage)
    assert isinstance(messages[2], AIMessage)
    assert isinstance(messages[-1], HumanMessage)
    assert "本轮视觉摘要：画面里有一只猫" in str(messages[-1].content)


@pytest.mark.asyncio
async def test_llm_adapter_volcengine_stream(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "volcengine")
    monkeypatch.setattr(llm_module, "build_chat_model", lambda **_kwargs: _FakeStreamingModel())
    monkeypatch.setattr(
        llm_module,
        "build_conversation_messages",
        _fake_build_conversation_messages,
    )

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
    monkeypatch.setattr(vision_module, "build_chat_model", lambda **_kwargs: _FakeInvokeModel())

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


@pytest.mark.asyncio
async def test_llm_adapter_fallback_reply(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "volcengine")

    def _raise_error(**_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(llm_module, "build_chat_model", _raise_error)

    chunks: list[str] = []
    async for chunk in llm_module.llm_adapter.stream_reply(
        user_text="帮我总结一下",
        vision_summary="画面中有一台电脑",
        history_turns=[],
    ):
        chunks.append(chunk)

    assert "火山文本模型暂不可用" in "".join(chunks)


@pytest.mark.asyncio
async def test_vision_adapter_fallback_summary(monkeypatch) -> None:
    monkeypatch.setattr(settings, "vision_provider", "volcengine")

    def _raise_error(**_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(vision_module, "build_chat_model", _raise_error)

    result = await vision_module.vision_adapter.summarize(
        FrameSnapshot(
            frame_id="frame-2",
            input_source="camera",
            image_base64="ZmFrZQ==",
            width=720,
            height=1280,
            captured_at="2026-06-12T12:00:00Z",
        )
    )

    assert result["provider"] == "fallback"
    assert "火山视觉模型暂不可用" in str(result["summary"])
