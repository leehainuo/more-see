# More See

一个面向演示与面试场景的纯 Web 多模态 AI 视觉对话助手骨架项目。

## 当前阶段
- 已完成 `uv + FastAPI + React + shadcn/ui` 工程初始化
- 已完成 WebSocket 会话生命周期
- 已接入麦克风采集、音频分段上报与火山 ASR 识别回传
- 已接入摄像头预览、关键帧抓取与火山视觉摘要回传
- 已接入多模态会话编排与火山 LLM 流式回复
- 已提供黑白极简风格的 React 工作台、会话记录页和设置页骨架

## 技术栈
- 后端：`FastAPI`、`WebSocket`
- 前端：`React`、`TypeScript`、`Tailwind CSS`、`shadcn/ui`
- Python 管理：`uv`

## 快速启动
1. 安装后端依赖

```bash
uv sync
```

2. 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

3. 启动后端服务

```bash
uv run uvicorn app.main:app --reload
```

4. 启动前端服务

```bash
cd frontend
npm run dev
```

5. 打开浏览器访问 [http://127.0.0.1:5173](http://127.0.0.1:5173)

## 常用命令
```bash
uv run pytest
uv run ruff check .
cd frontend && npm run check
```

## 自检接口
- `GET /healthz`：基础存活检查
- `GET /healthz/providers`：返回火山能力的配置级自检结果，不触发真实模型请求
- `GET /healthz/providers?probe=true`：执行一次真实连通性探测，帮助确认 `ASR / TTS / LLM / Vision` 是配置问题、模型未开通还是网络 / 证书问题

## 目录说明
- `app/`：FastAPI 应用与后续多模态服务编排层
- `frontend/`：React + shadcn/ui 前端工作台
- `tests/`：基础测试
- `.trae/documents/`：PRD、技术架构与执行计划

## 环境变量
复制 `.env.example` 为 `.env` 后按需填写模型密钥。

- `ASR_PROVIDER=volcengine`：默认通过豆包流式 ASR 识别前端上报的 16k PCM 分片
- `VISION_PROVIDER=volcengine`：默认通过火山方舟视觉模型返回关键帧摘要
- `LLM_PROVIDER=volcengine`：默认通过火山方舟文本模型生成流式回复
- `TTS_PROVIDER=volcengine`：默认通过豆包语音合成接口返回播放音频
- `VOLCENGINE_SPEECH_API_KEY`：豆包语音统一 API Key，用于火山 ASR / TTS 鉴权
- `VOLCENGINE_TTS_RESOURCE_ID / VOLCENGINE_TTS_SPEAKER`：火山 TTS 资源与音色配置
- `VOLCENGINE_ASR_RESOURCE_ID / VOLCENGINE_ASR_LANGUAGE`：火山流式 ASR 资源与语言配置
- `VOLCENGINE_SSL_CERT_FILE`：可选，自定义语音 WebSocket 使用的 CA 证书文件路径；默认使用项目内置 `certifi` 证书链
- `ARK_API_KEY`：火山方舟文本与视觉模型鉴权配置
- `ARK_LLM_MODEL / ARK_VISION_MODEL`：火山方舟文本与视觉模型 ID
- 若本地暂时没有火山密钥，后端会自动进入降级处理并返回保守回复或兜底音频

## TTS 接口
- `POST /api/tts/synthesize`
- 请求体：`{"text":"你好，欢迎使用 More See"}`
- 返回：`audioBase64`、`mimeType`、`provider`、`textLength`
- 当 `TTS_PROVIDER=volcengine` 时，后端会使用 `VOLCENGINE_SPEECH_API_KEY` 调用豆包语音 `2532486` WebSocket 双向流式语音合成接口；未配置密钥或请求失败时会自动回退到本地兜底音频

## 火山模型接入
- 当 `ASR_PROVIDER=volcengine` 时，前端会直接上报 `16k PCM` 音频分片，后端通过豆包流式语音识别接口完成转写
- 当 `TTS_PROVIDER=volcengine` 时，后端会通过 WebSocket 事件流调用豆包语音双向流式合成，并统一使用 `VOLCENGINE_SPEECH_API_KEY`
- 当 `LLM_PROVIDER=volcengine` 时，后端会通过 `LangChain ChatOpenAI` 对接方舟 OpenAI 兼容接口并调用 `ARK_LLM_MODEL`
- 当 `VISION_PROVIDER=volcengine` 时，后端会通过 `LangChain ChatOpenAI` 对接方舟多模态对话接口并调用 `ARK_VISION_MODEL`
- 多轮上下文组装交由 `LangGraph` 处理，避免会话编排逻辑继续散落在服务层与适配层
- 当火山模型暂不可用时，系统会自动降级为保守文本回复、基础画面说明、兜底 transcript 或本地提示音

## 下一步
- 接入浏览器 TTS 与分句朗读
- 接入屏幕共享与双视觉切换
- 接入关键帧筛选优化与真实视觉模型
