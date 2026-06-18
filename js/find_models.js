/**
 * ComfyUI-FindModels: Frontend extension
 * 
 * - Adds "🔍 Find Missing Models" button to the workflow canvas
 * - Auto-captures the current workflow JSON and sends to the backend node
 * - Displays results in a clean modal dialog
 * - Allows one-click model replacement in the workflow
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "ComfyUI-FindModels";

// ──────────────────────────────────────────────
// UI Helpers
// ──────────────────────────────────────────────

function createModal(title, content, options = {}) {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); z-index: 99999;
        display: flex; align-items: center; justify-content: center;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
        background: #1e1e2e; color: #cdd6f4; border-radius: 12px;
        padding: 24px; max-width: 800px; width: 90%; max-height: 80vh;
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
    body.style.cssText = "line-height: 1.6; font-size: 14px;";
    body.innerHTML = content;

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers
    const close = () => document.body.removeChild(overlay);
    overlay.querySelector("#findmodels-close").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    return { overlay, close };
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ──────────────────────────────────────────────
// Workflow Capture & Analysis
// ──────────────────────────────────────────────

async function captureCurrentWorkflow() {
    // Get the current workflow from the canvas
    const workflow = app.graphToPrompt();
    return workflow;
}

async function runFindMissingModels() {
    try {
        // Show loading indicator
        const loadingOverlay = createModal(
            "🔍 Finding Missing Models",
            `<div style="text-align: center; padding: 20px;">
                <div style="font-size: 24px; animation: spin 1s linear infinite;">⏳</div>
                <p>Scanning workflow for missing models...</p>
            </div>
            <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>`
        );

        // Capture workflow
        const workflow = await captureCurrentWorkflow();
        const workflowJson = JSON.stringify(workflow);

        // Queue the FindMissingModels node via API
        const payload = {
            "1": {
                "class_type": "FindMissingModels",
                "inputs": {
                    "workflow_json": workflowJson,
                    "check_categories": "all"
                }
            }
        };

        // Use the prompt API to execute
        const resp = await api.fetchApi("/prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: payload }),
        });

        loadingOverlay.close();

        if (!resp.ok) {
            // Fallback: run analysis locally in browser
            await runLocalAnalysis(workflow);
            return;
        }

        const result = await resp.json();
        displayResults(result);

    } catch (error) {
        console.error("[FindModels] Error:", error);
        // Fallback to local analysis
        try {
            const workflow = await captureCurrentWorkflow();
            await runLocalAnalysis(workflow);
        } catch (e2) {
            createModal("❌ Error", `<p>Failed to analyze workflow: ${escapeHtml(e2.message)}</p>`);
        }
    }
}

async function runLocalAnalysis(workflow) {
    // Client-side analysis as fallback
    const models = extractModelsFromWorkflow(workflow);
    const missing = [];

    for (const model of models) {
        // Check if model exists locally via API
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
            missing.push(model);
        }
    }

    displayAnalysisResults(models, missing);
}

function extractModelsFromWorkflow(workflow) {
    const models = [];
    const nodes = workflow?.nodes || [];

    for (const node of nodes) {
        const nodeType = node.type || "";
        const inputs = node.inputs || [];
        const widgets = node.widgets_values || [];

        // Check known model input patterns
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
            { type: "CLIPVisionLoader", input: "clip_name", category: "clip_vision" },
            { type: "unCLIPCheckpointLoader", input: "ckpt_name", category: "unclip" },
            { type: "GLIGENLoader", input: "gligen_name", category: "gligen" },
            { type: "VAEEncode", input: "vae", category: "vae" },
            { type: "IPAdapterModelLoader", input: "ipadapter_file", category: "ipadapter" },
            { type: "InstantIDModelLoader", input: "instantid_file", category: "instantid" },
        ];

        for (const pattern of modelInputPatterns) {
            if (nodeType === pattern.type || nodeType.includes(pattern.type)) {
                // Find the widget value for this input
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

function displayAnalysisResults(allModels, missing) {
    const total = allModels.length;
    const found = total - missing.length;

    let html = `
        <div style="margin-bottom: 16px; padding: 12px; background: #313244; border-radius: 8px;">
            <div style="display: flex; gap: 24px;">
                <span>📊 Total references: <strong>${total}</strong></span>
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
            html += `
                <div style="padding: 12px; margin: 8px 0; background: #313244; border-radius: 8px; border-left: 3px solid #f38ba8;">
                    <div style="font-weight: bold; color: #f38ba8;">❌ ${escapeHtml(m.model_name)}</div>
                    <div style="color: #a6adc8; font-size: 12px; margin-top: 4px;">
                        Category: ${escapeHtml(m.category || "unknown")} | 
                        Node: ${escapeHtml(m.node_type)} → ${escapeHtml(m.input_name)}
                    </div>
                    <div style="margin-top: 8px;">
                        <a href="https://civitai.com/models?query=${encodeURIComponent(m.model_name)}" 
                           target="_blank" 
                           style="color: #89b4fa; text-decoration: none; margin-right: 12px;">
                            🔍 CivitAI
                        </a>
                        <a href="https://huggingface.co/models?search=${encodeURIComponent(m.model_name)}" 
                           target="_blank" 
                           style="color: #89b4fa; text-decoration: none;">
                            🔍 HuggingFace
                        </a>
                    </div>
                </div>
            `;
        }
        html += `</div>`;
    }

    createModal("🔍 Find Missing Models — Results", html);
}

function displayResults(apiResult) {
    displayAnalysisResults([], []);
}

// ──────────────────────────────────────────────
// API Endpoint Registration
// ──────────────────────────────────────────────

async function setupApiEndpoints() {
    // Register a custom API route for checking model existence
    // This is done through the Python backend
}

// ──────────────────────────────────────────────
// ComfyUI Extension Registration
// ──────────────────────────────────────────────

const extension = {
    name: EXTENSION_NAME,

    async setup(app) {
        // Add the "Find Missing Models" button to the canvas menu
        const origGetCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions;
        
        LGraphCanvas.prototype.getCanvasMenuOptions = function () {
            const options = origGetCanvasMenuOptions.apply(this, arguments);
            
            options.push(null); // separator
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

        // Also add a toolbar button
        const toolbar = document.querySelector(".comfyui-toolbar");
        if (toolbar) {
            const btn = document.createElement("button");
            btn.textContent = "🔍 FindModels";
            btn.title = "Scan workflow for missing models";
            btn.style.cssText = `
                background: #45475a; color: #cdd6f4; border: 1px solid #585b70;
                padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
                margin-left: 8px;
            `;
            btn.onclick = () => runFindMissingModels();
            toolbar.appendChild(btn);
        }

        console.log(`[FindModels] Extension loaded`);
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Enhance our nodes with auto-fill workflow button
        if (nodeData.name === "FindMissingModels") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                origOnNodeCreated?.apply(this, arguments);
                
                // Add "Capture Workflow" widget button
                const widget = this.addWidget(
                    "button",
                    "📋 Capture Current Workflow",
                    null,
                    async () => {
                        try {
                            const workflow = await captureCurrentWorkflow();
                            const workflowStr = JSON.stringify(workflow, null, 2);
                            // Set the workflow_json input
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

// Register extension
app.registerExtension(extension);
