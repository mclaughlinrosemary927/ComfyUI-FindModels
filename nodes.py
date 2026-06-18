"""
ComfyUI-FindModels: Node definitions and model registry.
"""

from .find_models import FindMissingModels, AutoMatchModels, GetModelDownloadLinks

NODE_CLASS_MAPPINGS = {
    "FindMissingModels": FindMissingModels,
    "AutoMatchModels": AutoMatchModels,
    "GetModelDownloadLinks": GetModelDownloadLinks,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FindMissingModels": "🔍 Find Missing Models",
    "AutoMatchModels": "🔄 Auto Match Models",
    "GetModelDownloadLinks": "⬇️ Get Model Download Links",
}

WEB_DIRECTORY = "./js"
