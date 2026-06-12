## 1. 执行目标
本计划面向一个两天内可完成 MVP、可在面试现场直接演示的 Web 多模态产品。执行优先级遵循以下原则：
- 优先打通主链路：`采集 -> 上传 -> 理解 -> 回复 -> 朗读 -> 展示`
- 优先保障可演示性：先做到“能看、能听、能答”，再提升“更美、更顺、更省”
- 优先降低工程复杂度：MVP 不上数据库、不做账号体系、不做离线能力
- 优先稳定云端调用：所有智能能力放在后端统一编排，前端只承担采集和展示

## 2. 最终技术选型方案
### 2.1 总体方案
- 客户端：`React + TypeScript + Vite + Tailwind CSS + shadcn/ui`
- 服务端：`Python 3.12 + FastAPI + WebSocket`
- Python 管理：`uv`
- 语音识别：阿里云或百度短语音识别，统一通过后端适配层接入
- 视觉理解：通义千问视觉模型
- 对话模型：DeepSeek 或通义千问文本模型，使用流式响应
- 语音合成：浏览器 `SpeechSynthesis` 为主，云端 TTS 暂不进入 MVP
- 存储：MVP 内存态会话；如需要复盘记录，先追加文件日志，再考虑数据库

### 2.2 为什么此时不引入更重方案
- 不选 `PyQt`：会增加打包、录屏权限、跨平台兼容与演示门槛
- 不选 `WebRTC`：当前只需要关键帧与分段音频，不需要完整实时媒体通道
- 不选数据库：两天 MVP 不需要复杂持久化，先避免 schema 设计与查询复杂度
- 选用 `React + shadcn/ui`：当前已明确需要更好的组件复用、页面扩展性和状态管理承载能力

## 3. 推荐目录结构
```text
more-see/
├── .env.example
├── .gitignore
├── README.md
├── pyproject.toml
├── uv.lock
├── .trae/
│   └── documents/
│       ├── prd-ai-visual-dialog-assistant.md
│       ├── technical-architecture-ai-visual-dialog-assistant.md
│       └── execution-plan-ai-visual-dialog-assistant.md
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── http.py
│   │   └── ws.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── events.py
│   │   └── session.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── session_service.py
│   │   ├── audio_service.py
│   │   ├── frame_service.py
│   │   ├── conversation_service.py
│   │   ├── cost_service.py
│   │   └── tts_service.py
│   ├── adapters/
│   │   ├── __init__.py
│   │   ├── asr_adapter.py
│   │   ├── vision_adapter.py
│   │   └── llm_adapter.py
│   ├── state/
│   │   ├── __init__.py
│   │   └── session_store.py
│   └── utils/
│       ├── __init__.py
│       ├── images.py
│       └── logging.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   └── AppShell.tsx
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── components.json
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
├── tests/
│   ├── __init__.py
│   ├── test_health.py
│   ├── test_ws_session.py
│   ├── test_cost_service.py
│   └── test_cache_strategy.py
└── scripts/
    ├── dev.sh
    └── smoke_test.py
```

## 4. `uv` 管理方案
### 4.1 初始化步骤
建议在项目根目录直接使用 `uv` 管理 Python 和依赖。

```bash
uv python install 3.12
uv venv --python 3.12
source .venv/bin/activate
uv init --app --python 3.12
uv add fastapi uvicorn[standard] httpx pydantic-settings python-multipart
uv add --dev pytest pytest-asyncio ruff
```

### 4.2 运行方式
```bash
uv run uvicorn app.main:app --reload
uv run pytest
uv run ruff check .
```

### 4.3 依赖策略
- 运行时依赖尽量控制在 `FastAPI + Uvicorn + httpx + pydantic-settings`
- 图像与音频尽量沿用浏览器原生能力，减少 Python 端转码依赖
- 测试和质量工具仅保留 `pytest` 与 `ruff`，避免工具栈膨胀

## 5. 分阶段执行计划
### 阶段 0：项目初始化与骨架搭建
目标：建立最小可运行项目骨架，确保任何人拉代码后可一条命令启动。

本阶段任务：
- 初始化 `uv`、`pyproject.toml`、`.env.example`、`.gitignore`
- 创建 `FastAPI` 应用入口与 `healthz` 路由
- 创建 `frontend/` React 基础页，先显示黑白工作台骨架
- 配置 Vite 代理后端 `healthz`、`api` 与 `ws`
- 写明 `README` 的启动方式、环境变量和开发说明

验收标准：
- `uv run uvicorn app.main:app --reload` 可启动成功
- 打开 React 首页可以看到基础工作台框架
- `GET /healthz` 返回健康状态

建议分支名：
- `feat/bootstrap-uv-fastapi`

建议提交信息：
- `chore: bootstrap project with uv fastapi react and shadcn shell`
- `docs: add setup instructions and env example`

### 阶段 1：WebSocket 会话主链路
目标：建立前后端实时事件通道，为语音、关键帧、流式文本统一通信打底。

本阶段任务：
- 定义前后端事件协议，包含 `session.start`、`audio.chunk`、`frame.capture`、`turn.commit`
- 后端实现 `/ws/session`，支持连接、心跳、异常关闭和错误回传
- 前端实现 React WebSocket 客户端模块，统一发送和接收事件
- 对话区先接入假数据流，模拟 AI 一字一字输出

验收标准：
- 浏览器进入页面后可成功建立 WebSocket
- 用户点击“开始会话”后可创建 `sessionId`
- 后端可以把模拟流式文本推回前端并渲染

建议分支名：
- `feat/ws-session-lifecycle`

建议提交信息：
- `feat: add websocket session lifecycle and event schema`
- `feat: render mock streaming reply in chat panel`

### 阶段 2：音频采集、静音检测与 ASR
目标：让用户说一句话后，系统自动结束录音并识别出文本。

本阶段任务：
- 前端接入 `getUserMedia` 和 `MediaRecorder`
- 编写简单 VAD 或能量阈值检测逻辑，静默 `1.5s` 自动提交
- 将音频切片经 WebSocket 发送到后端
- 后端适配阿里云或百度 ASR，并回传识别文本
- 前端将识别结果作为用户消息插入对话区

验收标准：
- 用户说话后可自动停止录音
- 对话区出现识别后的用户文本
- 出错时页面给出明确反馈，不中断整个会话

建议分支名：
- `feat/audio-vad-asr`

建议提交信息：
- `feat: add microphone capture and silence based auto commit`
- `feat: integrate asr adapter and transcript event flow`

### 阶段 3：关键帧抓取与视觉理解
目标：在用户说话结束时自动抓图，让 AI 知道“此刻看到了什么”。

本阶段任务：
- 前端接入摄像头预览并支持从 `video` 抓取 JPEG 关键帧
- 用户结束发言时自动发送 `frame.capture`
- 后端接入视觉模型并返回视觉摘要与可选热区信息
- 增加静止画面缓存与简单帧差去重，减少重复调用成本
- 对相同会话轮次串联 ASR 结果和视觉摘要

验收标准：
- 每轮提交都会看到一张对应关键帧被处理
- 后端可返回视觉摘要
- 静止画面重复询问时可命中缓存

建议分支名：
- `feat/vision-frame-pipeline`

建议提交信息：
- `feat: capture key frame on turn commit and send to backend`
- `feat: integrate vision adapter with frame cache strategy`

### 阶段 4：多模态问答与流式输出
目标：将用户语音、视觉上下文和历史消息一起送入大模型，得到流式回答。

本阶段任务：
- 后端编写 `conversation_service`，统一拼装 prompt
- 维护内存态会话历史和视觉摘要缓存
- 调用 LLM 流式接口，边收到边推给前端
- 前端实现打字机效果、自动滚动和思考态切换

验收标准：
- AI 能结合图像和语音问题进行回答
- 长回答以流式形式逐步出现
- 同一会话下前后轮次可引用之前看过的内容

建议分支名：
- `feat/multimodal-streaming-chat`

建议提交信息：
- `feat: add multimodal conversation orchestration`
- `feat: stream llm response to frontend chat view`

### 阶段 5：浏览器 TTS 与双视觉切换
目标：让产品具备“边想边说”和“摄像头/屏幕共享双输入”的核心体验。

本阶段任务：
- 前端实现按句切分文本并调用 `SpeechSynthesis`
- 当前朗读句高亮，与文本渲染同步
- 接入 `getDisplayMedia`，支持屏幕共享
- 当屏幕共享开启时保留摄像头小窗
- 抽象统一输入源状态，便于后端识别当前视觉类型

验收标准：
- AI 回答时浏览器可逐句播报
- 用户能在摄像头与屏幕共享之间切换
- 屏幕共享状态下仍保留自拍小窗

建议分支名：
- `feat/tts-and-dual-vision`

建议提交信息：
- `feat: add sentence level browser tts playback`
- `feat: support screen sharing and camera picture in picture`

### 阶段 6：注意力热区、成本面板与黑白 UI 精修
目标：把产品从“能用”推进到“好看、可信、适合面试展示”。

本阶段任务：
- 前端叠加 AI 注意力热区框与轻微呼吸动画
- 增加底部成本栏，展示当前轮次和会话总成本
- 优化黑白 UI、毛玻璃面板、波形动画与边框发光
- 增加错误提示、加载占位、断线重连提示
- 完成设置页和会话记录页的首版静态结构

验收标准：
- 工作台具备完整的视觉风格
- 成本栏能看到每轮估算结果
- 异常时页面不会无反馈卡死

建议分支名：
- `feat/ui-polish-cost-visualization`

建议提交信息：
- `feat: visualize model focus regions and turn cost breakdown`
- `style: polish monochrome interface and status animations`

### 阶段 7：测试、部署与演示收尾
目标：确保在真实演示环境中稳定可用，并具备基本交付文档。

本阶段任务：
- 完成后端核心单测：健康检查、消息协议、缓存策略、成本计算
- 补充 smoke test，验证从会话开始到回答完成的主流程
- 编写部署说明，准备 `.env.example`
- 准备面试演示脚本和常见故障排查说明
- 如需线上演示，部署到单实例云主机或容器平台

验收标准：
- 本地一键启动成功
- 关键接口和服务通过基础测试
- 演示脚本清晰，能够在新环境快速复现

建议分支名：
- `chore/deploy-docs-demo`

建议提交信息：
- `test: add smoke coverage for session and cost flow`
- `docs: add deployment guide and interview demo script`

## 6. Git 工作流
### 6.1 主分支策略
- `main`：始终保持可演示、可部署状态
- `develop`：日常集成分支，合并所有阶段性功能
- `feature/*`：按阶段拆分的短生命周期功能分支

### 6.2 推荐分支清单
- `feature/bootstrap-uv-fastapi`
- `feature/ws-session-lifecycle`
- `feature/audio-vad-asr`
- `feature/vision-frame-pipeline`
- `feature/multimodal-streaming-chat`
- `feature/tts-and-dual-vision`
- `feature/ui-polish-cost-visualization`
- `chore/deploy-docs-demo`

### 6.3 提交规范
建议使用 Conventional Commits：
- `feat:` 新功能
- `fix:` 问题修复
- `style:` 纯样式或交互细节优化
- `refactor:` 不改变行为的结构重构
- `test:` 测试补充
- `docs:` 文档更新
- `chore:` 工程配置与脚手架

## 7. 每日执行顺序建议
### Day 1
- 上午：完成阶段 0 和阶段 1
- 下午：完成阶段 2 和阶段 3
- 晚上：打通“说话 -> 抓帧 -> 识别 -> 视觉理解 -> 假回答”

### Day 2
- 上午：完成阶段 4 和阶段 5
- 下午：完成阶段 6
- 晚上：完成阶段 7，并整理演示脚本、部署说明和成本展示

## 8. 风险与应对
| 风险 | 影响 | 应对方案 |
|------|------|----------|
| 浏览器录音格式与 ASR 不兼容 | 无法识别用户语音 | 优先选择浏览器可直接输出的 MIME，必要时在后端做轻量转码 |
| 屏幕共享权限失败 | 双视觉亮点无法演示 | 提前准备摄像头模式演示脚本，并在 UI 中提供清晰授权引导 |
| 视觉模型调用过慢 | 用户感知卡顿 | 先显示思考态，必要时先返回 ASR 文本并延后视觉补充 |
| TTS 分句不自然 | 朗读体验割裂 | 使用标点切句和最小长度阈值，允许用户关闭朗读 |
| 成本估算不准确 | 展示可信度下降 | 先展示估算值并标注“预估”，后续再与实际账单校准 |

## 9. 开工顺序建议
如果你现在就开始执行，建议严格按下面顺序推进：
1. 先建 `uv + FastAPI + 静态页` 骨架，不要一开始就接入云模型。
2. 再打通 `WebSocket` 事件流，先用假数据把聊天界面跑起来。
3. 再接入 `麦克风 + VAD + ASR`，保证用户语音能稳定变文本。
4. 再接入 `关键帧抓取 + 视觉理解`，让回答具备多模态能力。
5. 最后补 `流式文本 + TTS + 屏幕共享 + UI 精修`，把体验打磨到可展示状态。

这个顺序的好处是每一步都有独立可验收结果，出了问题也容易定位，不会在第一个晚上就陷入“所有模块都在同时调不通”的局面。
