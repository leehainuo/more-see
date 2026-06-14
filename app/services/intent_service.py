from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


IntentName = Literal["general_assistant", "object_explainer", "dialogue_reply", "translation"]
VisionDetail = Literal["low", "high"]


@dataclass(frozen=True)
class IntentRoute:
    name: IntentName
    vision_detail: VisionDetail
    vision_profile: str
    requires_precise_text_extraction: bool
    system_instruction: str | None = None


def _normalize_text(text: str) -> str:
    return text.lower().replace(" ", "")


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _count_matches(text: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for keyword in keywords if keyword in text)


_GENERAL_ROUTE = IntentRoute(
    name="general_assistant",
    vision_detail="low",
    vision_profile="general",
    requires_precise_text_extraction=False,
    system_instruction=None,
)

_OBJECT_EXPLAINER_ROUTE = IntentRoute(
    name="object_explainer",
    vision_detail="low",
    vision_profile="object_explainer",
    requires_precise_text_extraction=False,
    system_instruction=(
        "当前用户意图偏向“物品识别 + 科普介绍”。"
        "请先根据本轮视觉摘要判断用户手上/画面中的物品可能是什么；"
        "若判断有不确定性，要明确说“可能是/更像是”，不要编造品牌、型号或材质细节。"
        "如果能识别，请按这个顺序组织回答："
        "1. 先用一句话说这可能是什么；"
        "2. 再用 3-5 个简短分点做科普，优先讲用途、常见场景、关键特点、使用注意点；"
        "3. 若适合，再补一句有记忆点的小知识。"
        "不要只给一句泛泛定义，要体现“介绍信息更详细、适合科普”。"
    ),
)

_DIALOGUE_REPLY_ROUTE = IntentRoute(
    name="dialogue_reply",
    vision_detail="high",
    vision_profile="dialogue_reply",
    requires_precise_text_extraction=True,
    system_instruction=(
        "当前用户意图偏向“从图片/截图中提取对话内容，并帮用户组织回复”。"
        "请优先把本轮视觉摘要里能识别出的聊天信息、文案信息、对方诉求提炼出来，"
        "先用 1-3 句总结“对方在说什么、希望用户怎么回应”；"
        "然后给出 2-3 个可直接发送的中文回复版本，分别体现简短自然、礼貌稳妥、详细解释等不同风格。"
        "如果视觉摘要里没有足够的对话内容，请明确说明“当前截图中的文字信息不足以可靠提取”，"
        "并请用户把聊天区域截完整、拍清楚或贴出对话文本。"
        "不要把不存在于视觉摘要中的聊天细节当成事实。"
    ),
)

_TRANSLATION_ROUTE = IntentRoute(
    name="translation",
    vision_detail="high",
    vision_profile="translation",
    requires_precise_text_extraction=True,
    system_instruction=(
        "当前用户意图偏向“识别图片中的文字并翻译”。"
        "请优先基于视觉摘要提取原文，不要跳过原文直接自由发挥。"
        "回答时先简要说明识别到的原文语言与上下文，再给出准确、自然的中文翻译；"
        "若用户明确要求翻成英文、日文等其他语言，则按用户要求输出目标语言。"
        "如果图片中的文字不完整、模糊或存在歧义，请明确指出不确定部分，不要强行编造。"
        "若适合，可补充 1 个更自然的意译版本，但必须先给出忠实翻译。"
    ),
)


def classify_user_intent(user_text: str) -> IntentRoute:
    normalized = _normalize_text(user_text)

    translation_keywords = (
        "翻译",
        "译一下",
        "译成",
        "什么意思",
        "看不懂",
        "帮我翻成",
        "帮我翻译",
        "翻成中文",
        "翻成英文",
        "翻成日文",
        "翻成韩文",
        "翻译一下",
    )
    if _count_matches(normalized, translation_keywords) >= 1:
        return _TRANSLATION_ROUTE

    reply_keywords = (
        "我要回复",
        "我要怎么回答对方",
        "我要怎么回复对方",
        "怎么回答对方",
        "怎么回复对方",
        "怎么回对方",
        "怎么回消息",
        "帮我回复",
        "帮我回",
        "替我回复",
        "回复他",
        "回复她",
        "回他什么",
        "回她什么",
    )
    if _count_matches(normalized, reply_keywords) >= 1:
        return _DIALOGUE_REPLY_ROUTE

    object_reference_keywords = (
        "我手上的",
        "我手里",
        "手上拿的",
        "手里拿的",
        "这个物品",
        "这个东西",
        "这是什么",
        "这玩意",
        "这个玩意",
        "帮我看一下",
    )
    explainer_keywords = (
        "科普",
        "详细讲",
        "详细说",
        "详细介绍",
        "介绍一下",
        "讲一下",
        "是什么",
        "做什么用",
        "有什么用",
        "原理",
        "用途",
    )
    if _contains_any(normalized, object_reference_keywords) and _contains_any(normalized, explainer_keywords):
        return _OBJECT_EXPLAINER_ROUTE

    return _GENERAL_ROUTE

