import { getApiKey } from './api.js';
import * as state from './state.js';
import { triggerQuestionGeneration } from './handlers.js';
import { isAutoGenerateEnabled } from './utils.js';
import { elements } from './dom.js'; // 引入 DOM 模組
import { TAIWAN_EDU_DOMAINS, TAIWAN_EDU_ISSUES, TAIWAN_PUBLISHERS } from './config.js'; // 引入常數

import { translations } from './translations.js';

// --- 初始化與下拉選單 ---

/**
 * 填充所有下拉選單 (領域、議題、年級、出版社)
 * 包含上傳視窗與題庫大廳的篩選器
 */
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

    // 1. 領域 (Domains)
    populate(elements.uploadDomain, TAIWAN_EDU_DOMAINS, { value: "", text: "請選擇領域..." });
    populate(elements.libDomainSelect, TAIWAN_EDU_DOMAINS, { value: "全部", text: "所有領域" });

    // 2. 議題 (Issues)
    populate(elements.uploadIssue, TAIWAN_EDU_ISSUES); // uploadIssue 的第一個選項 "無" 已在常數中
    populate(elements.libIssueSelect, TAIWAN_EDU_ISSUES.filter(i => i !== '無'), { value: "全部", text: "所有議題" });

    // 3. 年級 (Grades)
    // 上傳用的年級選單 (不含"全部")
    populate(elements.uploadGrade, gradeOptions.slice(1), { value: "", text: "請選擇年級..." });
    // 篩選用的年級選單
    populate(elements.libGradeSelect, gradeOptions.slice(1), { value: "全部", text: "所有年級" });

    // 4. 出版社 (Publishers)
    populate(elements.uploadPublisher, TAIWAN_PUBLISHERS, { value: "", text: "請選擇出版社..." });
    populate(elements.libPublisherSelect, TAIWAN_PUBLISHERS, { value: "全部", text: "所有出版社" });
}

// --- 視窗控制 ---

export function toggleUploadModal(show) {
    if (!elements.uploadModal) return;
    if (show) {
        elements.uploadModal.classList.remove('hidden');
        // 自動填入標題 (如果有)
        if (elements.uploadUnit && elements.quizTitleInput) {
             if (!elements.uploadUnit.value) {
                 elements.uploadUnit.value = elements.quizTitleInput.value;
             }
        }
    } else {
        elements.uploadModal.classList.add('hidden');
    }
}

/**
 * 切換右側工作區 Tab
 * @param {string} tabId - 'edit' 或 'library'
 */
export function switchWorkTab(tabId) {
    if (!elements.workTabs) return;
    
    const isLibrary = tabId === 'library';
    const targetIndex = isLibrary ? 1 : 0;

    elements.workTabs.buttons.forEach((btn, idx) => {
        if (idx === targetIndex) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        }
    });

    elements.workTabs.contents.forEach((content, idx) => {
        if (idx === targetIndex) {
            content.classList.remove('hidden');
            content.classList.add('active');
        } else {
            content.classList.add('hidden');
            content.classList.remove('active');
        }
    });
}

// --- 題庫列表渲染 ---

/**
 * 顯示題庫載入中動畫
 */
export function showLibraryLoader() {
    if (elements.libQuizList) {
        // 重置容器樣式為置中顯示
        elements.libQuizList.className = "h-64 flex flex-col items-center justify-center text-gray-500 border rounded-lg bg-gray-50";
        elements.libQuizList.innerHTML = `
            <svg class="animate-spin h-8 w-8 mb-3 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p>正在從雲端載入題庫...</p>`;
    }
}

/**
 * 渲染題庫列表 (表格版)
 * @param {Array} quizzes - 測驗卷物件陣列
 * @param {Function} onImport - 點擊匯入時的回呼函式 (quizData) => void
 * @param {Function} onDelete - [新增] 點擊刪除時的回呼函式 (quizId) => void
 */
export function renderLibraryQuizzes(quizzes, onImport, onDelete) {
    if (!elements.libQuizList) return;
    
    // 設定容器樣式：固定高度 + 垂直卷軸 + 表格框線
    // max-h-[600px] 大約可顯示 10-12 筆資料
    elements.libQuizList.className = "max-h-[600px] overflow-y-auto overflow-x-auto border border-gray-200 rounded-lg custom-scrollbar bg-white shadow-sm";

    if (quizzes.length === 0) {
        elements.libQuizList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p class="text-lg font-medium">沒有找到符合條件的測驗卷</p>
                <p class="text-sm">試著調整篩選條件看看？</p>
            </div>`;
        return;
    }

    // 產生表格列 HTML
    const rowsHtml = quizzes.map((quiz, index) => {
        const date = quiz.createdAt ? new Date(quiz.createdAt.seconds * 1000).toLocaleDateString('zh-TW') : '-';
        const qCount = quiz.questions ? quiz.questions.length : 0;
        const domainColor = getDomainColor(quiz.domain);
        
        // 議題標籤
        const issueBadge = (quiz.issue && quiz.issue !== '無') 
            ? `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">#${quiz.issue}</span></div>` 
            : '';

        // [新增] 只有在管理員模式下才顯示刪除按鈕
        const deleteButtonHtml = state.isAdminMode() 
            ? `
            <button class="delete-quiz-btn ml-2 inline-flex items-center justify-center p-2 border border-transparent text-sm font-medium rounded-full text-gray-400 hover:text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all" data-id="${quiz.id}" title="刪除此題庫">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.995L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
            ` 
            : '';

        return `
            <tr class="group hover:bg-indigo-50/50 transition-colors border-b last:border-b-0 border-gray-100">
                <!-- 單元名稱 (主要資訊) -->
                <td class="px-4 py-3 align-middle">
                    <div class="flex flex-col">
                        <span class="font-bold text-gray-800 text-sm md:text-base line-clamp-1" title="${quiz.unit || quiz.title}">
                            ${quiz.unit || quiz.title}
                        </span>
                        <!-- 手機版顯示額外資訊 -->
                        <div class="md:hidden text-xs text-gray-500 mt-1 flex flex-wrap gap-1 items-center">
                            <span class="${domainColor.text}">${quiz.domain}</span>
                            <span>•</span>
                            <span>${quiz.grade}年級</span>
                            <span>•</span>
                            <span>${quiz.author}</span>
                        </div>
                    </div>
                </td>

                <!-- 領域 (桌機版) -->
                <td class="px-4 py-3 align-middle hidden md:table-cell">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${domainColor.bg} ${domainColor.text}">
                        ${quiz.domain || '未分類'}
                    </span>
                    ${issueBadge}
                </td>

                <!-- 年級 (桌機版) -->
                <td class="px-4 py-3 align-middle text-sm text-gray-600 text-center hidden md:table-cell whitespace-nowrap">
                    ${quiz.grade} 年級
                </td>

                <!-- 作者 (桌機版) -->
                <td class="px-4 py-3 align-middle text-sm text-gray-600 hidden md:table-cell">
                    <div class="flex items-center max-w-[120px]" title="${quiz.author}">
                        <svg class="w-3.5 h-3.5 mr-1.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        <span class="truncate">${quiz.author || '匿名'}</span>
                    </div>
                </td>

                <!-- 資訊/日期 (桌機版) -->
                <td class="px-4 py-3 align-middle text-xs text-gray-500 whitespace-nowrap hidden sm:table-cell text-right">
                    <div>${date}</div>
                    <div class="text-gray-400 mt-0.5" title="下載次數">
                        <span class="inline-flex items-center"><svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>${quiz.downloadCount || 0}</span>
                        <span class="mx-1">|</span>
                        <span>${qCount}題</span>
                    </div>
                </td>

                <!-- 操作按鈕 -->
                <td class="px-4 py-3 align-middle text-right whitespace-nowrap">
                    <div class="flex items-center justify-end">
                        <button class="import-quiz-btn inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-all active:scale-95" data-index="${index}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5 md:mr-0 lg:mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span class="inline md:hidden lg:inline">匯入</span>
                        </button>
                        ${deleteButtonHtml}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // 組合完整表格
    elements.libQuizList.innerHTML = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50 sticky top-0 z-10 shadow-sm ring-1 ring-gray-200/50">
                <tr>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-full md:w-auto">單元名稱</th>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell w-32">領域</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell w-20">年級</th>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell w-32">作者</th>
                    <th scope="col" class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell w-28">資訊</th>
                    <th scope="col" class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-20 md:w-24">操作</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-100">
                ${rowsHtml}
            </tbody>
        </table>
    `;

    // 重新綁定事件
    const importBtns = elements.libQuizList.querySelectorAll('.import-quiz-btn');
    importBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const index = btn.dataset.index;
            onImport(quizzes[index]);
        });
    });

    if (state.isAdminMode()) {
        const deleteBtns = elements.libQuizList.querySelectorAll('.delete-quiz-btn');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const quizId = e.currentTarget.dataset.id;
                onDelete(quizId);
            });
        });
    }
}

function getDomainColor(domain) {
    const colors = {
        '語文': { bg: 'bg-red-100', text: 'text-red-800' },
        '數學': { bg: 'bg-blue-100', text: 'text-blue-800' },
        '社會': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
        '自然科學': { bg: 'bg-green-100', text: 'text-green-800' },
        '藝術': { bg: 'bg-purple-100', text: 'text-purple-800' },
        '綜合活動': { bg: 'bg-orange-100', text: 'text-orange-800' },
        '科技': { bg: 'bg-cyan-100', text: 'text-cyan-800' },
        '健康與體育': { bg: 'bg-teal-100', text: 'text-teal-800' }
    };
    return colors[domain] || { bg: 'bg-gray-100', text: 'text-gray-800' };
}

/**
 * 顯示提示訊息 (Toast)
 */
export function showToast(message, type = 'success') {
    if (document.getElementById('toast') && document.getElementById('toast-message')) { // 暫時直接存取以維持相容性，因為 dom.js 可能不包含動態生成的元素
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        toastMessage.textContent = message;
        toast.className = `fixed bottom-5 right-5 text-white py-2 px-5 rounded-lg shadow-xl opacity-0 transition-opacity duration-300 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
        toast.classList.remove('opacity-0');
        setTimeout(() => { toast.classList.add('opacity-0'); }, 4000);
    }
}

/**
 * 停止並隱藏倒數計時器
 */
export function stopKeyTimer() {
    const timerDisplay = document.getElementById('api-key-timer');
    clearInterval(state.getKeyTimerInterval());
    if (timerDisplay) {
        timerDisplay.style.display = 'none';
    }
}

/**
 * 啟動或更新 API 金鑰的倒數計時器
 */
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
            getApiKey(); // 觸發過期邏輯
            return;
        }

        const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((remaining / 1000 / 60) % 60);
        const seconds = Math.floor((remaining / 1000) % 60);

        const f_hours = hours.toString().padStart(2, '0');
        const f_minutes = minutes.toString().padStart(2, '0');
        const f_seconds = seconds.toString().padStart(2, '0');

        timerDisplay.textContent = `(有效時間 ${f_hours}:${f_minutes}:${f_seconds})`;
    };

    updateTimer();
    state.setKeyTimerInterval(setInterval(updateTimer, 1000));
}

/**
 * 更新「開始出題/重新生成」按鈕與「下載/重置」區塊的狀態
 */
export function updateRegenerateButtonState() {
    // 1. 控制左側「開始出題」按鈕 (regenerate-btn)
    // 邏輯：有輸入內容 (文字或圖片) 時顯示，否則隱藏。
    // 文字部分已在 handlers.checkContentAndToggleButton 處理，但這裡做狀態更新 (文字變更)
    if (elements.regenerateBtn) {
        const hasContent = (elements.textInput && elements.textInput.value.trim() !== '') || state.getUploadedImages().length > 0;
        const hasQuestions = state.getGeneratedQuestions().length > 0;
        
        const refreshIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 10a1 1 0 01-1 1H5a1 1 0 110-2h5.001a5.002 5.002 0 004.087-7.885 1 1 0 111.732-1.001A7.002 7.002 0 0114 12z" clip-rule="evenodd" /></svg>`;
        const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>`;

        // 更新按鈕文字：若已有題目則顯示「重新生成」，否則顯示「開始出題」
        const currentLang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
        const t = translations[currentLang];
        
        if (hasQuestions) {
            elements.regenerateBtn.innerHTML = refreshIcon + (t ? t.regenerate_btn : '重新生成');
        } else {
            elements.regenerateBtn.innerHTML = playIcon + (t ? t.generate_btn : '開始出題');
        }
        
        // 確保顯示邏輯一致
        if (hasContent) {
            elements.regenerateBtn.classList.remove('hidden');
        } else {
            elements.regenerateBtn.classList.add('hidden');
        }
    }

    // 2. 控制右側「下載/重置」區塊 (preview-actions)
    // 邏輯：只有在題目生成完畢 (questions > 0) 時才顯示。
    const previewActions = document.getElementById('preview-actions');
    if (previewActions) {
        if (state.getGeneratedQuestions().length > 0) {
            previewActions.classList.remove('hidden');
        } else {
            previewActions.classList.add('hidden');
        }
    }
}

/**
 * 初始化 SortableJS 拖曳功能
 */
export function initializeSortable() {
    if (state.getSortableInstance()) state.getSortableInstance().destroy();
    if (!document.getElementById('questions-container')) return;
    const questionsContainer = document.getElementById('questions-container');
    const newSortable = new Sortable(questionsContainer, { 
        animation: 150, 
        handle: '.drag-handle', 
        ghostClass: 'sortable-ghost', 
        onEnd: function (evt) {
            const questions = state.getGeneratedQuestions();
            const [movedItem] = questions.splice(evt.oldIndex, 1); 
            questions.splice(evt.newIndex, 0, movedItem);
            state.setGeneratedQuestions(questions);
            renderQuestionsForEditing(questions);
            initializeSortable();
        }, 
    });
    state.setSortableInstance(newSortable);
}

/**
 * 將生成的題目渲染到預覽區以供編輯
 */
export function renderQuestionsForEditing(questions) {
    if (!document.getElementById('questions-container')) return;
    const questionsContainer = document.getElementById('questions-container');
    questionsContainer.innerHTML = '';
    questions.forEach((q, index) => {
        const isTF = q.hasOwnProperty('is_correct');
        const questionData = isTF ? { text: q.text, options: ['是', '否'], correct: [q.is_correct ? 0 : 1], time: q.time || 30, explanation: q.explanation || '', design_concept: q.design_concept || '' } : q;
        const card = document.createElement('div');
        card.className = 'question-card bg-gray-50 p-4 rounded-lg shadow-sm border flex gap-x-3 transition-transform duration-300 hover:border-l-indigo-300 hover:-translate-y-0.5';
        card.dataset.index = index;

        let optionsHtml = (questionData.options || []).map((opt, optIndex) => `
            <div class="flex items-center">
                <label class="option-label w-full flex items-center">
                    <input type="radio" name="correct-option-${index}" class="option-radio" value="${optIndex}" ${(questionData.correct || []).includes(optIndex) ? 'checked' : ''}>
                    <input type="text" value="${String(opt).replace(/"/g, '&quot;')}" class="ml-2 flex-grow border border-gray-300 rounded-md p-2 w-full transition focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">
                </label>
            </div>
        `).join('');

        let aiInsightHtml = '';
        if (elements.questionStyleSelect && elements.questionStyleSelect.value === 'competency-based' && questionData.design_concept) {
            aiInsightHtml = `
                <div class="relative flex items-center group">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm-.707 10.607a1 1 0 011.414 0l.707-.707a1 1 0 111.414 1.414l-.707.707a1 1 0 01-1.414 0zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" /></svg>
                    <div class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-gray-800 text-white text-sm rounded-lg shadow-lg z-10 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200">
                        <h5 class="font-bold mb-1 border-b border-gray-600 pb-1">${t('ai_insight_title')}</h5>
                        <p class="text-xs">${questionData.design_concept}</p>
                    </div>
                </div>`;
        }

        card.innerHTML = `
            <div class="drag-handle text-gray-400 hover:text-indigo-600 p-2 flex items-center cursor-grab active:cursor-grabbing">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </div>
            <div class="flex-grow">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center space-x-2">
                         <p class="text-sm font-bold themed-accent-text">${t('question_prefix')} ${index + 1} ${t('question_suffix')}</p>
                         ${aiInsightHtml}
                    </div>
                    <div class="flex items-center space-x-2">
                       <button class="copy-question-btn text-gray-400 hover:text-indigo-500 transition-colors" title="${t('toast_copy_success')}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                       </button>
                       <button class="delete-question-btn text-gray-400 hover:text-red-500 transition-colors" title="刪除題目">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       </button>
                    </div>
                </div>
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">${t('question_label')}</label>
                        <textarea rows="2" class="question-text border border-gray-300 rounded-md p-2 w-full transition focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">${questionData.text}</textarea>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">${t('options_label')}</label>
                        <div class="space-y-2 options-container">${optionsHtml}</div>
                    </div>
                </div>
            </div>`;
        questionsContainer.appendChild(card);
    });

    questionsContainer.querySelectorAll('.question-card').forEach(card => {
        const index = parseInt(card.dataset.index, 10);
        const currentQuestions = state.getGeneratedQuestions();
        card.querySelector('.question-text').addEventListener('input', e => { currentQuestions[index].text = e.target.value; });
        card.querySelectorAll('.options-container input[type="text"]').forEach((optInput, optIndex) => { optInput.addEventListener('input', e => { currentQuestions[index].options[optIndex] = e.target.value; }); });
        card.querySelectorAll('.options-container input[type="radio"]').forEach(radio => { radio.addEventListener('change', e => { if (e.target.checked) { currentQuestions[index].correct = [parseInt(e.target.value, 10)]; } }); });
        card.querySelector('.delete-question-btn').addEventListener('click', () => { currentQuestions.splice(index, 1); state.setGeneratedQuestions(currentQuestions); renderQuestionsForEditing(currentQuestions); initializeSortable(); });
        card.querySelector('.copy-question-btn').addEventListener('click', () => { const questionToCopy = JSON.parse(JSON.stringify(currentQuestions[index])); currentQuestions.splice(index + 1, 0, questionToCopy); state.setGeneratedQuestions(currentQuestions); renderQuestionsForEditing(currentQuestions); initializeSortable(); showToast(t('toast_copy_success'), 'success'); });
    });
}

/**
 * 設定拖曳上傳區域
 */
export function setupDragDrop(dropZone, fileHandler, isMultiple) {
    if (!dropZone) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false));
    ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false));
    ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false));
    dropZone.addEventListener('drop', (e) => { if (isMultiple) fileHandler(e.dataTransfer.files); else fileHandler(e.dataTransfer.files[0]); }, false);
}

export function showPostDownloadModal() {
    if (elements.postDownloadModal) elements.postDownloadModal.classList.remove('hidden');
    const content = document.getElementById('post-download-modal-content');
    if (content) setTimeout(() => { content.classList.remove('scale-95', 'opacity-0'); }, 10);
}
export function hidePostDownloadModal() {
    const content = document.getElementById('post-download-modal-content');
    if (content) content.classList.add('scale-95', 'opacity-0');
    if (elements.postDownloadModal) setTimeout(() => { elements.postDownloadModal.classList.add('hidden'); }, 200);
}

export function applyLayoutPreference() {
    const preferredLayout = localStorage.getItem('quizGenLayout_v2');
    if (!elements.mainContainer) return;

    const placeholderP = elements.previewPlaceholder;
    const currentLang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    const t = translations[currentLang];

    if (preferredLayout === 'reversed') {
        elements.mainContainer.classList.add('lg:flex-row-reverse');
        if (placeholderP && t) placeholderP.textContent = t.preview_placeholder_reversed;
    } else {
        elements.mainContainer.classList.remove('lg:flex-row-reverse');
        if (placeholderP && t) placeholderP.textContent = t.preview_placeholder;
    }
}

export function applyThemePreference() {
    const savedTheme = localStorage.getItem('quizGenTheme_v1') || 'lavender';
    const radioToCheck = document.getElementById(`theme-${savedTheme}`);
    if (radioToCheck) {
        radioToCheck.checked = true;
    }
}

export function populateVersionHistory() {
    const versionHistoryContent = document.getElementById('version-history-content');
    if (!versionHistoryContent) return;

    const currentDisplayVersion = 'v8.7 版本修正歷程';
    if (elements.versionBtn) elements.versionBtn.textContent = currentDisplayVersion;

    const versionHistory = [
        {
            version: "v8.7 (2025/12/20)",
            current: true,
            notes: [
                "【✨ 新增題庫大廳】",
                " - **題庫大廳**：新增「題庫大廳」至右側工作區，以分頁顯示，提供寬敞的瀏覽體驗。",
                " - **新增題庫上傳**：依個人意願上傳題庫，提供教師社群功能。",
                " - **Remix 功能**：匯入題庫時，會自動還原當時的生成設定與來源內文。",
                " - **管理員模式**：新增管理員模式，提供管理者刪除題庫。",
            ]
        },
        {
            version: "v8.6 (2025/12/14)",
            current: false,
            notes: [
                "【🌍 國際化支援】",
                " - 新增「語言」設定分頁，支援 **繁體中文** 與 **English** 介面切換。",
                " - AI 生成的題目與提示詞現在會根據介面語言自動調整。",
                " - 錯誤訊息與提示文字全面支援多語言顯示。",
            ]
        },
        {
            version: "v8.5 (2025/12/12)",
            current: false,
            notes: [
                "【🚀 新功能】",
                " - 新增支援 **Blooket** 平台 CSV 格式匯出。",
                " - 新增支援 **Gimkit** 平台 CSV 格式匯出。",
                "【✨ 優化】",
                " - 調整匯出格式選單順序，將 Wayground 選項前移。",
            ]
        },
        {
            version: "v8.4 介面更新",
            current: false,
            notes: [
                "【✨ 介面優化】",
                " - 調整「開始出題」按鈕位置至題目設定區塊底部，並配合布景主題配色。",
                " - 新增「重置」按鈕，並改為紅色以提示其清除功能。",
                " - 「下載題庫檔案」與「重置」按鈕僅在生成題目後才顯示，使流程更清晰。",
                " - 移除「啟用自動出題」設定，簡化出題流程為手動觸發。",
                " - 優化預覽區空白狀態顯示，移除不合時宜文字並新增引導圖示。"
            ]
        },
        {
            version: "v8.3 體驗優化",
            current: false, // Update to false as v8.4 is current
            notes: [
                "【🚀 新功能】",
                " - 新增「PDF 考卷 (A4)」與「純文字檔 (.txt)」匯出格式。",
                " - 新增「試卷標題」欄位，可自訂匯出檔名與內容標題。",
                "【✨ 優化】",
                " - 學生程度設定全域自動同步，避免設定遺漏。",
                " - 新增匯出格式與學生程度的強制檢查提示。",
                " - 優化「清除所有內容」功能，確保徹底清空。",
                " - 調整通知訊息位置至螢幕上方，提升可見度。",
                " - 優化 PDF 匯入錯誤提示，更友善告知無法讀取的檔案類型。"
            ]
        },
        {
            version: "v8.2 內容擴充",
            notes: [
                "【🚀 新功能】",
                " - 新增「從網址匯入」功能，可自動擷取網頁文章或 YouTube 影片字幕。",
                " - 支援貼上新聞、部落格、YouTube 影片連結，擴大內容來源。",
                " - 此功能需搭配後端的 `extractContentFromUrl` 與 `getYouTubeTranscript` 雲端函式使用。"
            ]
        },
        {
            version: "v8.1 內容分享",
            notes: [
                "【🚀 新功能】",
                " - 新增「分享內容」功能，可產生臨時閱讀頁面的 QR Code 與連結。",
                " - 方便教師在課堂上快速將 AI 生成的內容派發給學生閱讀。",
            ]
        },
        {
            version: "v8.0 功能增強",
            notes: [
                "【✨ 功能增強】",
                " - 新增 AI 生成內容的「文本類型」與「寫作語氣」的自訂選項。",
                " - 新增「預覽/修改提示詞」功能，讓使用者能完全控制 AI 指令。",
            ]
        },
        {
            version: "v7.9 安全性強化",
            notes: [
                "【🔒 安全性強化】",
                " - API 金鑰傳輸方式升級，從 URL 參數移至 HTTP 標頭 (Header) 傳送。",
            ]
        },
        {
            version: "v7.8 安全更新",
            notes: [
                "【✨ 安全性升級】",
                " - API 金鑰儲存方式從 localStorage 改為 sessionStorage。",
                " - 新增 API 金鑰 2 小時有效期限與倒數計時器。",
            ]
        },
    ];
    let html = '';
    versionHistory.forEach(v => {
        html += `<div><h4 class="font-bold text-lg">${v.version} ${v.current ? '<span class="text-sm font-normal themed-accent-text">(目前版本)</span>' : ''}</h4><ul class="list-disc list-inside text-gray-600">${v.notes.map(note => `<li>${note}</li>`).join('')}</ul></div>`;
    });
    versionHistoryContent.innerHTML = html;
}

export async function updateVisitorCount() {
    const counterElement = document.getElementById('visitor-counter');
    if (!counterElement) return;
    const namespace = 'aliang-quiz-gen';
    const key = 'main';
    const apiUrl = `https://api.counterapi.dev/v1/${namespace}/${key}/up`;
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error('計數器服務回應錯誤');
        const data = await response.json();
        if (data.count) {
            counterElement.textContent = data.count.toLocaleString();
        }
    } catch (error) {
        console.error('無法載入瀏覽人數:', error);
    }
}

export function askForLanguageChoice() {
    return new Promise((resolve, reject) => {
        const languageChoiceModal = document.getElementById('language-choice-modal');
        const languageChoiceModalContent = document.getElementById('language-choice-modal-content');
        const langChoiceZhBtn = document.getElementById('lang-choice-zh-btn');
        const langChoiceEnBtn = document.getElementById('lang-choice-en-btn');

        if (!languageChoiceModal || !languageChoiceModalContent) {
            return reject('Modal elements not found');
        }

        languageChoiceModal.classList.remove('hidden');
        setTimeout(() => languageChoiceModalContent.classList.add('open'), 10);

        function handleChoice(event) {
            const choice = event.target.id === 'lang-choice-en-btn' ? 'english' : 'chinese';

            languageChoiceModalContent.classList.remove('open');
            setTimeout(() => {
                languageChoiceModal.classList.add('hidden');
                langChoiceZhBtn.removeEventListener('click', handleChoice);
                langChoiceEnBtn.removeEventListener('click', handleChoice);
            }, 200);

            resolve(choice);
        }

        langChoiceZhBtn.addEventListener('click', handleChoice, { once: true });
        langChoiceEnBtn.addEventListener('click', handleChoice, { once: true });
    });
}

export function showLoader(text = '處理中...') {
    const previewLoader = document.getElementById('preview-loader');
    const loadingText = document.getElementById('loading-text');
    if (previewLoader && loadingText) {
        loadingText.textContent = text;
        previewLoader.classList.remove('hidden');
    }
}

export function hideLoader() {
    const previewLoader = document.getElementById('preview-loader');
    if (previewLoader) {
        previewLoader.classList.add('hidden');
    }
}

export function showPromptModal() {
    if (elements.promptModal) elements.promptModal.classList.remove('hidden');
}
export function hidePromptModal() {
    if (elements.promptModal) elements.promptModal.classList.add('hidden');
}

export function showShareModal() {
    if (elements.shareModal) elements.shareModal.classList.remove('hidden');
}
export function hideShareModal() {
    if (elements.shareModal) elements.shareModal.classList.add('hidden');
}

/**
 * 更新介面語言
 * @param {string} lang - 語言代碼 (zh-TW, en)
 */
export function updateLanguage(lang) {
    if (!translations[lang]) return;

    // 1. 更新所有帶有 data-i18n 的元素
    const elementsToTranslate = document.querySelectorAll('[data-i18n]');
    elementsToTranslate.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });

    // 1.5. 更新帶有 data-i18n-html 的元素 (支援 HTML 內容)
    const elementsToTranslateHtml = document.querySelectorAll('[data-i18n-html]');
    elementsToTranslateHtml.forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (translations[lang][key]) {
            el.innerHTML = translations[lang][key];
        }
    });

    // 2. 更新 placeholder (data-i18n-placeholder)
    const placeholdersToTranslate = document.querySelectorAll('[data-i18n-placeholder]');
    placeholdersToTranslate.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang][key]) {
            el.placeholder = translations[lang][key];
        }
    });

    // 3. 更新特定動態元素
    // 更新「開始出題/重新生成」按鈕文字 (因為它會動態變化，我們存個狀態或在 updateRegenerateButtonState 裡處理)
    updateRegenerateButtonState(); 

    // 更新 Placeholder 文字 (左側/右側提示)
    if (elements.previewPlaceholder) {
        const isReversed = document.getElementById('main-container').classList.contains('lg:flex-row-reverse');
        const key = isReversed ? 'preview_placeholder_reversed' : 'preview_placeholder';
        elements.previewPlaceholder.textContent = translations[lang][key];
    }
    
    // 4. 更新 HTML lang 屬性
    document.documentElement.lang = lang;

    // 5. 儲存設定
    localStorage.setItem('quizGenLanguage_v1', lang);

    // 6. 更新語言選單狀態
    const radios = document.querySelectorAll('input[name="language"]');
    radios.forEach(radio => {
        if (radio.value === lang) radio.checked = true;
    });
}

/**
 * 初始化語言設定
 */
export function initLanguage() {
    const savedLang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    updateLanguage(savedLang);

    const languageRadios = document.querySelectorAll('input[name="language"]');
    languageRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            updateLanguage(e.target.value);
        });
    });
}

/**
 * 取得目前語言的翻譯字串
 * @param {string} key - 翻譯鍵值
 * @returns {string} - 翻譯後的字串
 */
export function t(key) {
    const lang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    return (translations[lang] && translations[lang][key]) ? translations[lang][key] : key;
}

/**
 * [新增] 匯入題庫時，將儲存的設定與內容套用回介面
 * @param {object} quiz - 從 Firestore 讀取的完整測驗物件
 */
export function applyImportedData(quiz) {
    const { settings, sourceContext, title, unit } = quiz;

    // 1. 恢復生成設定
    if (settings) {
        if (elements.formatSelect) elements.formatSelect.value = settings.format || '';
        if (elements.studentLevelSelect) elements.studentLevelSelect.value = settings.studentLevel || '';
        if (elements.difficultySelect) elements.difficultySelect.value = settings.difficulty || '中等';
        if (elements.questionTypeSelect) elements.questionTypeSelect.value = settings.questionType || 'multiple_choice';
        if (elements.questionStyleSelect) elements.questionStyleSelect.value = settings.questionStyle || 'knowledge-recall';
        if (elements.numQuestionsInput) elements.numQuestionsInput.value = settings.numQuestions || '5';
    }

    // 2. 恢復來源內容與對應的 Tab
    if (sourceContext && sourceContext.content) {
        // 清空所有輸入
        elements.textInput.value = '';
        elements.urlInput.value = '';
        // 根據類型填入並切換 Tab
        if (sourceContext.sourceType === 'url') {
            elements.urlInput.value = sourceContext.content;
            if (elements.tabs.input.buttons[2]) { // URL tab is at index 2
                elements.tabs.input.buttons[2].click();
            }
        } else { // 'text' or 'image' (image content is just a placeholder text)
            elements.textInput.value = sourceContext.content;
            if (elements.tabs.input.buttons[0]) { // Text tab is at index 0
                elements.tabs.input.buttons[0].click();
            }
        }
    }
    
    // 3. 恢復標題
    if (elements.quizTitleInput) {
        elements.quizTitleInput.value = unit || title;
    }
}