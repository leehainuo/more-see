from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from app.adapters.langchain_ark import build_chat_model, extract_text_content
from app.core.config import settings
from app.services.intent_service import IntentRoute
from app.state.session_store import FrameSnapshot


def _build_fallback_summary(frame: FrameSnapshot, *, intent_route: IntentRoute) -> str:
    orientation = "横向" if frame.width >= frame.height else "纵向"
    if intent_route.requires_precise_text_extraction:
        return (
            f"当前关键帧来自{frame.input_source}，分辨率约为 {frame.width}x{frame.height}，属于{orientation}画面。"
            "当前视觉模型不可用，因此无法可靠提取图片中的精细文字内容；如需准确回复或翻译，请确保截图清晰完整后重试。"
        )
    return (
        f"当前关键帧来自{frame.input_source}，分辨率约为 {frame.width}x{frame.height}，属于{orientation}画面。"
        "火山视觉模型暂不可用，我先记录了本轮画面输入，但不会对细节做不可靠推断。"
    )


def _build_vision_system_prompt(intent_route: IntentRoute) -> str:
    if intent_route.name == "dialogue_reply":
        return (
            "你是一个视觉 OCR 与对话理解助手。"
            "当前任务是帮助用户从截图/聊天界面中提取关键信息，并保证后续回复建议尽可能准确。"
            "请优先识别可见文字、说话方、对方诉求、时间或约束条件；"
            "不要猜测看不清的文字，不要补全截图里不存在的内容。"
            "输出中文摘要，允许适度详细，优先保留可直接用于回复的原始文本线索。"
        )
    if intent_route.name == "translation":
        return (
            "你是一个视觉 OCR 文字提取助手。"
            "当前任务是为后续翻译提供尽可能准确的原文提取结果。"
            "请优先识别图片中的可见文本，保留原始语言，不要直接翻译；"
            "若有模糊或缺失部分，请明确标注不确定。"
            "输出中文摘要，但必须把提取到的原文内容保留下来。"
        )
    if intent_route.name == "object_explainer":
        return (
            "你是一个视觉理解助手。"
            "请聚焦用户手中或画面主体物品，提取对“识别物品并做科普”最有帮助的信息。"
            "输出简洁中文摘要，控制在120字以内，聚焦物品外观、形态、使用场景和显著特征。"
        )
    return (
        "你是一个视觉理解助手。"
        "请基于用户上传的关键帧输出一段简洁中文摘要，控制在80字以内，"
        "聚焦主体、动作、场景和提问相关的信息。"
    )


def _build_vision_request_text(frame: FrameSnapshot, *, intent_route: IntentRoute) -> str:
    base = f"这是来自 {frame.input_source} 的关键帧，分辨率为 {frame.width}x{frame.height}。"
    if intent_route.name == "dialogue_reply":
        return (
            f"{base} 请优先提取聊天截图中的文字内容、对方诉求、时间要求、待回复点。"
            "输出格式建议为：可见对话 / 对方诉求 / 需要谨慎确认的信息。"
        )
    if intent_route.name == "translation":
        return (
            f"{base} 请优先提取图片中的原文文字，判断语言，并指出看不清或不确定的部分。"
            "输出格式建议为：原文提取 / 语言判断 / 上下文场景。"
        )
    if intent_route.name == "object_explainer":
        return f"{base} 请输出对识别物品和后续科普最有帮助的视觉摘要。"
    return f"{base} 请输出本轮视觉摘要。"


class VisionAdapter:
    async def summarize(self, frame: FrameSnapshot, *, intent_route: IntentRoute) -> dict[str, str | bool]:
        if settings.vision_provider == "volcengine":
            try:
                image_url = f"data:image/jpeg;base64,{frame.image_base64}"
                chat_model = build_chat_model(model=settings.ark_vision_model, temperature=0.2)
                response = await chat_model.ainvoke(
                    [
                        SystemMessage(
                            content=_build_vision_system_prompt(intent_route)
                        ),
                        HumanMessage(
                            content=[
                                {
                                    "type": "text",
                                    "text": _build_vision_request_text(frame, intent_route=intent_route),
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": image_url,
                                        "detail": intent_route.vision_detail,
                                    },
                                },
                            ]
                        ),
                    ]
                )
                summary = extract_text_content(response.content).strip()
                if summary:
                    return {
                        "summary": summary,
                        "provider": "volcengine",
                        "cacheHit": False,
                    }
            except Exception:
                pass

        return {
            "summary": _build_fallback_summary(frame, intent_route=intent_route),
            "provider": "fallback",
            "cacheHit": False,
        }


vision_adapter = VisionAdapter()
