import { QUESTION_STYLE } from './constants.js';
import { getApiKey } from './api.js';
import * as state from './state.js';
import * as EditorHandlers from './handlers/editor.js';
import { isAutoGenerateEnabled } from './utils.js';
import { elements } from './dom.js';
import { TAIWAN_EDU_DOMAINS, TAIWAN_EDU_ISSUES, TAIWAN_PUBLISHERS } from './config.js';
import { translations } from './translations.js';
import { refreshUI } from './view/sync.js';

// Import View Layer
import * as view from './view/index.js';

// Re-export standard view functions for backward compatibility
export { refreshUI };
export const showToast = view.showToast;
export const showLoader = view.showLoader;
export const hideLoader = view.hideLoader;
export const showErrorState = view.showErrorState;
export const toggleUploadModal = view.toggleUploadModal;
export const switchWorkTab = view.switchWorkTab;
export const switchTab = view.switchTab;
export const showLibraryLoader = view.showLibraryLoader;
export const renderQuizSummary = view.renderQuizSummary;
export const showPromptModal = view.showPromptModal;
export const hidePromptModal = view.hidePromptModal;
export const showShareModal = view.showShareModal;
export const hideShareModal = view.hideShareModal;
export const showPostDownloadModal = view.showPostDownloadModal;
export const hidePostDownloadModal = view.hidePostDownloadModal;

export function t(key) {
    const lang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    return (translations[lang] && translations[lang][key]) ? translations[lang][key] : key;
}

export function populateDropdowns() {
    const gradeOptions = [
        { value: "全部", text: "所有年級" },
        ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, text: `${i + 1} 年級` }))
    ];
    const populate = (el, opts, def) => {
        if (!el) return;
        el.innerHTML = '';
        if (def) { const o = document.createElement('option'); o.value = def.value; o.textContent = def.text; el.appendChild(o); }
        opts.forEach(item => {
            const o = document.createElement('option');
            o.value = typeof item === 'object' ? item.value : item;
            o.textContent = typeof item === 'object' ? item.text : item;
            el.appendChild(o);
        });
    };
    populate(elements.uploadDomain, TAIWAN_EDU_DOMAINS, { value: "", text: "請選擇領域..." });
    populate(elements.libDomainSelect, TAIWAN_EDU_DOMAINS, { value: "全部", text: "所有領域" });
    populate(elements.uploadIssue, TAIWAN_EDU_ISSUES);
    populate(elements.libIssueSelect, TAIWAN_EDU_ISSUES.filter(i => i !== '無'), { value: "全部", text: "所有議題" });
    const uploadGradeOptions = [...gradeOptions.slice(1), { value: "其他", text: "其他" }];
    populate(elements.uploadGrade, uploadGradeOptions, { value: "", text: "請選擇年級..." });
    populate(elements.libGradeSelect, uploadGradeOptions, { value: "全部", text: "所有年級" });
    populate(elements.uploadPublisher, TAIWAN_PUBLISHERS, { value: "", text: "請選擇版本..." });
    populate(elements.libPublisherSelect, TAIWAN_PUBLISHERS, { value: "全部", text: "所有版本" });
}

/**
 * 渲染題目編輯區 (穩定版：直接綁定 Callback)
 */
export function renderQuestionsForEditing(questions) {
    view.renderQuestionsForEditing(questions, {
        onUpdateField: (index, field, value) => EditorHandlers.updateQuestionField(index, field, value),
        onUpdateOption: (index, optIndex, value) => EditorHandlers.updateOption(index, optIndex, value),
        onUpdateCorrect: (index, correctArr) => EditorHandlers.updateCorrectAnswer(index, correctArr),
        onDelete: (index) => {
            EditorHandlers.deleteQuestion(index);
            renderQuestionsForEditing(state.getGeneratedQuestions());
        },
        onCopy: (index) => {
            EditorHandlers.copyQuestion(index);
            renderQuestionsForEditing(state.getGeneratedQuestions());
            showToast(t('toast_copy_success'), 'success');
        }
    });
    initializeSortable(); // 重點：重新渲染後必須重啟拖曳
}

export function renderLibraryQuizzes(quizzes, onImport, onDelete) {
    view.renderLibraryQuizzes(quizzes, onImport, onDelete);
}

export function stopKeyTimer() {
    const display = document.getElementById('api-key-timer');
    clearInterval(state.getKeyTimerInterval());
    if (display) display.style.display = 'none';
}

export function startKeyTimer(expirationTime) {
    const display = document.getElementById('api-key-timer');
    if (!display) return;
    clearInterval(state.getKeyTimerInterval());
    display.style.display = 'inline';
    display.classList.remove('text-green-600', 'text-red-600'); // Reset colors
    
    const update = () => {
        const rem = expirationTime - Date.now();
        if (rem <= 0) { 
            display.textContent = '金鑰已過期'; 
            display.classList.add('text-red-600');
            // stopKeyTimer(); // Don't stop immediately, let user see it expired
            getApiKey(); // Trigger cleanup if needed
            return; 
        }
        const h = Math.floor((rem / 3600000) % 24).toString().padStart(2, '0');
        const m = Math.floor((rem / 60000) % 60).toString().padStart(2, '0');
        const s = Math.floor((rem / 1000) % 60).toString().padStart(2, '0');
        display.textContent = `(有效時間 ${h}:${m}:${s})`;
    };
    update();
    state.setKeyTimerInterval(setInterval(update, 1000));
}

export function updateRegenerateButtonState() {
    refreshUI();
}

export function initializeSortable() {
    if (state.getSortableInstance()) state.getSortableInstance().destroy();
    const container = document.getElementById('questions-container');
    if (!container) return;
    const newSortable = new Sortable(container, { 
        animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost', 
        onEnd: function (evt) {
            state.updateGeneratedQuestions(prev => {
                const questions = [...prev];
                const [moved] = questions.splice(evt.oldIndex, 1); 
                questions.splice(evt.newIndex, 0, moved);
                return questions;
            });
            // 拖曳完畢後重新渲染以更新題號
            renderQuestionsForEditing(state.getGeneratedQuestions());
        }, 
    });
    state.setSortableInstance(newSortable);
}

export function setupDragDrop(zone, handler, isMultiple) {
    if (!zone) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false));
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, () => zone.classList.add('drag-over'), false));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('drag-over'), false));
    zone.addEventListener('drop', e => { if (isMultiple) handler(e.dataTransfer.files); else handler(e.dataTransfer.files[0]); }, false);
}

export function applyLayoutPreference() {
    const layout = localStorage.getItem('quizGenLayout_v2');
    if (!elements.mainContainer) return;
    const tDict = translations[localStorage.getItem('quizGenLanguage_v1') || 'zh-TW'];
    const isRev = layout === 'reversed';
    elements.mainContainer.classList.toggle('lg:flex-row-reverse', isRev);
    
    // Fix: Only update the text paragraph, not the entire container (which kills the icon)
    const textEl = elements.previewPlaceholder ? elements.previewPlaceholder.querySelector('[data-i18n="preview_placeholder"]') : null;
    if (textEl && tDict) {
        textEl.textContent = isRev ? tDict.preview_placeholder_reversed : tDict.preview_placeholder;
    }
}

export function applyThemePreference() {
    const theme = localStorage.getItem('quizGenTheme_v1') || 'lavender';
    const radio = document.getElementById(`theme-${theme}`);
    if (radio) radio.checked = true;
}

export function populateVersionHistory() {
    const content = document.getElementById('version-history-content');
    if (!content) return;
    content.innerHTML = `
        <div class="space-y-6">
            <div class="border-l-4 border-blue-600 pl-4">
                <h4 class="font-bold text-lg text-blue-800">V9.8.4 命題風格精準化與 UX 深度優化 (2026/01/17)</h4>
                <ul class="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                    <li>API 負載均衡優化：實作「隨機起點圓桌輪詢 (Random Start Round-Robin)」，避免過度消耗第一組金鑰，讓多組 API Key 的使用量更趨平均。</li>
                    <li>命題風格光譜化：重構 Prompt 工廠，將「知識記憶」與「素養導向」徹底解耦。知識型題目現在強制使用直述句並禁止情境包裝。</li>
                    <li>黃金範例引導 (Few-Shot)：為不同風格注入 Good/Bad 對比範例，大幅提升 AI 對「直球對決」與「真實情境」的執行力。</li>
                    <li>認知層次轉譯：實作二維控制矩陣，確保在高認知層次（如分析、評鑑）與基礎風格並存時，AI 能以正確的語法呈現題目。</li>
                    <li>深層重置 (Hard Reset)：優化重置邏輯，區分「清空內容（保留設定）」與「全域重置（設定歸零）」，並補全所有選單預設值。</li>
                    <li>AI 創作庫擴充：新增文本類型（新聞、社群、微小說）與寫作語氣（偵探、YouTuber、史詩），大幅提升生成多樣性。</li>
                </ul>
            </div>
            <div class="border-l-4 border-pink-500 pl-4">
                <h4 class="font-bold text-lg text-pink-700">V9.8.3 專業教育大腦與適性化升級 (2026/01/06)</h4>
                <ul class="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                    <li>K-12 適性化大腦：基於《台灣閱讀分級規範》，精準控制各年段識字量與語法（如：低年級禁止成語/疊字）。</li>
                    <li>領域靈魂矩陣：新增「學習領域」選單，針對數學、自然、語文等學科注入專屬命題邏輯。</li>
                    <li>智慧 UI 連動：實作「內容篇幅」滑桿，隨年級自動跳轉科學建議字數，並即時預估閱讀時間。</li>
                    <li>命題品質大躍進：找回 v9.8.1 強力基因，解決題目重複、考點脫鉤與格式錯誤（如 A. B. 前綴）問題。</li>
                    <li>結構化解析：優化 AI 文章生成 Parser，支援自動同步關鍵字至考點欄位並徹底清洗 JSON 標籤。</li>
                </ul>
            </div>
            <div class="border-l-4 border-purple-500 pl-4">
                <h4 class="font-bold text-lg text-purple-700">v9.8 極限生存與品質強化 (2026/01/03)</h4>
                <ul class="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                    <li>實作「多金鑰自動跳號」機制，遇到 429 錯誤自動嘗試備用金鑰。</li>
                    <li>新增「高品質模式」與「標準模式」雙軌選擇，應對 API 配額緊縮。</li>
                    <li>高品質模式注入 CoT (思維鏈) 指令，強化邏輯驗證與推理深度。</li>
                    <li>標準模式強化誘答項設計規範，提升一次出題成功率。</li>
                </ul>
            </div>
            <div class="border-l-4 border-indigo-500 pl-4">
                <h4 class="font-bold text-lg text-indigo-700">v9.7.1 配置與網址擷取修復</h4>
                <ul class="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                    <li>還原網址擷取功能至 Google Cloud Function，解決 CORS 擋截問題。</li>
                    <li>補全 config.js 遺失的分享與內容服務 URL。</li>
                </ul>
            </div>
            <div class="border-l-4 border-emerald-500 pl-4">
                <h4 class="font-bold text-lg text-emerald-700">v9.7 第一階段完工 (2026/01/01)</h4>
                <ul class="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                    <li>全面導入人性化錯誤報錯機制 (Error Translator)。</li>
                    <li>認知層次標籤全面中文化，不再顯示英文代碼。</li>
                    <li>修復分享後頁面重置與題庫列表無法即時更新的問題。</li>
                    <li>UI 細節打磨：高亮選單修復、API Key 眼睛修復、移除冗餘介面設定。</li>
                </ul>
            </div>
            <div class="border-l-4 border-blue-500 pl-4">
                <h4 class="font-bold text-lg text-blue-700">v9.6 架構重整與韌性強化</h4>
                <ul class="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                    <li>實作分段容錯初始化 (Resilient Bootloader)，防止單一錯誤癱瘓系統。</li>
                    <li>重構「題目生成設定」為精確的 4 列網格佈局。</li>
                    <li>全站圖示與標籤支援主題色連動 (Theming)。</li>
                    <li>題庫大廳實作內部獨立捲動與自適應高度。</li>
                </ul>
            </div>
        </div>
    `;
}
export async function updateVisitorCount() {
    const el = document.getElementById('visitor-counter');
    if (!el) return;
    try {
        const res = await fetch(`https://api.counterapi.dev/v1/aliang-quiz-gen/main/up`);
        const data = await res.json();
        if (data.count) el.textContent = data.count.toLocaleString();
    } catch (e) {}
}

export function askForLanguageChoice() {
    return new Promise((resolve, reject) => {
        const modal = document.getElementById('language-choice-modal');
        const content = document.getElementById('language-choice-modal-content');
        const zh = document.getElementById('lang-choice-zh-btn');
        const en = document.getElementById('lang-choice-en-btn');
        
        if (!modal || !zh || !en) {
            console.error('[UI] Language choice modal or buttons missing');
            // Fallback: use default confirmation if modal fails
            if (confirm("偵測到英文內容。是否使用英文出題？\n(按「確定」為英文，「取消」為中文)")) {
                return resolve('english');
            } else {
                return resolve('chinese');
            }
        }
        
        console.log('[UI] Showing language choice modal');
        modal.classList.remove('hidden');
        // Force reflow to enable transition
        void modal.offsetWidth; 
        
        if (content) {
            content.classList.remove('opacity-0', 'scale-95');
            content.classList.add('open'); // Ensure 'open' class is used if styled that way
        }
        
        const closeAndResolve = (lang) => {
            if (content) {
                content.classList.add('opacity-0', 'scale-95');
                content.classList.remove('open');
            }
            setTimeout(() => {
                modal.classList.add('hidden');
                zh.onclick = null;
                en.onclick = null;
                resolve(lang);
            }, 200);
        };

        zh.onclick = () => closeAndResolve('chinese');
        en.onclick = () => closeAndResolve('english');
    });
}

export function updateLanguage(lang) {
    if (!translations[lang]) return;
    document.querySelectorAll('[data-i18n]').forEach(el => { 
        const k = el.getAttribute('data-i18n'); 
        if (translations[lang][k]) {
            el.textContent = translations[lang][k];
        }
    });
    refreshUI();
    document.documentElement.lang = lang;
    localStorage.setItem('quizGenLanguage_v1', lang);
    document.querySelectorAll('input[name="language"]').forEach(r => { r.checked = (r.value === lang); });
}

export function initLanguage() {
    const saved = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    updateLanguage(saved);
    document.querySelectorAll('input[name="language"]').forEach(r => r.addEventListener('change', e => updateLanguage(e.target.value)));
}

export function initModelSelection() {
    const savedModel = localStorage.getItem('quizGenModel_v1') || 'standard';
    const radios = elements.modelRadios;
    const warning = elements.modelQuotaWarning;

    if (!radios) return;

    radios.forEach(r => {
        if (r.value === savedModel) r.checked = true;
        
        r.addEventListener('change', (e) => {
            const val = e.target.value;
            localStorage.setItem('quizGenModel_v1', val);
            
            if (val === 'high-quality') {
                warning?.classList.remove('hidden');
                showToast('已切換至高品質模式 (每日限額 20 次)', 'info');
            } else {
                warning?.classList.add('hidden');
            }
        });
    });

    // 初始狀態檢查
    if (savedModel === 'high-quality') {
        warning?.classList.remove('hidden');
    }
}

export function showVersionModal() {
    if (elements.versionModal) elements.versionModal.classList.remove('hidden');
}

export function hideVersionModal() {
    if (elements.versionModal) elements.versionModal.classList.add('hidden');
}

export function applyImportedData(quiz) {
    const { settings, sourceContext, unit, title } = quiz;
    if (settings) {
        if (elements.studentLevelSelect) elements.studentLevelSelect.value = settings.studentLevel || '';
        if (elements.questionStyleSelect) elements.questionStyleSelect.value = settings.questionStyle || QUESTION_STYLE.KNOWLEDGE_RECALL;
        if (elements.numQuestionsInput) elements.numQuestionsInput.value = settings.numQuestions || '5';
    }
    if (sourceContext && sourceContext.content) {
        elements.textInput.value = sourceContext.content;
        elements.textInput.dispatchEvent(new Event('input'));
    }
    if (elements.quizTitleInput) elements.quizTitleInput.value = unit || title;
}

/**
 * [New] Phase 1: 應用程式模式切換
 */
export function switchAppMode(mode) {
    const quick = document.getElementById('quick-mode-container');
    const expert = document.getElementById('expert-mode-container');
    const btnQuick = document.getElementById('mode-btn-quick');
    const btnExpert = document.getElementById('mode-btn-expert');

    if (!quick || !expert) return;

    if (mode === 'quick') {
        quick.classList.remove('hidden');
        expert.classList.add('hidden');
        btnQuick?.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
        btnExpert?.classList.remove('bg-purple-600', 'text-white', 'shadow-md');
    } else {
        quick.classList.add('hidden');
        expert.classList.remove('hidden');
        btnQuick?.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
        btnExpert?.classList.add('bg-purple-600', 'text-white', 'shadow-md');
    }
    localStorage.setItem('appMode_v1', mode);
}

/**
 * [New] Phase 1: 專家模式題型切換
 */
export function switchExpertType(btnElement, type) {
    document.querySelectorAll('.expert-type-btn').forEach(btn => btn.classList.remove('active', 'bg-purple-50', 'text-purple-700', 'ring-1', 'ring-purple-500'));
    btnElement.classList.add('active', 'bg-purple-50', 'text-purple-700', 'ring-1', 'ring-purple-500');
    const title = document.getElementById('expert-placeholder-title');
    if (title) title.textContent = btnElement.textContent;
}
