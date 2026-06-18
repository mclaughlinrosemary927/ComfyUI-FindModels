/**
 * ComfyUI-FindModels: Frontend extension
 * 
 * - Adds "🔍 FindModels" button to the action bar (same row as Queue Prompt)
 * - Auto-captures the current workflow JSON and sends to the backend node
 * - Displays results in a clean modal dialog with download & auto-sort support
 * - Downloads models and automatically places them in the correct model folder
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "ComfyUI-FindModels";

// ──────────────────────────────────────────────
// UI Helpers
// ──────────────────────────────────────────────

function createModal(title, content, options = {}) {
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

    const close = () => {
        if (document.getElementById("findmodels-overlay")) {
            document.body.removeChild(overlay);
        }
    };
    overlay.querySelector("#findmodels-close").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    return { overlay, close, body };
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ──────────────────────────────────────────────
// Download with auto-sort to model folder
// ──────────────────────────────────────────────

async function downloadAndSortModel(modelName, category, downloadUrl, sourceType) {
    const statusEl = document.getElementById(`dl-status-${CSS.escape(modelName)}`);
    if (statusEl) {
        statusEl.innerHTML = `<span style="color: #f9e2af;">⬇️ Downloading from ${sourceType}...</span>`;
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
                statusEl.innerHTML = `<span style="color: #a6e3a1;">✅ Saved to: ${escapeHtml(result.saved_path)}</span>`;
            }
            // Mark the card as resolved
            const card = document.getElementById(`model-card-${CSS.escape(modelName)}`);
            if (card) {
                card.style.borderLeftColor = "#a6e3a1";
            }
        } else {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color: #f38ba8;">❌ ${escapeHtml(result.error || "Download failed")}</span>`;
            }
        }
    } catch (e) {
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: #f38ba8;">❌ Error: ${escapeHtml(e.message)}</span>`;
        }
    }
}

// ──────────────────────────────────────────────
// Workflow Capture & Analysis
// ──────────────────────────────────────────────

async function captureCurrentWorkflow() {
    const workflow = app.graphToPrompt();
    return workflow;
}

async function runFindMissingModels() {
    let loadingOverlay;
    try {
        loadingOverlay = createModal(
            "🔍 Finding Missing Models",
            `<div style="text-align: center; padding: 20px;">
                <div style="font-size: 24px; animation: findmodels-spin 1s linear infinite;">⏳</div>
                <p>Scanning workflow for missing models...</p>
            </div>
            <style>@keyframes findmodels-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>`
        );

        // Try server-side scan first
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
            console.warn("[FindModels] Server scan failed, falling back to client-side:", e);
        }

        loadingOverlay.close();

        if (scanResult) {
            displayServerResults(scanResult);
        } else {
            // Fallback: client-side analysis
            const parsedWorkflow = JSON.parse(workflowJson);
            await runLocalAnalysis(parsedWorkflow);
        }

    } catch (error) {
        if (loadingOverlay) loadingOverlay.close();
        console.error("[FindModels] Error:", error);
        createModal("❌ Error", `<p>Failed to analyze workflow: ${escapeHtml(error.message)}</p>`);
    }
}

async function runLocalAnalysis(workflow) {
    const models = extractModelsFromWorkflow(workflow);
    const missing = [];

    for (const model of models) {
        try {
            const resp = await api.fetchApi(`/findmodels/check?category=${encodeURIComponent(model.category || "")}&name=${encodeURIComponent(model.model_name)}`);
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
            // Fetch download links for each missing model
            try {
                const resp = await api.fetchApi(`/findmodels/download_links?category=${encodeURIComponent(model.category || "")}&name=${encodeURIComponent(model.model_name)}`);
                if (resp.ok) {
                    const data = await resp.json();
                    model.download_links = data.links || [];
                }
            } catch {}
            missing.push(model);
        }
    }

    displayAnalysisResults(models, missing);
}

function extractModelsFromWorkflow(workflow) {
    const models = [];
    const nodes = workflow?.nodes || [];

    const modelInputPatterns = [
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
        { type: "CLIPLoader", input: "clip_name", category: "text_encoders" },
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

        for (const pattern of modelInputPatterns) {
            if (nodeType === pattern.type || nodeType.includes(pattern.type)) {
                const widgetIndex = node.inputs?.findIndex(i => i.name === pattern.input);
                if (widgetIndex !== undefined && widgetIndex >= 0 && widgets[widgetIndex]) {
                    models.push({
                        node_id: node.id,
                        node_type: nodeType,
                        input_name: pattern.input,
                        model_name: widgets[widgetIndex],
                        category: pattern.category,
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
    let html = `<div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">`;

    // Direct download buttons (with auto-sort)
    const directLinks = links.filter(l => l.type === "direct");
    for (const link of directLinks) {
        const btnColor = link.source === "CivitAI" ? "#a78bfa" :
                         link.source === "HuggingFace" ? "#f38ba8" :
                         link.source === "夸克网盘" ? "#89dceb" : "#89b4fa";
        html += `
            <button onclick="window._findModelsDownload('${escapeHtml(modelName)}', '${escapeHtml(category)}', '${escapeHtml(link.url)}', '${escapeHtml(link.source)}')"
                    style="background: ${btnColor}; color: #1e1e2e; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">
                ⬇️ ${escapeHtml(link.source)}: ${escapeHtml(link.description)}
            </button>
        `;
    }

    // Search links
    const searchLinks = links.filter(l => l.type === "search");
    for (const link of searchLinks) {
        const icon = link.source === "CivitAI" ? "🔍" :
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

function displayServerResults(data) {
    const { total, found_count, missing_count, missing, found } = data;
    displayAnalysisResults(
        [...(found || []), ...(missing || [])].map(m => ({ ...m, status: m.status || (missing?.includes(m) ? "missing" : "found") })),
        missing || []
    );
}

function displayAnalysisResults(allModels, missing) {
    const total = allModels.length;
    const found = total - missing.length;

    let html = `
        <div style="margin-bottom: 16px; padding: 12px; background: #313244; border-radius: 8px;">
            <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                <span>📊 Total: <strong>${total}</strong></span>
                <span>✅ Found: <strong style="color: #a6e3a1;">${found}</strong></span>
                <span>❌ Missing: <strong style="color: #f38ba8;">${missing.length}</strong></span>
            </div>
        </div>
    `;

    if (missing.length === 0) {
        html += `<div style="text-align: center; padding: 20px; color: #a6e3a1;">🎉 All models are available locally!</div>`;
    } else {
        html += `<div style="margin-top: 8px;">`;
        for (const m of missing) {
            const links = m.download_links || [];
            const arch = m.architecture || "";
            const mtype = m.model_type || "";
            const category = m.category || "unknown";
            const targetFolder = `models/${category}`;

            html += `
                <div id="model-card-${CSS.escape(m.model_name)}" style="padding: 12px; margin: 8px 0; background: #313244; border-radius: 8px; border-left: 3px solid #f38ba8;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="font-weight: bold; color: #f38ba8;">❌ ${escapeHtml(m.model_name)}</div>
                            <div style="color: #a6adc8; font-size: 12px; margin-top: 4px;">
                                📁 Target: <code style="background: #45475a; padding: 1px 4px; border-radius: 3px;">${escapeHtml(targetFolder)}</code> | 
                                Category: ${escapeHtml(category)}${arch ? ` | Arch: ${escapeHtml(arch)}` : ""}${mtype ? ` | Type: ${escapeHtml(mtype)}` : ""}
                            </div>
                        </div>
                    </div>
                    ${links.length > 0 ? renderDownloadButtons(m.model_name, category, links) : `
                        <div style="margin-top: 8px;">
                            <a href="https://civitai.com/models?query=${encodeURIComponent(m.model_name)}" target="_blank" style="color: #89b4fa; text-decoration: none; margin-right: 12px;">🔍 CivitAI</a>
                            <a href="https://huggingface.co/models?search=${encodeURIComponent(m.model_name)}" target="_blank" style="color: #89b4fa; text-decoration: none; margin-right: 12px;">🔍 HuggingFace</a>
                            <a href="https://pan.quark.cn/search?q=${encodeURIComponent(m.model_name)}" target="_blank" style="color: #89dceb; text-decoration: none;">☁️ 夸克网盘</a>
                        </div>
                    `}
                    <div id="dl-status-${CSS.escape(m.model_name)}" style="margin-top: 6px; font-size: 12px;"></div>
                </div>
            `;
        }
        html += `</div>`;
    }

    createModal("🔍 Find Missing Models — Results", html);
}

// ──────────────────────────────────────────────
// Expose download function globally for button onclick
// ──────────────────────────────────────────────

window._findModelsDownload = async function(modelName, category, downloadUrl, source) {
    await downloadAndSortModel(modelName, category, downloadUrl, source);
};

// ──────────────────────────────────────────────
// ComfyUI Extension Registration
// ──────────────────────────────────────────────

const extension = {
    name: EXTENSION_NAME,

    async setup() {
        // ── Inject button into the action bar (same row as Queue Prompt) ──
        const injectButton = () => {
            // Try multiple selectors for the ComfyUI action bar
            const actionBar = document.querySelector("#queue-button")?.parentElement
                || document.querySelector(".comfyui-queue-button")?.parentElement
                || document.querySelector('[id^="queue"]')?.parentElement
                || document.querySelector(".comfy-menu") 
                || document.querySelector("#comfy-menu");

            if (!actionBar) return false;

            // Avoid duplicate injection
            if (document.getElementById("findmodels-action-btn")) return true;

            const btn = document.createElement("button");
            btn.id = "findmodels-action-btn";
            btn.textContent = "🔍 FindModels";
            btn.title = "Scan workflow for missing models";
            btn.style.cssText = `
                background: #45475a; color: #cdd6f4; border: 1px solid #585b70;
                padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
                margin-left: 6px; white-space: nowrap; font-weight: 500;
                transition: background 0.15s, border-color 0.15s;
            `;
            btn.onmouseenter = () => { btn.style.background = "#585b70"; btn.style.borderColor = "#89b4fa"; };
            btn.onmouseleave = () => { btn.style.background = "#45475a"; btn.style.borderColor = "#585b70"; };
            btn.onclick = () => runFindMissingModels();

            // Insert right after the queue button area
            const queueBtn = document.querySelector("#queue-button")
                || document.querySelector(".comfyui-queue-button")
                || actionBar.querySelector("button");
            
            if (queueBtn && queueBtn.nextSibling) {
                actionBar.insertBefore(btn, queueBtn.nextSibling);
            } else {
                actionBar.appendChild(btn);
            }

            return true;
        };

        // Try to inject immediately, then retry with MutationObserver
        if (!injectButton()) {
            const observer = new MutationObserver((mutations, obs) => {
                if (injectButton()) {
                    obs.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            // Safety: stop after 15 seconds
            setTimeout(() => observer.disconnect(), 15000);
        }

        // Also add to right-click canvas menu
        const origGetCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions;
        LGraphCanvas.prototype.getCanvasMenuOptions = function () {
            const options = origGetCanvasMenuOptions.apply(this, arguments);
            options.push(null);
            options.push({
                content: "🔍 Find Missing Models",
                callback: () => runFindMissingModels(),
            });
            options.push({
                content: "📋 Export Model List",
                callback: () => exportModelList(),
            });
            return options;
        };

        console.log("[FindModels] Extension loaded — button in action bar + right-click menu");
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "FindMissingModels") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                origOnNodeCreated?.apply(this, arguments);
                this.addWidget(
                    "button",
                    "📋 Capture Current Workflow",
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

async function exportModelList() {
    try {
        const workflow = await captureCurrentWorkflow();
        const models = extractModelsFromWorkflow(workflow);

        if (models.length === 0) {
            createModal("📋 Model List", "<p>No model references found in current workflow.</p>");
            return;
        }

        let html = `<div style="font-family: monospace;">`;
        for (const m of models) {
            html += `<div style="padding: 4px 0;">${escapeHtml(m.model_name)} <span style="color: #a6adc8;">(${m.category})</span></div>`;
        }
        html += `</div>`;
        html += `<button onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText)" style="margin-top: 12px; padding: 8px 16px; background: #89b4fa; color: #1e1e2e; border: none; border-radius: 6px; cursor: pointer;">📋 Copy to Clipboard</button>`;

        createModal("📋 Model List — Export", html);
    } catch (e) {
        createModal("❌ Error", `<p>${escapeHtml(e.message)}</p>`);
    }
}

app.registerExtension(extension);
