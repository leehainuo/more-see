import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import type { DisplayMessage } from "@/components/workspace/types";

type ConversationBubbleProps = {
  message: DisplayMessage;
};

export function ConversationBubble({ message }: ConversationBubbleProps) {
  const [entered, setEntered] = useState(false);
  const isUser = message.role === "user";
  const isPendingUser = message.pending === "user-transcribing";
  const isPendingAssistant = message.pending === "assistant-thinking";
  const isPending = Boolean(message.pending);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <article
        className={cn(
          "max-w-[88%] rounded-lg border px-4 py-2.5 sm:max-w-[78%]",
          isUser ? "border-black bg-black text-white" : "border-black/10 bg-white text-zinc-900",
          isUser ? "rounded-br-[3px]" : "rounded-bl-[3px]",
          entered && "chat-bubble-enter",
          (message.streaming || isPendingAssistant) && "ai-thinking-surface",
          isPending && "min-w-[136px]",
        )}
        style={{ transformOrigin: isUser ? "right center" : "left center" }}
      >
        {isPendingUser ? (
          <div className="flex items-center justify-end gap-2 text-white/88">
            <span className="text-sm">正在识别...</span>
            <div className="flex items-center gap-1">
              <span className="typing-dot bg-white/85" />
              <span className="typing-dot bg-white/85 [animation-delay:120ms]" />
              <span className="typing-dot bg-white/85 [animation-delay:240ms]" />
            </div>
          </div>
        ) : null}

        {(message.role === "assistant" && message.streaming) || isPendingAssistant ? (
          <div className="mb-3 flex items-center gap-1.5">
            <span className="ai-thinking-dot" />
            <span className="ai-thinking-dot [animation-delay:120ms]" />
            <span className="ai-thinking-dot [animation-delay:240ms]" />
          </div>
        ) : null}

        {!isPendingUser ? (
          <p className={cn("text-sm leading-7", isUser ? "text-white" : "text-zinc-800")}>{message.content}</p>
        ) : null}

        {(message.role === "assistant" && message.streaming) || isPendingAssistant ? (
          <div className="mt-3 space-y-2">
            <div className="ai-thinking-line w-20" />
            <div className="ai-thinking-line w-28" />
          </div>
        ) : null}
      </article>
    </div>
  );
}
