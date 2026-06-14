# More See

More See 是一款面向演示、面试和多模态交互场景的 **Web 端 AI 视觉对话助手**。它可以在浏览器中打开 **摄像头 / 屏幕共享 + 麦克风**，把用户语音与当前画面一起送入 AI 理解链路，并返回 **流式文本 + 流式语音** 回复，帮助用户完成“看见现实世界或数字世界，并能自然对话”的完整体验。

![More See 产品首页](docs/images/%E4%BA%A7%E5%93%81%E9%A6%96%E9%A1%B5.png)

## 视频与文档

### - Demo 视频：[Bilibili 演示视频](https://www.bilibili.com/video/BV1smJA6iEbJ/)

### - 设计文档：[详情入口](docs/ai-visual-dialog-design.md)

### - 技术架构文档：[详情入口](.trae/documents/technical-architecture-ai-visual-dialog-assistant.md)

## 题目对应

题目一：AI 视觉对话助手

原题如下：

> 请开发一款与 AI 对话的应用。要求：打开摄像头与麦克风，让 AI 能够看到摄像头中的视频内容、听到用户说的话，并给予恰当的回应。需综合考虑视觉内容的理解准确性、语音交互的自然度与流畅性，以及端云协同的成本控制策略等。实现应用的同时，请额外提交一份设计文档，内容包含：1）你计划实现哪些用户故事，最终实现了哪些 2）你想到了哪些控制运营成本的技巧，实际采用了哪些。

本项目对应实现如下：

- **基础要求对应**：支持在浏览器中打开麦克风、摄像头与屏幕共享，让 AI 同时获取语音和视觉输入
- **交互体验对应**：支持流式 ASR、流式 LLM 回复、流式 TTS 播报以及用户打断继续说话
- **视觉理解对应**：支持关键帧抓取、视觉摘要、多轮上下文拼装与当前画面问答
- **成本控制对应**：已实现音频静音裁剪、关键帧相似复用、视觉摘要缓存、视觉超时降级
- **文档交付对应**：已提供独立设计文档，明确“计划实现/最终实现的用户故事”和“成本控制技巧：想到的 vs 实际采用的”

## 项目定位

- 面向需要展示多模态能力的 Web 产品、面试作品和 demo 项目
- 不是纯聊天机器人，而是“语音 + 视觉 + 流式反馈”的完整交互闭环
- 强调端云协同成本控制，而不是把连续视频和全量音频无脑上云
- 在保证体验自然的前提下，尽可能压低 ASR、视觉理解与上下文成本

## 核心亮点

- **完整多模态主链路**
  从浏览器采集音频与关键帧，经 WebSocket 送入后端，再接火山 ASR、视觉模型、LLM 与 TTS，形成可直接演示的端到端闭环。
- **屏幕共享 + 摄像头双视觉**
  不仅能看现实物体，也能看屏幕内容；开启屏幕共享时保留摄像头小窗，表达“人 + 屏幕”双视觉状态。
- **流式文本 + 流式语音**
  AI 回复不是整段等待后一次性返回，而是边生成边显示、边播报，更接近真实实时助手。
- **端云协同成本控制**
  端侧做音频静音裁剪与关键帧相似复用，服务端做视觉摘要缓存与超时降级，把“低成本”真正落到工程实现。
- **打断与继续对话**
  AI 播报期间，用户可直接开口打断，让对话更自然，也更适合现场演示。
- **成本可解释**
  提供独立成本面板，按 session 展示 ASR、TTS、视觉调用与预估费用，便于评审理解优化策略不是口头描述。

## 核心能力

### 1. 语音输入

- 支持浏览器麦克风采集
- 支持 16k PCM 下采样与 WebSocket 音频分片上送
- 支持静音自动提交当前轮次
- 支持 AI 播报期间的 barge-in 打断探测

### 2. 视觉输入

- 支持摄像头预览
- 支持屏幕共享输入
- 支持关键帧抓取与上传
- 支持相似关键帧复用，避免重复视觉调用

### 3. AI 理解与回复

- 支持火山流式 ASR 识别
- 支持火山视觉模型生成关键帧摘要
- 支持 LLM 多模态上下文编排与流式回复
- 支持火山流式 TTS 播报

### 4. 会话与展示

- 支持会话开始、断开、恢复
- 支持工作台流式消息展示
- 支持历史会话与成本面板
- 支持 provider health 自检与降级提示

## 成本控制策略

项目已实际采用以下策略：

- **音频静音裁剪**
  端侧只在有效语音与短尾静音窗口内继续发送 chunk，减少无效静音带来的 ASR 成本。
- **关键帧相似复用**
  对关键帧计算差分指纹，相似画面不重复上传，直接复用上一轮视觉摘要。
- **服务端视觉摘要缓存**
  对重复图像内容直接命中缓存，减少视觉模型重复推理。
- **ASR 与视觉并行 + 视觉超时降级**
  保证主链路低延迟，避免视觉模型拖慢整轮体验。
- **最小上下文窗口**
  仅保留最近必要轮次，避免无上限增长的上下文成本。

详细说明见 [docs/ai-visual-dialog-design.md](docs/ai-visual-dialog-design.md)。

## 技术栈

- 后端：`FastAPI`、`WebSocket`、`LangChain`、`LangGraph`
- 前端：`React`、`TypeScript`、`Vite`、`Tailwind CSS`、`shadcn/ui`
- 语音与多模态能力：`Volcengine ASR / Vision / LLM / TTS`
- Python 管理：`uv`

## 项目结构

```text
more-see/
├── app/                      # FastAPI 应用、会话编排、模型适配
├── docs/                     # 对外提交文档、设计文档、Demo 台词稿
├── frontend/                 # React + Vite 工作台前端
└── tests/                    # 后端测试
```

## 快速开始

### 1. 安装后端依赖

```bash
uv sync
```

### 2. 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

### 3. 启动后端

```bash
uv run uvicorn app.main:app --reload
```

### 4. 启动前端

```bash
cd frontend
npm run dev
```

### 5. 打开页面

- 前端地址：<http://127.0.0.1:5173>

## Docker Compose 启动

### 1. 一键部署

```bash
./scripts/docker/start.sh
```

脚本会自动完成以下工作：

- 检查 Docker 与 Docker daemon 是否可用
- 自动创建 `scripts/docker/data/postgres/pgdata` 和 `scripts/docker/data/redis`
- 若 `scripts/docker/.env` 不存在，则基于根目录 `.env.example` 自动生成
- 执行 `docker compose -f scripts/docker/docker-compose.yml up --build -d`

### 2. 首次启动后的环境变量

首次执行后，如需接入真实火山 / 方舟能力，请编辑 `scripts/docker/.env`，补齐模型密钥与相关配置，然后重新执行：

```bash
./scripts/docker/start.sh
```

启动后默认可访问：

- 前端地址：<http://127.0.0.1:8080>
- 后端健康检查：<http://127.0.0.1:8000/healthz>

### 3. 常用容器命令

```bash
./scripts/docker/stop.sh
./scripts/docker/start.sh
docker compose -f scripts/docker/docker-compose.yml logs -f
```

## 常用命令

```bash
uv run pytest
uv run ruff check .
cd frontend && npm run typecheck
cd frontend && npm run lint
```

## 自检接口

- `GET /healthz`：基础存活检查
- `GET /healthz/providers`：配置级能力自检，不触发真实模型请求
- `GET /healthz/providers?probe=true`：真实连通性探测，用于排查 `ASR / TTS / LLM / Vision`

## 环境变量

本地开发可复制 `.env.example` 为根目录 `.env`；
Docker Compose 启动时则使用 `scripts/docker/.env`。

- `ASR_PROVIDER=volcengine`
- `VISION_PROVIDER=volcengine`
- `LLM_PROVIDER=volcengine`
- `TTS_PROVIDER=volcengine`
- `VOLCENGINE_SPEECH_API_KEY`
- `VOLCENGINE_TTS_RESOURCE_ID / VOLCENGINE_TTS_SPEAKER`
- `VOLCENGINE_ASR_RESOURCE_ID / VOLCENGINE_ASR_LANGUAGE`
- `VOLCENGINE_SSL_CERT_FILE`
- `ARK_API_KEY`
- `ARK_LLM_MODEL / ARK_VISION_MODEL`

若本地未配置火山密钥，后端会进入降级处理，返回保守文本回复、基础画面说明或兜底 transcript。

## 成本面板

- 前端入口：`/costs`
- 权限规则：`users.is_super = 1` 才能访问
- 后端接口：`GET /api/admin/costs/sessions`
- 计费口径：按火山官方文档后付费单价做预估，可通过环境变量调整单价
