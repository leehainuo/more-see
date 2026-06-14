import type * as React from "react";

import { ConversationBubble } from "@/components/workspace/ConversationBubble";
import type { DisplayMessage } from "@/components/workspace/types";

type WorkspaceConversationListProps = {
  messages: DisplayMessage[];
  bottomAnchorRef: React.RefObject<HTMLDivElement | null>;
  bottomSpacerHeight: number;
};

export function WorkspaceConversationList({
  messages,
  bottomAnchorRef,
  bottomSpacerHeight,
}: WorkspaceConversationListProps) {
  return (
    <main className="mx-auto w-full max-w-5xl">
      <section className="min-w-0">
        <div className="flex min-h-[720px] flex-col">
          <div className="flex-1 px-4 py-5 sm:px-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col space-y-6">
              {messages.map((message) => (
                <ConversationBubble key={message.id} message={message} />
              ))}
              <div ref={bottomAnchorRef} style={{ height: `${bottomSpacerHeight}px` }} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
