import pytest


@pytest.mark.asyncio
async def test_vision_summary_cache_hit(monkeypatch):
    import app.services.vision_service as vision_service_module
    from app.services.vision_service import VisionService
    from app.state.session_store import FrameSnapshot

    call_count = {"count": 0}

    async def fake_summarize(frame):
        call_count["count"] += 1
        return {
            "summary": "测试摘要",
            "provider": "volcengine",
            "cacheHit": False,
        }

    def noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(vision_service_module.vision_adapter, "summarize", fake_summarize)
    monkeypatch.setattr(vision_service_module.persistence_service, "record_frame_summary", noop)

    service = VisionService()

    frame_1 = FrameSnapshot(
        session_id="s1",
        frame_id="f1",
        input_source="camera",
        image_base64="same-image",
        width=1280,
        height=720,
        captured_at="2026-01-01T00:00:00Z",
    )
    result_1 = await service._summarize_frame(frame_1)

    frame_2 = FrameSnapshot(
        session_id="s1",
        frame_id="f2",
        input_source="camera",
        image_base64="same-image",
        width=1280,
        height=720,
        captured_at="2026-01-01T00:00:01Z",
    )
    result_2 = await service._summarize_frame(frame_2)

    assert call_count["count"] == 1
    assert result_1["cacheHit"] is False
    assert result_2["cacheHit"] is True
