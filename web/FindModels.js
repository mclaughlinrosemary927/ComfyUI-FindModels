/*
 * ComfyUI-FindModels 前端扩展
 * 功能：侧边栏面板，显示缺失模型/节点，提供下载、本地加载、定位引用节点等功能
 */

// ============================================================
// 工具函数
// ============================================================
const API_BASE = "/findmodels";

async function apiPost(endpoint, body = {}) {
    const resp = await fetch(`${API_BASE}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || "请求失败");
    }
    return resp.json();
}

async function apiGet(endpoint) {
    const resp = await fetch(`${API_BASE}/${endpoint}`);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || "请求失败");
    }
    return resp.json();
}

function formatSize(mb) {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(1)} MB`;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification(`已复制: ${text}`);
    });
}

function showNotification(msg, duration = 2000) {
    const notif = document.createElement("div");
    notif.className = "fm-notification";
    notif.textContent = msg;
    document.body.appendChild(notif);
    requestAnimationFrame(() => notif.classList.add("fm-notification-show"));
    setTimeout(() => {
        notif.classList.remove("fm-notification-show");
        setTimeout(() => notif.remove(), 300);
    }, duration);
}

// ============================================================
// 样式注入
// ============================================================
const STYLES = `
/* 面板容器 */
.fm-panel {
    width: 320px;
    min-width: 320px;
    background: var(--comfy-menu-bg, #1a1a2e);
    border-left: 1px solid var(--border-color, #333);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: margin-left 0.3s ease;
}

.fm-panel.collapsed {
    margin-left: -320px;
}

/* 头部搜索 */
.fm-header {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-color, #333);
    display: flex;
    align-items: center;
    gap: 8px;
}

.fm-search-box {
    flex: 1;
    background: var(--input-bg, #2a2a3e);
    border: 1px solid var(--border-color, #444);
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--fg-color, #ddd);
    font-size: 13px;
    outline: none;
}

.fm-search-box:focus {
    border-color: var(--accent-color, #7c3aed);
}

.fm-scan-btn {
    background: var(--accent-color, #7c3aed);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    font-weight: 600;
}

.fm-scan-btn:hover {
    opacity: 0.85;
}

/* Tab 导航 */
.fm-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color, #333);
}

.fm-tab {
    flex: 1;
    padding: 10px 8px;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    color: var(--fg-color, #999);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
}

.fm-tab:hover {
    color: var(--fg-color, #ddd);
    background: var(--hover-bg, rgba(255,255,255,0.05));
}

.fm-tab.active {
    color: var(--accent-color, #7c3aed);
    border-bottom-color: var(--accent-color, #7c3aed);
}

/* 内容区域 */
.fm-content {
    flex: 1;
    overflow-y: auto;
    padding: 10px 0;
}

.fm-empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--fg-color, #666);
    font-size: 13px;
}

/* 模型卡片 */
.fm-model-card {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-color, #222);
    cursor: pointer;
    transition: background 0.15s;
}

.fm-model-card:hover {
    background: var(--hover-bg, rgba(255,255,255,0.03));
}

.fm-model-header {
    display: flex;
    align-items: center;
    gap: 8px;
}

.fm-model-type-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--accent-color, #7c3aed);
    color: white;
    flex-shrink: 0;
    font-weight: 600;
}

.fm-model-name {
    flex: 1;
    font-size: 13px;
    color: var(--fg-color, #ddd);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
}

.fm-model-name:hover {
    white-space: normal;
    word-break: break-all;
}

.fm-copy-btn {
    background: none;
    border: none;
    color: var(--fg-color, #666);
    cursor: pointer;
    font-size: 14px;
    padding: 2px;
    flex-shrink: 0;
    opacity: 0.6;
}

.fm-copy-btn:hover {
    opacity: 1;
    color: var(--accent-color, #7c3aed);
}

.fm-model-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
}

.fm-action-btn {
    flex: 1;
    padding: 5px 8px;
    font-size: 11px;
    border: 1px solid var(--border-color, #444);
    border-radius: 4px;
    background: var(--input-bg, #2a2a3e);
    color: var(--fg-color, #ccc);
    cursor: pointer;
    white-space: nowrap;
    text-align: center;
    transition: all 0.15s;
}

.fm-action-btn:hover {
    border-color: var(--accent-color, #7c3aed);
    color: var(--accent-color, #7c3aed);
}

.fm-action-btn.primary {
    background: var(--accent-color, #7c3aed);
    border-color: var(--accent-color, #7c3aed);
    color: white;
}

.fm-action-btn.primary:hover {
    opacity: 0.85;
}

.fm-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* 下载源列表 */
.fm-source-list {
    padding: 0 14px 10px;
}

.fm-source-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: var(--input-bg, #2a2a3e);
    border-radius: 6px;
    margin-bottom: 4px;
    font-size: 11px;
    color: var(--fg-color, #ccc);
}

.fm-source-name {
    font-weight: 600;
    flex-shrink: 0;
}

.fm-source-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: var(--fg-color, #888);
}

.fm-source-dl-btn {
    background: var(--accent-color, #7c3aed);
    color: white;
    border: none;
    border-radius: 3px;
    padding: 3px 8px;
    font-size: 10px;
    cursor: pointer;
    white-space: nowrap;
}

/* 缺失节点 */
.fm-node-card {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-color, #222);
}

.fm-node-name {
    font-size: 13px;
    font-weight: 600;
    color: #ef4444;
    font-family: monospace;
}

.fm-node-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    align-items: center;
}

.fm-auto-deps {
    font-size: 11px;
    color: var(--fg-color, #888);
    display: flex;
    align-items: center;
    gap: 4px;
}

.fm-auto-deps input[type="checkbox"] {
    accent-color: var(--accent-color, #7c3aed);
}

/* 下载任务 */
.fm-task-card {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-color, #222);
}

.fm-task-name {
    font-size: 12px;
    color: var(--fg-color, #ddd);
    margin-bottom: 4px;
}

.fm-progress-bar {
    height: 4px;
    background: var(--input-bg, #2a2a3e);
    border-radius: 2px;
    overflow: hidden;
}

.fm-progress-fill {
    height: 100%;
    background: var(--accent-color, #7c3aed);
    border-radius: 2px;
    transition: width 0.3s ease;
}

.fm-task-info {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--fg-color, #666);
    margin-top: 3px;
}

.fm-task-status {
    font-size: 10px;
    font-weight: 600;
    margin-top: 3px;
}

.fm-task-status.completed { color: #22c55e; }
.fm-task-status.failed { color: #ef4444; }
.fm-task-status.downloading { color: var(--accent-color, #7c3aed); }

/* 设置面板 */
.fm-settings {
    padding: 14px;
}

.fm-setting-group {
    margin-bottom: 16px;
}

.fm-setting-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--fg-color, #ddd);
    margin-bottom: 6px;
}

.fm-setting-input {
    width: 100%;
    background: var(--input-bg, #2a2a3e);
    border: 1px solid var(--border-color, #444);
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--fg-color, #ddd);
    font-size: 12px;
    outline: none;
}

.fm-setting-input:focus {
    border-color: var(--accent-color, #7c3aed);
}

.fm-setting-link {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--input-bg, #2a2a3e);
    border-radius: 6px;
    margin-bottom: 4px;
    font-size: 11px;
    color: var(--accent-color, #7c3aed);
    cursor: pointer;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fm-setting-link:hover {
    opacity: 0.8;
}

.fm-save-btn {
    width: 100%;
    padding: 10px;
    background: var(--accent-color, #7c3aed);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}

.fm-save-btn:hover {
    opacity: 0.85;
}

/* 本地模型文件浏览器 */
.fm-browse-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 500px;
    max-height: 400px;
    background: var(--comfy-menu-bg, #1a1a2e);
    border: 1px solid var(--border-color, #444);
    border-radius: 10px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.fm-browse-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color, #333);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.fm-browse-path {
    font-size: 12px;
    color: var(--fg-color, #888);
    font-family: monospace;
}

.fm-browse-close {
    background: none;
    border: none;
    color: var(--fg-color, #888);
    font-size: 18px;
    cursor: pointer;
}

.fm-browse-list {
    flex: 1;
    overflow-y: auto;
}

.fm-browse-item {
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--fg-color, #ddd);
}

.fm-browse-item:hover {
    background: var(--hover-bg, rgba(255,255,255,0.05));
}

.fm-browse-item.dir::before {
    content: "📁";
}

.fm-browse-item.file::before {
    content: "📄";
}

.fm-browse-item-size {
    margin-left: auto;
    font-size: 10px;
    color: var(--fg-color, #666);
}

/* 通知 */
.fm-notification {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: var(--comfy-menu-bg, #1a1a2e);
    border: 1px solid var(--accent-color, #7c3aed);
    color: var(--fg-color, #ddd);
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 13px;
    opacity: 0;
    transition: all 0.3s ease;
    z-index: 2000;
    pointer-events: none;
}

.fm-notification.fm-notification-show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}

/* 工具栏联动 */
.fm-toolbar-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 12px;
    background: transparent;
    border: 1px solid var(--border-color, #444);
    border-radius: 4px;
    color: var(--fg-color, #ccc);
    cursor: pointer;
    white-space: nowrap;
}

.fm-toolbar-btn:hover {
    border-color: var(--accent-color, #7c3aed);
    color: var(--accent-color, #7c3aed);
}

.fm-toolbar-btn.active {
    background: var(--accent-color, #7c3aed);
    border-color: var(--accent-color, #7c3aed);
    color: white;
}

.fm-toolbar-btn svg {
    width: 14px;
    height: 14px;
}

/* 遮罩 */
.fm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 999;
}
`;

// ============================================================
// 主面板组件
// ============================================================
class FindModelsPanel {
    constructor(app) {
        this.app = app;
        this.panelEl = null;
        this.activeTab = "models"; // models | nodes | downloads | settings
        this.missingModels = [];
        this.missingNodes = [];
        this.downloadTasks = {};
        this.downloadPollTimer = null;
        this.quarkCookie = "";
        this.quarkLinks = {
            library1: "",
            library2: "",
        };
        this.autoInstallDeps = true;
        this.panelOpen = false;

        this._loadSettings();
        this._injectStyles();
        this._injectToolbarButton();
        this._createPanel();
        this._bindEvents();
    }

    // ---- 设置持久化 ----
    _loadSettings() {
        try {
            const saved = localStorage.getItem("fm_settings");
            if (saved) {
                const data = JSON.parse(saved);
                this.quarkCookie = data.quarkCookie || "";
                this.quarkLinks = data.quarkLinks || { library1: "", library2: "" };
                this.autoInstallDeps = data.autoInstallDeps !== false;
            }
        } catch {}
    }

    _saveSettings() {
        localStorage.setItem("fm_settings", JSON.stringify({
            quarkCookie: this.quarkCookie,
            quarkLinks: this.quarkLinks,
            autoInstallDeps: this.autoInstallDeps,
        }));
    }

    // ---- 注入样式 ----
    _injectStyles() {
        const style = document.createElement("style");
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    // ---- 工具栏按钮 ----
    _injectToolbarButton() {
        const toolbar = document.querySelector(".comfyui-menu .comfyui-toolbar");
        if (!toolbar) {
            // fallback: 等待 DOM 就绪
            setTimeout(() => this._injectToolbarButton(), 500);
            return;
        }

        const btn = document.createElement("button");
        btn.className = "fm-toolbar-btn";
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> 查找缺失模型和节点`;
        btn.title = "打开 FindModels 面板";
        btn.onclick = () => this.togglePanel();
        btn.id = "fm-toolbar-toggle";

        toolbar.appendChild(btn);
    }

    // ---- 创建面板 ----
    _createPanel() {
        this.panelEl = document.createElement("div");
        this.panelEl.className = "fm-panel collapsed";
        this.panelEl.id = "fm-panel";

        this.panelEl.innerHTML = `
            <div class="fm-header">
                <input type="text" class="fm-search-box" placeholder="搜索模型..." id="fm-search" />
                <button class="fm-scan-btn" id="fm-scan">扫描</button>
            </div>
            <div class="fm-tabs" id="fm-tabs">
                <button class="fm-tab active" data-tab="models">缺失模型</button>
                <button class="fm-tab" data-tab="nodes">缺失节点</button>
                <button class="fm-tab" data-tab="downloads">下载任务</button>
                <button class="fm-tab" data-tab="settings">设置</button>
            </div>
            <div class="fm-content" id="fm-content">
                <div class="fm-empty">打开工作流后点击「扫描」查找缺失模型</div>
            </div>
        `;

        // 插入到 canvas 旁边的侧栏
        const canvasContainer = document.querySelector("#graph-canvas")?.parentElement
            || document.querySelector(".comfyui-canvas-container")
            || document.querySelector("body");

        if (canvasContainer) {
            canvasContainer.style.display = "flex";
            canvasContainer.appendChild(this.panelEl);
        } else {
            document.body.appendChild(this.panelEl);
        }
    }

    // ---- 事件绑定 ----
    _bindEvents() {
        // Tab 切换
        this.panelEl.querySelector("#fm-tabs").addEventListener("click", (e) => {
            const tab = e.target.closest(".fm-tab");
            if (!tab) return;
            this.activeTab = tab.dataset.tab;
            this.panelEl.querySelectorAll(".fm-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            this._renderContent();
        });

        // 扫描按钮
        this.panelEl.querySelector("#fm-scan").addEventListener("click", () => this.scanWorkflow());

        // 搜索框
        this.panelEl.querySelector("#fm-search").addEventListener("input", (e) => {
            this._renderContent(e.target.value.toLowerCase());
        });

        // 面板内容事件委托
        this.panelEl.querySelector("#fm-content").addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            const action = btn.dataset.action;
            const name = btn.dataset.name || "";
            const type = btn.dataset.type || "";
            const url = btn.dataset.url || "";

            switch (action) {
                case "copy": copyToClipboard(name); break;
                case "locate": this._locateNode(name); break;
                case "load-local": this._browseLocal(name, type); break;
                case "find-source": this._findDownloadSource(name, type); break;
                case "download": this._startDownload(url, name, type); break;
                case "install-plugin": this._installPlugin(name); break;
                case "open-link": window.open(url, "_blank"); break;
            }
        });
    }

    // ---- 面板开关 ----
    togglePanel() {
        this.panelOpen = !this.panelOpen;
        this.panelEl.classList.toggle("collapsed", !this.panelOpen);

        const btn = document.getElementById("fm-toolbar-toggle");
        if (btn) btn.classList.toggle("active", this.panelOpen);

        if (this.panelOpen && this.activeTab === "downloads") {
            this._startPolling();
        } else {
            this._stopPolling();
        }
    }

    // ---- 扫描工作流 ----
    async scanWorkflow() {
        try {
            // 获取当前工作流
            const graphData = this.app.graph?.toJSON?.();
            if (!graphData) {
                showNotification("未找到工作流数据");
                return;
            }

            const scanBtn = this.panelEl.querySelector("#fm-scan");
            scanBtn.textContent = "扫描中...";
            scanBtn.disabled = true;

            const result = await apiPost("scan", { workflow: graphData });

            this.missingModels = result.missing_models || [];
            this.missingNodes = result.missing_nodes || [];

            // 同时检查缺失节点
            try {
                const nodeResult = await apiPost("check-missing-nodes", { workflow: graphData });
                if (nodeResult.missing_nodes) {
                    this.missingNodes = nodeResult.missing_nodes;
                }
            } catch {}

            scanBtn.textContent = "扫描";
            scanBtn.disabled = false;

            // 自动切换到有结果的 tab
            if (this.missingModels.length > 0) {
                this.activeTab = "models";
            } else if (this.missingNodes.length > 0) {
                this.activeTab = "nodes";
            }

            this._renderContent();
            showNotification(`找到 ${this.missingModels.length} 个缺失模型, ${this.missingNodes.length} 个缺失节点`);

            // 如果面板未打开，自动打开
            if (!this.panelOpen) this.togglePanel();

        } catch (e) {
            const scanBtn = this.panelEl.querySelector("#fm-scan");
            if (scanBtn) {
                scanBtn.textContent = "扫描";
                scanBtn.disabled = false;
            }
            showNotification(`扫描失败: ${e.message}`);
        }
    }

    // ---- 渲染内容 ----
    _renderContent(filter = "") {
        const container = this.panelEl.querySelector("#fm-content");

        switch (this.activeTab) {
            case "models": container.innerHTML = this._renderModels(filter); break;
            case "nodes": container.innerHTML = this._renderNodes(filter); break;
            case "downloads": container.innerHTML = this._renderDownloads(); break;
            case "settings": container.innerHTML = this._renderSettings(); break;
        }
    }

    _renderModels(filter = "") {
        const models = filter
            ? this.missingModels.filter(m => m.name.toLowerCase().includes(filter))
            : this.missingModels;

        if (models.length === 0) {
            return '<div class="fm-empty">🎉 没有缺失的模型</div>';
        }

        return models.map(m => `
            <div class="fm-model-card" data-model="${this._escAttr(m.name)}">
                <div class="fm-model-header">
                    <span class="fm-model-type-badge">${this._esc(m.type)}</span>
                    <span class="fm-model-name" title="${this._escAttr(m.name)}">${this._esc(m.name)}</span>
                    <button class="fm-copy-btn" data-action="copy" data-name="${this._escAttr(m.name)}" title="复制模型名称">📋</button>
                </div>
                <div class="fm-model-actions">
                    <button class="fm-action-btn" data-action="locate" data-name="${this._escAttr(m.name)}">定位引用节点</button>
                    <button class="fm-action-btn" data-action="load-local" data-name="${this._escAttr(m.name)}" data-type="${this._escAttr(m.type)}">加载本地模型</button>
                    <button class="fm-action-btn primary" data-action="find-source" data-name="${this._escAttr(m.name)}" data-type="${this._escAttr(m.type)}">查找下载来源</button>
                </div>
            </div>
        `).join("");
    }

    _renderNodes(filter = "") {
        const nodes = filter
            ? this.missingNodes.filter(n => n.toLowerCase().includes(filter))
            : this.missingNodes;

        if (nodes.length === 0) {
            return '<div class="fm-empty">🎉 没有缺失的节点</div>';
        }

        return nodes.map(n => `
            <div class="fm-node-card">
                <div class="fm-node-name">${this._esc(n)}</div>
                <div class="fm-node-actions">
                    <label class="fm-auto-deps">
                        <input type="checkbox" id="fm-auto-deps-${this._escAttr(n)}" ${this.autoInstallDeps ? "checked" : ""} />
                        自动安装依赖
                    </label>
                    <button class="fm-action-btn primary" data-action="install-plugin" data-name="${this._escAttr(n)}">链接安装插件</button>
                </div>
            </div>
        `).join("");
    }

    _renderDownloads() {
        if (Object.keys(this.downloadTasks).length === 0) {
            return '<div class="fm-empty">当前无下载任务</div>';
        }

        return Object.values(this.downloadTasks).map(task => `
            <div class="fm-task-card">
                <div class="fm-task-name">${this._esc(task.model_name)}</div>
                <div class="fm-progress-bar">
                    <div class="fm-progress-fill" style="width: ${task.progress}%"></div>
                </div>
                <div class="fm-task-info">
                    <span>${formatSize(task.downloaded_mb)} / ${formatSize(task.size_mb)}</span>
                    <span>${task.progress.toFixed(1)}%</span>
                </div>
                <div class="fm-task-status ${task.status}">${
                    task.status === "completed" ? "✅ 下载完成" :
                    task.status === "failed" ? `❌ ${task.error || "失败"}` :
                    `⬇️ 下载中...`
                }</div>
            </div>
        `).join("");
    }

    _renderSettings() {
        return `
            <div class="fm-settings">
                <div class="fm-setting-group">
                    <div class="fm-setting-label">夸克链接</div>
                    <input type="text" class="fm-setting-input" id="fm-quark-link-1"
                        placeholder="夸克模型库链接 1" value="${this._esc(this.quarkLinks.library1)}" />
                    <input type="text" class="fm-setting-input" id="fm-quark-link-2"
                        placeholder="夸克模型库链接 2" value="${this._esc(this.quarkLinks.library2)}"
                        style="margin-top: 6px;" />
                </div>
                <div class="fm-setting-group">
                    <div class="fm-setting-label">夸克直链登录态（Cookie）</div>
                    <input type="text" class="fm-setting-input" id="fm-quark-cookie"
                        placeholder="可选，用于解析夸克直链" value="${this._esc(this.quarkCookie)}" />
                </div>
                <div class="fm-setting-group">
                    <button class="fm-save-btn" id="fm-save-settings">保存设置</button>
                </div>
            </div>
        ` + (() => {
            // 设置面板事件绑定
            setTimeout(() => {
                const saveBtn = this.panelEl.querySelector("#fm-save-settings");
                if (saveBtn) {
                    saveBtn.onclick = () => {
                        this.quarkLinks.library1 = this.panelEl.querySelector("#fm-quark-link-1").value;
                        this.quarkLinks.library2 = this.panelEl.querySelector("#fm-quark-link-2").value;
                        this.quarkCookie = this.panelEl.querySelector("#fm-quark-cookie").value;
                        this._saveSettings();
                        showNotification("设置已保存");
                    };
                }
            }, 0);
            return "";
        })();
    }

    // ---- 功能实现 ----

    async _locateNode(modelName) {
        try {
            const graphData = this.app.graph?.toJSON?.();
            if (!graphData) return showNotification("未找到工作流");

            const result = await apiPost("locate", { model_name: modelName, workflow: graphData });
            if (result.found) {
                // 高亮引用节点
                for (const ref of result.references) {
                    const node = this.app.graph.getNodeById(ref.node_id);
                    if (node) {
                        this.app.graph.centerOnNode(node);
                        // 闪烁效果
                        node.selected = true;
                        setTimeout(() => { node.selected = false; }, 2000);
                    }
                }
                showNotification(`已定位 ${result.references.length} 个引用节点`);
            } else {
                showNotification("未找到引用节点");
            }
        } catch (e) {
            showNotification(`定位失败: ${e.message}`);
        }
    }

    _browseLocal(modelName, modelType) {
        // 创建本地文件浏览对话框
        const overlay = document.createElement("div");
        overlay.className = "fm-overlay";

        const dialog = document.createElement("div");
        dialog.className = "fm-browse-dialog";
        dialog.innerHTML = `
            <div class="fm-browse-header">
                <span class="fm-browse-path" id="fm-browse-path">选择本地模型文件</span>
                <button class="fm-browse-close" id="fm-browse-close">✕</button>
            </div>
            <div class="fm-browse-list" id="fm-browse-list"></div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(dialog);

        const close = () => { overlay.remove(); dialog.remove(); };
        dialog.querySelector("#fm-browse-close").onclick = close;
        overlay.onclick = close;

        let currentPath = "";
        const loadDir = async (path) => {
            try {
                const data = await apiPost("browse", { path });
                currentPath = data.path;
                dialog.querySelector("#fm-browse-path").textContent = data.path;
                dialog.querySelector("#fm-browse-list").innerHTML = data.entries.map(e => `
                    <div class="fm-browse-item ${e.is_dir ? "dir" : "file"}"
                         data-path="${this._escAttr(path + "/" + e.name)}" data-is-dir="${e.is_dir}">
                        <span>${this._esc(e.name)}</span>
                        ${e.is_dir ? "" : `<span class="fm-browse-item-size">${formatSize(e.size_mb || 0)}</span>`}
                    </div>
                `).join("");

                dialog.querySelector("#fm-browse-list").onclick = async (ev) => {
                    const item = ev.target.closest(".fm-browse-item");
                    if (!item) return;
                    if (item.dataset.isDir === "true") {
                        await loadDir(item.dataset.path);
                    } else {
                        // 选择文件 → 加载
                        try {
                            const result = await apiPost("load-local", {
                                file_path: item.dataset.path,
                                model_name: modelName,
                                model_type: modelType,
                            });
                            if (result.success) {
                                showNotification(`✅ 模型已加载: ${result.filename}`);
                                close();
                                // 从缺失列表移除
                                this.missingModels = this.missingModels.filter(m => m.name !== modelName);
                                this._renderContent();
                            } else {
                                showNotification(`❌ ${result.error}`);
                            }
                        } catch (e) {
                            showNotification(`加载失败: ${e.message}`);
                        }
                    }
                };

                // 返回上级目录
                if (path !== "" && path !== "/") {
                    const parentPath = path.substring(0, path.lastIndexOf("/")) || "/";
                    const backItem = document.createElement("div");
                    backItem.className = "fm-browse-item dir";
                    backItem.innerHTML = "<span>..</span>";
                    backItem.onclick = () => loadDir(parentPath);
                    dialog.querySelector("#fm-browse-list").prepend(backItem);
                }
            } catch (e) {
                showNotification(`浏览失败: ${e.message}`);
            }
        };

        loadDir(folder_paths?.models_dir || "");
    }

    async _findDownloadSource(modelName, modelType) {
        // 展开下载源列表
        const card = this.panelEl.querySelector(`[data-model="${this._escAttr(modelName)}"]`);
        if (!card) return;

        // 检查是否已展开
        const existing = card.querySelector(".fm-source-list");
        if (existing) {
            existing.remove();
            return;
        }

        const sourceContainer = document.createElement("div");
        sourceContainer.className = "fm-source-list";
        sourceContainer.innerHTML = '<div class="fm-empty" style="padding:10px">搜索中...</div>';
        card.appendChild(sourceContainer);

        try {
            const result = await apiPost("search", {
                model_name: modelName,
                source: "civitai",
                quark_cookie: this.quarkCookie,
            });

            if (result.results?.length > 0) {
                sourceContainer.innerHTML = result.results.map(r => `
                    <div class="fm-source-item">
                        <div>
                            <div class="fm-source-name">${this._esc(r.name)}</div>
                            <div class="fm-source-meta">
                                <span>匹配度: ${r.match_score}%</span>
                                <span>${r.type || ""}</span>
                                ${r.size_mb ? `<span>${formatSize(r.size_mb)}</span>` : ""}
                            </div>
                        </div>
                        <button class="fm-source-dl-btn" data-action="download"
                            data-url="${this._escAttr(r.url)}" data-name="${this._escAttr(modelName)}" data-type="${this._escAttr(modelType)}">
                            下载
                        </button>
                    </div>
                `).join("");
            } else {
                // 没有 Civitai 结果，尝试夸克链接
                if (this.quarkLinks.library1 || this.quarkLinks.library2) {
                    sourceContainer.innerHTML = `
                        <div class="fm-source-item" style="cursor:pointer" data-action="open-link" data-url="${this._escAttr(this.quarkLinks.library1)}">
                            <span>夸克模型库 1</span>
                            <span style="font-size:10px;color:#888">点击打开</span>
                        </div>
                        ${this.quarkLinks.library2 ? `
                        <div class="fm-source-item" style="cursor:pointer" data-action="open-link" data-url="${this._escAttr(this.quarkLinks.library2)}">
                            <span>夸克模型库 2</span>
                            <span style="font-size:10px;color:#888">点击打开</span>
                        </div>` : ""}
                    `;
                } else {
                    sourceContainer.innerHTML = '<div class="fm-empty" style="padding:10px">未找到下载源，请在设置中配置夸克链接</div>';
                }
            }
        } catch (e) {
            sourceContainer.innerHTML = `<div class="fm-empty" style="padding:10px">搜索失败: ${e.message}</div>`;
        }
    }

    async _startDownload(url, modelName, modelType) {
        try {
            const result = await apiPost("download", {
                url,
                model_name: modelName,
                model_type: modelType,
                quark_cookie: this.quarkCookie,
            });
            showNotification(`开始下载: ${modelName}`);
            this._startPolling();
            // 切换到下载 tab
            this.activeTab = "downloads";
            this.panelEl.querySelectorAll(".fm-tab").forEach(t => t.classList.remove("active"));
            this.panelEl.querySelector('[data-tab="downloads"]').classList.add("active");
            this._renderContent();
        } catch (e) {
            showNotification(`下载失败: ${e.message}`);
        }
    }

    async _installPlugin(nodeName) {
        // 构造 GitHub 搜索链接
        const query = encodeURIComponent(`comfyui ${nodeName}`);
        const url = `https://github.com/search?q=${query}&type=repositories`;
        window.open(url, "_blank");
    }

    // ---- 下载轮询 ----
    _startPolling() {
        if (this.downloadPollTimer) return;
        this.downloadPollTimer = setInterval(async () => {
            try {
                const data = await apiGet("download/status");
                this.downloadTasks = data;
                if (this.activeTab === "downloads") {
                    this._renderDownloads();
                }
                // 检查是否有正在进行的下载
                const hasActive = Object.values(data).some(t => t.status === "downloading");
                if (!hasActive) this._stopPolling();
            } catch {}
        }, 1000);
    }

    _stopPolling() {
        if (this.downloadPollTimer) {
            clearInterval(this.downloadPollTimer);
            this.downloadPollTimer = null;
        }
    }

    // ---- 工具方法 ----
    _esc(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    _escAttr(str) {
        return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}

// ============================================================
// ComfyUI 扩展注册
// ============================================================
app.registerExtension({
    name: "ComfyUI.FindModels",
    async init() {
        // 等待 app 就绪后初始化面板
        const waitForApp = () => {
            if (window.app) {
                new FindModelsPanel(app);
            } else {
                setTimeout(waitForApp, 100);
            }
        };
        waitForApp();
    },
});
