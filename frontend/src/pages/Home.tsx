import { ArrowRight, AudioLines, Camera, History, MessageSquareText, Sparkles, Waves } from "lucide-react";
import { Link } from "react-router-dom";

import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const highlights = [
  {
    title: "语音提问",
    description: "打开会话后直接说话，系统会自动判断静音并提交当前一轮输入。",
    icon: AudioLines,
  },
  {
    title: "视觉理解",
    description: "提交语音的同时抓取关键帧，把当前画面纳入同一轮理解上下文。",
    icon: Camera,
  },
  {
    title: "实时回答",
    description: "返回文本后自动播放语音，让整个体验更接近完整的产品交互。",
    icon: MessageSquareText,
  },
];

const sections = [
  { label: "视频语音聊天", description: "进入实时会话页面，直接开始视频与语音聊天。", to: "/workspace", icon: Sparkles },
  { label: "会话记录", description: "后续用于沉淀摘要、关键帧和播放记录。", to: "/history", icon: History },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <main className="mx-auto flex max-w-[1280px] flex-col gap-16 px-6 pb-20 pt-24 sm:pt-32">
        <section className="flex flex-col items-center border-b border-black/8 pb-16 text-center sm:pb-24">
          <h1 className="mt-6 max-w-5xl text-[clamp(3rem,7vw,5.5rem)] font-semibold tracking-tight text-black">
            把语音、视觉和实时回答整合成更像正式产品的体验
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-600 sm:text-lg">
            More See 将实时语音输入、关键帧理解和 AI 回复串成一条完整链路。
            首屏先介绍产品价值，真正的会话能力则收纳到独立工作台中。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link to="/workspace">
                开始视频语音聊天
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/history">查看能力结构</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title}>
                <CardContent className="space-y-5 p-7">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-black/10 bg-black/3 p-3">
                      <Icon className="size-5 text-black" />
                    </div>
                    <p className="text-sm font-medium text-black">{item.title}</p>
                  </div>
                  <p className="text-sm leading-7 text-zinc-600">{item.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Card>
            <CardContent className="space-y-8 p-8 sm:p-10">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">How It Works</p>
                <h2 className="mt-3 text-[clamp(1.8rem,3vw,3rem)] font-semibold tracking-tight text-black">
                  首页负责讲清楚产品，工作台负责承接真实交互
                </h2>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="rounded-[24px] border border-black/10 bg-black/2 p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">01</p>
                  <p className="mt-4 text-sm leading-7 text-zinc-700">先在首页理解产品定位、能力结构和主要使用路径。</p>
                </div>
                <div className="rounded-[24px] border border-black/10 bg-black/2 p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">02</p>
                  <p className="mt-4 text-sm leading-7 text-zinc-700">进入工作台后开启会话，说一句话并让系统自动串联视觉理解。</p>
                </div>
                <div className="rounded-[24px] border border-black/10 bg-black/2 p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">03</p>
                  <p className="mt-4 text-sm leading-7 text-zinc-700">在历史页继续承接记录沉淀，让首页与聊天页保持更纯粹。</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-5 p-8">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-black/10 bg-black/3 p-3">
                  <Waves className="size-5 text-black" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Product Surface</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black">从首页进入各个功能面</h2>
                </div>
              </div>
              <div className="space-y-3">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <Link
                      key={section.label}
                      to={section.to}
                      className="flex items-start gap-4 rounded-[24px] border border-black/10 bg-black/2 px-5 py-5 transition-colors hover:bg-black/4"
                    >
                      <div className="rounded-2xl border border-black/10 bg-white p-3">
                        <Icon className="size-4 text-black" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-black">{section.label}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-600">{section.description}</p>
                      </div>
                      <ArrowRight className="mt-1 size-4 shrink-0 text-zinc-500" />
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
