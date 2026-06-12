import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";

const rows = [
  { label: "ASR 供应商", value: "待接入" },
  { label: "视觉模型", value: "待接入" },
  { label: "流式 TTS", value: "浏览器内置" },
];

export default function Settings() {
  return (
    <AppShell eyebrow="System Setup" title="设置" narrow>
      <main className="grid gap-6">
        <Card>
          <CardContent className="space-y-4 p-7">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">模型与设备</p>
              <h2 className="font-['Oswald','Noto_Sans_SC',sans-serif] text-[clamp(1.4rem,2.6vw,2rem)] tracking-[0.08em]">
                后续将在这里配置 API Key、输入设备和调试开关
              </h2>
            </div>

            <div className="grid gap-3">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"
                >
                  <span className="text-sm text-slate-400">{row.label}</span>
                  <strong className="text-sm text-slate-100">{row.value}</strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
