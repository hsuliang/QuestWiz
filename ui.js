import { QUESTION_STYLE } from './constants.js';
import { getApiKey } from './api.js';
import * as state from './state.js';
import * as EditorHandlers from './handlers/editor.js';
import { isAutoGenerateEnabled } from './utils.js';
import { elements } from './dom.js';
import { TAIWAN_EDU_DOMAINS, TAIWAN_EDU_ISSUES, TAIWAN_PUBLISHERS } from './config.js';
import { translations } from './translations.js';

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

/**
 * [New] 統一事件委派中心 (Event Delegation)
 * 負責處理題目列表內的所有互動
 */
export function setupQuestionListEvents() {
    const container = document.getElementById('questions-container');
    if (!container || container.dataset.eventsBound) return;

    container.addEventListener('input', (e) => {
        const target = e.target;
        const card = target.closest('.question-card');
        if (!card) return;
        const index = parseInt(card.dataset.index, 10);
        const action = target.dataset.action;

        if (action === 'update-text') {
            EditorHandlers.updateQuestionField(index, 'text', target.value);
        } else if (action === 'update-option') {
            const optIndex = parseInt(target.dataset.optIndex, 10);
            EditorHandlers.updateOption(index, optIndex, target.value);
        }
    });

    container.addEventListener('change', (e) => {
        const target = e.target;
        const card = target.closest('.question-card');
        if (!card) return;
        const index = parseInt(card.dataset.index, 10);
        const action = target.dataset.action;

        if (action === 'update-correct' && target.checked) {
            EditorHandlers.updateCorrectAnswer(index, [parseInt(target.value, 10)]);
        }
    });

    container.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const card = target.closest('.question-card');
        if (!card) return;
        const index = parseInt(card.dataset.index, 10);
        const action = target.dataset.action;

        if (action === 'delete') {
            EditorHandlers.deleteQuestion(index);
            renderQuestionsForEditing(state.getGeneratedQuestions());
            initializeSortable();
        } else if (action === 'copy') {
            EditorHandlers.copyQuestion(index);
            renderQuestionsForEditing(state.getGeneratedQuestions());
            initializeSortable();
            showToast(t('toast_copy_success'), 'success');
        }
    });

    container.dataset.eventsBound = "true";
    console.log('[UI] Question list event delegation initialized.');
}

export function populateDropdowns() {
    const gradeOptions = [
        { value: "全部", text: "所有年級" },
        ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, text: `${i + 1} 年級` }))
    ];
    const populate = (selectElement, options, defaultOption) => {
        if (!selectElement) return;
        selectElement.innerHTML = '';
        if (defaultOption) {
            const opt = document.createElement('option');
            opt.value = defaultOption.value;
            opt.textContent = defaultOption.text;
            selectElement.appendChild(opt);
        }
        options.forEach(item => {
            const opt = document.createElement('option');
            const isObj = typeof item === 'object';
            opt.value = isObj ? item.value : item;
            opt.textContent = isObj ? item.text : item;
            selectElement.appendChild(opt);
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
 * 渲染題目編輯區 (簡化版，不再傳遞 Callback)
 */
export function renderQuestionsForEditing(questions) {
    view.renderQuestionsForEditing(questions);
    // 確保事件委派已綁定 (只需綁定一次)
    setupQuestionListEvents();
}

export function renderLibraryQuizzes(quizzes, onImport, onDelete) {
    view.renderLibraryQuizzes(quizzes, onImport, onDelete);
}

export function stopKeyTimer() {
    const timerDisplay = document.getElementById('api-key-timer');
    clearInterval(state.getKeyTimerInterval());
    if (timerDisplay) timerDisplay.style.display = 'none';
}

export function startKeyTimer(expirationTime) {
    const timerDisplay = document.getElementById('api-key-timer');
    if (!timerDisplay) return;
    clearInterval(state.getKeyTimerInterval());
    timerDisplay.style.display = 'inline';
    const updateTimer = () => {
        const remaining = expirationTime - new Date().getTime();
        if (remaining <= 0) {
            timerDisplay.textContent = '金鑰已過期';
            stopKeyTimer();
            getApiKey();
            return;
        }
        const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
        const minutes = Math.floor((remaining / 1000 / 60) % 60).toString().padStart(2, '0');
        const seconds = Math.floor((remaining / 1000) % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `(有效時間 ${hours}:${minutes}:${seconds})`;
    };
    updateTimer();
    state.setKeyTimerInterval(setInterval(updateTimer, 1000));
}

export function updateRegenerateButtonState() {
    if (!elements.regenerateBtn) return;
    const hasContent = (elements.textInput && elements.textInput.value.trim() !== '') || state.getUploadedImages().length > 0;
    const hasQuestions = state.getGeneratedQuestions().length > 0;
    const refreshIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 10a1 1 0 01-1 1H5a1 1 0 110-2h5.001a5.002 5.002 0 004.087-7.885 1 1 0 111.732-1.001A7.002 7.002 0 0114 12z" clip-rule="evenodd" /></svg>`;
    const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>`;
    const currentLang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    const tDict = translations[currentLang];
    if (hasQuestions) elements.regenerateBtn.innerHTML = refreshIcon + (tDict ? tDict.regenerate_btn : '重新生成');
    else elements.regenerateBtn.innerHTML = playIcon + (tDict ? tDict.generate_btn : '開始出題');
    elements.regenerateBtn.classList.toggle('hidden', !hasContent);
    const previewActions = document.getElementById('preview-actions');
    if (previewActions) previewActions.classList.toggle('hidden', state.getGeneratedQuestions().length === 0);
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
                const [movedItem] = questions.splice(evt.oldIndex, 1); 
                questions.splice(evt.newIndex, 0, movedItem);
                return questions;
            });
            renderQuestionsForEditing(state.getGeneratedQuestions());
            initializeSortable();
        }, 
    });
    state.setSortableInstance(newSortable);
}

export function setupDragDrop(dropZone, fileHandler, isMultiple) {
    if (!dropZone) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false));
    ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('drag-over'), false));
    ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'), false));
    dropZone.addEventListener('drop', e => { if (isMultiple) fileHandler(e.dataTransfer.files); else fileHandler(e.dataTransfer.files[0]); }, false);
}

export function applyLayoutPreference() {
    const preferredLayout = localStorage.getItem('quizGenLayout_v2');
    if (!elements.mainContainer) return;
    const placeholderP = elements.previewPlaceholder;
    const currentLang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    const tDict = translations[currentLang];
    const isReversed = preferredLayout === 'reversed';
    elements.mainContainer.classList.toggle('lg:flex-row-reverse', isReversed);
    if (placeholderP && tDict) placeholderP.textContent = isReversed ? tDict.preview_placeholder_reversed : tDict.preview_placeholder;
}

export function applyThemePreference() {
    const savedTheme = localStorage.getItem('quizGenTheme_v1') || 'lavender';
    const radio = document.getElementById(`theme-${savedTheme}`);
    if (radio) radio.checked = true;
}

export function populateVersionHistory() {
    const versionHistoryContent = document.getElementById('version-history-content');
    if (!versionHistoryContent) return;
    if (elements.versionBtn) elements.versionBtn.textContent = 'v8.9 版本修正歷程';
    const history = [
        { 
            version: "v8.9 (2025/12/23)", 
            current: true, 
            notes: [
                "✨ 核心架構模組化：完成 View 層獨立與常數中心化，大幅提升維護性。",
                "🛡️ 異步穩定性強化：導入任務追蹤與 ID 驗證，杜絕重複點擊與幽靈請求。",
                "🚀 操作效能優化：實作事件委派與動態 DOM 存取，提升介面流暢度。",
                "📡 API 請求韌性：加入智慧重試與安全性捕捉，提升 AI 出題成功率。",
                "🌐 網址抓取進化：整合 Jina 與本地雙解析策略，並模擬真實瀏覽器環境。",
                "📦 品質工程保障：建立自動化驗收腳本，確保系統釋出穩定。"
            ] 
        },
        { 
            version: "v8.8 (2025/12/22)", 
            current: false, 
            notes: ["【✨ 認知領域進階】 - 新增布魯姆認知層次分配。", "【🚀 穩定性提升】 - 恢復穩定 API 邏輯。", "【📝 命題規範】 - 整合核心命題指南。"] 
        }
    ];
    versionHistoryContent.innerHTML = history.map(v => `<div><h4 class="font-bold text-lg">${v.version} ${v.current ? '<span class="text-sm font-normal themed-accent-text">(目前版本)</span>' : ''}</h4><ul class="list-disc list-inside text-gray-600">${v.notes.map(n => `<li>${n}</li>`).join('')}</ul></div>`).join('');
}

export async function updateVisitorCount() {
    const counterElement = document.getElementById('visitor-counter');
    if (!counterElement) return;
    try {
        const response = await fetch(`https://api.counterapi.dev/v1/aliang-quiz-gen/main/up`);
        const data = await response.json();
        if (data.count) counterElement.textContent = data.count.toLocaleString();
    } catch (e) { console.error('無法載入瀏覽人數:', e); }
}

export function askForLanguageChoice() {
    return new Promise((resolve, reject) => {
        const modal = document.getElementById('language-choice-modal');
        const content = document.getElementById('language-choice-modal-content');
        const zhBtn = document.getElementById('lang-choice-zh-btn');
        const enBtn = document.getElementById('lang-choice-en-btn');
        if (!modal || !content) return reject('Modal not found');
        modal.classList.remove('hidden');
        setTimeout(() => content.classList.add('open'), 10);
        const handle = (choice) => {
            content.classList.remove('open');
            setTimeout(() => { modal.classList.add('hidden'); resolve(choice); }, 200);
        };
        zhBtn.onclick = () => handle('chinese');
        enBtn.onclick = () => handle('english');
    });
}

export function updateLanguage(lang) {
    if (!translations[lang]) return;
    document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if (translations[lang][k]) el.textContent = translations[lang][k]; });
    document.querySelectorAll('[data-i18n-html]').forEach(el => { const k = el.getAttribute('data-i18n-html'); if (translations[lang][k]) el.innerHTML = translations[lang][k]; });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { const k = el.getAttribute('data-i18n-placeholder'); if (translations[lang][k]) el.placeholder = translations[lang][k]; });
    updateRegenerateButtonState(); 
    if (elements.previewPlaceholder) {
        const isRev = document.getElementById('main-container').classList.contains('lg:flex-row-reverse');
        elements.previewPlaceholder.textContent = translations[lang][isRev ? 'preview_placeholder_reversed' : 'preview_placeholder'];
    }
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
        if (elements.formatSelect) elements.formatSelect.value = settings.format || '';
        if (elements.studentLevelSelect) elements.studentLevelSelect.value = settings.studentLevel || '';
        if (elements.difficultySelect) elements.difficultySelect.value = settings.difficulty || '中等';
        if (elements.questionTypeSelect) elements.questionTypeSelect.value = settings.questionType || 'multiple_choice';
        if (elements.questionStyleSelect) elements.questionStyleSelect.value = settings.questionStyle || QUESTION_STYLE.KNOWLEDGE_RECALL;
        if (elements.numQuestionsInput) elements.numQuestionsInput.value = settings.numQuestions || '5';
    }
    if (sourceContext && sourceContext.content) {
        elements.textInput.value = '';
        elements.urlInput.value = '';
        if (sourceContext.sourceType === 'url') {
            elements.urlInput.value = sourceContext.content;
            if (elements.tabs.input.buttons[2]) elements.tabs.input.buttons[2].click();
        } else {
            elements.textInput.value = sourceContext.content;
            if (elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click();
        }
    }
    if (elements.quizTitleInput) elements.quizTitleInput.value = unit || title;
}
