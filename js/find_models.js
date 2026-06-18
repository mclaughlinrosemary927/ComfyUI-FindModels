/**
 * ComfyUI-FindModels v5: Frontend extension
 *
 * - 顶部栏按钮只显示 "查找模型"
 * - 只显示缺失的模型（正常的和加载后已有的都不显示）
 * - 显示缺失模型的大小
 * - 夸克网盘分享链接点击直接下载到对应文件夹
 * - 下载后自动放入 models/<category>/ 对应文件夹
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "ComfyUI-FindModels";

// ──────────────────────────────────────────────
// 夸克网盘固定资源
// ──────────────────────────────────────────────
const QUARK_FIXED_LINKS = [
    {
        url: "https://pan.quark.cn/s/fb913d649b18",
        label: "模型资源①",
        description: "常用模型（Checkpoint / VAE / LoRA）",
    },
    {
        url: "https://pan.quark.cn/s/4680ac8665162",
        label: "模型资源②",
        description: "扩展模型（ControlNet / IP-Adapter / Upscale 等）",
    },
];

// ──────────────────────────────────────────────
// UI
// ──────────────────────────────────────────────

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function createModal(title, content) {
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
        padding: 24px; max-width: 920px; width: 92%; max-height: 85vh;
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
// 下载到对应文件夹
// ──────────────────────────────────────────────

async function downloadAndSort(modelName, category, downloadUrl, sourceType, safeId) {
    const statusEl = document.getElementById(`dl-status-${safeId}`);
    if (statusEl) {
        statusEl.innerHTML = `<span style="color: #f9e2af;">⬇️ 正在下载到 models/${escapeHtml(category)}/ ...</span>`;
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
                statusEl.innerHTML = `<span style="color: #a6e3a1;">✅ 已保存: ${escapeHtml(result.saved_path)} (${result.size_mb || "?"} MB)</span>`;
            }
            const card = document.getElementById(`model-card-${safeId}`);
            if (card) {
                card.style.borderLeftColor = "#a6e3a1";
                card.querySelector(".model-status").textContent = "✅ 已下载";
                card.querySelector(".model-status").style.color = "#a6e3a1";
            }
        } else {
            if (statusEl) {
                // 夸克网盘无法自动下载时，提供手动下载指引
                let msg = `<span style="color: #f38ba8;">❌ ${escapeHtml(result.error || "下载失败")}</span>`;
                if (result.fallback_url) {
                    msg += `<br><span style="color: #f9e2af; font-size: 12px;">
                        👉 请手动操作：<a href="${escapeHtml(result.fallback_url)}" target="_blank" style="color: #89dceb;">打开链接</a>
                        下载后放入 <code style="background: #45475a; padding: 1px 4px; border-radius: 3px;">${escapeHtml(result.target_folder || "models/" + category)}</code>
                    </span>`;
                }
                statusEl.innerHTML = msg;
            }
        }
    } catch (e) {
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: #f38ba8;">❌ 错误: ${escapeHtml(e.message)}</span>`;
        }
    }
}

// 暴露给 onclick
window._fmDl = downloadAndSort;

// ──────────────────────────────────────────────
// 扫描工作流
// ──────────────────────────────────────────────

async function runFindMissingModels() {
    let loadingModal;
    try {
        loadingModal = createModal(
            "查找模型",
            `<div style="text-align: center; padding: 20px;">
                <div style="font-size: 24px;">⏳</div>
                <p>正在扫描缺失模型...</p>
            </div>`
        );

        const workflow = await app.graphToPrompt();

        // 调用后端扫描，后端只返回缺失模型
        let result;
        try {
            const resp = await api.fetchApi("/findmodels/scan_workflow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflow: JSON.parse(JSON.stringify(workflow)) }),
            });
            if (resp.ok) result = await resp.json();
        } catch (e) {
            console.warn("[FindModels] Server scan failed:", e);
        }

        loadingModal.close();

        if (result) {
            displayResults(result);
        } else {
            // Fallback: 本地分析
            await runLocalAnalysis(workflow);
        }
    } catch (error) {
        if (loadingModal) loadingModal.close();
        console.error("[FindModels] Error:", error);
        createModal("查找模型", `<p style="color: #f38ba8;">扫描失败: ${escapeHtml(error.message)}</p>`);
    }
}

async function runLocalAnalysis(workflow) {
    const allModels = extractModelsFromWorkflow(workflow);
    const missing = [];

    // 检查每个模型是否存在
    for (const m of allModels) {
        try {
            const resp = await api.fetchApi(
                `/findmodels/check?category=${encodeURIComponent(m.category || "")}&name=${encodeURIComponent(m.model_name)}`
            );
            if (resp.ok) {
                const data = await resp.json();
                if (data.exists) continue; // 已有的跳过
            }
        } catch {}

        // 缺失的模型：获取下载链接和大小
        m.architecture = "";
        m.model_type = "";
        m.download_links = [];
        m.size_info = { size_gb: 0, size_mb: 0, source: "estimated" };

        try {
            const resp = await api.fetchApi(
                `/findmodels/download_links?category=${encodeURIComponent(m.category || "")}&name=${encodeURIComponent(m.model_name)}`
            );
            if (resp.ok) {
                const data = await resp.json();
                m.download_links = data.links || [];
                m.size_info = data.size_info || m.size_info;
                m.architecture = data.architecture || "";
            }
        } catch {}

        missing.push(m);
    }

    displayResults({ missing, missing_count: missing.length });
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
                        node_id: node.id, node_type: nodeType,
                        input_name: p.input, model_name: widgets[idx],
                        category: p.category,
                    });
                }
            }
        }
    }
    return models;
}

// ──────────────────────────────────────────────
// 结果展示 — 只显示缺失模型
// ──────────────────────────────────────────────

function formatSize(sizeInfo) {
    if (!sizeInfo) return "";
    const gb = sizeInfo.size_gb || 0;
    const mb = sizeInfo.size_mb || 0;
    if (gb >= 1) return `≈ ${gb} GB`;
    if (mb >= 1) return `≈ ${mb} MB`;
    return "";
}

function displayResults(data) {
    const missing = data.missing || [];

    let html = "";

    if (missing.length === 0) {
        html = `<div style="text-align: center; padding: 40px 20px; color: #a6e3a1; font-size: 16px;">
            🎉 所有模型都已就绪，无缺失！
        </div>`;
        createModal("查找模型", html);
        return;
    }

    // 顶部统计
    html += `
        <div style="margin-bottom: 16px; padding: 12px; background: #313244; border-radius: 8px; display: flex; gap: 16px; align-items: center;">
            <span>❌ 缺失模型: <strong style="color: #f38ba8;">${missing.length}</strong></span>
        </div>
    `;

    // 夸克网盘固定资源区
    html += `
        <div style="margin-bottom: 16px; padding: 12px; background: #1e3a5f; border-radius: 8px; border-left: 3px solid #89dceb;">
            <div style="font-weight: bold; color: #89dceb; margin-bottom: 8px;">☁️ 夸克网盘资源</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
    `;
    for (const ql of QUARK_FIXED_LINKS) {
        html += `
            <a href="${escapeHtml(ql.url)}" target="_blank"
               style="background: #89dceb; color: #1e1e2e; text-decoration: none; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500;">
                ☁️ ${escapeHtml(ql.label)}
            </a>
        `;
    }
    html += `</div></div>`;

    // 缺失模型卡片
    html += `<div>`;
    for (const m of missing) {
        const links = m.download_links || [];
        const category = m.category || "unknown";
        const targetFolder = `models/${category}`;
        const safeId = (m.model_name || "").replace(/[^a-zA-Z0-9_-]/g, "_");
        const sizeStr = formatSize(m.size_info);

        html += `
            <div id="model-card-${safeId}" style="padding: 12px; margin: 8px 0; background: #313244; border-radius: 8px; border-left: 3px solid #f38ba8;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <span class="model-status" style="color: #f38ba8; font-weight: bold;">❌</span>
                        <span style="font-weight: bold;">${escapeHtml(m.model_name)}</span>
                    </div>
                    ${sizeStr ? `<span style="color: #f9e2af; font-size: 13px; white-space: nowrap;">💾 ${sizeStr}</span>` : ""}
                </div>
                <div style="color: #a6adc8; font-size: 12px; margin-top: 4px;">
                    📁 → <code style="background: #45475a; padding: 1px 4px; border-radius: 3px;">${escapeHtml(targetFolder)}</code>
                    | 分类: ${escapeHtml(category)}
                </div>
                ${renderActionButtons(m.model_name, category, links)}
                <div id="dl-status-${safeId}" style="margin-top: 6px; font-size: 12px;"></div>
            </div>
        `;
    }
    html += `</div>`;

    createModal("查找模型", html);
}

function renderActionButtons(modelName, category, links) {
    if (!links || links.length === 0) {
        // 兜底：搜索直达
        return `
            <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
                <a href="https://pan.quark.cn/search?q=${encodeURIComponent(modelName)}" target="_blank"
                   style="background: #89dceb; color: #1e1e2e; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500;">
                    ☁️ 夸克搜索</a>
                <a href="https://civitai.com/models?query=${encodeURIComponent(modelName)}" target="_blank"
                   style="background: #45475a; color: #cdd6f4; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-size: 12px;">
                    🔍 CivitAI</a>
                <a href="https://huggingface.co/models?search=${encodeURIComponent(modelName)}" target="_blank"
                   style="background: #45475a; color: #cdd6f4; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-size: 12px;">
                    🔍 HuggingFace</a>
            </div>
        `;
    }

    const safeId = (modelName || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    let html = `<div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">`;

    // 夸克固定链接 → 点击直接下载到对应文件夹
    const quarkDirect = links.filter(l => l.source === "夸克网盘" && l.type === "direct");
    for (const link of quarkDirect) {
        html += `
            <button onclick="window._fmDl('${escapeHtml(modelName)}', '${escapeHtml(category)}', '${escapeHtml(link.url)}', '夸克网盘', '${safeId}')"
                    style="background: #89dceb; color: #1e1e2e; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">
                ☁️ ${escapeHtml(link.description)}
            </button>
        `;
    }

    // 夸克搜索直达
    const quarkSearch = links.filter(l => l.source === "夸克网盘" && l.type === "search");
    for (const link of quarkSearch) {
        html += `
            <a href="${escapeHtml(link.url)}" target="_blank"
               style="background: #45475a; color: #89dceb; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                ☁️ 夸克搜索</a>
        `;
    }

    // HuggingFace / CivitAI 直链下载
    const otherDirect = links.filter(l => l.source !== "夸克网盘" && l.type === "direct");
    for (const link of otherDirect) {
        const btnColor = link.source === "CivitAI" ? "#a78bfa" : "#f38ba8";
        html += `
            <button onclick="window._fmDl('${escapeHtml(modelName)}', '${escapeHtml(category)}', '${escapeHtml(link.url)}', '${escapeHtml(link.source)}', '${safeId}')"
                    style="background: ${btnColor}; color: #1e1e2e; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">
                ⬇️ ${escapeHtml(link.source)}: ${escapeHtml(link.description)}
            </button>
        `;
    }

    // 其他搜索链接
    const otherSearch = links.filter(l => l.source !== "夸克网盘" && l.type === "search");
    for (const link of otherSearch) {
        html += `
            <a href="${escapeHtml(link.url)}" target="_blank"
               style="background: #45475a; color: #cdd6f4; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-size: 12px;">
                🔍 ${escapeHtml(link.source)}</a>
        `;
    }

    html += `</div>`;
    return html;
}

// ──────────────────────────────────────────────
// DOM fallback 注入按钮
// ──────────────────────────────────────────────

function injectToolbarButton() {
    if (document.getElementById("findmodels-toolbar-btn")) return true;

    const selectors = [
        ".comfyui-action-bar", "#comfyui-action-bar",
        ".action-bar", "#action-bar",
        ".p-toolbar",
        ".comfy-menu", "#comfy-menu",
    ];

    let toolbar = null;
    for (const sel of selectors) {
        toolbar = document.querySelector(sel);
        if (toolbar) break;
    }

    if (!toolbar) return false;

    const btn = document.createElement("button");
    btn.id = "findmodels-toolbar-btn";
    btn.textContent = "查找模型";
    btn.title = "扫描缺失模型";
    btn.style.cssText = `
        background: #45475a; color: #cdd6f4; border: 1px solid #585b70;
        padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
        margin-left: 6px; white-space: nowrap; font-weight: 500;
        transition: background 0.15s, border-color 0.15s;
    `;
    btn.onmouseenter = () => { btn.style.background = "#585b70"; btn.style.borderColor = "#89dceb"; };
    btn.onmouseleave = () => { btn.style.background = "#45475a"; btn.style.borderColor = "#585b70"; };
    btn.onclick = () => runFindMissingModels();

    const queueBtn = toolbar.querySelector("#queue-button")
        || toolbar.querySelector("[class*='queue']")
        || toolbar.querySelector("button");

    if (queueBtn && queueBtn.nextSibling) {
        toolbar.insertBefore(btn, queueBtn.nextSibling);
    } else {
        toolbar.appendChild(btn);
    }

    return true;
}

// ──────────────────────────────────────────────
// Extension Registration
// ──────────────────────────────────────────────

const extension = {
    name: EXTENSION_NAME,

    // 官方 API: 顶部工具栏按钮
    actionBarButtons: [
        {
            icon: "icon-[lucide--search]",
            label: "查找模型",
            tooltip: "扫描缺失模型",
            onClick: () => runFindMissingModels(),
        },
    ],

    commands: [
        {
            id: "comfyui-findmodels.scan",
            label: "查找缺失模型",
            icon: "icon-[lucide--search]",
            callback: () => runFindMissingModels(),
        },
    ],

    menuCommands: [
        {
            path: ["查找模型"],
            commands: ["comfyui-findmodels.scan"],
        },
    ],

    getCanvasMenuItems() {
        return [
            { content: "🔍 查找缺失模型", callback: () => runFindMissingModels() },
        ];
    },

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "FindMissingModels") {
            const orig = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                orig?.apply(this, arguments);
                this.addWidget("button", "📋 捕获当前工作流", null, async () => {
                    try {
                        const workflow = await app.graphToPrompt();
                        const workflowStr = JSON.stringify(workflow, null, 2);
                        const w = this.widgets?.find(w => w.name === "workflow_json");
                        if (w) { w.value = workflowStr; w.callback?.(workflowStr); }
                    } catch (e) {
                        console.error("[FindModels] Capture failed:", e);
                    }
                });
            };
        }
    },

    async setup() {
        const tryInject = () => {
            if (!injectToolbarButton()) setTimeout(tryInject, 500);
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", tryInject);
        } else {
            tryInject();
        }

        setTimeout(() => {
            if (!document.getElementById("findmodels-toolbar-btn")) {
                console.warn("[FindModels] Toolbar button injection failed — relying on actionBarButtons API");
            }
        }, 15000);

        console.log("[FindModels] Extension loaded");
    },
};

app.registerExtension(extension);
