import { ArrowRight, Camera} from "lucide-react";
import { Link } from "react-router-dom";

import BlurText from "@/components/BlurText";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const heroWaveHeights = [16, 26, 38, 54, 42, 24, 34, 58, 46, 28, 40, 50, 32, 22, 36, 30, 20];
const heroWaveDurations = [4.8, 5.6, 4.2, 6.1, 4.7, 5.9, 4.5, 6.4, 4.9, 5.3, 4.4, 6.2, 5.1, 5.8, 4.6, 6.0, 4.3];
const heroWaveBurstScales = [1.18, 1.36, 1.24, 1.62, 1.42, 1.2, 1.34, 1.68, 1.48, 1.22, 1.38, 1.54, 1.3, 1.16, 1.32, 1.26, 1.14];
const featureColumns = [
  {
    waveCount: 1,
    title: "实时多模态会话",
    description: "不是单次截图问答，而是持续采集、持续理解、持续返回的完整对话闭环。",
  },
  {
    waveCount: 2,
    title: "双视觉输入能力",
    description: "既能看摄像头里的现实世界，也能看屏幕共享中的页面与代码，适合演示和讲解。",
  },
  {
    waveCount: 3,
    title: "自然语音交互",
    description: "支持边生成边播报、边听边打断，让语音对话更接近真实助手，而不是按钮式工具。",
  },
];

export default function Home() {
  return (
    <div className="homepage-shell min-h-screen overflow-x-hidden bg-background text-foreground">
      <TopNav />

      <main className="relative mx-auto flex max-w-[1360px] flex-col px-5 pb-20 pt-18 sm:px-6 sm:pt-20 lg:px-10 lg:pt-20">
        <section className="relative flex min-h-[520px] w-full max-w-5xl self-center items-start justify-center py-4 sm:min-h-[560px] sm:py-6 lg:min-h-[600px] lg:py-8">
          <div className="homepage-grid-mask" />
          <div className="relative mx-auto mt-8 flex max-w-5xl flex-col items-center text-center sm:mt-10 lg:mt-12">
            <BlurText
              animateBy="letters"
              className="homepage-rounded-brand max-w-5xl justify-center text-[clamp(3.25rem,8vw,6.8rem)] font-semibold leading-[0.9] tracking-[-0.07em] text-zinc-950"
              delay={90}
              direction="top"
              stepDuration={0.38}
              text="More See"
            />

            <div className="homepage-fade-in-up-delay mt-8 flex h-20 w-full max-w-[460px] items-center justify-center gap-2.5">
              {heroWaveHeights.map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  className="homepage-hero-wave-bar"
                  style={{
                    height: `${height}px`,
                    animationDelay: `${(index % 6) * 120}ms`,
                    animationDuration: `${heroWaveDurations[index]}s`,
                    ["--wave-rest-scale" as string]: "0.18",
                    ["--wave-burst-scale" as string]: `${heroWaveBurstScales[index]}`,
                  }}
                />
              ))}
            </div>

            <p className="homepage-fade-in-up-delay-2 mt-8 max-w-2xl text-center text-sm leading-7 text-zinc-500 sm:text-base">
              More See 把实时语音输入、关键帧理解和 AI 回复收敛成一条完整链路。
            </p>

            <div className="homepage-fade-in-up-delay-3 mt-10 flex flex-wrap items-center justify-center gap-10">
              <Button asChild size="lg" className="h-14 rounded-lg bg-zinc-950 px-10 text-base text-white transition-transform duration-300 hover:-translate-y-0.5">
                <Link to="/workspace">
                  即可前往
                  <ArrowRight className="ml-3 size-5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="h-14 rounded-lg border border-black/12 bg-white px-10 text-base text-zinc-950 transition-transform duration-300 hover:-translate-y-0.5"
              >
                <Link to="/history">查看记录</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="homepage-geometry-section homepage-fade-in-up-delay w-full max-w-5xl self-center pt-4">
          <div className="homepage-geometry-cell homepage-chat-scene-cell">

            <div className="homepage-chat-scene">
              <div className="homepage-scene-vision-card" aria-hidden="true">
                <div className="homepage-scene-vision-frame floating-panel-enter">
                  <div className="homepage-scene-vision-surface">
                    <div className="homepage-scene-vision-badge">CAMERA</div>
                    <div className="homepage-scene-vision-overlay">
                      <Camera className="size-4 text-white/66" />
                    </div>
                    <div className="homepage-scene-vision-grid" />
                    <div className="homepage-scene-vision-beam" />
                  </div>
                </div>
              </div>

              <div className="homepage-scene-row homepage-scene-row-user homepage-scene-msg-1">
                <article
                  className={cn(
                    "max-w-[88%] rounded-lg border border-black bg-black px-4 py-2.5 text-white sm:max-w-[78%]",
                    "rounded-br-[3px] chat-bubble-enter",
                  )}
                  style={{ transformOrigin: "right center" }}
                >
                  <p className="text-sm leading-7 text-white">帮我看一下我现在展示的内容。</p>
                </article>
              </div>

              <div className="homepage-scene-row homepage-scene-row-ai homepage-scene-msg-2">
                <article
                  className={cn(
                    "max-w-[88%] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-zinc-900 sm:max-w-[78%]",
                    "rounded-bl-[3px] ai-thinking-surface chat-bubble-enter min-w-[136px]",
                  )}
                  style={{ transformOrigin: "left center" }}
                >
                  <div className="homepage-scene-loading-state">
                    <p className="homepage-scene-loading-label">正在生成中...</p>
                    <div className="mb-3 flex items-center gap-1.5">
                      <span className="ai-thinking-dot" />
                      <span className="ai-thinking-dot [animation-delay:120ms]" />
                      <span className="ai-thinking-dot [animation-delay:240ms]" />
                    </div>
                    <div className="space-y-2">
                      <div className="ai-thinking-line w-20" />
                      <div className="ai-thinking-line w-28" />
                    </div>
                  </div>
                </article>
              </div>

              <div className="homepage-scene-row homepage-scene-row-ai homepage-scene-msg-2-interrupted">
                <article
                  className={cn(
                    "max-w-[88%] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-zinc-900 sm:max-w-[78%]",
                    "rounded-bl-[3px] chat-bubble-enter min-w-[136px]",
                  )}
                  style={{ transformOrigin: "left center" }}
                >
                  <span className="homepage-scene-interrupt-flag-static">响应中断</span>
                </article>
              </div>

              <div className="homepage-scene-row homepage-scene-row-user homepage-scene-msg-3">
                <article
                  className={cn(
                    "max-w-[88%] rounded-lg border border-black bg-black px-4 py-2.5 text-white sm:max-w-[78%]",
                    "rounded-br-[3px] chat-bubble-enter",
                  )}
                  style={{ transformOrigin: "right center" }}
                >
                  <p className="text-sm leading-7 text-white">等一下，你直接用一句话告诉我重点。</p>
                </article>
              </div>

              <div className="homepage-scene-row homepage-scene-row-ai homepage-scene-msg-4">
                <article
                  className={cn(
                    "max-w-[88%] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-zinc-900 sm:max-w-[78%]",
                    "rounded-bl-[3px] ai-thinking-surface chat-bubble-enter min-w-[136px]",
                  )}
                  style={{ transformOrigin: "left center" }}
                >
                  <div className="homepage-scene-loading-state">
                    <p className="homepage-scene-loading-label">正在生成中...</p>
                    <div className="mb-3 flex items-center gap-1.5">
                      <span className="ai-thinking-dot" />
                      <span className="ai-thinking-dot [animation-delay:120ms]" />
                      <span className="ai-thinking-dot [animation-delay:240ms]" />
                    </div>
                    <div className="space-y-2">
                      <div className="ai-thinking-line w-20" />
                      <div className="ai-thinking-line w-28" />
                    </div>
                  </div>
                </article>
              </div>

              <div className="homepage-scene-row homepage-scene-row-ai homepage-scene-msg-4-final">
                <article
                  className={cn(
                    "max-w-[88%] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-zinc-900 sm:max-w-[78%]",
                    "rounded-bl-[3px] chat-bubble-enter",
                  )}
                  style={{ transformOrigin: "left center" }}
                >
                  <p className="text-sm leading-7 text-zinc-800">
                    当前画面重点已经识别完成，我会直接返回结论。
                  </p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="homepage-geometry-section homepage-fade-in-up-delay-2 grid w-full max-w-5xl self-center pb-6 lg:grid-cols-3">
          {featureColumns.map((item) => (
            <div key={item.title} className="homepage-geometry-cell">
              <div className="homepage-step-wave" aria-hidden="true">
                {Array.from({ length: item.waveCount }).map((_, index) => (
                  <span
                    key={`${item.title}-wave-${index}`}
                    className="homepage-step-wave-bar"
                    style={{
                      height: `${16 + index * 6}px`,
                      animationDelay: `${index * 180}ms`,
                      animationDuration: `${4.8 + index * 0.45}s`,
                      ["--wave-rest-scale" as string]: "0.28",
                      ["--wave-burst-scale" as string]: `${1.1 + index * 0.18}`,
                    }}
                  />
                ))}
              </div>
              <h2 className="mt-6 text-[clamp(1.2rem,1.8vw,1.75rem)] font-semibold tracking-tight text-zinc-950">
                {item.title}
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-zinc-500 sm:text-base">{item.description}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
