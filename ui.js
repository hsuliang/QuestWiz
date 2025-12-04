import { getApiKey } from './api.js';
import * as state from './state.js';
import { triggerQuestionGeneration } from './handlers.js';
import { isAutoGenerateEnabled } from './utils.js';
import { elements } from './dom.js'; // 引入 DOM 模組

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
 * 更新「開始出題/手動更新」按鈕的狀態與文字
 */
export function updateRegenerateButtonState() {
    if (!elements.regenerateBtn || !document.getElementById('preview-actions')) return;
    const previewActions = document.getElementById('preview-actions');

    const hasContent = (elements.textInput && elements.textInput.value.trim() !== '') || state.getUploadedImages().length > 0;
    const isAutoMode = isAutoGenerateEnabled();

    if (!hasContent && !isAutoMode) {
        previewActions.classList.add('hidden');
        return;
    }

    const refreshIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 10a1 1 0 01-1 1H5a1 1 0 110-2h5.001a5.002 5.002 0 004.087-7.885 1 1 0 111.732-1.001A7.002 7.002 0 0114 12z" clip-rule="evenodd" /></svg>`;
    const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>`;

    if (isAutoMode) {
        if (state.getGeneratedQuestions().length > 0) {
            previewActions.classList.remove('hidden');
            elements.regenerateBtn.classList.remove('themed-button-primary');
            elements.regenerateBtn.classList.add('bg-gray-500', 'hover:bg-gray-600');
            elements.regenerateBtn.innerHTML = refreshIcon + '手動更新';
        } else {
            previewActions.classList.add('hidden');
        }
    } else {
        if (hasContent) {
            previewActions.classList.remove('hidden');
            elements.regenerateBtn.classList.add('themed-button-primary');
            elements.regenerateBtn.classList.remove('bg-gray-500', 'hover:bg-gray-600');
            
            if (state.getGeneratedQuestions().length > 0) {
                elements.regenerateBtn.innerHTML = refreshIcon + '重新生成';
            } else {
                elements.regenerateBtn.innerHTML = playIcon + '開始出題';
            }
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
                        <h5 class="font-bold mb-1 border-b border-gray-600 pb-1">AI 設計理念</h5>
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
                         <p class="text-sm font-bold themed-accent-text">第 ${index + 1} 題</p>
                         ${aiInsightHtml}
                    </div>
                    <div class="flex items-center space-x-2">
                       <button class="copy-question-btn text-gray-400 hover:text-indigo-500 transition-colors" title="複製題目">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                       </button>
                       <button class="delete-question-btn text-gray-400 hover:text-red-500 transition-colors" title="刪除題目">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       </button>
                    </div>
                </div>
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">題目：</label>
                        <textarea rows="2" class="question-text border border-gray-300 rounded-md p-2 w-full transition focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">${questionData.text}</textarea>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">選項 (點擊圓圈設為正解)：</label>
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
        card.querySelector('.copy-question-btn').addEventListener('click', () => { const questionToCopy = JSON.parse(JSON.stringify(currentQuestions[index])); currentQuestions.splice(index + 1, 0, questionToCopy); state.setGeneratedQuestions(currentQuestions); renderQuestionsForEditing(currentQuestions); initializeSortable(); showToast('題目已成功複製！', 'success'); });
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

    if (preferredLayout === 'reversed') {
        elements.mainContainer.classList.add('lg:flex-row-reverse');
        if (placeholderP) placeholderP.textContent = '請在右側提供內容並設定選項';
    } else {
        elements.mainContainer.classList.remove('lg:flex-row-reverse');
        if (placeholderP) placeholderP.textContent = '請在左側提供內容並設定選項';
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

    const currentDisplayVersion = 'v8.3 體驗優化';
    if (elements.versionBtn) elements.versionBtn.textContent = currentDisplayVersion;

    const versionHistory = [
        {
            version: "v8.3 體驗優化",
            current: true,
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
