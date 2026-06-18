# ComfyUI-FindModels

🔍 **Automatically detect missing models in your ComfyUI workflows, find compatible alternatives, get direct download links, and auto-sort models to the correct folders.**

## Features

- **🔍 Find Missing Models** — Scan any workflow JSON and instantly identify which models are not available locally
- **🔄 Auto Match Models** — Automatically find locally available alternatives that match the same architecture and type
- **⬇️ Direct Download + Auto Sort** — Download models and automatically place them in the correct model folder (e.g., `models/checkpoints/`, `models/lora/`)
- **☁️ 夸克网盘 Search** — Search for models on Quark Cloud Drive (夸克网盘), optimized for users in China
- **🌐 Frontend Integration** — Button in the action bar (same row as Queue Prompt) + right-click canvas menu
- **📡 REST API** — Full API for programmatic access to model checking, searching, downloading, and auto-sorting

## Installation

### Method 1: ComfyUI Manager (Recommended)

Search for "ComfyUI-FindModels" in the ComfyUI Manager and click Install.

### Method 2: Manual Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/AIExplorer-Studio/ComfyUI-FindModels.git
cd ComfyUI-FindModels
pip install -r requirements.txt
```

Restart ComfyUI.

## Nodes

### 🔍 Find Missing Models

Scans a workflow JSON and identifies all models that are referenced but not present locally.

**Inputs:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `workflow_json` | STRING | "" | Paste your workflow JSON, or use the "Capture Current Workflow" button |
| `check_categories` | STRING | "all" | Comma-separated categories to check (e.g., "checkpoints,lora,vae") |

**Outputs:**
| Output | Type | Description |
|--------|------|-------------|
| `missing_models` | STRING | JSON list of missing models with details |
| `all_models` | STRING | JSON list of all models found in workflow |
| `summary` | STRING | Human-readable summary |

### 🔄 Auto Match Models

For each missing model, finds locally available alternatives matching the same architecture and type.

**Inputs:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `missing_models_json` | STRING | "" | Connect from FindMissingModels output |
| `max_suggestions` | INT | 5 | Maximum alternatives per missing model |

**Outputs:**
| Output | Type | Description |
|--------|------|-------------|
| `match_results` | STRING | JSON with match results and alternatives |
| `summary` | STRING | Human-readable match summary |

### ⬇️ Get Model Download Links

Generates direct download links for missing models from CivitAI, HuggingFace, 夸克网盘, and other sources.

**Inputs:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `missing_models_json` | STRING | "" | Connect from FindMissingModels output |

**Outputs:**
| Output | Type | Description |
|--------|------|-------------|
| `download_links` | STRING | JSON with download links |
| `summary` | STRING | Human-readable links summary |

## Frontend Usage

1. **🔍 FindModels button** — Located in the action bar, same row as Queue Prompt. One-click scan.
2. **Right-click canvas** → "🔍 Find Missing Models" — Alternative scan trigger
3. **Right-click canvas** → "📋 Export Model List" — Export all model references
4. **FindMissingModels node** → "📋 Capture Current Workflow" button — Auto-fills the workflow JSON
5. **⬇️ Download & Auto-Sort** — Click download buttons in the results modal; models are automatically saved to the correct `models/<category>/` folder

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/findmodels/check?category=&name=` | Check if a model exists |
| GET | `/findmodels/list?category=` | List models in a category |
| GET | `/findmodels/search?q=` | Search models across categories |
| GET | `/findmodels/alternatives?category=&name=` | Find alternatives for a missing model |
| GET | `/findmodels/download_links?category=&name=` | Get download links (CivitAI, HuggingFace, 夸克网盘) |
| POST | `/findmodels/download_and_sort` | Download model and auto-sort to correct folder |
| GET | `/findmodels/category_path?category=` | Get filesystem path for a model category |
| POST | `/findmodels/scan_workflow` | Scan a workflow for missing models |

### Example API Usage

```bash
# Check if a model exists
curl "http://localhost:8188/findmodels/check?category=checkpoints&name=v1-5-pruned-emaonly.safetensors"

# Search for models
curl "http://localhost:8188/findmodels/search?q=sdxl"

# Download and auto-sort a model
curl -X POST "http://localhost:8188/findmodels/download_and_sort" \
  -H "Content-Type: application/json" \
  -d '{"model_name": "sdxl_vae.safetensors", "category": "vae", "download_url": "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors"}'

# Scan a workflow
curl -X POST "http://localhost:8188/findmodels/scan_workflow" \
  -H "Content-Type: application/json" \
  -d '{"workflow": {...}}'
```

## Download Sources

| Source | Type | Description |
|--------|------|-------------|
| ☁️ **夸克网盘** | Search | Search models on Quark Cloud Drive (国内用户优先) |
| 🔍 **CivitAI** | Search + Direct | Search and direct download from CivitAI |
| 🤗 **HuggingFace** | Search + Direct | Search and direct download from HuggingFace |

## Auto-Sort Feature

When you click a download button in the results modal, the model file is:

1. **Downloaded** from the source URL
2. **Automatically saved** to the correct ComfyUI model folder:
   - Checkpoints → `models/checkpoints/`
   - LoRA → `models/loras/`
   - VAE → `models/vae/`
   - ControlNet → `models/controlnet/`
   - And all other categories...
3. **Verified** for file integrity (rejects files < 1KB that are likely error pages)

## Supported Model Categories

- Checkpoints (SD1.5, SDXL, SD3, Flux, etc.)
- VAE
- LoRA
- ControlNet
- UNet / Diffusion Models
- CLIP / Text Encoders
- CLIP Vision
- Embeddings
- Upscale Models
- IP-Adapter
- InstantID / InsightFace
- PuLID / PhotoMaker
- Hypernetworks
- Style Models
- GLIGEN
- SAM
- Depth Models
- And more...

## Architecture Detection

Automatically detects model architecture from filenames:
- **SD 1.5** — v1-5, sd1.5, stable-diffusion-1
- **SDXL** — sdxl, xl, stable-diffusion-xl
- **SD3** — sd3, stable-diffusion-3
- **Flux** — flux, flux1, flux-dev, flux-schnell
- **CogVideoX** — cogvideo
- **Hunyuan** — hunyuan-video
- **SVD** — stable-video-diffusion
- And more...

## How Auto-Matching Works

The auto-match algorithm scores local models based on:

1. **Architecture match** (50 pts) — Same SD version / Flux / etc.
2. **Type match** (30 pts) — Same sub-type (inpainting, depth, etc.)
3. **Name similarity** (5 pts/token) — Overlapping tokens in filename
4. **Format preference** (+3 pts) — Prefers safetensors over ckpt
5. **Precision preference** (+1 pt) — Prefers fp16 variants

## Requirements

- ComfyUI >= 0.2.0
- Python >= 3.9
- aiohttp (included with ComfyUI)

## License

MIT License

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
