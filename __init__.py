"""
ComfyUI-FindModels: 自动识别工作流中缺失的模型和节点，提供直链下载和 GitHub 同步。
"""
# 注册 API 路由，否则 ComfyUI 不会加载扩展的 HTTP 端点
from .main import register_routes
register_routes()

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["WEB_DIRECTORY", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
