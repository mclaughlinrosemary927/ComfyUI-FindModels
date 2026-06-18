"""
ComfyUI-FindModels 主模块 - ComfyExtension 后端
"""
import os
import json
import glob
import logging
import aiohttp
import asyncio
from pathlib import Path
from server import PromptServer
from aiohttp import web
import folder_paths

logger = logging.getLogger(__name__)

# 模型类型映射 (ComfyUI 内部类型名 → 中文显示名)
MODEL_TYPE_LABELS = {
    "checkpoints": "主模型 (Checkpoints)",
    "loras": "LoRA",
    "vae": "VAE",
    "text_encoders": "文本编码器 (CLIP/Text Encoder)",
    "diffusion_models": "扩散模型 (UNet/Diffusion)",
    "clip_vision": "CLIP Vision",
    "style_models": "风格模型",
    "embeddings": "Embeddings (Textual Inversion)",
    "controlnet": "ControlNet / T2I Adapter",
    "gligen": "GLIGEN",
    "upscale_models": "超分模型",
    "latent_upscale_models": "Latent 超分模型",
    "hypernetworks": "超网络",
    "photomaker": "PhotoMaker",
    "model_patches": "模型补丁",
    "audio_encoders": "音频编码器",
    "background_removal": "背景移除",
    "frame_interpolation": "帧插值",
    "geometry_estimation": "几何估计",
    "optical_flow": "光流",
    "detection": "检测模型",
    "vae_approx": "VAE 近似",
    "diffusers": "Diffusers",
    "configs": "配置文件",
}

# 已知的模型下载源 (Civitai 直链)
MODEL_DOWNLOAD_SOURCES = {
    "civitai": {
        "name": "Civitai",
        "base_url": "https://civitai.com/api/download/models/",
        "search_url": "https://civitai.com/api/v1/models",
    },
    "huggingface": {
        "name": "HuggingFace",
        "base_url": "https://huggingface.co/",
    },
}


class FindModelsExtension:
    """ComfyUI 扩展：查找缺失模型和节点"""

    def __init__(self):
        self.download_tasks: dict = {}  # task_id -> task_info
        self._task_counter = 0

    async def _scan_workflow_missing(self, workflow_data: dict) -> dict:
        """扫描工作流 JSON，找出缺失的模型和节点"""
        missing_models = []
        missing_nodes = []

        if not workflow_data:
            return {"missing_models": [], "missing_nodes": []}

        # 1. 提取所有节点中引用的模型
        nodes = workflow_data.get("nodes", [])
        links = workflow_data.get("links", [])
        node_map = {str(n.get("id")): n for n in nodes}

        for node in nodes:
            node_type = node.get("type", "")
            widgets_values = node.get("widgets_values", [])
            properties = node.get("properties", {})

            # 检查节点类型是否已注册（判断缺失节点）
            # 注意：这里需要从 ComfyUI 获取已注册节点列表
            # 我们在前端处理节点缺失检测

            # 检查模型引用
            if isinstance(widgets_values, list):
                for val in widgets_values:
                    if isinstance(val, str) and self._is_model_reference(val):
                        model_info = self._check_model_exists(val)
                        if model_info["missing"]:
                            missing_models.append(model_info)

            # 检查 properties 中的模型引用
            for key, val in properties.items():
                if isinstance(val, str) and self._is_model_reference(val):
                    model_info = self._check_model_exists(val)
                    if model_info["missing"]:
                        if model_info not in missing_models:
                            missing_models.append(model_info)

        # 去重
        seen = set()
        unique_models = []
        for m in missing_models:
            key = (m["name"], m.get("type", ""))
            if key not in seen:
                seen.add(key)
                unique_models.append(m)

        return {
            "missing_models": unique_models,
            "missing_nodes": missing_nodes,
        }

    def _is_model_reference(self, value: str) -> bool:
        """判断字符串是否可能是模型文件名引用"""
        if not value or len(value) < 3:
            return False
        # 模型文件通常有扩展名或特定格式
        model_extensions = {'.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.pkl', '.sft', '.pt2', '.yaml'}
        ext = os.path.splitext(value)[1].lower()
        if ext in model_extensions:
            return True
        # 没有扩展名也可能是模型名（ComfyUI 内部引用有时不带扩展名）
        if not ext and len(value) > 5:
            # 排除明显的非模型值
            non_model_patterns = {'enable', 'disable', 'fixed', 'increment', 'decrement',
                                  'randomize', 'constant', 'none', 'default'}
            if value.lower() not in non_model_patterns:
                return True
        return False

    def _check_model_exists(self, model_name: str) -> dict:
        """检查模型文件是否在本地存在"""
        name_no_ext, ext = os.path.splitext(model_name)

        # 在所有模型目录中搜索
        for folder_name, (folder_paths_list, supported_exts) in folder_paths.folder_names_and_paths.items():
            if folder_name in ("custom_nodes", "output", "temp", "input", "classifiers"):
                continue

            for folder_path in folder_paths_list:
                if not os.path.exists(folder_path):
                    continue

                # 精确匹配（带扩展名）
                full_path = os.path.join(folder_path, model_name)
                if os.path.isfile(full_path):
                    return {
                        "name": model_name,
                        "type": folder_name,
                        "missing": False,
                        "local_path": str(full_path),
                    }

                # 不带扩展名匹配
                if not ext or ext not in supported_exts:
                    for se in supported_exts:
                        full_path = os.path.join(folder_path, name_no_ext + se)
                        if os.path.isfile(full_path):
                            return {
                                "name": model_name,
                                "type": folder_name,
                                "missing": False,
                                "local_path": str(full_path),
                            }

        # 确定最可能的模型类型
        likely_type = self._guess_model_type(model_name)

        return {
            "name": model_name,
            "type": likely_type,
            "missing": True,
            "local_path": None,
        }

    def _guess_model_type(self, model_name: str) -> str:
        """根据模型名猜测模型类型"""
        name_lower = model_name.lower()
        if "lora" in name_lower or "lycoris" in name_lower:
            return "loras"
        if "vae" in name_lower:
            return "vae"
        if "controlnet" in name_lower or "cnet" in name_lower or "t2i" in name_lower:
            return "controlnet"
        if "clip" in name_lower or "text_encoder" in name_lower:
            return "text_encoders"
        if "upscale" in name_lower or "esrgan" in name_lower or "realesrgan" in name_lower:
            return "upscale_models"
        if "embedding" in name_lower or "ti" in name_lower:
            return "embeddings"
        if "gligen" in name_lower:
            return "gligen"
        if "hypernetwork" in name_lower:
            return "hypernetworks"
        if "photomaker" in name_lower:
            return "photomaker"
        if "detect" in name_lower or "yolo" in name_lower or "sam" in name_lower:
            return "detection"
        if "clip_vision" in name_lower:
            return "clip_vision"
        # 默认当主模型
        return "checkpoints"

    async def _get_download_link(self, model_name: str, source: str = "civitai",
                                  quark_cookie: str = "") -> dict:
        """获取模型下载链接"""
        results = []

        if source == "civitai":
            try:
                async with aiohttp.ClientSession() as session:
                    # 在 Civitai 搜索模型
                    params = {"query": model_name, "limit": 5}
                    async with session.get(
                        MODEL_DOWNLOAD_SOURCES["civitai"]["search_url"],
                        params=params
                    ) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            for item in data.get("items", [])[:5]:
                                versions = item.get("modelVersions", [])
                                if versions:
                                    v = versions[0]
                                    model_id = v.get("id")
                                    dl_files = v.get("downloads", [])
                                    for f in dl_files:
                                        results.append({
                                            "source": "Civitai",
                                            "url": f"https://civitai.com/api/download/models/{model_id}?type={f.get('type', 'Model')}",
                                            "name": item.get("name", model_name),
                                            "version": v.get("name", ""),
                                            "size_mb": round(f.get("sizeKB", 0) / 1024, 1),
                                            "type": f.get("type", "Model"),
                                            "match_score": self._calc_match_score(model_name, item.get("name", "")),
                                        })
            except Exception as e:
                logger.error(f"Civitai 搜索失败: {e}")

        elif source == "quark" and quark_cookie:
            try:
                async with aiohttp.ClientSession(cookies={"cookie": quark_cookie}) as session:
                    # 夸克网盘直链解析（需要用户配置 Cookie）
                    # 这里先返回结构，实际解析在前端配合夸克链接完成
                    results.append({
                        "source": "Quark",
                        "url": "",
                        "name": model_name,
                        "requires_cookie": True,
                        "match_score": 0,
                    })
            except Exception as e:
                logger.error(f"Quark 链接解析失败: {e}")

        # 按匹配度排序
        results.sort(key=lambda x: x.get("match_score", 0), reverse=True)

        return {"model_name": model_name, "results": results}

    def _calc_match_score(self, query: str, candidate: str) -> float:
        """计算模型名匹配度 (0-100)"""
        if not query or not candidate:
            return 0
        q = query.lower().replace('_', ' ').replace('-', ' ')
        c = candidate.lower().replace('_', ' ').replace('-', ' ')

        if q == c:
            return 100
        if q in c or c in q:
            return 85

        # 拆分词组计算重叠度
        q_words = set(q.split())
        c_words = set(c.split())
        if not q_words or not c_words:
            return 0
        overlap = len(q_words & c_words)
        score = (overlap / max(len(q_words), 1)) * 70
        return min(score, 80)

    async def _download_model(self, url: str, model_name: str, model_type: str,
                               quark_cookie: str = "") -> str:
        """下载模型到对应目录"""
        task_id = f"dl_{self._task_counter}"
        self._task_counter += 1

        # 确定保存目录
        target_dir = None
        if model_type in folder_paths.folder_names_and_paths:
            paths_list = folder_paths.folder_names_and_paths[model_type][0]
            if paths_list:
                target_dir = paths_list[0]

        if not target_dir:
            os.makedirs(os.path.join(folder_paths.models_dir, model_type), exist_ok=True)
            target_dir = os.path.join(folder_paths.models_dir, model_type)

        os.makedirs(target_dir, exist_ok=True)

        # 下载状态更新
        self.download_tasks[task_id] = {
            "status": "downloading",
            "model_name": model_name,
            "url": url,
            "progress": 0,
            "size_mb": 0,
            "downloaded_mb": 0,
        }

        try:
            headers = {}
            cookies = {}
            if quark_cookie:
                cookies["cookie"] = quark_cookie

            async with aiohttp.ClientSession(cookies=cookies) as session:
                async with session.get(url, headers=headers) as resp:
                    if resp.status != 200:
                        raise Exception(f"HTTP {resp.status}")

                    total = int(resp.headers.get("Content-Length", 0))
                    chunk_size = 1024 * 1024  # 1MB chunks
                    downloaded = 0

                    # 从 URL 或 Content-Disposition 获取文件名
                    filename = model_name
                    cd = resp.headers.get("Content-Disposition", "")
                    if "filename=" in cd:
                        fn = cd.split("filename=")[1].strip('"').strip("'")
                        if fn:
                            filename = fn

                    save_path = os.path.join(target_dir, filename)

                    with open(save_path, "wb") as f:
                        async for chunk in resp.content.iter_chunked(chunk_size):
                            f.write(chunk)
                            downloaded += len(chunk)
                            progress = (downloaded / total * 100) if total > 0 else 0
                            self.download_tasks[task_id].update({
                                "progress": round(progress, 1),
                                "size_mb": round(total / 1024 / 1024, 1),
                                "downloaded_mb": round(downloaded / 1024 / 1024, 1),
                            })

                    self.download_tasks[task_id].update({
                        "status": "completed",
                        "progress": 100,
                        "save_path": str(save_path),
                    })

                    # 刷新 folder_paths 缓存
                    folder_paths.clear_filename_list_cache()

                    return task_id

        except Exception as e:
            self.download_tasks[task_id].update({
                "status": "failed",
                "error": str(e),
            })
            raise

    async def _load_local_model(self, file_path: str, model_name: str, model_type: str) -> dict:
        """从本地加载模型（复制到正确目录并创建符号链接/快捷方式）"""
        if not os.path.isfile(file_path):
            return {"success": False, "error": f"文件不存在: {file_path}"}

        # 确定目标目录
        target_dir = None
        if model_type in folder_paths.folder_names_and_paths:
            paths_list = folder_paths.folder_names_and_paths[model_type][0]
            if paths_list:
                target_dir = paths_list[0]

        if not target_dir:
            return {"success": False, "error": f"未知的模型类型: {model_type}"}

        os.makedirs(target_dir, exist_ok=True)

        # 获取文件名
        filename = os.path.basename(file_path)
        target_path = os.path.join(target_dir, filename)

        # 如果目标已存在
        if os.path.exists(target_path):
            return {"success": False, "error": f"目标位置已存在文件: {target_path}"}

        try:
            # Windows: 创建符号链接（需要管理员权限）或直接复制
            try:
                os.symlink(os.path.abspath(file_path), target_path)
                method = "symlink"
            except (OSError, NotImplementedError):
                import shutil
                shutil.copy2(file_path, target_path)
                method = "copy"

            # 刷新缓存
            folder_paths.clear_filename_list_cache()

            return {
                "success": True,
                "method": method,
                "target_path": str(target_path),
                "filename": filename,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _locate_reference_node(self, model_name: str, workflow_data: dict) -> dict:
        """定位工作流中引用该模型的节点"""
        if not workflow_data:
            return {"found": False}

        nodes = workflow_data.get("nodes", [])
        references = []

        for node in nodes:
            widgets_values = node.get("widgets_values", [])
            if isinstance(widgets_values, list):
                for idx, val in enumerate(widgets_values):
                    if isinstance(val, str) and model_name in val:
                        references.append({
                            "node_id": node.get("id"),
                            "node_type": node.get("type", "Unknown"),
                            "widget_index": idx,
                            "widget_value": val,
                            "pos": node.get("pos", [0, 0]),
                        })

            # 也检查 properties
            props = node.get("properties", {})
            for key, val in props.items():
                if isinstance(val, str) and model_name in val:
                    references.append({
                        "node_id": node.get("id"),
                        "node_type": node.get("type", "Unknown"),
                        "property_key": key,
                        "property_value": val,
                        "pos": node.get("pos", [0, 0]),
                    })

        return {
            "found": len(references) > 0,
            "references": references,
        }

    async def _get_registered_nodes(self) -> list:
        """获取所有已注册的节点类型"""
        from nodes import NODE_CLASS_MAPPINGS as core_mappings

        registered = list(core_mappings.keys())

        # 扫描 custom_nodes 的映射
        import comfy.utils
        try:
            cn_mappings = comfy.utils.get_custom_nodes()
            for node_name in cn_mappings:
                if node_name not in registered:
                    registered.append(node_name)
        except Exception:
            pass

        return registered

    def setup(self):
        """注册 API 路由"""

        @PromptServer.instance.routes.post("/findmodels/scan")
        async def scan_workflow(request):
            """扫描当前工作流中的缺失模型和节点"""
            try:
                data = await request.json()
                workflow_data = data.get("workflow", {})
                result = await self._scan_workflow_missing(workflow_data)
                return web.json_response(result)
            except Exception as e:
                logger.error(f"扫描工作流失败: {e}")
                return web.json_response({"error": str(e)}, status=500)

        @PromptServer.instance.routes.post("/findmodels/search")
        async def search_download(request):
            """搜索模型下载源"""
            try:
                data = await request.json()
                model_name = data.get("model_name", "")
                source = data.get("source", "civitai")
                quark_cookie = data.get("quark_cookie", "")
                result = await self._get_download_link(model_name, source, quark_cookie)
                return web.json_response(result)
            except Exception as e:
                logger.error(f"搜索下载源失败: {e}")
                return web.json_response({"error": str(e)}, status=500)

        @PromptServer.instance.routes.post("/findmodels/download")
        async def download_model(request):
            """下载模型"""
            try:
                data = await request.json()
                url = data.get("url", "")
                model_name = data.get("model_name", "")
                model_type = data.get("model_type", "checkpoints")
                quark_cookie = data.get("quark_cookie", "")
                task_id = await self._download_model(url, model_name, model_type, quark_cookie)
                return web.json_response({"task_id": task_id})
            except Exception as e:
                logger.error(f"下载模型失败: {e}")
                return web.json_response({"error": str(e)}, status=500)

        @PromptServer.instance.routes.get("/findmodels/download/status")
        async def download_status(request):
            """查询下载任务状态"""
            return web.json_response(self.download_tasks)

        @PromptServer.instance.routes.post("/findmodels/load-local")
        async def load_local(request):
            """从本地加载模型"""
            try:
                data = await request.json()
                file_path = data.get("file_path", "")
                model_name = data.get("model_name", "")
                model_type = data.get("model_type", "checkpoints")
                result = await self._load_local_model(file_path, model_name, model_type)
                return web.json_response(result)
            except Exception as e:
                logger.error(f"加载本地模型失败: {e}")
                return web.json_response({"error": str(e)}, status=500)

        @PromptServer.instance.routes.post("/findmodels/locate")
        async def locate_reference(request):
            """定位模型引用节点"""
            try:
                data = await request.json()
                model_name = data.get("model_name", "")
                workflow_data = data.get("workflow", {})
                result = await self._locate_reference_node(model_name, workflow_data)
                return web.json_response(result)
            except Exception as e:
                logger.error(f"定位引用节点失败: {e}")
                return web.json_response({"error": str(e)}, status=500)

        @PromptServer.instance.routes.get("/findmodels/registered-nodes")
        async def get_registered_nodes(request):
            """获取已注册节点列表"""
            try:
                nodes = await self._get_registered_nodes()
                return web.json_response({"nodes": nodes})
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)

        @PromptServer.instance.routes.post("/findmodels/check-missing-nodes")
        async def check_missing_nodes(request):
            """检查工作流中的缺失节点"""
            try:
                data = await request.json()
                workflow_data = data.get("workflow", {})
                registered = await self._get_registered_nodes()

                nodes = workflow_data.get("nodes", [])
                missing = []
                seen = set()

                for node in nodes:
                    node_type = node.get("type", "")
                    if node_type and node_type not in registered and node_type not in seen:
                        seen.add(node_type)
                        missing.append(node_type)

                return web.json_response({"missing_nodes": missing})
            except Exception as e:
                logger.error(f"检查缺失节点失败: {e}")
                return web.json_response({"error": str(e)}, status=500)

        @PromptServer.instance.routes.post("/findmodels/browse")
        async def browse_local(request):
            """浏览本地文件系统选择模型"""
            try:
                data = await request.json()
                path = data.get("path", "")
                if not path:
                    path = folder_paths.models_dir

                if not os.path.isdir(path):
                    return web.json_response({"error": "目录不存在"}, status=400)

                entries = []
                for item in os.scandir(path):
                    try:
                        entry = {
                            "name": item.name,
                            "is_dir": item.is_dir(),
                            "size": item.stat().st_size if item.is_file() else 0,
                        }
                        if item.is_file():
                            entry["size_mb"] = round(item.stat().st_size / 1024 / 1024, 1)
                        entries.append(entry)
                    except OSError:
                        continue

                entries.sort(key=lambda x: (0 if x["is_dir"] else 1, x["name"]))
                return web.json_response({"path": path, "entries": entries})
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)

        @PromptServer.instance.routes.get("/findmodels/model-types")
        async def get_model_types(request):
            """获取所有支持的模型类型"""
            types = {}
            for name, (paths, exts) in folder_paths.folder_names_and_paths.items():
                if name in ("custom_nodes", "classifiers"):
                    continue
                label = MODEL_TYPE_LABELS.get(name, name)
                types[name] = {
                    "label": label,
                    "paths": paths,
                    "extensions": list(exts) if exts else [],
                }
            return web.json_response(types)


# 全局扩展实例
extension = FindModelsExtension()


def register_routes():
    """注册 API 路由（由 __init__.py 在导入时调用）"""
    try:
        extension.setup()
    except Exception as e:
        logger.error(f"注册路由失败: {e}")
