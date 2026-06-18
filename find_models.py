"""
ComfyUI-FindModels: Node implementations.

Three nodes:
1. FindMissingModels — Scan workflow, detect missing models
2. AutoMatchModels — Find local alternatives for missing models
3. GetModelDownloadLinks — Get direct download URLs for missing models
"""

import json
import os
from typing import Any

from .model_registry import (
    parse_workflow_models,
    scan_local_models,
    find_matching_models,
    build_download_links,
    detect_architecture,
    detect_model_type,
    categorize_model,
    MODEL_CATEGORIES,
)

import folder_paths


class FindMissingModels:
    """
    Scans a workflow JSON and identifies all models that are referenced
    but not present in the local model directories.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "workflow_json": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Paste your ComfyUI workflow JSON here, or use the frontend button to auto-detect from canvas."
                }),
            },
            "optional": {
                "check_categories": ("STRING", {
                    "default": "all",
                    "tooltip": "Comma-separated categories to check (e.g., 'checkpoints,lora,vae'). Use 'all' to check everything."
                }),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("missing_models", "all_models", "summary")
    OUTPUT_TOOLTIPS = (
        "JSON list of missing models with details",
        "JSON list of all models found in workflow",
        "Human-readable summary of scan results",
    )
    FUNCTION = "find_missing"
    CATEGORY = "🧭 FindModels"
    DESCRIPTION = "Scan a workflow and detect all missing model files. Outputs structured JSON and a readable summary."

    def find_missing(self, workflow_json: str, check_categories: str = "all"):
        if not workflow_json or not workflow_json.strip():
            return ("[]", "[]", "⚠️ No workflow JSON provided. Paste a workflow or use the frontend auto-detect button.")

        try:
            workflow = json.loads(workflow_json)
        except json.JSONDecodeError as e:
            return ("[]", "[]", f"❌ Invalid JSON: {e}")

        # Parse categories filter
        if check_categories.strip().lower() == "all":
            filter_cats = None
        else:
            filter_cats = {c.strip().lower() for c in check_categories.split(",") if c.strip()}

        # Extract model references from workflow
        referenced_models = parse_workflow_models(workflow)

        # Check which ones are missing
        missing = []
        all_models = []

        for ref in referenced_models:
            category = ref.get("category")
            if not category:
                category = "unknown"
                ref["category"] = category

            if filter_cats and category.lower() not in filter_cats:
                continue

            model_name = ref["model_name"]
            # Normalize path separators
            model_name_norm = model_name.replace("\\", "/")

            # Check local existence
            is_missing = True
            local_path = None

            if category in MODEL_CATEGORIES:
                try:
                    local_models = scan_local_models(category)
                    for lm in local_models:
                        lm_norm = lm.replace("\\", "/")
                        if lm_norm == model_name_norm or lm_norm.endswith("/" + model_name_norm) or lm_norm.endswith(model_name_norm):
                            is_missing = False
                            local_path = lm
                            break
                except Exception:
                    pass

            ref["status"] = "missing" if is_missing else "found"
            ref["local_path"] = local_path
            ref["architecture"] = detect_architecture(model_name)
            ref["model_type"] = detect_model_type(model_name)

            all_models.append(ref)
            if is_missing:
                missing.append(ref)

        # Build summary
        total = len(all_models)
        missing_count = len(missing)
        found_count = total - missing_count

        lines = [
            f"📊 Workflow Scan Results",
            f"━━━━━━━━━━━━━━━━━━━━━━━━━",
            f"Total model references: {total}",
            f"✅ Found locally: {found_count}",
            f"❌ Missing: {missing_count}",
        ]

        if missing:
            lines.append("")
            lines.append("🔍 Missing Models:")
            for m in missing:
                arch_info = f" [{m['architecture']}]" if m.get("architecture") and m["architecture"] != "unknown" else ""
                type_info = f" ({m['model_type']})" if m.get("model_type") else ""
                cat_info = f" ({m['category']})" if m.get("category") else ""
                lines.append(f"  ❌ {m['model_name']}{cat_info}{arch_info}{type_info}")
                lines.append(f"     Node: {m['node_type']} → {m['input_name']}")

        return (
            json.dumps(missing, ensure_ascii=False, indent=2),
            json.dumps(all_models, ensure_ascii=False, indent=2),
            "\n".join(lines),
        )


class AutoMatchModels:
    """
    For each missing model, find locally available alternatives
    that match the same architecture and type.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "missing_models_json": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "JSON output from FindMissingModels node"
                }),
            },
            "optional": {
                "max_suggestions": ("INT", {
                    "default": 5,
                    "min": 1,
                    "max": 20,
                    "tooltip": "Maximum number of alternative suggestions per missing model"
                }),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("match_results", "summary")
    OUTPUT_TOOLTIPS = (
        "JSON with match results including suggested alternatives",
        "Human-readable summary of matches",
    )
    FUNCTION = "auto_match"
    CATEGORY = "🧭 FindModels"
    DESCRIPTION = "Automatically find locally available models that can replace missing ones. Matches by architecture and type."

    def auto_match(self, missing_models_json: str, max_suggestions: int = 5):
        if not missing_models_json or not missing_models_json.strip():
            return ("[]", "⚠️ No missing models data provided. Connect from FindMissingModels node.")

        try:
            missing_models = json.loads(missing_models_json)
        except json.JSONDecodeError as e:
            return ("[]", f"❌ Invalid JSON input: {e}")

        if not isinstance(missing_models, list):
            missing_models = [missing_models]

        results = []
        summary_lines = ["🔄 Auto-Match Results", "━━━━━━━━━━━━━━━━━━━━━━━━━"]

        for m in missing_models:
            model_name = m.get("model_name", "unknown")
            category = m.get("category", "unknown")
            architecture = m.get("architecture", "unknown")
            model_type = m.get("model_type")

            alternatives = find_matching_models(model_name, category, max_suggestions)

            match_info = {
                **m,
                "alternatives": [],
                "auto_match": None,
            }

            if alternatives:
                match_info["alternatives"] = alternatives
                match_info["auto_match"] = alternatives[0]  # Best match

                arch_label = f" [{architecture}]" if architecture != "unknown" else ""
                type_label = f" ({model_type})" if model_type else ""
                summary_lines.append(f"✅ {model_name}{arch_label}{type_label}")
                summary_lines.append(f"   → Best match: {alternatives[0]}")
                if len(alternatives) > 1:
                    summary_lines.append(f"   → Other options: {', '.join(alternatives[1:])}")
            else:
                summary_lines.append(f"❌ {model_name} — No local alternatives found")
                summary_lines.append(f"   → Use GetModelDownloadLinks to find download sources")

            results.append(match_info)

        return (
            json.dumps(results, ensure_ascii=False, indent=2),
            "\n".join(summary_lines),
        )


class GetModelDownloadLinks:
    """
    Generate direct download links for missing models from
    CivitAI, HuggingFace, and other known sources.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "missing_models_json": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "JSON output from FindMissingModels node"
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("download_links", "summary")
    OUTPUT_TOOLTIPS = (
        "JSON with download links for each missing model",
        "Human-readable summary with clickable links",
    )
    FUNCTION = "get_links"
    CATEGORY = "🧭 FindModels"
    DESCRIPTION = "Get direct download links for missing models from CivitAI, HuggingFace, 夸克网盘, and other sources."

    def get_links(self, missing_models_json: str):
        if not missing_models_json or not missing_models_json.strip():
            return ("[]", "⚠️ No missing models data provided. Connect from FindMissingModels node.")

        try:
            missing_models = json.loads(missing_models_json)
        except json.JSONDecodeError as e:
            return ("[]", f"❌ Invalid JSON input: {e}")

        if not isinstance(missing_models, list):
            missing_models = [missing_models]

        results = []
        summary_lines = ["⬇️ Download Links", "━━━━━━━━━━━━━━━━━━━━━━━━━"]

        for m in missing_models:
            model_name = m.get("model_name", "unknown")
            category = m.get("category", "unknown")
            architecture = m.get("architecture")

            links = build_download_links(model_name, category, architecture)

            result = {
                **m,
                "download_links": links,
                "direct_links": [l for l in links if l["type"] == "direct"],
                "search_links": [l for l in links if l["type"] == "search"],
            }
            results.append(result)

            arch_label = f" [{architecture}]" if architecture else ""
            summary_lines.append(f"📦 {model_name} ({category}){arch_label}")

            # Direct links first
            direct = [l for l in links if l["type"] == "direct"]
            if direct:
                summary_lines.append("   🟢 Direct Downloads:")
                for link in direct:
                    summary_lines.append(f"      • [{link['source']}] {link['description']}")
                    summary_lines.append(f"        {link['url']}")

            # Search links
            search = [l for l in links if l["type"] == "search"]
            if search:
                summary_lines.append("   🔍 Search Pages:")
                for link in search:
                    summary_lines.append(f"      • [{link['source']}] {link['description']}")
                    summary_lines.append(f"        {link['url']}")

            summary_lines.append("")

        return (
            json.dumps(results, ensure_ascii=False, indent=2),
            "\n".join(summary_lines),
        )
