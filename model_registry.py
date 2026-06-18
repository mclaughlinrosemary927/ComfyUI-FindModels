"""
Model registry: maps model categories, architectures, and download sources.
Provides the intelligence for matching missing models with alternatives.
"""

import os
import json
import re
import folder_paths
from typing import Optional


# ──────────────────────────────────────────────
# Model category definitions
# ──────────────────────────────────────────────

MODEL_CATEGORIES = {
    "checkpoints": {
        "folder_names": ["checkpoints"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin", ".pth"],
        "description": "Stable Diffusion checkpoints",
    },
    "vae": {
        "folder_names": ["vae"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "VAE models",
    },
    "lora": {
        "folder_names": ["loras", "lora"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "LoRA models",
    },
    "controlnet": {
        "folder_names": ["controlnet", "controlnets"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin", ".pth"],
        "description": "ControlNet models",
    },
    "unet": {
        "folder_names": ["unet", "diffusion_models"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "UNet / Diffusion models",
    },
    "clip": {
        "folder_names": ["clip", "text_encoders"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "CLIP / Text encoder models",
    },
    "clip_vision": {
        "folder_names": ["clip_vision"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "CLIP Vision models",
    },
    "embedding": {
        "folder_names": ["embeddings"],
        "extensions": [".pt", ".safetensors", ".bin"],
        "description": "Textual inversion embeddings",
    },
    "upscale": {
        "folder_names": ["upscale_models"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin", ".pth"],
        "description": "Upscale models (ESRGAN, RealESRGAN, etc.)",
    },
    "unclip": {
        "folder_names": ["unclip"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "UnCLIP models",
    },
    "style_models": {
        "folder_names": ["style_models"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "Style models",
    },
    "hypernetworks": {
        "folder_names": ["hypernetworks"],
        "extensions": [".pt", ".safetensors", ".bin"],
        "description": "Hypernetwork models",
    },
    "instantid": {
        "folder_names": ["instantid"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "InstantID models",
    },
    "insightface": {
        "folder_names": ["insightface", "facedetection"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin", ".onnx"],
        "description": "InsightFace models",
    },
    "ipadapter": {
        "folder_names": ["ipadapter"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "IP-Adapter models",
    },
    "photomaker": {
        "folder_names": ["photomaker"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "PhotoMaker models",
    },
    "pulid": {
        "folder_names": ["pulid"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "PuLID models",
    },
    "vae_approx": {
        "folder_names": ["vae_approx"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "Approximate VAE models",
    },
    "diffusion_models": {
        "folder_names": ["diffusion_models", "unet"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "Diffusion models (Flux, SD3, etc.)",
    },
    "text_encoders": {
        "folder_names": ["text_encoders", "clip"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "Text encoders",
    },
    "norm": {
        "folder_names": ["norm"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "Normalization models",
    },
    "gligen": {
        "folder_names": ["gligen"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "GLIGEN models",
    },
    "sam": {
        "folder_names": ["sam"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin"],
        "description": "Segment Anything models",
    },
    "depth": {
        "folder_names": ["depth", "depth_anything"],
        "extensions": [".ckpt", ".safetensors", ".pt", ".bin", ".onnx"],
        "description": "Depth estimation models",
    },
    "custom_nodes": {
        "folder_names": ["custom_nodes"],
        "extensions": [],
        "description": "Custom nodes (not file-based)",
    },
}


# ──────────────────────────────────────────────
# Architecture detection patterns
# ──────────────────────────────────────────────

ARCH_PATTERNS = {
    "sd15": [
        r"v1[-_.]?5", r"sd[-_.]?1[-_.]?5", r"stable[-_.]?diffusion[-_.]?1",
        r"1[-_.]?5\b", r"sd15",
    ],
    "sd21": [
        r"v2[-_.]?1", r"sd[-_.]?2[-_.]?1", r"stable[-_.]?diffusion[-_.]?2",
        r"2[-_.]?1\b", r"sd21",
    ],
    "sdxl": [
        r"sdxl", r"xl[-_.]??turbo", r"stable[-_.]?diffusion[-_.]?xl",
        r"\bxl\b",
    ],
    "sd3": [
        r"sd3", r"stable[-_.]?diffusion[-_.]?3",
    ],
    "flux": [
        r"flux[-_.]?(dev|schnell)", r"flux1", r"\bflux\b",
    ],
    "cogvideox": [
        r"cogvideox", r"cogvideo",
    ],
    "ltxv": [
        r"ltx[-_.]?video", r"ltxv",
    ],
    "hunyuan": [
        r"hunyuan[-_.]?video", r"hunyuan",
    ],
    "mochi": [
        r"\bmochi\b",
    ],
    "animatediff": [
        r"animatediff", r"anima[-_.]?diff",
    ],
    "svd": [
        r"stable[-_.]?video[-_.]?diffusion", r"\bsvd\b",
    ],
}

# Model type detection within a category
TYPE_PATTERNS = {
    "inpainting": [r"inpaint", r"inpainting"],
    "instruct_pix2pix": [r"instruct", r"pix2pix", r"ip2p"],
    "depth": [r"depth", r"midas", r"zoe"],
    "canny": [r"canny"],
    "lineart": [r"lineart", r"line[-_.]?art"],
    "openpose": [r"openpose", r"pose"],
    "segmentation": [r"seg", r"segment"],
    "tile": [r"tile"],
    "sr": [r"sr", r"super[-_.]?resolution", r"upscale", r"esrgan", r"realesrgan"],
    "face": [r"face", r"faceid", r"instantid", r"pulid", r"photomaker"],
    "anime": [r"anime", r"anylora", r"anything", r"counterfeit"],
}


def detect_architecture(model_name: str) -> Optional[str]:
    """Detect model architecture from filename."""
    name_lower = model_name.lower()
    for arch, patterns in ARCH_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, name_lower):
                return arch
    return "unknown"


def detect_model_type(model_name: str) -> Optional[str]:
    """Detect model sub-type (inpainting, depth, etc.) from filename."""
    name_lower = model_name.lower()
    for mtype, patterns in TYPE_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, name_lower):
                return mtype
    return None


def categorize_model(node_type: str, input_name: str) -> Optional[str]:
    """Map a ComfyUI node's input to a model category."""
    node_lower = node_type.lower()
    input_lower = input_name.lower()

    # Direct category match
    for cat in MODEL_CATEGORIES:
        if cat in node_lower or cat in input_lower:
            return cat

    # Alias mappings
    aliases = {
        "ckpt": "checkpoints",
        "checkpoint": "checkpoints",
        "lora": "lora",
        "control_net": "controlnet",
        "controlnet": "controlnet",
        "vae": "vae",
        "clip": "clip",
        "clip_vision": "clip_vision",
        "embedding": "embedding",
        "upscale": "upscale",
        "upsampler": "upscale",
        "hypernetwork": "hypernetworks",
        "ipadapter": "ipadapter",
        "ip_adapter": "ipadapter",
        "unet": "unet",
        "model": "checkpoints",
        "diffusion": "diffusion_models",
        "text_encoder": "text_encoders",
    }

    for alias, cat in aliases.items():
        if alias in node_lower or alias in input_lower:
            return cat

    return None


# ──────────────────────────────────────────────
# Download source registry
# ──────────────────────────────────────────────

# Well-known model download sources with direct links
MODEL_SOURCES = {
    "civitai": {
        "base_url": "https://civitai.com/api/v1/models",
        "search_url": "https://civitai.com/models?query={query}",
        "direct_download": "https://civitai.com/api/download/models/{model_id}",
    },
    "huggingface": {
        "base_url": "https://huggingface.co",
        "search_url": "https://huggingface.co/models?search={query}",
        "direct_download": "https://huggingface.co/{repo}/resolve/main/{filename}",
    },
    "quark": {
        "base_url": "https://pan.quark.cn",
        "search_url": "https://pan.quark.cn/search?q={query}",
        "direct_download": None,  # Quark requires browser interaction
    },
}


def build_download_links(model_name: str, category: str, arch: str = None) -> list:
    """Build direct download link suggestions for a missing model."""
    links = []
    name_clean = model_name.replace(".safetensors", "").replace(".ckpt", "").replace(".pt", "").replace(".bin", "")

    # 夸克网盘搜索链接（放在最前面，国内用户优先）
    quark_search = f"https://pan.quark.cn/search?q={name_clean}"
    links.append({
        "source": "夸克网盘",
        "url": quark_search,
        "type": "search",
        "description": f"在夸克网盘搜索 '{name_clean}'",
    })

    # CivitAI search link
    civitai_search = f"https://civitai.com/models?query={name_clean}"
    links.append({
        "source": "CivitAI",
        "url": civitai_search,
        "type": "search",
        "description": f"Search '{name_clean}' on CivitAI",
    })

    # HuggingFace search link
    hf_search = f"https://huggingface.co/models?search={name_clean}"
    links.append({
        "source": "HuggingFace",
        "url": hf_search,
        "type": "search",
        "description": f"Search '{name_clean}' on HuggingFace",
    })

    # Well-known direct download links for popular models
    known_models = _get_known_model_links(model_name, category, arch)
    links.extend(known_models)

    return links


def _get_known_model_links(model_name: str, category: str, arch: str = None) -> list:
    """Return known direct download links for popular models."""
    links = []
    name_lower = model_name.lower()

    # SD 1.5
    if category == "checkpoints" and (arch == "sd15" or "v1-5" in name_lower or "sd1.5" in name_lower):
        links.append({
            "source": "HuggingFace",
            "url": "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors",
            "type": "direct",
            "description": "Stable Diffusion v1.5 (pruned emaonly)",
        })

    # SDXL
    if category == "checkpoints" and (arch == "sdxl" or "sdxl" in name_lower):
        links.append({
            "source": "HuggingFace",
            "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
            "type": "direct",
            "description": "Stable Diffusion XL Base 1.0",
        })

    # SDXL Refiner
    if category == "checkpoints" and "refiner" in name_lower:
        links.append({
            "source": "HuggingFace",
            "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0.safetensors",
            "type": "direct",
            "description": "Stable Diffusion XL Refiner 1.0",
        })

    # SD3
    if category == "checkpoints" and (arch == "sd3" or "sd3" in name_lower):
        links.append({
            "source": "HuggingFace",
            "url": "https://huggingface.co/stabilityai/stable-diffusion-3-medium/resolve/main/sd3_medium.safetensors",
            "type": "direct",
            "description": "Stable Diffusion 3 Medium",
        })

    # FLUX
    if category in ("checkpoints", "diffusion_models") and arch == "flux":
        if "schnell" in name_lower:
            links.append({
                "source": "HuggingFace",
                "url": "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors",
                "type": "direct",
                "description": "FLUX.1 Schnell",
            })
        else:
            links.append({
                "source": "HuggingFace",
                "url": "https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors",
                "type": "direct",
                "description": "FLUX.1 Dev",
            })

    # VAE
    if category == "vae":
        if "sdxl" in name_lower or (arch and arch in ("sdxl",)):
            links.append({
                "source": "HuggingFace",
                "url": "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors",
                "type": "direct",
                "description": "SDXL VAE",
            })
        else:
            links.append({
                "source": "HuggingFace",
                "url": "https://huggingface.co/stabilityai/sd-vae-ft-mse-original/resolve/main/vae-ft-mse-840000-ema-pruned.safetensors",
                "type": "direct",
                "description": "SD VAE (ft-mse-840000)",
            })
            links.append({
                "source": "HuggingFace",
                "url": "https://huggingface.co/stabilityai/sd-vae-ft-ema-original/resolve/main/vae-ft-ema-560000-ema-pruned.safetensors",
                "type": "direct",
                "description": "SD VAE (ft-ema-560000)",
            })

    # CLIP Vision
    if category == "clip_vision":
        links.append({
            "source": "HuggingFace",
            "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors",
            "type": "direct",
            "description": "CLIP Vision (IP-Adapter image encoder)",
        })

    # ControlNet
    if category == "controlnet":
        controlnet_models = {
            "canny": "sd15_control_canny-fp16.safetensors",
            "depth": "sd15_control_depth-fp16.safetensors",
            "openpose": "sd15_control_openpose-fp16.safetensors",
            "tile": "sd15_control_tile-fp16.safetensors",
            "lineart": "sd15_control_lineart-fp16.safetensors",
        }
        for cn_type, cn_file in controlnet_models.items():
            if cn_type in name_lower:
                links.append({
                    "source": "HuggingFace",
                    "url": f"https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/{cn_file}",
                    "type": "direct",
                    "description": f"ControlNet {cn_type} (SD1.5 fp16)",
                })
                break

    # Upscale
    if category == "upscale":
        if "4x" in name_lower and "ultrasharp" in name_lower:
            links.append({
                "source": "HuggingFace",
                "url": "https://huggingface.co/lokCX/4x-Ultrasharp/resolve/main/4x-UltraSharp.pth",
                "type": "direct",
                "description": "4x-UltraSharp",
            })
        else:
            links.append({
                "source": "HuggingFace",
                "url": "https://huggingface.co/stabilityai/generative-models/resolve/main/RealESRGAN_x2plus.pth",
                "type": "direct",
                "description": "RealESRGAN_x2plus",
            })

    # IP-Adapter
    if category == "ipadapter":
        links.append({
            "source": "HuggingFace",
            "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter_sd15.bin",
            "type": "direct",
            "description": "IP-Adapter SD1.5",
        })
        if "sdxl" in name_lower:
            links.append({
                "source": "HuggingFace",
                "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter_sdxl.bin",
                "type": "direct",
                "description": "IP-Adapter SDXL",
            })

    # InsightFace
    if category == "insightface":
        links.append({
            "source": "HuggingFace",
            "url": "https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/insightface/buffalo_l/1k3d68.onnx",
            "type": "direct",
            "description": "InsightFace buffalo_l (1k3d68.onnx)",
        })

    return links


# ──────────────────────────────────────────────
# Model scanning & matching
# ──────────────────────────────────────────────

def scan_local_models(category: str) -> list:
    """Scan local model directories and return available model filenames."""
    try:
        if category in folder_paths.folder_names_and_paths:
            paths = folder_paths.get_filename_list(category)
            return list(paths)
    except Exception:
        pass

    # Fallback: manually scan folders
    if category in MODEL_CATEGORIES:
        cat_info = MODEL_CATEGORIES[category]
        models = []
        for folder_name in cat_info["folder_names"]:
            try:
                base_paths = folder_paths.get_folder_paths(folder_name)
            except Exception:
                # Try default ComfyUI paths
                base_paths = [
                    os.path.join(folder_paths.base_path, "models", folder_name)
                ]
            for base_path in base_paths:
                if os.path.isdir(base_path):
                    for ext in cat_info["extensions"]:
                        for root, _dirs, files in os.walk(base_path):
                            for f in files:
                                if f.endswith(ext):
                                    rel = os.path.relpath(os.path.join(root, f), base_path)
                                    models.append(rel.replace("\\", "/"))
        return list(set(models))

    return []


def find_matching_models(missing_name: str, category: str, max_results: int = 5) -> list:
    """Find locally available models that could replace a missing one."""
    local_models = scan_local_models(category)
    if not local_models:
        return []

    missing_arch = detect_architecture(missing_name)
    missing_type = detect_model_type(missing_name)
    name_lower = missing_name.lower()

    scored = []
    for model in local_models:
        score = 0
        model_lower = model.lower()

        # Architecture match (highest weight)
        model_arch = detect_architecture(model)
        if model_arch == missing_arch and missing_arch != "unknown":
            score += 50

        # Type match (inpainting, depth, etc.)
        model_type = detect_model_type(model)
        if model_type == missing_type and missing_type is not None:
            score += 30

        # Name similarity (token overlap)
        missing_tokens = set(re.split(r"[-_.\s]+", name_lower))
        model_tokens = set(re.split(r"[-_.\s]+", model_lower))
        overlap = missing_tokens & model_tokens - {"", "safetensors", "ckpt", "pt", "bin", "pth", "fp16", "ema"}
        score += len(overlap) * 5

        # Prefer safetensors over ckpt
        if model_lower.endswith(".safetensors"):
            score += 3
        if model_lower.endswith(".fp16") or "fp16" in model_lower:
            score += 1

        if score > 0:
            scored.append((model, score))

    scored.sort(key=lambda x: -x[1])
    return [m[0] for m in scored[:max_results]]


def parse_workflow_models(workflow: dict) -> list:
    """
    Parse a ComfyUI workflow JSON and extract all model references.
    Returns list of dicts with model info.
    """
    models = []

    # Handle both workflow and API formats
    nodes = workflow.get("nodes", [])
    if not nodes and "prompt" in workflow:
        # API format
        prompt = workflow.get("prompt", workflow)
        if isinstance(prompt, dict):
            nodes = []
            for node_id, node_data in prompt.items():
                if isinstance(node_data, dict):
                    nodes.append({
                        "id": node_id,
                        "type": node_data.get("class_type", ""),
                        "inputs": node_data.get("inputs", {}),
                    })

    for node in nodes:
        node_type = node.get("type", "") or node.get("class_type", "")
        inputs = node.get("inputs", {})

        if isinstance(inputs, dict):
            for input_name, input_val in inputs.items():
                if isinstance(input_val, str) and _looks_like_model(input_val, input_name, node_type):
                    category = categorize_model(node_type, input_name)
                    models.append({
                        "node_id": node.get("id", ""),
                        "node_type": node_type,
                        "input_name": input_name,
                        "model_name": input_val,
                        "category": category,
                    })
        elif isinstance(inputs, list):
            for inp in inputs:
                if isinstance(inp, dict):
                    name = inp.get("name", "")
                    val = inp.get("widget", inp.get("value", ""))
                    if isinstance(val, str) and _looks_like_model(val, name, node_type):
                        category = categorize_model(node_type, name)
                        models.append({
                            "node_id": node.get("id", ""),
                            "node_type": node_type,
                            "input_name": name,
                            "model_name": val,
                            "category": category,
                        })

    return models


def get_model_folder_path(category: str) -> Optional[str]:
    """Get the absolute filesystem path for a model category's folder.
    Returns the first existing folder path, or creates one if none exist."""
    if category not in MODEL_CATEGORIES:
        return None

    cat_info = MODEL_CATEGORIES[category]

    # Try folder_paths first (respects extra_paths config)
    for folder_name in cat_info["folder_names"]:
        try:
            paths = folder_paths.get_folder_paths(folder_name)
            for p in paths:
                if os.path.isdir(p):
                    return p
        except Exception:
            pass

    # Fallback: default ComfyUI models directory
    try:
        base = folder_paths.base_path
    except Exception:
        base = os.getcwd()

    for folder_name in cat_info["folder_names"]:
        model_dir = os.path.join(base, "models", folder_name)
        if os.path.isdir(model_dir):
            return model_dir
        # Try creating it
        try:
            os.makedirs(model_dir, exist_ok=True)
            return model_dir
        except Exception:
            continue

    return None


def download_model_to_category(download_url: str, model_name: str, category: str) -> dict:
    """Download a model file and save it to the correct category folder.
    Returns dict with success status and saved path or error."""
    import urllib.request
    import shutil
    import tempfile

    target_dir = get_model_folder_path(category)
    if not target_dir:
        return {"success": False, "error": f"Cannot find or create folder for category '{category}'"}

    # Ensure filename is safe
    safe_name = os.path.basename(model_name.replace("\\", "/"))
    if not safe_name:
        safe_name = "model.safetensors"
    target_path = os.path.join(target_dir, safe_name)

    # Don't overwrite existing files
    if os.path.exists(target_path):
        return {"success": True, "saved_path": target_path, "message": "File already exists"}

    try:
        # Download to temp file first, then move
        tmp_dir = tempfile.gettempdir()
        tmp_path = os.path.join(tmp_dir, f"findmodels_{safe_name}")

        urllib.request.urlretrieve(download_url, tmp_path)

        # Verify it's a real file (not an error page)
        file_size = os.path.getsize(tmp_path)
        if file_size < 1024:  # Less than 1KB is probably an error
            os.remove(tmp_path)
            return {"success": False, "error": "Downloaded file too small, possibly an error page"}

        # Move to target
        shutil.move(tmp_path, target_path)

        return {
            "success": True,
            "saved_path": target_path,
            "size_mb": round(file_size / (1024 * 1024), 2),
        }
    except Exception as e:
        # Clean up temp file on error
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        return {"success": False, "error": str(e)}


def _looks_like_model(value: str, input_name: str = "", node_type: str = "") -> bool:
    """Check if a string value looks like a model file reference."""
    model_extensions = (".safetensors", ".ckpt", ".pt", ".bin", ".pth", ".onnx")
    if any(value.lower().endswith(ext) for ext in model_extensions):
        return True

    # Check if it's referenced through a model-type input
    model_keywords = ["model", "ckpt", "checkpoint", "lora", "vae", "clip",
                      "controlnet", "embedding", "upscale", "unet", "ipadapter"]
    name_lower = input_name.lower()
    if any(kw in name_lower for kw in model_keywords):
        # Could be a model name without extension
        if "/" in value or "\\" in value or len(value) > 8:
            return True

    return False
