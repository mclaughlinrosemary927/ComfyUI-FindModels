"""
ComfyUI-FindModels: 自动识别工作流中缺失的模型和节点，提供直链下载和 GitHub 同步。
"""
from .main import FindModelsExtension

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["FindModelsExtension", "WEB_DIRECTORY", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
