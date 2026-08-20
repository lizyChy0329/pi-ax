# pi-ax

> [ax](https://github.com/yusukebe/ax) 集成包 for pi — 结构化网页提取，无需写解析脚本。

提供 **自定义工具** (`web_extract`) + **skill** 指导，让 pi 的 agent 能够通过 CSS 选择器从 HTML 中提取结构化数据（表格、列表、卡片）、发现页面结构、调用 REST API。

## 安装

```bash
# 从 GitHub 安装
pi install git:github.com/yourname/pi-ax

# 或从本地路径安装（开发模式）
pi install ./pi-ax
```

## 能力

### web_extract 工具

一个自定义工具，覆盖 ax 的 6 种核心模式：

| 模式 | 说明 | 典型场景 |
|---|---|---|
| `fetch` | 完整 HTTP 报告（状态、头、耗时、body） | 调用 REST API、调试接口 |
| `outline` | 页面结构发现（重复 tag.class + 计数） | 提取前了解页面结构 |
| `locate` | 查找某段文本在 DOM 中的 CSS 选择器 | 知道文本内容但不知道选择器 |
| `extract` | CSS 选择器多字段行提取 | 提取列表/卡片数据（标题、链接、价格） |
| `table` | HTML `<table>` 提取为键值行 | 提取表格数据 |
| `markdown` | 页面转可读 Markdown，支持 token 预算 | 阅读文档页 |

### Skill 指导

skill 文件告诉 agent **何时该用 `web_extract`、何时该用 `fetch_content`**，避免工具选择混乱。

## 命令行参考

### 使用 web_extract 工具

在 pi 中直接向 agent 描述需求即可，它会自动调用 `web_extract` 工具。例如：

> "提取 https://example.com/items 中所有卡的标题和链接"

agent 会自动调用 `web_extract` 的 extract 模式。

### 高级用法：直接使用 ax CLI

对于需要精细控制 HTTP 请求的场景（如 POST 请求体、文件上传、`--json-envelope` 分页），可以告诉 agent 直 接用 `ax` CLI：

> "用 ax 调用 https://api.example.com/data 的 POST 接口，body 是 @payload.json"

## 开发

```bash
# 克隆项目
git clone https://github.com/yourname/pi-ax
cd pi-ax

# 本地测试（使用 --extension 或 -e 临时加载）
pi -e ./src/index.ts

# 发布到 GitHub 后，其他用户可安装
pi install git:github.com/yourname/pi-ax
```

## 与 fetch_content 的分工

| 场景 | 工具 |
|---|---|
| 结构化提取（CSS 选择器、表格、多字段） | `web_extract` |
| 读取文档/文章为可读 Markdown | `fetch_content` |
| 未知页面的结构探索 | `web_extract` (outline) |
| 视频/YouTube/PDF 分析 | `fetch_content` |
| GitHub 仓库克隆和分析 | `fetch_content` |
| REST API 调用（GET/POST/PUT/DELETE） | `web_extract` (fetch) |
| 大数据集分页 | `web_extract` (envelope + offset) |

## License

MIT