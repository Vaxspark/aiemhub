# aiemhub

AI Extension Manager — a lightweight, npm-installable Web UI for managing AI coding IDE Skills, MCP servers, project profiles, secrets, and backups.

Built with TypeScript + Express.js. Install and run with a single `aiem` command.

- [中文说明](#中文说明)
- [English](#english)

## 中文说明

### 包含内容

- `aiem`：npm CLI 命令，启动基于浏览器的 Web UI 管理界面

### 支持的 IDE

- Claude Code
- Codex
- Cursor
- Copilot
- Windsurf
- Trae
- Qoder
- Kiro

### 主要功能

- 从 GitHub 或本地目录安装 Skills
- 将 Skills 部署到全局或指定项目
- 添加、部署、移除、启用、禁用和打包 MCP 服务
- 按 IDE 和项目范围部署 MCP 服务
- 创建项目配置，将 IDE、Skills 和 MCP 服务组合到同一个工作区
- 使用系统密钥环保存密钥，并通过 `${secret:NAME}` 引用
- 扫描本地 IDE 配置，发现并导入已有资源
- 创建本地快照，或同步到 GitHub 备份仓库
- 中英文界面切换

### 安装

#### 全局安装（推荐）

```bash
npm install -g aiemhub
```

安装后即可在命令行中使用 `aiem` 命令。

#### 或者直接用 npx

```bash
npx aiemhub
```

### 使用

#### 启动 Web UI

```bash
aiem
```

浏览器访问 http://127.0.0.1:8787 即可。

#### 自定义端口和主机

```bash
aiem --port 3000
aiem --host 0.0.0.0 --port 8080
aiem --open            # 启动后自动打开浏览器
```

#### 查看帮助

```bash
aiem --help
aiem --version
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AIEM_HOST` | 绑定地址 | `127.0.0.1` |
| `AIEM_PORT` | 监听端口 | `8787` |
| `AIEM_OPEN_BROWSER` | 自动打开浏览器 | `false` |

### 快速上手

```bash
# 安装
npm install -g aiemhub

# 启动
aiem --open
```

添加和部署一个 Skill：

```bash
# 在 Web UI 中操作，或通过 GitHub 添加
# Skills 管理页面支持添加、部署、删除、更新
```

添加和同步一个 MCP 服务器：

```bash
# 在 Web UI 的 MCP 页面中添加和管理
# 支持 stdio / SSE / HTTP 三种传输类型
```

### 项目配置 (Project Profiles)

项目配置描述了哪些 IDE、Skills 和 MCP 服务应该活跃在某个工作区路径下。

- `Save only`：仅更新项目记录
- `Save & Deploy`：保存记录并部署选定的 Skills/MCP 服务
- `Sync`：重新应用已保存的项目记录到工作区

### 密钥管理

密钥值存储在操作系统密钥环中，不会提交到仓库。MCP 配置可以通过以下方式引用密钥：

```text
${secret:NAME}
```

### 备份

通过 Web UI 的 Settings 页面进行本地快照和 GitHub 备份管理。

GitHub token 可以通过 Settings 页面或环境变量 `GITHUB_TOKEN` 提供。

### 隐私与本地文件

仓库忽略了本地运行时文件和构建输出，如 `node_modules/`、`dist/` 等。请勿使用 `git add -f` 强制添加这些文件。

## English

### What Is Included

- `aiem`: npm CLI tool that launches the browser-based Web UI management interface.

### Supported IDE Targets

- Claude Code
- Codex
- Cursor
- Copilot
- Windsurf
- Trae
- Qoder
- Kiro

### Features

- Install Skills from GitHub or local folders.
- Deploy Skills globally or into project workspaces.
- Add, deploy, remove, enable, disable, and bundle MCP servers.
- Deploy MCP servers per IDE and per project.
- Create project profiles that combine IDE targets, Skills, and MCP servers.
- Store secrets in the OS keyring and reference them with `${secret:NAME}`.
- Discover existing local IDE configuration and import unmanaged resources.
- Create local snapshots or sync backups to a GitHub repository.
- Switch between English and Chinese interfaces.

### Installation

#### Global Install (recommended)

```bash
npm install -g aiemhub
```

After installation, use the `aiem` command in your terminal.

#### Or use npx directly

```bash
npx aiemhub
```

### Usage

#### Start the Web UI

```bash
aiem
```

Open http://127.0.0.1:8787 in your browser.

#### Custom port and host

```bash
aiem --port 3000
aiem --host 0.0.0.0 --port 8080
aiem --open            # open browser on start
```

#### Help

```bash
aiem --help
aiem --version
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AIEM_HOST` | Bind address | `127.0.0.1` |
| `AIEM_PORT` | Listen port | `8787` |
| `AIEM_OPEN_BROWSER` | Open browser on start | `false` |

### Quick Start

```bash
# Install
npm install -g aiemhub

# Start
aiem --open
```

Add and deploy a Skill:

```bash
# Use the Web UI Skills page to add, deploy, remove, and update skills
```

Add and sync an MCP server:

```bash
# Use the Web UI MCP page to add and manage servers
# Supports stdio / SSE / HTTP transport types
```

### Project Profiles

Project profiles describe which IDEs, Skills, and MCP servers should be active for a given workspace path.

- `Save only`: update the project record only.
- `Save & Deploy`: save the record and deploy the selected Skills/MCP servers.
- `Sync`: re-apply the already saved project record to the workspace.

### Secrets

Secret values are stored in the OS keyring and are not committed to the repository. MCP configuration can reference secrets with:

```text
${secret:NAME}
```

### Backup

Manage local snapshots and GitHub backups via the Settings page in the Web UI.

GitHub tokens can be provided through the Settings page or the `GITHUB_TOKEN` environment variable.

### Privacy And Local Files

The repository ignores local runtime files and build outputs such as `node_modules/` and `dist/`. Do not use `git add -f` to force-add those local files before publishing.

## Development

```bash
git clone git@github.com:Vaxspark/aiemhub.git
cd aiemhub
npm install
npm run build
```

Run locally:

```bash
node dist/cli.js --port 8787 --open
```

### License

MIT
