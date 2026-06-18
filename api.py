"""
ComfyUI-FindModels: API routes for the web frontend.
Handles model checking, downloading, and Quark share link resolution.
"""

import os
import json
import urllib.parse
import urllib.request
import shutil
import tempfile
import re
from aiohttp import web

import folder_paths
from .model_registry import (
    scan_local_models,
    find_matching_models,
    build_download_links,
    detect_architecture,
    detect_model_type,
    download_model_to_category,
    get_model_folder_path,
    get_model_size_info,
    MODEL_CATEGORIES,
    QUARK_FIXED_LINKS,
)


routes = []


def route(method, path):
    """Decorator to register API routes."""
    def decorator(func):
        routes.append((method, path, func))
        return func
    return decorator


@route("GET", "/findmodels/check")
async def check_model_exists(request):
    """Check if a specific model exists locally."""
    category = request.query.get("category", "")
    model_name = request.query.get("name", "")

    if not category or not model_name:
        return web.json_response({"error": "Missing category or name parameter"}, status=400)

    local_models = scan_local_models(category)
    model_name_norm = model_name.replace("\\", "/")

    for lm in local_models:
        lm_norm = lm.replace("\\", "/")
        if lm_norm == model_name_norm or lm_norm.endswith("/" + model_name_norm):
            return web.json_response({"exists": True, "local_path": lm})

    return web.json_response({"exists": False, "local_path": None})


@route("GET", "/findmodels/list")
async def list_models(request):
    """List all available models in a category."""
    category = request.query.get("category", "")

    if not category:
        result = {}
        for cat in MODEL_CATEGORIES:
            models = scan_local_models(cat)
            result[cat] = {"count": len(models), "models": models[:100]}
        return web.json_response(result)

    if category not in MODEL_CATEGORIES:
        return web.json_response({"error": f"Unknown category: {category}"}, status=400)

    models = scan_local_models(category)
    return web.json_response({"category": category, "models": models})


@route("GET", "/findmodels/search")
async def search_models(request):
    """Search for models across all categories."""
    query = request.query.get("q", "").lower()
    if not query:
        return web.json_response({"error": "Missing search query"}, status=400)

    results = []
    for cat in MODEL_CATEGORIES:
        models = scan_local_models(cat)
        for m in models:
            if query in m.lower():
                results.append({
                    "name": m, "category": cat,
                    "architecture": detect_architecture(m),
                    "type": detect_model_type(m),
                })

    return web.json_response({"query": query, "results": results[:50]})


@route("GET", "/findmodels/alternatives")
async def get_alternatives(request):
    """Find alternative models for a missing one."""
    category = request.query.get("category", "")
    model_name = request.query.get("name", "")
    max_results = int(request.query.get("max", "5"))

    if not category or not model_name:
        return web.json_response({"error": "Missing category or name"}, status=400)

    alternatives = find_matching_models(model_name, category, max_results)
    return web.json_response({
        "missing_model": model_name, "category": category,
        "alternatives": alternatives,
        "architecture": detect_architecture(model_name),
        "model_type": detect_model_type(model_name),
    })


@route("GET", "/findmodels/download_links")
async def get_download_links(request):
    """Get download links for a missing model."""
    category = request.query.get("category", "")
    model_name = request.query.get("name", "")

    if not category or not model_name:
        return web.json_response({"error": "Missing category or name"}, status=400)

    arch = detect_architecture(model_name)
    links = build_download_links(model_name, category, arch)

    # Get model size info
    size_info = get_model_size_info(model_name, category, arch)

    return web.json_response({
        "model_name": model_name, "category": category,
        "architecture": arch, "links": links, "size_info": size_info,
    })


@route("POST", "/findmodels/download_and_sort")
async def download_and_sort(request):
    """Download a model file and automatically save it to the correct category folder.
    Supports direct URLs and Quark share links."""
    body = await request.json()
    download_url = body.get("download_url", "")
    model_name = body.get("model_name", "")
    category = body.get("category", "")

    if not download_url or not model_name or not category:
        return web.json_response({"success": False, "error": "Missing download_url, model_name, or category"}, status=400)

    # If it's a Quark share link, resolve it first
    if "pan.quark.cn/s/" in download_url:
        resolved = _resolve_quark_share(download_url, model_name)
        if resolved:
            download_url = resolved
        else:
            return web.json_response({
                "success": False,
                "error": "无法解析夸克网盘链接，请手动在浏览器中打开链接下载，然后放入对应文件夹",
                "fallback_url": body.get("download_url", ""),
                "target_folder": get_model_folder_path(category),
            })

    result = download_model_to_category(download_url, model_name, category)
    return web.json_response(result)


@route("GET", "/findmodels/category_path")
async def get_category_path(request):
    """Get the filesystem path for a model category folder."""
    category = request.query.get("category", "")
    if not category:
        return web.json_response({"error": "Missing category"}, status=400)

    path = get_model_folder_path(category)
    return web.json_response({"category": category, "path": path})


@route("POST", "/findmodels/scan_workflow")
async def scan_workflow(request):
    """Scan a workflow JSON for missing models. Only returns missing models."""
    from .model_registry import parse_workflow_models

    body = await request.json()
    workflow = body.get("workflow", {})

    referenced = parse_workflow_models(workflow)
    missing = []

    for ref in referenced:
        category = ref.get("category", "unknown")
        model_name = ref["model_name"]
        model_name_norm = model_name.replace("\\", "/")

        is_missing = True

        if category in MODEL_CATEGORIES:
            local_models = scan_local_models(category)
            for lm in local_models:
                lm_norm = lm.replace("\\", "/")
                if lm_norm == model_name_norm or lm_norm.endswith("/" + model_name_norm):
                    is_missing = False
                    break

        # Only include missing models
        if is_missing:
            ref["status"] = "missing"
            ref["architecture"] = detect_architecture(model_name)
            ref["model_type"] = detect_model_type(model_name)
            ref["download_links"] = build_download_links(model_name, category, ref["architecture"])
            ref["size_info"] = get_model_size_info(model_name, category, ref["architecture"])
            missing.append(ref)

    return web.json_response({
        "missing_count": len(missing),
        "missing": missing,
    })


@route("GET", "/findmodels/quark_fixed_links")
async def get_quark_fixed_links(request):
    """Return the configured Quark fixed resource links."""
    return web.json_response({"links": QUARK_FIXED_LINKS})


# ──────────────────────────────────────────────
# Quark share link resolution
# ──────────────────────────────────────────────

def _resolve_quark_share(share_url: str, target_filename: str) -> str | None:
    """
    Try to resolve a Quark share link to a direct download URL.
    
    Quark share links (pan.quark.cn/s/xxx) require authentication
    and browser interaction. We attempt to get the file info via
    the Quark API, but this may not work without cookies.
    
    Returns the direct download URL, or None if resolution fails.
    """
    import re
    
    # Extract share key from URL
    match = re.search(r'/s/([a-zA-Z0-9]+)', share_url)
    if not match:
        return None
    
    share_key = match.group(1)
    
    try:
        # Step 1: Get share page info (may require cookies)
        req = urllib.request.Request(
            f"https://pan.quark.cn/share/{share_key}",
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        
        # Try to extract file download URL from page data
        # Quark embeds share data in the page as JSON
        data_match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.*?});', html)
        if data_match:
            data = json.loads(data_match.group(1))
            # Navigate the share data structure to find download URLs
            share_data = data.get("share", {})
            files = share_data.get("file_list", share_data.get("files", []))
            
            for f in files:
                fname = f.get("file_name", f.get("name", ""))
                # Match target filename
                if target_filename.lower() in fname.lower() or fname.lower() in target_filename.lower():
                    fid = f.get("fid", f.get("id", ""))
                    if fid:
                        # Construct download URL
                        return f"https://pan.quark.cn/file/{fid}"
        
        return None
        
    except Exception as e:
        print(f"[FindModels] Quark resolution failed: {e}")
        return None


def register_routes(app):
    """Register all API routes with the aiohttp app."""
    for method, path, handler in routes:
        if method == "GET":
            app.router.add_get(path, handler)
        elif method == "POST":
            app.router.add_post(path, handler)
