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
    const update = () => {
        const rem = expirationTime - Date.now();
        if (rem <= 0) { display.textContent = '金鑰已過期'; stopKeyTimer(); getApiKey(); return; }
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
    if (elements.previewPlaceholder && tDict) elements.previewPlaceholder.textContent = isRev ? tDict.preview_placeholder_reversed : tDict.preview_placeholder;
}

export function applyThemePreference() {
    const theme = localStorage.getItem('quizGenTheme_v1') || 'lavender';
    const radio = document.getElementById(`theme-${theme}`);
    if (radio) radio.checked = true;
}

export function populateVersionHistory() {
    const content = document.getElementById('version-history-content');
    if (!content) return;
    if (elements.versionBtn) elements.versionBtn.textContent = 'v9.5 版本修正歷程';
    const history = [
        { version: "v9.5 (2025/12/28)", current: true, notes: ["✨ 互動標記：選取文章文字即可快速設為考點，並自動高亮顯示。", "🎨 智慧高亮：輸入框支援即時關鍵字變色，且與捲動完美同步。", "🛠️ 系統修復：解決出題卡頓問題，優化渲染邏輯。"] },
        { version: "v9.4 (2025/12/27)", current: false, notes: ["🚀 效能巔峰：實作「智慧局部更新」，編輯題目時游標不再跳離，體感極度流暢。", "🛡️ 穩定性強：修復 PDF 中文擷取 bcmap 錯誤，改用穩定 CDN。", "🎨 互動細緻：新增 AI 生成與分析時的按鈕內 Loading 動態。"] },
        { version: "v9.3 (2025/12/27)", current: false, notes: ["🧩 組件化革命：導入 HTML &lt;template&gt; 技術，徹底分離視圖與邏輯，解決按鈕失效問題。"] },
        { version: "v9.2 (2025/12/27)", current: false, notes: ["⚡ 響應式核心：重構資料層 (MVVM)，實現「修改資料、自動繪圖」的自動檔體驗。"] },
        { version: "v9.0 (2025/12/23)", current: false, notes: ["🎨 視覺一致性優化：全系統按鈕圖示化。", "🛡️ 異步穩定性：導入任務追蹤與 ID 驗證。"] }
    ];
    content.innerHTML = history.map(v => `
        <div class="mb-6 last:mb-0">
            <h4 class="font-bold text-lg ${v.current ? 'themed-accent-text' : 'text-gray-700'} flex items-center">
                ${v.version} 
                ${v.current ? '<span class="text-[10px] font-normal bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full ml-2 uppercase tracking-wider">Latest</span>' : ''}
            </h4>
            <ul class="mt-3 space-y-2">
                ${v.notes.map(n => `
                    <li class="flex items-start text-sm text-gray-600 leading-relaxed">
                        <span class="text-indigo-400 mr-2 flex-shrink-0 mt-0.5">✦</span>
                        <span>${n}</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `).join('<hr class="my-4 border-gray-100">');
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
        const zh = document.getElementById('lang-choice-zh-btn');
        const en = document.getElementById('lang-choice-en-btn');
        if (!modal) return reject();
        modal.classList.remove('hidden');
        zh.onclick = () => { modal.classList.add('hidden'); resolve('chinese'); };
        en.onclick = () => { modal.classList.add('hidden'); resolve('english'); };
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
