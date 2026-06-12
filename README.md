# More See

一个面向演示与面试场景的纯 Web 多模态 AI 视觉对话助手骨架项目。

## 当前阶段
- 已完成 `uv + FastAPI + React + shadcn/ui` 工程初始化
- 已完成 WebSocket 会话生命周期
- 已接入麦克风采集、音频分段上报与 mock ASR 识别回传
- 已接入摄像头预览、关键帧抓取与 mock 视觉摘要回传
- 已接入多模态会话编排与 mock LLM 流式回复
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

## 目录说明
- `app/`：FastAPI 应用与后续多模态服务编排层
- `frontend/`：React + shadcn/ui 前端工作台
- `tests/`：基础测试
- `.trae/documents/`：PRD、技术架构与执行计划

## 环境变量
复制 `.env.example` 为 `.env` 后按需填写模型密钥。

- `ASR_PROVIDER=mock`：默认启用 mock ASR，方便在无云端密钥环境下联调
- `VISION_PROVIDER=mock`：默认启用 mock 视觉摘要，方便在无真实视觉模型时跑通关键帧链路
- `LLM_PROVIDER=mock`：默认启用 mock LLM，方便在无真实文本模型时跑通流式回复链路
- `TTS_PROVIDER=mock`：默认启用 mock TTS；切换到 `volcengine` 后可通过后端接口调用火山语音合成
- `VOLCENGINE_TTS_APP_ID / VOLCENGINE_TTS_ACCESS_TOKEN`：火山 TTS 鉴权配置
- `VOLCENGINE_TTS_RESOURCE_ID / VOLCENGINE_TTS_SPEAKER`：火山 TTS 资源与音色配置
- `ARK_API_KEY`：火山方舟文本与视觉模型鉴权配置
- `ARK_LLM_MODEL / ARK_VISION_MODEL`：火山方舟文本与视觉模型 ID

## TTS 接口
- `POST /api/tts/synthesize`
- 请求体：`{"text":"你好，欢迎使用 More See"}`
- 返回：`audioBase64`、`mimeType`、`provider`、`textLength`
- 当 `TTS_PROVIDER=volcengine` 时，后端会调用火山引擎语音合成接口；未配置密钥时可先使用 mock 模式联调

## 火山模型接入
- 当 `LLM_PROVIDER=volcengine` 时，后端会通过 `LangChain ChatOpenAI` 对接方舟 OpenAI 兼容接口并调用 `ARK_LLM_MODEL`
- 当 `VISION_PROVIDER=volcengine` 时，后端会通过 `LangChain ChatOpenAI` 对接方舟多模态对话接口并调用 `ARK_VISION_MODEL`
- 多轮上下文组装交由 `LangGraph` 处理，避免会话编排逻辑继续散落在服务层与适配层
- 当前仍保留 mock 提供商，便于在缺少火山密钥或模型开通权限时独立联调页面

## 下一步
- 接入浏览器 TTS 与分句朗读
- 接入屏幕共享与双视觉切换
- 接入关键帧筛选优化与真实视觉模型
