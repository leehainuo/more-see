import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export default function History() {
  return (
    <AppShell eyebrow="Conversation Memory" title="会话记录" narrow>
      <main className="grid gap-6">
        <Card>
          <CardContent className="space-y-3 p-7">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">阶段预留</p>
            <h2 className="font-['Oswald','Noto_Sans_SC',sans-serif] text-[clamp(1.4rem,2.6vw,2rem)] tracking-[0.08em]">
              轮次摘要、关键帧回放、调用成本明细
            </h2>
            <p className="text-sm text-slate-400">
              后续将把每轮语音文本、视觉摘要、模型回复和费用拆解集中展示在此页面。
            </p>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
