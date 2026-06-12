import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export default function History() {
  return (
    <AppShell eyebrow="Conversation Memory" title="会话记录" narrow>
      <main className="grid gap-6">
        <Card>
          <CardContent className="space-y-6 p-7">
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Timeline</p>
              <h2 className="text-[clamp(1.6rem,2.8vw,2.4rem)] font-semibold tracking-tight text-black">
                这里会成为更像产品的会话回放页
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-zinc-600">
                后续会把每轮语音文本、关键帧摘要、AI 回答和播放状态组织成便于回看的时间线卡片。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-black/10 bg-black/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Summary</p>
                <p className="mt-3 text-sm leading-6 text-zinc-700">每轮问题、视觉摘要与最终回答会被折叠成摘要卡片。</p>
              </div>
              <div className="rounded-[24px] border border-black/10 bg-black/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Playback</p>
                <p className="mt-3 text-sm leading-6 text-zinc-700">会补上关键帧缩略图和语音播报状态，便于演示回放。</p>
              </div>
              <div className="rounded-[24px] border border-black/10 bg-black/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Costs</p>
                <p className="mt-3 text-sm leading-6 text-zinc-700">后续如果接入成本统计，这里可以承接每轮消耗拆解。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
