# More See

一个面向演示与面试场景的纯 Web 多模态 AI 视觉对话助手骨架项目。

## 当前阶段
- 已完成 `uv + FastAPI + React + shadcn/ui` 工程初始化
- 已完成 WebSocket 会话生命周期
- 已接入麦克风采集、音频分段上报与 mock ASR 识别回传
- 已接入摄像头预览、关键帧抓取与 mock 视觉摘要回传
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
- 后续接入真实阿里云或百度 ASR 时，可继续扩展对应适配器
- 后续接入真实视觉模型时，可继续扩展 `QWEN_VL_API_KEY` 等配置

## 下一步
- 接入流式大模型回复与浏览器 TTS
- 接入屏幕共享与双视觉切换
- 接入关键帧筛选优化与真实视觉模型
