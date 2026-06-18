"""
ComfyUI-FindModels: API routes for the web frontend.
Registers custom API endpoints for model checking and downloading.
"""

import os
import json
import urllib.parse
from aiohttp import web

import folder_paths
from .model_registry import (
    scan_local_models,
    find_matching_models,
    build_download_links,
    detect_architecture,
    detect_model_type,
    MODEL_CATEGORIES,
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
        # List all categories with model counts
        result = {}
        for cat in MODEL_CATEGORIES:
            models = scan_local_models(cat)
            result[cat] = {
                "count": len(models),
                "models": models[:100],  # Limit response size
            }
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
                    "name": m,
                    "category": cat,
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
        "missing_model": model_name,
        "category": category,
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

    return web.json_response({
        "model_name": model_name,
        "category": category,
        "architecture": arch,
        "links": links,
    })


@route("POST", "/findmodels/scan_workflow")
async def scan_workflow(request):
    """Scan a workflow JSON for missing models."""
    from .model_registry import parse_workflow_models

    body = await request.json()
    workflow = body.get("workflow", {})

    referenced = parse_workflow_models(workflow)

    missing = []
    found = []

    for ref in referenced:
        category = ref.get("category", "unknown")
        model_name = ref["model_name"]
        model_name_norm = model_name.replace("\\", "/")

        is_missing = True
        local_path = None

        if category in MODEL_CATEGORIES:
            local_models = scan_local_models(category)
            for lm in local_models:
                lm_norm = lm.replace("\\", "/")
                if lm_norm == model_name_norm or lm_norm.endswith("/" + model_name_norm):
                    is_missing = False
                    local_path = lm
                    break

        ref["status"] = "missing" if is_missing else "found"
        ref["local_path"] = local_path
        ref["architecture"] = detect_architecture(model_name)
        ref["model_type"] = detect_model_type(model_name)

        # Add download links for missing models
        if is_missing:
            ref["download_links"] = build_download_links(model_name, category, ref["architecture"])
            ref["alternatives"] = find_matching_models(model_name, category, 5)
            missing.append(ref)
        else:
            found.append(ref)

    return web.json_response({
        "total": len(referenced),
        "found_count": len(found),
        "missing_count": len(missing),
        "missing": missing,
        "found": found,
    })


def register_routes(app):
    """Register all API routes with the aiohttp app."""
    for method, path, handler in routes:
        if method == "GET":
            app.router.add_get(path, handler)
        elif method == "POST":
            app.router.add_post(path, handler)
