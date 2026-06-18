/**
 * ComfyUI-FindModels: Frontend extension
 *
 * Uses ComfyUI's official extension API:
 *   - actionBarButtons: adds "查找模型" button to the top action bar (same row as Queue Prompt)
 *   - commands + menuCommands: adds menu entries
 *   - getCanvasMenuItems: right-click canvas menu
 *
 * Features:
 *   - Auto-captures the current workflow and scans for missing models
 *   - Displays results in a modal with download buttons
 *   - Downloads models and auto-sorts them into the correct model folder
 *   - Search sources: 夸克网盘, CivitAI, HuggingFace
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "ComfyUI-FindModels";

// ──────────────────────────────────────────────
// UI Helpers
// ──────────────────────────────────────────────

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function createModal(title, content) {
    // Remove existing modal if any
    const existing = document.getElementById("findmodels-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "findmodels-overlay";
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); z-index: 99999;
        display: flex; align-items: center; justify-content: center;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
        background: #1e1e2e; color: #cdd6f4; border-radius: 12px;
        padding: 24px; max-width: 900px; width: 90%; max-height: 85vh;
        overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    const header = document.createElement("div");
    header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;";
    header.innerHTML = `
        <h2 style="margin: 0; color: #89b4fa; font-size: 18px;">${title}</h2>
        <button id="findmodels-close" style="background: none; border: none; color: #a6adc8; font-size: 20px; cursor: pointer; padding: 4px 8px;">✕</button>
    `;

    const body = document.createElement("div");
    body.id = "findmodels-body";
    body.style.cssText = "line-height: 1.6; font-size: 14px;";
    body.innerHTML = content;

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector("#findmodels-close").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    return { overlay, close, body };
}

// ──────────────────────────────────────────────
// Download with auto-sort
// ──────────────────────────────────────────────

async function downloadAndSortModel(modelName, category, downloadUrl, sourceType) {
    const safeId = modelName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const statusEl = document.getElementById(`dl-status-${safeId}`);
    if (statusEl) {
        statusEl.innerHTML = `<span style="color: #f9e2af;">⬇️ 正在从 ${escapeHtml(sourceType)} 下载...</span>`;
    }

    try {
        const resp = await api.fetchApi("/findmodels/download_and_sort", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model_name: modelName,
                category: category,
                download_url: downloadUrl,
            }),
        });

        const result = await resp.json();

        if (result.success) {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color: #a6e3a1;">✅ 已保存到: ${escapeHtml(result.saved_path)}</span>`;
            }
            const card = document.getElementById(`model-card-${safeId}`);
            if (card) card.style.borderLeftColor = "#a6e3a1";
        } else {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color: #f38ba8;">❌ ${escapeHtml(result.error || "下载失败")}</span>`;
            }
        }
    } catch (e) {
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: #f38ba8;">❌ 错误: ${escapeHtml(e.message)}</span>`;
        }
    }
}

// Expose globally for onclick handlers
window._findModelsDownload = downloadAndSortModel;

// ──────────────────────────────────────────────
// Workflow Analysis
// ──────────────────────────────────────────────

async function captureCurrentWorkflow() {
    return await app.graphToPrompt();
}

async function runFindMissingModels() {
    let loadingModal;
    try {
        loadingModal = createModal(
            "🔍 查找模型",
            `<div style="text-align: center; padding: 20px;">
                <div style="font-size: 24px;">⏳</div>
                <p>正在扫描工作流中的缺失模型...</p>
            </div>`
        );

        const workflow = await captureCurrentWorkflow();
        const workflowJson = JSON.stringify(workflow);

        let scanResult;
        try {
            const resp = await api.fetchApi("/findmodels/scan_workflow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflow: JSON.parse(workflowJson) }),
            });

            if (resp.ok) {
                scanResult = await resp.json();
            }
        } catch (e) {
            console.warn("[FindModels] Server scan failed:", e);
        }

        loadingModal.close();

        if (scanResult) {
            displayResults(scanResult);
        } else {
            const parsed = JSON.parse(workflowJson);
            await runLocalAnalysis(parsed);
        }

    } catch (error) {
        if (loadingModal) loadingModal.close();
        console.error("[FindModels] Error:", error);
        createModal("❌ 错误", `<p>扫描失败: ${escapeHtml(error.message)}</p>`);
    }
}

async function runLocalAnalysis(workflow) {
    const models = extractModelsFromWorkflow(workflow);
    const missing = [];

    for (const model of models) {
        try {
            const resp = await api.fetchApi(
                `/findmodels/check?category=${encodeURIComponent(model.category || "")}&name=${encodeURIComponent(model.model_name)}`
            );
            if (resp.ok) {
                const data = await resp.json();
                model.status = data.exists ? "found" : "missing";
                model.local_path = data.local_path || null;
            } else {
                model.status = "missing";
            }
        } catch {
            model.status = "missing";
        }
        if (model.status === "missing") {
            try {
                const resp = await api.fetchApi(
                    `/findmodels/download_links?category=${encodeURIComponent(model.category || "")}&name=${encodeURIComponent(model.model_name)}`
                );
                if (resp.ok) {
                    const data = await resp.json();
                    model.download_links = data.links || [];
                }
            } catch {}
            missing.push(model);
        }
    }

    displayResultsFromModels(models, missing);
}

function extractModelsFromWorkflow(workflow) {
    const models = [];
    const nodes = workflow?.nodes || [];

    const patterns = [
        { type: "CheckpointLoaderSimple", input: "ckpt_name", category: "checkpoints" },
        { type: "CheckpointLoader", input: "ckpt_name", category: "checkpoints" },
        { type: "LoraLoader", input: "lora_name", category: "lora" },
        { type: "LoraLoaderModelOnly", input: "lora_name", category: "lora" },
        { type: "VAELoader", input: "vae_name", category: "vae" },
        { type: "ControlNetLoader", input: "control_net_name", category: "controlnet" },
        { type: "CLIPLoader", input: "clip_name", category: "clip" },
        { type: "CLIPVisionLoader", input: "clip_name", category: "clip_vision" },
        { type: "DualCLIPLoader", input: "clip_name1", category: "clip" },
        { type: "UNETLoader", input: "unet_name", category: "unet" },
        { type: "UpscaleModelLoader", input: "model_name", category: "upscale" },
        { type: "HypernetworkLoader", input: "hypernetwork_name", category: "hypernetworks" },
        { type: "StyleModelLoader", input: "style_model_name", category: "style_models" },
        { type: "unCLIPCheckpointLoader", input: "ckpt_name", category: "unclip" },
        { type: "GLIGENLoader", input: "gligen_name", category: "gligen" },
        { type: "IPAdapterModelLoader", input: "ipadapter_file", category: "ipadapter" },
        { type: "InstantIDModelLoader", input: "instantid_file", category: "instantid" },
    ];

    for (const node of nodes) {
        const nodeType = node.type || "";
        const widgets = node.widgets_values || [];

        for (const p of patterns) {
            if (nodeType === p.type || nodeType.includes(p.type)) {
                const idx = node.inputs?.findIndex(i => i.name === p.input);
                if (idx !== undefined && idx >= 0 && widgets[idx]) {
                    models.push({
                        node_id: node.id,
                        node_type: nodeType,
                        input_name: p.input,
                        model_name: widgets[idx],
                        category: p.category,
                    });
                }
            }
        }
    }

    return models;
}

// ──────────────────────────────────────────────
// Results Display
// ──────────────────────────────────────────────

function renderDownloadButtons(modelName, category, links) {
    const safeId = modelName.replace(/[^a-zA-Z0-9_-]/g, "_");
    let html = `<div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">`;

    const directLinks = links.filter(l => l.type === "direct");
    for (const link of directLinks) {
        const btnColor =
            link.source === "CivitAI" ? "#a78bfa" :
            link.source === "HuggingFace" ? "#f38ba8" :
            link.source === "夸克网盘" ? "#89dceb" : "#89b4fa";
        const escapedUrl = escapeHtml(link.url);
        const escapedSource = escapeHtml(link.source);
        const escapedDesc = escapeHtml(link.description);
        html += `
            <button onclick="window._findModelsDownload('${escapeHtml(modelName)}', '${escapeHtml(category)}', '${escapedUrl}', '${escapedSource}')"
                    style="background: ${btnColor}; color: #1e1e2e; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">
                ⬇️ ${escapedSource}: ${escapedDesc}
            </button>
        `;
    }

    const searchLinks = links.filter(l => l.type === "search");
    for (const link of searchLinks) {
        const icon =
            link.source === "CivitAI" ? "🔍" :
            link.source === "HuggingFace" ? "🔍" :
            link.source === "夸克网盘" ? "☁️" : "🔍";
        html += `
            <a href="${escapeHtml(link.url)}" target="_blank"
               style="background: #45475a; color: #cdd6f4; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                ${icon} ${escapeHtml(link.source)}
            </a>
        `;
    }

    html += `</div>`;
    return html;
}

function displayResults(data) {
    const { total, found_count, missing_count, missing, found } = data;
    const allModels = [...(found || []), ...(missing || [])];
    displayResultsFromModels(allModels, missing || []);
}

function displayResultsFromModels(allModels, missing) {
    const total = allModels.length;
    const found = total - missing.length;

    let html = `
        <div style="margin-bottom: 16px; padding: 12px; background: #313244; border-radius: 8px;">
            <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                <span>📊 总计: <strong>${total}</strong></span>
                <span>✅ 已有: <strong style="color: #a6e3a1;">${found}</strong></span>
                <span>❌ 缺失: <strong style="color: #f38ba8;">${missing.length}</strong></span>
            </div>
        </div>
    `;

    if (missing.length === 0) {
        html += `<div style="text-align: center; padding: 20px; color: #a6e3a1;">🎉 所有模型都已就绪！</div>`;
    } else {
        html += `<div style="margin-top: 8px;">`;
        for (const m of missing) {
            const links = m.download_links || [];
            const arch = m.architecture || "";
            const mtype = m.model_type || "";
            const category = m.category || "unknown";
            const targetFolder = `models/${category}`;
            const safeId = m.model_name.replace(/[^a-zA-Z0-9_-]/g, "_");

            html += `
                <div id="model-card-${safeId}" style="padding: 12px; margin: 8px 0; background: #313244; border-radius: 8px; border-left: 3px solid #f38ba8;">
                    <div>
                        <div style="font-weight: bold; color: #f38ba8;">❌ ${escapeHtml(m.model_name)}</div>
                        <div style="color: #a6adc8; font-size: 12px; margin-top: 4px;">
                            📁 保存到: <code style="background: #45475a; padding: 1px 4px; border-radius: 3px;">${escapeHtml(targetFolder)}</code> |
                            分类: ${escapeHtml(category)}${arch ? ` | 架构: ${escapeHtml(arch)}` : ""}${mtype ? ` | 类型: ${escapeHtml(mtype)}` : ""}
                        </div>
                    </div>
                    ${links.length > 0 ? renderDownloadButtons(m.model_name, category, links) : `
                        <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
                            <a href="https://pan.quark.cn/search?q=${encodeURIComponent(m.model_name)}" target="_blank" style="background: #45475a; color: #89dceb; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-size: 12px;">☁️ 夸克网盘</a>
                            <a href="https://civitai.com/models?query=${encodeURIComponent(m.model_name)}" target="_blank" style="background: #45475a; color: #cdd6f4; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-size: 12px;">🔍 CivitAI</a>
                            <a href="https://huggingface.co/models?search=${encodeURIComponent(m.model_name)}" target="_blank" style="background: #45475a; color: #cdd6f4; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-size: 12px;">🔍 HuggingFace</a>
                        </div>
                    `}
                    <div id="dl-status-${safeId}" style="margin-top: 6px; font-size: 12px;"></div>
                </div>
            `;
        }
        html += `</div>`;
    }

    createModal("🔍 查找模型 — 结果", html);
}

// ──────────────────────────────────────────────
// Export model list
// ──────────────────────────────────────────────

async function exportModelList() {
    try {
        const workflow = await captureCurrentWorkflow();
        const models = extractModelsFromWorkflow(workflow);

        if (models.length === 0) {
            createModal("📋 模型列表", "<p>当前工作流中没有模型引用。</p>");
            return;
        }

        let html = `<div style="font-family: monospace;">`;
        for (const m of models) {
            html += `<div style="padding: 4px 0;">${escapeHtml(m.model_name)} <span style="color: #a6adc8;">(${m.category})</span></div>`;
        }
        html += `</div>`;
        html += `<button onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText)" style="margin-top: 12px; padding: 8px 16px; background: #89b4fa; color: #1e1e2e; border: none; border-radius: 6px; cursor: pointer;">📋 复制到剪贴板</button>`;

        createModal("📋 模型列表", html);
    } catch (e) {
        createModal("❌ 错误", `<p>${escapeHtml(e.message)}</p>`);
    }
}

// ──────────────────────────────────────────────
// Extension Registration — using official ComfyUI APIs
// ──────────────────────────────────────────────

const extension = {
    name: EXTENSION_NAME,

    /**
     * Add "查找模型" button to the action bar (same row as Queue Prompt).
     * This is the official ComfyUI API for action bar buttons.
     */
    actionBarButtons: [
        {
            icon: "icon-[lucide--search]",
            label: "查找模型",
            tooltip: "扫描工作流中缺失的模型",
            onClick: () => runFindMissingModels(),
        },
    ],

    /**
     * Register commands that can be triggered from menus and keybindings.
     */
    commands: [
        {
            id: "comfyui-findmodels.scan",
            label: "查找缺失模型",
            icon: "icon-[lucide--search]",
            callback: () => runFindMissingModels(),
        },
        {
            id: "comfyui-findmodels.export",
            label: "导出模型列表",
            icon: "icon-[lucide--clipboard-list]",
            callback: () => exportModelList(),
        },
    ],

    /**
     * Add menu entries in the top menu bar.
     */
    menuCommands: [
        {
            path: ["查找模型"],
            commands: ["comfyui-findmodels.scan", "comfyui-findmodels.export"],
        },
    ],

    /**
     * Add right-click canvas menu items (legacy support).
     */
    getCanvasMenuItems(canvas) {
        return [
            {
                content: "🔍 查找缺失模型",
                callback: () => runFindMissingModels(),
            },
            {
                content: "📋 导出模型列表",
                callback: () => exportModelList(),
            },
        ];
    },

    /**
     * Add "Capture Current Workflow" button to FindMissingModels node.
     */
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "FindMissingModels") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                origOnNodeCreated?.apply(this, arguments);
                this.addWidget(
                    "button",
                    "📋 捕获当前工作流",
                    null,
                    async () => {
                        try {
                            const workflow = await captureCurrentWorkflow();
                            const workflowStr = JSON.stringify(workflow, null, 2);
                            const jsonWidget = this.widgets?.find(w => w.name === "workflow_json");
                            if (jsonWidget) {
                                jsonWidget.value = workflowStr;
                                jsonWidget.callback?.(workflowStr);
                            }
                        } catch (e) {
                            console.error("[FindModels] Capture failed:", e);
                        }
                    }
                );
            };
        }
    },
};

app.registerExtension(extension);
