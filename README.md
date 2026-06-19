# AgentMusic

AgentMusic 是一个以站内账号、个人资料库和 AI 音乐 Agent 为核心的 Web 音乐应用。它不是只依赖 Spotify 登录才能使用的播放器，而是把本地音频、站内歌单、Spotify 增强能力和对话式推荐放在同一个体验里。

## 功能概览

- 站内账号：注册、登录、会话保存、个人资料库。
- 音乐资料库：创建站内歌单、重命名/删除歌单、上传本地 MP3/M4A 音频。
- 搜索：搜索 Spotify 公开目录中的歌曲、歌手、专辑、歌单和节目。
- 歌单管理：从搜索结果把歌曲加入站内歌单；站内歌单可混合本地音频和 Spotify 曲目。
- 播放器：支持本地音频、Spotify preview、Spotify Remote Playback 队列播放。
- Spotify 增强：连接 Spotify 后可导入歌单、同步收藏、完整播放 Spotify 曲目。
- AI Agent：通过 DeepSeek/OpenAI 兼容接口进行音乐查询、推荐生成、播放控制和会话记忆。

## 技术栈

前端：

- React 19
- Vite
- Redux Toolkit
- React Router
- i18next / react-i18next

后端：

- Node.js
- Express
- SQLite / better-sqlite3
- Spotify Web API
- music-metadata
- OpenAI SDK 兼容 DeepSeek API

## 项目结构

```text
Music/
  frontend/          React + Vite 前端
  backend/           Express API 服务
  backend/db/        SQLite 数据库与迁移脚本
  backend/uploads/   本地音频上传目录
  docs/              项目设计与开发文档
  config/            本地配置目录
```

## 本地开发

建议使用 Node.js 22 或较新的 LTS 版本。

### 1. 安装依赖

```powershell
cd D:\205zd\Desktop\Music\backend
npm install

cd D:\205zd\Desktop\Music\frontend
npm install
```

### 2. 配置后端环境变量

复制后端环境变量示例：

```powershell
cd D:\205zd\Desktop\Music\backend
Copy-Item .env.example .env
```

然后编辑 `backend/.env`：

```env
PORT=8080
FRONTEND_URI=http://127.0.0.1:5173
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8080/api/auth/spotify/callback
SESSION_SECRET=replace_with_a_long_random_string
DATABASE_PATH=./db/database.sqlite
UPLOADS_DIR=./uploads
MEDIA_UPLOAD_MAX_BYTES=41943040
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
```

注意：不要提交真实的 `.env`、Spotify secret 或 API key。

### 3. 配置 Spotify Redirect URI

在 Spotify Developer Dashboard 里，把应用的 Redirect URI 设置为：

```text
http://127.0.0.1:8080/api/auth/spotify/callback
```

本项目推荐统一使用 `127.0.0.1`，不要在同一轮 OAuth 流程里混用 `localhost` 和 `127.0.0.1`，否则浏览器会话可能对不上。

### 4. 启动后端

```powershell
cd D:\205zd\Desktop\Music\backend
npm run dev
```

默认后端地址：

```text
http://127.0.0.1:8080
```

健康检查：

```text
GET http://127.0.0.1:8080/api/test
```

### 5. 启动前端

```powershell
cd D:\205zd\Desktop\Music\frontend
npm run dev
```

默认前端地址：

```text
http://127.0.0.1:5173
```

前端 Vite 配置启用了 `strictPort: true`。如果 5173 已被占用，请先关闭旧的 Vite 进程，再重新启动。

## 常用命令

后端：

```powershell
cd D:\205zd\Desktop\Music\backend
npm run dev
npm start
npm audit --audit-level=moderate
```

前端：

```powershell
cd D:\205zd\Desktop\Music\frontend
npm run dev
npm run build
npm run lint
npm audit --audit-level=moderate
```

说明：当前前端全量 `npm run lint` 可能会暴露既有 React Hooks 规则问题；提交新功能前至少应对改动文件运行 ESLint，并确保 `npm run build` 通过。

## 主要能力说明

### 游客模式

无需登录即可搜索公开音乐目录、浏览公开内容、与 Agent 进行基础对话，并播放可用的 preview 音频。游客模式不保存长期资料库、歌单和会话。

### 站内账号模式

登录 AgentMusic 账号后，可以创建站内歌单、上传本地音频、保存 Agent 会话与推荐历史，并把搜索结果中的歌曲加入自己的歌单。

### Spotify 增强模式

站内账号登录后可以连接 Spotify。连接成功后可导入 Spotify 歌单、同步收藏歌曲、读取用户 Top Tracks/Top Artists，并通过 Spotify 官方播放器完整播放曲目。

### 本地音频

支持上传非 DRM 的 `.mp3` 和 `.m4a` 文件。后端会尝试读取音频元数据，并对常见中文错码进行修复。上传后的本地音频存放在 `backend/uploads/`，数据库记录存放在 SQLite 中。

### 播放队列

播放器会根据每首歌的 `playMode` 自动选择播放方式：

- `local_audio`：使用站内 HTML audio 播放本地上传文件。
- `preview`：播放 Spotify 提供的公开试听片段。
- `spotify_remote`：通过 Spotify Remote Playback 播放完整歌曲。
- `unavailable`：当前没有可用音频源。

## 数据与存储

- SQLite 默认路径：`backend/db/database.sqlite`
- 本地音频默认目录：`backend/uploads/`
- OAuth pending state、站内账号、会话、Provider 连接、歌单、播放事件等数据都存入 SQLite。

如果需要清空本地开发数据，可以停止后端后删除 SQLite 文件及其 WAL/SHM 文件：

```powershell
Remove-Item backend\db\database.sqlite, backend\db\database.sqlite-wal, backend\db\database.sqlite-shm -Force -ErrorAction SilentlyContinue
```

请只在本地开发环境这样做。

## 常见问题

### 前端提示无法连接后端

确认后端正在运行，并检查：

- 后端是否监听 `http://127.0.0.1:8080`
- 前端是否从 `http://127.0.0.1:5173` 打开
- 浏览器控制台是否有 CORS 或网络错误
- `backend/.env` 中的 `FRONTEND_URI` 是否正确

### `Port 5173 is already in use`

说明已有一个 Vite 进程占用了 5173。关闭旧终端或结束对应 Node 进程后再运行：

```powershell
cd D:\205zd\Desktop\Music\frontend
npm run dev
```

### Spotify 登录后没有回到正确页面

检查 Spotify Dashboard 和 `backend/.env` 中的回调地址是否完全一致：

```text
http://127.0.0.1:8080/api/auth/spotify/callback
```

同时确认发起连接和回调使用的是同一个站内账号、同一个前端 origin。

### Spotify 播放需要 Premium

Spotify Web Playback / Remote Playback 需要 Spotify Premium。没有 Premium 时，应用仍可使用公开搜索、preview 音频、本地音频和站内歌单功能。

### 搜索结果加入歌单没有目标

搜索结果只能加入可编辑的站内歌单。请先登录 AgentMusic，并在资料库里创建一个站内歌单。

## 文档

- [系统设计](docs/系统设计.md)
- [开发规划](docs/开发规划.md)
- [选题背景分析](docs/选题背景分析.md)

## 当前开发提醒

- 后端配置文件 `backend/config/env.js` 在当前仓库规则下可能被忽略；多人协作时请确保配置加载逻辑和 `.env.example` 保持一致。
- 不要提交 `node_modules/`、SQLite 数据库、上传音频、真实密钥或本地日志。
- 变更播放、OAuth、资料库和推荐逻辑后，建议同时验证前端构建、后端语法和一次完整登录/播放流程。
