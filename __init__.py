"""
ComfyUI-FindModels: Automatically detect missing models in workflows,
suggest compatible alternatives, and provide direct download links.
"""

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS, WEB_DIRECTORY

__version__ = "1.0.0"
__author__ = "ComfyUI-FindModels"


def on_app_started(app):
    """Called when ComfyUI app starts. Register API routes."""
    from .api import register_routes
    register_routes(app)


# ComfyUI looks for this special variable for app lifecycle hooks
HOOKS = {
    "on_app_started": on_app_started,
}
