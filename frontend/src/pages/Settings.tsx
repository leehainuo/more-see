import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";

const rows = [
  { label: "ASR 供应商", value: "Volcengine" },
  { label: "视觉模型", value: "Ark 多模态" },
  { label: "流式 TTS", value: "Volcengine WebSocket" },
];

export default function Settings() {
  return (
    <AppShell eyebrow="System Setup" title="设置" narrow>
      <main className="grid gap-6">
        <Card>
          <CardContent className="space-y-6 p-7">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Models & Devices</p>
              <h2 className="text-[clamp(1.6rem,2.8vw,2.4rem)] font-semibold tracking-tight text-black">
                当前配置页先展示产品级信息结构
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-zinc-600">
                下一步可以把 API Key 检查、输入设备选择、语音播报偏好和视觉策略都收进这里，让首页保持更干净。
              </p>
            </div>

            <div className="grid gap-3">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-[24px] border border-black/10 bg-black/[0.02] px-4 py-4"
                >
                  <span className="text-sm text-zinc-600">{row.label}</span>
                  <strong className="text-sm text-black">{row.value}</strong>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-black/10 bg-black/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Input Preferences</p>
                <p className="mt-3 text-sm leading-6 text-zinc-700">后续可在这里切换麦克风、摄像头和屏幕共享策略。</p>
              </div>
              <div className="rounded-[24px] border border-black/10 bg-black/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Voice Output</p>
                <p className="mt-3 text-sm leading-6 text-zinc-700">后续可补充播报音色、自动播放、句级中断等偏好设置。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
