/*
 * ComfyUI-FindModels 前端扩展
 * 功能：顶部工具栏按钮 → 模态弹窗，显示缺失模型/节点，提供下载、本地加载、定位引用节点等功能
 */

// ============================================================
// 常量与工具函数
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

// ============================================================
// 样式注入
// ============================================================
const STYLES = `
/* ===== 顶栏按钮 ===== */
.fm-toolbar-btn {
    background: linear-gradient(135deg, #7c3aed, #6d28d9) !important;
    color: #fff !important;
    border: none !important;
    border-radius: 6px !important;
    padding: 4px 14px !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    transition: opacity 0.15s !important;
    white-space: nowrap !important;
    line-height: 28px !important;
    letter-spacing: 0.5px !important;
}
.fm-toolbar-btn:hover {
    opacity: 0.85 !important;
}
.fm-toolbar-btn:active {
    opacity: 0.7 !important;
}

/* ===== 模态蒙层 ===== */
.fm-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fmFadeIn 0.15s ease;
}
.fm-overlay.hidden {
    display: none;
}

@keyframes fmFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes fmSlideIn {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

/* ===== 模态主体 ===== */
.fm-modal {
    background: var(--comfy-menu-bg, #1e1e2e);
    border: 1px solid var(--border-color, #3a3a4e);
    border-radius: 12px;
    width: min(820px, 90vw);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: fmSlideIn 0.2s ease;
    overflow: hidden;
}

/* ===== 标题栏 ===== */
.fm-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border-color, #3a3a4e);
    flex-shrink: 0;
}
.fm-modal-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--fg-color, #e0e0e0);
    display: flex;
    align-items: center;
    gap: 8px;
}
.fm-modal-title .fm-badge {
    font-size: 11px;
    font-weight: 600;
    background: #ef4444;
    color: #fff;
    border-radius: 10px;
    padding: 1px 8px;
    line-height: 18px;
}
.fm-close-btn {
    background: transparent;
    border: none;
    color: var(--fg-color, #888);
    font-size: 22px;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: background 0.15s;
}
.fm-close-btn:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
}

/* ===== 工具栏区域（搜索 + 扫描按钮） ===== */
.fm-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border-color, #3a3a4e);
    flex-shrink: 0;
}
.fm-search-box {
    flex: 1;
    background: var(--input-bg, #2a2a3e);
    border: 1px solid var(--border-color, #444);
    border-radius: 6px;
    padding: 7px 10px;
    color: var(--fg-color, #ddd);
    font-size: 13px;
    outline: none;
}
.fm-search-box:focus {
    border-color: #7c3aed;
}
.fm-scan-btn {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
}
.fm-scan-btn:hover { opacity: 0.85; }
.fm-scan-btn:active { opacity: 0.7; }
.fm-scan-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ===== Tab 导航 ===== */
.fm-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color, #3a3a4e);
    flex-shrink: 0;
    padding: 0 16px;
}
.fm-tab {
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    color: #777;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
    position: relative;
}
.fm-tab:hover { color: #ccc; }
.fm-tab.active {
    color: #7c3aed;
    border-bottom-color: #7c3aed;
}
.fm-tab .fm-count {
    display: inline-block;
    background: #7c3aed;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    border-radius: 8px;
    padding: 0 6px;
    line-height: 16px;
    margin-left: 4px;
    vertical-align: middle;
}

/* ===== 内容区（滚动） ===== */
.fm-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    min-height: 200px;
}
.fm-content::-webkit-scrollbar {
    width: 6px;
}
.fm-content::-webkit-scrollbar-track {
    background: transparent;
}
.fm-content::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 3px;
}

/* ===== 模型卡片 ===== */
.fm-model-card {
    background: var(--comfy-input-bg, #2a2a3e);
    border: 1px solid var(--border-color, #3a3a4e);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 8px;
    transition: border-color 0.15s;
}
.fm-model-card:hover {
    border-color: #555;
}
.fm-model-card .fm-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--fg-color, #e0e0e0);
    word-break: break-all;
    margin-bottom: 4px;
}
.fm-model-card .fm-meta {
    font-size: 11px;
    color: #888;
    margin-bottom: 8px;
}
.fm-model-card .fm-meta strong {
    color: #aaa;
}
.fm-model-card .fm-type-tag {
    display: inline-block;
    background: #7c3aed;
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    padding: 1px 7px;
    margin-right: 4px;
}
.fm-model-card .fm-type-tag.node-tag {
    background: #2563eb;
}
.fm-model-card .fm-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
.fm-model-card .fm-action-btn {
    background: rgba(255,255,255,0.08);
    color: var(--fg-color, #ccc);
    border: 1px solid #444;
    border-radius: 5px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}
.fm-model-card .fm-action-btn:hover {
    background: rgba(124,58,237,0.25);
    border-color: #7c3aed;
    color: #fff;
}
.fm-model-card .fm-action-btn.fm-primary {
    background: #7c3aed;
    border-color: #7c3aed;
    color: #fff;
}
.fm-model-card .fm-action-btn.fm-primary:hover {
    background: #6d28d9;
}
.fm-model-card .fm-action-btn.fm-danger {
    border-color: #ef4444;
    color: #ef4444;
}
.fm-model-card .fm-action-btn.fm-danger:hover {
    background: rgba(239,68,68,0.2);
}
.fm-model-card .fm-source-link {
    display: inline-block;
    background: #22c55e;
    color: #fff;
    border: none;
    border-radius: 5px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
}
.fm-model-card .fm-source-link:hover {
    opacity: 0.85;
}

/* ===== 下载进度条 ===== */
.fm-progress-bar {
    height: 4px;
    background: #333;
    border-radius: 2px;
    margin: 6px 0;
    overflow: hidden;
}
.fm-progress-bar .fm-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #7c3aed, #22c55e);
    border-radius: 2px;
    transition: width 0.5s ease;
}
.fm-download-item {
    background: var(--comfy-input-bg, #2a2a3e);
    border: 1px solid var(--border-color, #3a3a4e);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 8px;
}
.fm-download-item .fm-dl-name {
    font-weight: 700;
    font-size: 13px;
    margin-bottom: 4px;
    color: var(--fg-color, #e0e0e0);
}
.fm-download-item .fm-dl-status {
    font-size: 11px;
    color: #888;
}
.fm-download-item .fm-dl-status.done { color: #22c55e; }
.fm-download-item .fm-dl-status.error { color: #ef4444; }

/* ===== 设置区 ===== */
.fm-settings {
    max-width: 600px;
}
.fm-setting-group {
    background: var(--comfy-input-bg, #2a2a3e);
    border: 1px solid var(--border-color, #3a3a4e);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 10px;
}
.fm-setting-group h4 {
    font-size: 13px;
    font-weight: 700;
    color: var(--fg-color, #e0e0e0);
    margin: 0 0 8px 0;
}
.fm-setting-group label {
    display: block;
    font-size: 12px;
    color: #999;
    margin-bottom: 4px;
}
.fm-setting-group input[type="text"],
.fm-setting-group textarea {
    width: 100%;
    background: var(--input-bg, #1a1a2e);
    border: 1px solid var(--border-color, #444);
    border-radius: 5px;
    padding: 6px 10px;
    color: var(--fg-color, #ddd);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
}
.fm-setting-group input:focus,
.fm-setting-group textarea:focus {
    border-color: #7c3aed;
}
.fm-setting-group textarea {
    min-height: 50px;
    resize: vertical;
    font-family: monospace;
    font-size: 12px;
}
.fm-save-btn {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 8px 24px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 8px;
}
.fm-save-btn:hover { opacity: 0.85; }

/* ===== 空状态 ===== */
.fm-empty {
    text-align: center;
    padding: 40px 20px;
    color: #666;
    font-size: 14px;
}
.fm-empty .fm-empty-icon {
    font-size: 36px;
    margin-bottom: 10px;
}

/* ===== 加载状态 ===== */
.fm-loading {
    text-align: center;
    padding: 40px;
    color: #888;
}
.fm-spinner {
    display: inline-block;
    width: 24px;
    height: 24px;
    border: 3px solid #333;
    border-top-color: #7c3aed;
    border-radius: 50%;
    animation: fmSpin 0.6s linear infinite;
}
@keyframes fmSpin {
    to { transform: rotate(360deg); }
}

/* ===== 通知 Toast ===== */
.fm-notification {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: #1e1e2e;
    color: #e0e0e0;
    border: 1px solid #3a3a4e;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 600;
    z-index: 100000;
    opacity: 0;
    transition: opacity 0.3s, transform 0.3s;
    pointer-events: none;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
.fm-notification.fm-notification-show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}
`;

// ============================================================
// FindModelsPanel - 主面板类
// ============================================================
class FindModelsPanel {
    constructor(app) {
        this.app = app;
        this.overlay = null;      // 蒙层 + 模态
        this.contentEl = null;    // 内容容器

        this.activeTab = "missing";
        this.missingModels = [];
        this.missingNodes = [];
        this.downloadTasks = {};
        this.searchFilter = "";
        this.quarkCookie = localStorage.getItem("fm_quark_cookie") || "";
        this.quarkLinks = {
            library1: localStorage.getItem("fm_quark_lib1") || "https://pan.quark.cn/s/fb913d649b18",
            library2: localStorage.getItem("fm_quark_lib2") || "https://pan.quark.cn/s/4680ac866516",
        };

        this.downloadPollTimer = null;
        this.init();
    }

    init() {
        this._injectStyles();
        this._addToolbarButton();
    }

    // ---- 注入样式 ----
    _injectStyles() {
        if (document.getElementById("fm-styles")) return;
        const style = document.createElement("style");
        style.id = "fm-styles";
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    // ---- 添加顶栏按钮 ----
    _addToolbarButton() {
        // 找 ComfyUI 的菜单容器
        const menu = document.querySelector(".comfy-menu");
        if (!menu) {
            // 新式 ComfyUI 结构
            const toolbar = document.querySelector(".comfyui-toolbar") || 
                            document.querySelector("#comfy-ui-top") ||
                            document.querySelector(".comfyui-menu-btns") ||
                            document.querySelector(".comfyui-menu");
            if (toolbar) {
                const btn = document.createElement("button");
                btn.className = "fm-toolbar-btn";
                btn.textContent = "🔍 查找模型";
                btn.title = "查找缺失模型和节点";
                btn.onclick = () => this._openModal();
                toolbar.appendChild(btn);
                return;
            }
            // 兜底：加到 body
            const btn = document.createElement("button");
            btn.className = "fm-toolbar-btn";
            btn.textContent = "🔍 查找模型";
            btn.style.position = "fixed";
            btn.style.top = "8px";
            btn.style.right = "8px";
            btn.style.zIndex = "9999";
            btn.onclick = () => this._openModal();
            document.body.appendChild(btn);
            return;
        }

        // 旧式 ComfyUI：加在 comfy-menu 内，排在第一个
        const btn = document.createElement("button");
        btn.className = "fm-toolbar-btn";
        btn.textContent = "🔍 查找模型";
        btn.title = "查找缺失模型和节点";
        btn.onclick = () => this._openModal();
        
        // 插到菜单最前面
        const firstChild = menu.firstChild;
        if (firstChild) {
            menu.insertBefore(btn, firstChild);
        } else {
            menu.appendChild(btn);
        }
    }

    // ---- 打开模态窗口 ----
    async _openModal() {
        if (this.overlay) {
            this.overlay.classList.remove("hidden");
            await this._renderContent();
            return;
        }
        this._buildModal();
        await this._renderContent();
    }

    _buildModal() {
        const ov = document.createElement("div");
        ov.className = "fm-overlay";
        ov.innerHTML = `
            <div class="fm-modal">
                <div class="fm-modal-header">
                    <div class="fm-modal-title">
                        🔍 查找缺失模型和节点
                        <span class="fm-badge" id="fm-badge" style="display:none">0</span>
                    </div>
                    <button class="fm-close-btn" title="关闭">×</button>
                </div>
                <div class="fm-toolbar">
                    <input class="fm-search-box" type="text" placeholder="搜索模型名称..." id="fm-search">
                    <button class="fm-scan-btn" id="fm-scan-btn">🔄 扫描工作流</button>
                </div>
                <div class="fm-tabs" id="fm-tabs">
                    <button class="fm-tab active" data-tab="missing">缺失模型 <span class="fm-count" id="fm-count-models">0</span></button>
                    <button class="fm-tab" data-tab="nodes">缺失节点 <span class="fm-count" id="fm-count-nodes">0</span></button>
                    <button class="fm-tab" data-tab="downloads">下载中 <span class="fm-count" id="fm-count-dls">0</span></button>
                    <button class="fm-tab" data-tab="settings">设置</button>
                </div>
                <div class="fm-content" id="fm-content"></div>
            </div>
        `;
        document.body.appendChild(ov);
        this.overlay = ov;
        this.contentEl = ov.querySelector("#fm-content");

        // 事件绑定
        ov.querySelector(".fm-close-btn").onclick = () => {
            ov.classList.add("hidden");
        };
        ov.addEventListener("click", (e) => {
            if (e.target === ov) ov.classList.add("hidden");
        });

        // Tab 切换
        ov.querySelectorAll(".fm-tab").forEach(tab => {
            tab.onclick = () => {
                ov.querySelectorAll(".fm-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                this.activeTab = tab.dataset.tab;
                this._renderContent();
            };
        });

        // 搜索框
        const searchBox = ov.querySelector("#fm-search");
        let searchTimer;
        searchBox.oninput = () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.searchFilter = searchBox.value.trim().toLowerCase();
                this._renderContent();
            }, 300);
        };

        // 扫描按钮
        ov.querySelector("#fm-scan-btn").onclick = () => this._scanWorkflow();
    }

    // ---- 扫描工作流 ----
    async _scanWorkflow() {
        const btn = this.overlay.querySelector("#fm-scan-btn");
        btn.disabled = true;
        btn.textContent = "⏳ 扫描中...";

        try {
            // 获取当前工作流 JSON
            const workflow = await this.app.graph.serialize();
            
            // 扫描缺失模型
            const scanResult = await apiPost("scan", { workflow });
            this.missingModels = scanResult.missing_models || [];

            // 检查缺失节点
            const nodeResult = await apiPost("check-missing-nodes", { workflow });
            this.missingNodes = nodeResult.missing_nodes || [];

            // 更新计数
            this._updateBadges();
            this._renderContent();
            showNotification(`扫描完成：${this.missingModels.length} 个缺失模型，${this.missingNodes.length} 个缺失节点`);
        } catch (e) {
            showNotification(`扫描失败: ${e.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = "🔄 扫描工作流";
        }
    }

    _updateBadges() {
        const total = this.missingModels.length + this.missingNodes.length;
        const badge = this.overlay.querySelector("#fm-badge");
        if (total > 0) {
            badge.style.display = "inline";
            badge.textContent = total;
        } else {
            badge.style.display = "none";
        }

        this.overlay.querySelector("#fm-count-models").textContent = this.missingModels.length;
        this.overlay.querySelector("#fm-count-nodes").textContent = this.missingNodes.length;
        const dlCount = Object.keys(this.downloadTasks).length;
        this.overlay.querySelector("#fm-count-dls").textContent = dlCount;
    }

    // ---- 渲染内容 ----
    async _renderContent() {
        if (!this.contentEl) return;
        this._updateBadges();

        switch (this.activeTab) {
            case "missing":
                this._renderMissingModels();
                break;
            case "nodes":
                this._renderMissingNodes();
                break;
            case "downloads":
                this._renderDownloads();
                break;
            case "settings":
                this._renderSettings();
                break;
        }
    }

    _renderMissingModels() {
        const el = this.contentEl;
        const models = this.missingModels.filter(m => {
            if (!this.searchFilter) return true;
            return m.name.toLowerCase().includes(this.searchFilter);
        });

        if (models.length === 0) {
            el.innerHTML = `
                <div class="fm-empty">
                    <div class="fm-empty-icon">✅</div>
                    ${this.searchFilter ? '未找到匹配的模型' : '没有缺失模型，点击"扫描工作流"开始检测'}
                </div>
            `;
            return;
        }

        el.innerHTML = models.map(m => `
            <div class="fm-model-card" data-name="${this._escAttr(m.name)}" data-type="${this._escAttr(m.type || 'checkpoints')}">
                <div class="fm-name">${this._esc(m.name)}</div>
                <div class="fm-meta">
                    <span class="fm-type-tag">${this._esc(this._modelTypeLabel(m.type))}</span>
                    ${m.local_path ? `<strong>路径:</strong> ${this._esc(m.local_path)}` : '<strong>状态:</strong> 缺失'}
                </div>
                <div class="fm-actions">
                    <button class="fm-action-btn fm-primary" data-action="download">⬇ 查找下载来源</button>
                    <button class="fm-action-btn" data-action="locate">📍 定位引用节点</button>
                    <button class="fm-action-btn" data-action="browse">📂 加载本地模型</button>
                </div>
                <div class="fm-sources" style="display:none;margin-top:8px"></div>
            </div>
        `).join("");

        // 事件绑定
        el.querySelectorAll(".fm-model-card").forEach(card => {
            const name = card.dataset.name;
            const type = card.dataset.type;

            card.querySelector('[data-action="download"]').onclick = (e) => {
                e.stopPropagation();
                this._searchDownloadSources(card, name, type);
            };
            card.querySelector('[data-action="locate"]').onclick = async (e) => {
                e.stopPropagation();
                await this._locateNode(name);
            };
            card.querySelector('[data-action="browse"]').onclick = (e) => {
                e.stopPropagation();
                this._browseLocal(card, name, type);
            };
        });
    }

    _renderMissingNodes() {
        const el = this.contentEl;
        const nodes = this.missingNodes.filter(n => {
            if (!this.searchFilter) return true;
            return n.toLowerCase().includes(this.searchFilter);
        });

        if (nodes.length === 0) {
            el.innerHTML = `
                <div class="fm-empty">
                    <div class="fm-empty-icon">✅</div>
                    ${this.searchFilter ? '未找到匹配的节点' : '没有缺失节点'}
                </div>
            `;
            return;
        }

        el.innerHTML = nodes.map(n => `
            <div class="fm-model-card">
                <div class="fm-name">${this._esc(n)}</div>
                <div class="fm-meta">
                    <span class="fm-type-tag node-tag">缺失节点</span>
                    该节点类型未注册，需安装对应的 ComfyUI 插件
                </div>
                <div class="fm-actions">
                    <button class="fm-action-btn fm-primary" data-action="install">📦 搜索插件</button>
                </div>
            </div>
        `).join("");

        el.querySelectorAll('[data-action="install"]').forEach((btn, i) => {
            btn.onclick = () => this._installPlugin(nodes[i]);
        });
    }

    async _renderDownloads() {
        const el = this.contentEl;
        try {
            const data = await apiGet("download/status");
            this.downloadTasks = data;
        } catch {}

        const tasks = Object.values(this.downloadTasks);
        if (tasks.length === 0) {
            el.innerHTML = '<div class="fm-empty"><div class="fm-empty-icon">📥</div>暂无下载任务</div>';
            return;
        }

        el.innerHTML = tasks.map(t => {
            const pct = t.progress || 0;
            const statusClass = t.status === "done" ? "done" : t.status === "error" ? "error" : "";
            return `
                <div class="fm-download-item">
                    <div class="fm-dl-name">${this._esc(t.model_name || t.name || "未知")}</div>
                    <div class="fm-dl-status ${statusClass}">${this._esc(t.status)}</div>
                    ${t.status === "downloading" ? `
                        <div class="fm-progress-bar">
                            <div class="fm-progress-fill" style="width:${pct}%"></div>
                        </div>
                        <div style="font-size:11px;color:#888">${pct}%</div>
                    ` : ""}
                </div>
            `;
        }).join("");
    }

    _renderSettings() {
        const el = this.contentEl;
        el.innerHTML = `
            <div class="fm-settings">
                <div class="fm-setting-group">
                    <h4>夸克网盘 Cookie</h4>
                    <label>用于解析夸克网盘直链，从浏览器 F12 → Network → Request Header 获取</label>
                    <input type="text" id="fm-quark-cookie" placeholder="__QUARK_COOKIE__" value="${this._escAttr(this.quarkCookie)}">
                </div>
                <div class="fm-setting-group">
                    <h4>夸克模型库链接 1</h4>
                    <input type="text" id="fm-quark-lib1" value="${this._escAttr(this.quarkLinks.library1)}">
                </div>
                <div class="fm-setting-group">
                    <h4>夸克模型库链接 2</h4>
                    <input type="text" id="fm-quark-lib2" value="${this._escAttr(this.quarkLinks.library2)}">
                </div>
                <button class="fm-save-btn" id="fm-save-settings">💾 保存设置</button>
            </div>
        `;

        el.querySelector("#fm-save-settings").onclick = () => {
            const cookie = el.querySelector("#fm-quark-cookie").value;
            const lib1 = el.querySelector("#fm-quark-lib1").value;
            const lib2 = el.querySelector("#fm-quark-lib2").value;
            localStorage.setItem("fm_quark_cookie", cookie);
            localStorage.setItem("fm_quark_lib1", lib1);
            localStorage.setItem("fm_quark_lib2", lib2);
            this.quarkCookie = cookie;
            this.quarkLinks.library1 = lib1;
            this.quarkLinks.library2 = lib2;
            showNotification("设置已保存");
        };
    }

    // ---- 查找下载来源 ----
    async _searchDownloadSources(card, name, type) {
        const sourcesEl = card.querySelector(".fm-sources");
        if (sourcesEl.style.display === "block") {
            sourcesEl.style.display = "none";
            return;
        }

        sourcesEl.style.display = "block";
        sourcesEl.innerHTML = '<div class="fm-loading"><div class="fm-spinner"></div></div>';

        try {
            const result = await apiPost("search-downloads", {
                model_name: name,
                source: "civitai",
                quark_cookie: this.quarkCookie,
            });

            const items = result.results || [];
            if (items.length > 0) {
                sourcesEl.innerHTML = items.map(item => `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-top:1px solid #333;font-size:12px">
                        <span style="color:#ccc;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc(item.name)}</span>
                        <span style="color:#888;margin:0 8px;flex-shrink:0">${item.size_mb ? formatSize(item.size_mb) : ''}</span>
                        <button class="fm-source-link" data-url="${this._escAttr(item.url)}">⬇ 下载</button>
                    </div>
                `).join("");

                sourcesEl.querySelectorAll(".fm-source-link").forEach(link => {
                    link.onclick = () => {
                        this._startDownload(link.dataset.url, name, type);
                    };
                });
            }

            // 显示夸克链接
            if (this.quarkLinks.library1 || this.quarkLinks.library2) {
                const quarkHtml = `
                    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #333">
                        <div style="font-size:11px;color:#888;margin-bottom:4px">夸克模型库：</div>
                        ${this.quarkLinks.library1 ? `<a href="${this._escAttr(this.quarkLinks.library1)}" target="_blank" style="display:block;font-size:12px;color:#7c3aed;text-decoration:underline;margin-bottom:2px">📁 模型库 1</a>` : ''}
                        ${this.quarkLinks.library2 ? `<a href="${this._escAttr(this.quarkLinks.library2)}" target="_blank" style="display:block;font-size:12px;color:#7c3aed;text-decoration:underline">📁 模型库 2</a>` : ''}
                    </div>
                `;
                sourcesEl.insertAdjacentHTML("beforeend", quarkHtml);
            } else if (items.length === 0) {
                sourcesEl.innerHTML = '<div class="fm-empty" style="padding:10px">未找到下载源，请在设置中配置夸克链接</div>';
            }
        } catch (e) {
            sourcesEl.innerHTML = `<div class="fm-empty" style="padding:10px">搜索失败: ${e.message}</div>`;
        }
    }

    // ---- 开始下载 ----
    async _startDownload(url, name, type) {
        try {
            await apiPost("download", {
                url,
                model_name: name,
                model_type: type,
                quark_cookie: this.quarkCookie,
            });
            showNotification(`开始下载: ${name}`);
            this._startPolling();
            this.activeTab = "downloads";
            this.overlay.querySelectorAll(".fm-tab").forEach(t => t.classList.remove("active"));
            this.overlay.querySelector('[data-tab="downloads"]').classList.add("active");
            this._renderContent();
        } catch (e) {
            showNotification(`下载失败: ${e.message}`);
        }
    }

    // ---- 定位引用节点 ----
    async _locateNode(name) {
        try {
            const workflow = await this.app.graph.serialize();
            const result = await apiPost("locate", {
                model_name: name,
                workflow,
            });
            if (result.found) {
                showNotification(`已找到引用节点: ${result.node_name || ''}`);
            } else {
                showNotification('未找到引用节点');
            }
        } catch (e) {
            showNotification(`定位失败: ${e.message}`);
        }
    }

    // ---- 浏览本地文件 ----
    async _browseLocal(card, name, type) {
        // 简单实现：触发文件选择
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".safetensors,.ckpt,.pt,.pth,.bin";
        input.multiple = false;
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const path = file.name; // 浏览器安全限制，只能拿到文件名
            try {
                await apiPost("load-local", {
                    file_path: path,
                    model_name: name,
                    model_type: type,
                });
                showNotification(`已加载: ${file.name}`);
            } catch (e) {
                showNotification(`加载失败: ${e.message}`);
            }
        };
        input.click();
    }

    // ---- 搜索缺失节点插件 ----
    _installPlugin(nodeName) {
        const query = encodeURIComponent(`comfyui ${nodeName}`);
        window.open(`https://github.com/search?q=${query}&type=repositories`, "_blank");
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
                this._updateBadges();
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

    // ---- 辅助方法 ----
    _modelTypeLabel(type) {
        const labels = {
            "checkpoints": "主模型",
            "loras": "LoRA",
            "vae": "VAE",
            "text_encoders": "文本编码器",
            "diffusion_models": "扩散模型",
            "controlnet": "ControlNet",
            "embedding": "Embedding",
            "embeddings": "Embedding",
            "upscale_models": "超分模型",
            "clip_vision": "CLIP Vision",
        };
        return labels[type] || type || "模型";
    }

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
    async setup() {
        // setup 阶段 DOM 已就绪
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
