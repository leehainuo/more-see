from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.adapters import llm_adapter as llm_module
from app.adapters import vision_adapter as vision_module
from app.adapters.langchain_ark import extract_text_content
from app.core.config import settings
from app.graphs.conversation_graph import build_conversation_messages
from app.services.intent_service import classify_user_intent
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
    def __init__(self) -> None:
        self.calls: list[object] = []

    async def ainvoke(self, _messages):
        self.calls.append(_messages)
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
async def test_build_conversation_messages_skips_fallback_asr_history() -> None:
    messages = await build_conversation_messages(
        user_text="继续分析",
        vision_summary=None,
        history_turns=[
            TurnRecord(
                turn_id="turn-fallback",
                user_text="已收到约 1.2 秒语音，但当前火山语音识别暂不可用。我先保留本轮提问，你可以检查语音配置后重试，或直接继续输入文字问题。",
                assistant_text="看来语音识别暂时遇到了点小状况呢。",
            ),
            TurnRecord(turn_id="turn-ok", user_text="上一轮正常问题", assistant_text="上一轮正常回复"),
        ],
    )

    rendered = [str(message.content) for message in messages]

    assert all("火山语音识别暂不可用" not in content for content in rendered)
    assert any("上一轮正常问题" in content for content in rendered)


@pytest.mark.asyncio
async def test_build_conversation_messages_adds_object_explainer_intent_prompt() -> None:
    messages = await build_conversation_messages(
        user_text="请你帮我看一下我手上的物品是什么，请你科普一下",
        vision_summary="画面里是一支白色电动牙刷",
        history_turns=[],
    )

    system_messages = [message for message in messages if isinstance(message, SystemMessage)]

    assert any("物品识别 + 科普介绍" in str(message.content) for message in system_messages)
    assert any("用途、常见场景、关键特点、使用注意点" in str(message.content) for message in system_messages)


@pytest.mark.asyncio
async def test_build_conversation_messages_adds_dialogue_reply_intent_prompt() -> None:
    messages = await build_conversation_messages(
        user_text="我现在要回复，我要怎么回答对方？",
        vision_summary="截图中对方说周五前要确认方案，并询问你是否能按时提交。",
        history_turns=[],
    )

    system_messages = [message for message in messages if isinstance(message, SystemMessage)]

    assert any("提取对话内容，并帮用户组织回复" in str(message.content) for message in system_messages)
    assert any("给出 2-3 个可直接发送的中文回复版本" in str(message.content) for message in system_messages)


@pytest.mark.asyncio
async def test_build_conversation_messages_adds_translation_intent_prompt() -> None:
    messages = await build_conversation_messages(
        user_text="帮我翻译一下这张图里的英文是什么意思",
        vision_summary="画面里有一句英文提示语",
        history_turns=[],
    )

    system_messages = [message for message in messages if isinstance(message, SystemMessage)]

    assert any("识别图片中的文字并翻译" in str(message.content) for message in system_messages)
    assert any("必须先给出忠实翻译" in str(message.content) for message in system_messages)


def test_classify_user_intent_routes_reply_and_translation_to_high_detail() -> None:
    assert classify_user_intent("我要怎么回复对方").vision_detail == "high"
    assert classify_user_intent("帮我翻译一下这张图").vision_detail == "high"
    assert classify_user_intent("帮我看看这个东西并科普").vision_detail == "low"


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
    fake_model = _FakeInvokeModel()
    monkeypatch.setattr(vision_module, "build_chat_model", lambda **_kwargs: fake_model)

    result = await vision_module.vision_adapter.summarize(
        FrameSnapshot(
            session_id="session-test",
            frame_id="frame-1",
            input_source="camera",
            image_base64="ZmFrZQ==",
            width=1280,
            height=720,
            captured_at="2026-06-12T12:00:00Z",
        ),
        intent_route=classify_user_intent("帮我看一下我手上的物品并科普一下"),
    )

    assert result["provider"] == "volcengine"
    assert result["summary"] == "这是一段火山视觉摘要"
    assert fake_model.calls


@pytest.mark.asyncio
async def test_vision_adapter_uses_high_detail_for_reply_intent(monkeypatch) -> None:
    monkeypatch.setattr(settings, "vision_provider", "volcengine")
    fake_model = _FakeInvokeModel()
    monkeypatch.setattr(vision_module, "build_chat_model", lambda **_kwargs: fake_model)

    await vision_module.vision_adapter.summarize(
        FrameSnapshot(
            session_id="session-test",
            frame_id="frame-reply",
            input_source="screen",
            image_base64="ZmFrZQ==",
            width=1440,
            height=900,
            captured_at="2026-06-12T12:00:00Z",
        ),
        intent_route=classify_user_intent("我要怎么回复对方"),
    )

    content = fake_model.calls[0][1].content
    image_part = next(item for item in content if item["type"] == "image_url")
    text_part = next(item for item in content if item["type"] == "text")

    assert image_part["image_url"]["detail"] == "high"
    assert "聊天截图中的文字内容" in text_part["text"]


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
            session_id="session-test",
            frame_id="frame-2",
            input_source="camera",
            image_base64="ZmFrZQ==",
            width=720,
            height=1280,
            captured_at="2026-06-12T12:00:00Z",
        ),
        intent_route=classify_user_intent("帮我翻译一下"),
    )

    assert result["provider"] == "fallback"
    assert "无法可靠提取图片中的精细文字内容" in str(result["summary"])
