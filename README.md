# ComfyUI-FindModels

自动识别并适配 ComfyUI 工作流中丢失的模型和节点，提供直链下载，并支持 GitHub 同步。

## ✨ 功能特性

- **缺失模型检测** — 扫描工作流 JSON，自动识别所有缺失的模型文件
- **缺失节点检测** — 检测工作流中未安装的自定义节点
- **直链下载** — 自动从 Civitai 搜索匹配模型并下载
- **夸克网盘支持** — 配置夸克链接，快速获取模型直链
- **本地模型加载** — 从本地磁盘浏览选择模型文件，复制/链接到正确目录
- **定位引用节点** — 一键高亮工作流中引用该模型的节点
- **模型名称复制** — 每个模型旁带复制按钮
- **下载任务管理** — 实时显示下载进度、状态
- **插件安装引导** — 缺失节点提供 GitHub 搜索链接，支持自动安装依赖

## 📦 安装

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/your-username/ComfyUI-FindModels.git
```

重启 ComfyUI 即可使用。

## 🚀 使用方法

1. 安装完成后，ComfyUI 工具栏会出现「查找缺失模型和节点」按钮
2. 加载一个工作流（可能包含缺失的模型/节点）
3. 点击侧边栏的「扫描」按钮
4. 面板会显示缺失的模型和节点列表
5. 对每个缺失模型，可以选择：
   - **定位引用节点** — 高亮工作流中使用该模型的节点
   - **加载本地模型** — 从本地文件系统选择已有的模型文件
   - **查找下载来源** — 从 Civitai 搜索并下载

## 🎯 模型匹配规则

模型文件必须遵循 ComfyUI 官方路径和命名规范：

| 类型 | 目录 | 扩展名 |
|------|------|--------|
| 主模型 (Checkpoints) | `models/checkpoints/` | `.safetensors`, `.ckpt`, `.pt` |
| LoRA | `models/loras/` | `.safetensors`, `.ckpt`, `.pt` |
| VAE | `models/vae/` | `.safetensors`, `.ckpt`, `.pt` |
| CLIP Vision | `models/clip_vision/` | `.safetensors`, `.pt` |
| ControlNet | `models/controlnet/` | `.safetensors`, `.pt` |
| 超分模型 | `models/upscale_models/` | `.safetensors`, `.pt` |
| Embeddings | `models/embeddings/` | `.safetensors`, `.pt` |

## ⚙️ 设置

在面板的「设置」标签中可以配置：

- **夸克链接** — 夸克网盘中的模型库分享链接
- **夸克直链登录态** — 用于解析夸克网盘直链的 Cookie（可选）

## 🔧 技术架构

```
ComfyUI-FindModels/
├── __init__.py          # 插件入口
├── main.py              # 后端逻辑 (ComfyExtension)
├── web/
│   └── FindModels.js    # 前端面板 (ComfyUI JS Extension)
├── .flake8
└── README.md
```

- **后端**：基于 ComfyUI 的 `ComfyExtension` API，注册 REST 路由处理模型扫描、下载、文件浏览等
- **前端**：基于 ComfyUI 的 JS Extension API，创建侧边栏面板 UI
- **通信**：通过 `aiohttp` 路由实现前后端 JSON API 通信

## 📝 开发计划

- [ ] 支持 HuggingFace 模型搜索
- [ ] 支持模型版本管理
- [ ] 支持批量下载
- [ ] 多语言界面支持

## 📄 License

MIT License
