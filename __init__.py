from .styles_selector import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# CRITICAL: This lets ComfyUI serve the frontend javascript and assets
WEB_DIRECTORY = "./js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']