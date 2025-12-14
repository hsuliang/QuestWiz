import { CONFIG, contentLoadingMessages, questionLoadingMessages } from './config.js';
import * as state from './state.js';
import { getApiKey, generateSingleBatch, fetchWithRetry } from './api.js';
import * as ui from './ui.js';
import * as utils from './utils.js'; // Changed to namespace import
import { elements } from './dom.js';
import { getContentSystemInstruction } from './prompts.js'; // Import prompt builder

// Destructure what's needed for direct use, but keep 'utils' for namespace access
const { isEnglish, debounce, isAutoGenerateEnabled, compressImage } = utils;

// --- 草稿功能 ---
const DRAFT_INPUTS_KEY = 'questwiz_draft_inputs_v1';

function saveInputDraft() {
    const draft = {
        textInput: elements.textInput ? elements.textInput.value : '',
        topicInput: elements.topicInput ? elements.topicInput.value : '',
        learningObjectivesInput: elements.learningObjectivesInput ? elements.learningObjectivesInput.value : '',
        textTypeSelect: elements.textTypeSelect ? elements.textTypeSelect.value : '科普說明文',
        customTextTypeInput: elements.customTextTypeInput ? elements.customTextTypeInput.value : '',
        toneSelect: elements.toneSelect ? elements.toneSelect.value : '客觀中立',
        customToneInput: elements.customToneInput ? elements.customToneInput.value : '',
        urlInput: elements.urlInput ? elements.urlInput.value : '',
        numQuestionsInput: elements.numQuestionsInput ? elements.numQuestionsInput.value : '5',
        questionTypeSelect: elements.questionTypeSelect ? elements.questionTypeSelect.value : 'multiple_choice',
        difficultySelect: elements.difficultySelect ? elements.difficultySelect.value : '中等',
        questionStyleSelect: elements.questionStyleSelect ? elements.questionStyleSelect.value : 'knowledge-recall',
        studentLevelSelect: elements.studentLevelSelect ? elements.studentLevelSelect.value : '1-2',
        competencyBasedCheckbox: elements.competencyBasedCheckbox ? elements.competencyBasedCheckbox.checked : false,
        formatSelect: elements.formatSelect ? elements.formatSelect.value : '',
        quizTitleInput: elements.quizTitleInput ? elements.quizTitleInput.value : '',
        timestamp: Date.now()
    };
    localStorage.setItem(DRAFT_INPUTS_KEY, JSON.stringify(draft));
}

const debouncedSaveDraft = debounce(saveInputDraft, 1000);

export function restoreDraft() {
    // 1. 恢復 State (題目與圖片)
    const stateDraft = state.loadDraftState();
    if (stateDraft) {
        // 檢查是否超時 (例如超過 24 小時就不恢復)
        if (Date.now() - stateDraft.timestamp < 24 * 60 * 60 * 1000) {
            if (stateDraft.generatedQuestions && stateDraft.generatedQuestions.length > 0) {
                state.setGeneratedQuestions(stateDraft.generatedQuestions);
                ui.renderQuestionsForEditing(stateDraft.generatedQuestions);
                ui.initializeSortable();
            }
            if (stateDraft.uploadedImages && stateDraft.uploadedImages.length > 0) {
                state.setUploadedImages(stateDraft.uploadedImages);
                // 重新渲染圖片預覽
                if (elements.imagePreviewContainer) {
                    elements.imagePreviewContainer.innerHTML = '';
                    const fragment = document.createDocumentFragment();
                    stateDraft.uploadedImages.forEach(img => {
                        const previewWrapper = document.createElement('div');
                        previewWrapper.className = 'relative group';
                        const imgElement = document.createElement('img');
                        imgElement.src = `data:${img.type};base64,${img.data}`; 
                        imgElement.className = 'w-full h-32 object-cover rounded-lg shadow-md';
                        const removeBtn = document.createElement('div');
                        removeBtn.className = 'absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer font-bold leading-none transition-all hover:bg-red-500/90 scale-0 group-hover:scale-100';
                        removeBtn.innerHTML = '&times;';
                        removeBtn.onclick = () => { 
                            state.setUploadedImages(state.getUploadedImages().filter(i => i.id !== img.id)); 
                            previewWrapper.remove();
                            triggerOrUpdate();
                        };
                        previewWrapper.appendChild(imgElement); previewWrapper.appendChild(removeBtn);
                        fragment.appendChild(previewWrapper);
                    });
                    elements.imagePreviewContainer.appendChild(fragment);
                }
            }
        }
    }

    // 2. 恢復 Inputs
    try {
        const inputsString = localStorage.getItem(DRAFT_INPUTS_KEY);
        if (inputsString) {
            const inputs = JSON.parse(inputsString);
            if (Date.now() - inputs.timestamp < 24 * 60 * 60 * 1000) {
                if(elements.textInput) elements.textInput.value = inputs.textInput || '';
                if(elements.topicInput) elements.topicInput.value = inputs.topicInput || '';
                if(elements.learningObjectivesInput) elements.learningObjectivesInput.value = inputs.learningObjectivesInput || '';
                if(elements.textTypeSelect) elements.textTypeSelect.value = inputs.textTypeSelect || '科普說明文';
                if(elements.customTextTypeInput) {
                    elements.customTextTypeInput.value = inputs.customTextTypeInput || '';
                    if (inputs.textTypeSelect === 'custom') elements.customTextTypeInput.classList.remove('hidden');
                }
                if(elements.toneSelect) elements.toneSelect.value = inputs.toneSelect || '客觀中立';
                if(elements.customToneInput) {
                    elements.customToneInput.value = inputs.customToneInput || '';
                    if (inputs.toneSelect === 'custom') elements.customToneInput.classList.remove('hidden');
                }
                if(elements.urlInput) elements.urlInput.value = inputs.urlInput || '';
                if(elements.numQuestionsInput) elements.numQuestionsInput.value = inputs.numQuestionsInput || '5';
                if(elements.questionTypeSelect) elements.questionTypeSelect.value = inputs.questionTypeSelect || 'multiple_choice';
                if(elements.difficultySelect) elements.difficultySelect.value = inputs.difficultySelect || '中等';
                if(elements.questionStyleSelect) elements.questionStyleSelect.value = inputs.questionStyleSelect || 'knowledge-recall';
                if(elements.studentLevelSelect) elements.studentLevelSelect.value = inputs.studentLevelSelect || '1-2';
                if(elements.quizTitleInput) elements.quizTitleInput.value = inputs.quizTitleInput || '';
                if(elements.competencyBasedCheckbox) elements.competencyBasedCheckbox.checked = inputs.competencyBasedCheckbox || false;
                if(elements.formatSelect) elements.formatSelect.value = inputs.formatSelect || '';

                // 簡單判斷是否有恢復內容
                if (inputs.textInput || inputs.topicInput || (stateDraft && stateDraft.generatedQuestions.length > 0)) {
                    ui.showToast(ui.t('toast_restored'), 'success');
                    ui.updateRegenerateButtonState();
                    
                    // 根據內容切換 Tab (簡單邏輯)
                    if (inputs.topicInput) { if(elements.tabs.input.buttons[3]) elements.tabs.input.buttons[3].click(); } 
                    else if (state.getUploadedImages().length > 0) { if(elements.tabs.input.buttons[1]) elements.tabs.input.buttons[1].click(); } 
                    else if (inputs.textInput) { if(elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click(); }
                }
            }
        }
    } catch (e) {
        console.error('恢復 Input 草稿失敗:', e);
    }
}

// 為所有輸入欄位綁定自動儲存
export function bindAutoSave() {
    const inputs = [
        elements.textInput, elements.topicInput, elements.learningObjectivesInput, 
        elements.textTypeSelect, elements.customTextTypeInput, elements.toneSelect, 
        elements.customToneInput, elements.urlInput, elements.numQuestionsInput, 
        elements.questionTypeSelect, elements.difficultySelect, elements.questionStyleSelect, 
        elements.studentLevelSelect, elements.competencyBasedCheckbox, elements.formatSelect
    ];
    inputs.forEach(input => {
        if (input) {
            const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input';
            utils.addSafeEventListener(input, eventType, debouncedSaveDraft);
        }
    });
}


/**
 * 輔助函式：動態載入一個 script
 * @param {string} src - script 的 URL
 * @returns {Promise<void>}
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`無法載入 script: ${src}`));
        document.body.appendChild(script);
    });
}

// --- AI 生成內容相關函式 ---

/**
 * 1. 組合 AI 內容生成的提示詞 (Prompt)
 * @returns {string|null} - 組合好的提示詞字串，如果輸入無效則回傳 null
 */
export function buildContentPrompt() {
    const topic = elements.topicInput ? elements.topicInput.value : '';
    if (!topic.trim()) {
        ui.showToast(ui.t('toast_enter_topic'), 'error');
        return null;
    }

    const textType = elements.textTypeSelect.value === 'custom' ? elements.customTextTypeInput.value.trim() : elements.textTypeSelect.value;
    const tone = elements.toneSelect.value === 'custom' ? elements.customToneInput.value.trim() : elements.toneSelect.value;

    if ((elements.textTypeSelect.value === 'custom' && !textType) || (elements.toneSelect.value === 'custom' && !tone)) {
        ui.showToast(ui.t('toast_custom_empty'), 'error');
        return null;
    }
    
    const studentLevel = elements.studentLevelSelect.value;
    const studentGradeText = elements.studentLevelSelect.options[elements.studentLevelSelect.selectedIndex].text;
    const learningObjectives = elements.learningObjectivesInput ? elements.learningObjectivesInput.value : '';
    const wordCountMap = { '1-2': 200, '3-4': 400, '5-6': 600, '7-9': 800, '9-12': 1000 };
    const wordCount = wordCountMap[studentLevel];
    const interfaceLanguage = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    
    // 偵測主題是否為英文
    const isTargetEnglish = isEnglish(topic);

    // 使用 prompts.js 生成提示詞
    return getContentSystemInstruction({
        topic,
        textType,
        tone,
        studentGradeText,
        wordCount,
        learningObjectives,
        interfaceLanguage,
        isTargetEnglish
    });
}

/**
 * 2. 呼叫 Gemini API 請求生成內容
 * @param {string} promptString - 完整的提示詞
 */
export async function callGeminiForContent(promptString) {
    const apiKey = getApiKey();
    if (!apiKey) {
        return ui.showToast(ui.t('error_api_missing'), 'error');
    }

    // 智慧載入狀態：開始輪播訊息
    let messageIndex = 0;
    ui.showLoader(contentLoadingMessages[0]); // Need to make this dynamic too, but skip for now
    const loaderInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % contentLoadingMessages.length;
        ui.showLoader(contentLoadingMessages[messageIndex]);
    }, 2500); 
    
    try {
        const requestBody = {
            "contents": [{"parts": [{ "text": "請根據 systemInstruction 中的詳細指令生成內容。" }] }],
            "systemInstruction": {
                "parts": [{ "text": promptString }]
            }
        };

        const response = await fetchWithRetry(CONFIG.API_URL, { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            }, 
            body: JSON.stringify(requestBody) 
        });
        
        if (!response.ok) {
             const errorBody = await response.json().catch(() => ({ error: { message: '無法讀取錯誤內容' } }));
             throw new Error(`API 請求失敗: ${response.status} - ${errorBody.error.message}`);
        }
        
        const result = await response.json();
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (generatedText) {
            elements.textInput.value = generatedText;
            saveInputDraft(); // 生成後立即儲存
            ui.showToast(ui.t('toast_content_generated'), 'success');
            if (elements.downloadTxtBtn) elements.downloadTxtBtn.classList.remove('hidden');
            if (elements.shareContentBtn) elements.shareContentBtn.classList.remove('hidden');
            
            if (elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click();
            
            if (elements.competencyBasedCheckbox) elements.competencyBasedCheckbox.checked = true;
            if (elements.questionStyleSelect) elements.questionStyleSelect.value = 'competency-based';
            triggerOrUpdate();
        } else { 
            throw new Error(ui.t('error_generate_fail')); 
        }
    } catch (error) {
        console.error('生成內文時發生錯誤:', error);
        ui.showToast(error.message, 'error');
    } finally {
        clearInterval(loaderInterval); 
        ui.hideLoader();
    }
}

/**
 * 3. 主按鈕「生成學習內文」的處理函式 (快速生成)
 */
export function generateContentFromTopic() {
    // Validate Student Level
    if (!elements.studentLevelSelect.value) {
        ui.showToast(ui.t('toast_select_level'), 'error');
        if(elements.studentLevelSelectContent) {
             elements.studentLevelSelectContent.focus();
             elements.studentLevelSelectContent.classList.add('input-error');
             setTimeout(() => elements.studentLevelSelectContent.classList.remove('input-error'), 2000);
        } else if (elements.studentLevelSelect) {
             elements.studentLevelSelect.focus();
        }
        return;
    }

    const prompt = buildContentPrompt();
    if (prompt) {
        callGeminiForContent(prompt);
    }
}

/**
 * 4. 「預覽/修改提示詞」按鈕的處理函式
 */
export function handlePreviewPrompt() {
    // Validate Student Level for prompt preview as well
    if (!elements.studentLevelSelect.value) {
        ui.showToast(ui.t('toast_select_level'), 'error');
        if(elements.studentLevelSelectContent) {
             elements.studentLevelSelectContent.focus();
             elements.studentLevelSelectContent.classList.add('input-error');
             setTimeout(() => elements.studentLevelSelectContent.classList.remove('input-error'), 2000);
        }
        return;
    }

    const prompt = buildContentPrompt();
    if (prompt && elements.promptDisplayArea) {
        elements.promptDisplayArea.value = prompt.trim();
        ui.showPromptModal();
    }
}

/**
 * 5. 彈出視窗中「複製提示詞」按鈕的處理函式
 */
export function handleCopyPrompt() {
    if (!elements.promptDisplayArea) return;
    const textToCopy = elements.promptDisplayArea.value;
    if (!textToCopy.trim()) {
        ui.showToast(ui.t('toast_copy_fail'), 'error'); // Using copy fail as generic empty here or create new key
        return;
    }
    navigator.clipboard.writeText(textToCopy)
        .then(() => ui.showToast(ui.t('toast_copy_prompt_success'), 'success'))
        .catch(err => {
            console.error('複製失敗:', err);
            ui.showToast(ui.t('toast_copy_fail'), 'error');
        });
}

/**
 * 6. 彈出視窗中「以此提示詞生成內容」按鈕的處理函式
 */
export function handleGenerateWithEditedPrompt() {
    if (!elements.promptDisplayArea) return;
    const finalPrompt = elements.promptDisplayArea.value;
    if (!finalPrompt.trim()) {
        ui.showToast(ui.t('toast_custom_empty'), 'error'); // Reusing empty custom toast or create new
        return;
    }
    ui.hidePromptModal();
    callGeminiForContent(finalPrompt);
}

/**
 * 7. 處理下載 .txt 檔案
 */
export function handleDownloadTxt() {
    const textToSave = elements.textInput.value;
    if (!textToSave.trim()) {
        return ui.showToast(ui.t('toast_no_content_download'), 'error');
    }
    const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated-content.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 8. 處理分享內容的函式
 */
export async function handleShareContent() {
    const textToShare = elements.textInput.value;
    if (!textToShare.trim()) {
        return ui.showToast(ui.t('toast_no_content_share'), 'error');
    }

    ui.showLoader('正在產生分享連結...');
    try {
        const response = await fetch(CONFIG.ADD_CONTENT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textToShare }),
        });

        if (!response.ok) {
            throw new Error(`建立分享連結失敗: ${response.status}`);
        }

        const result = await response.json();
        const contentId = result.id;

        const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
        const shareUrl = `${baseUrl}${CONFIG.VIEW_PAGE_URL}?id=${contentId}`;
        
        const shareLinkInput = document.getElementById('share-link-input'); 
        if (shareLinkInput) {
            shareLinkInput.value = shareUrl;
        }

        const qrCodeContainer = document.getElementById('qr-code-container'); 
        if (qrCodeContainer) {
            qrCodeContainer.innerHTML = '';
            await loadScript('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js');
            new QRCode(qrCodeContainer, {
                text: shareUrl,
                width: 180,
                height: 180,
            });
        }
        
        ui.showShareModal();

    } catch (error) {
        console.error('分享失敗:', error);
        ui.showToast(ui.t('toast_export_fail'), 'error'); // Using generic export fail or share fail
    } finally {
        ui.hideLoader();
    }
}

/**
 * 9. 處理複製分享連結的函式
 */
export function handleCopyLink() {
    const shareLinkInput = document.getElementById('share-link-input'); 
    if (shareLinkInput && shareLinkInput.value) {
        navigator.clipboard.writeText(shareLinkInput.value)
            .then(() => ui.showToast(ui.t('toast_copy_link_success'), 'success'))
            .catch(() => ui.showToast(ui.t('toast_copy_fail'), 'error'));
    }
}

/**
 * 10. 處理從 URL 擷取內容的函式
 */
export async function handleExtractFromUrl() {
    const url = elements.urlInput ? elements.urlInput.value.trim() : '';
    const isYouTube = elements.urlTypeWebRadio ? !elements.urlTypeWebRadio.checked : false;
    
    if (!url) {
        return ui.showToast(ui.t('toast_no_url'), 'error');
    }
    
    try {
        new URL(url);
    } catch (_) {
        return ui.showToast(ui.t('toast_invalid_url'), 'error');
    }

    const endpoint = isYouTube ? CONFIG.GET_YOUTUBE_TRANSCRIPT_URL : CONFIG.EXTRACT_URL_FUNCTION_URL;
    const loaderText = isYouTube ? '正在擷取 YouTube 字幕...' : '正在擷取網頁內容...';
    
    ui.showLoader(loaderText);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: '無法解析錯誤訊息' }));
            throw new Error(errorData.error || `擷取失敗: ${response.status}`);
        }

        const result = await response.json();
        
        let fullText;
        if (isYouTube) {
            fullText = result.transcript;
        } else {
            fullText = `${ui.t('extracted_title_label')}${result.title}\n\n${ui.t('extracted_content_label')}\n${result.content}`;
        }
        
        elements.textInput.value = fullText;
        saveInputDraft(); // 擷取後立即儲存
        ui.showToast(ui.t('toast_content_extracted'), 'success');
        
        if (elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click();

        if (elements.downloadTxtBtn) elements.downloadTxtBtn.classList.remove('hidden');
        if (elements.shareContentBtn) elements.shareContentBtn.classList.remove('hidden');

    } catch (error) {
        console.error('擷取內容失敗:', error);
        ui.showToast(error.message, 'error');
    } finally {
        ui.hideLoader();
    }
}


// --- 其餘既有函式 ---

/**
 * 檢查是否有內容 (文字或圖片)，並據此切換「開始出題」按鈕的顯示狀態
 */
export function checkContentAndToggleButton() {
    const hasText = elements.textInput && elements.textInput.value.trim() !== '';
    const hasImages = state.getUploadedImages().length > 0;
    
    if (elements.regenerateBtn) {
        if (hasText || hasImages) {
            elements.regenerateBtn.classList.remove('hidden');
        } else {
            elements.regenerateBtn.classList.add('hidden');
        }
    }
    
    // 同步更新按鈕文字與狀態
    ui.updateRegenerateButtonState();
}

export function triggerOrUpdate() {
    // 每次內容變更時，僅檢查是否顯示按鈕，不再自動生成
    checkContentAndToggleButton();
}

// 移除自動生成邏輯，但為了相容性保留空函式或直接指向 checkContentAndToggleButton
export const debouncedGenerate = debounce(checkContentAndToggleButton, CONFIG.DEBOUNCE_DELAY);

export async function triggerQuestionGeneration() {
    // Validate Student Level
    if (!elements.studentLevelSelect.value) {
        ui.showToast(ui.t('toast_select_level'), 'error');
        if(elements.studentLevelSelectQuiz) {
             elements.studentLevelSelectQuiz.focus();
             elements.studentLevelSelectQuiz.classList.add('input-error');
             setTimeout(() => elements.studentLevelSelectQuiz.classList.remove('input-error'), 2000);
        } else if (elements.studentLevelSelect) {
             elements.studentLevelSelect.focus();
        }
        return;
    }

    // Validate Export Format
    if (!elements.formatSelect.value) {
        ui.showToast(ui.t('toast_select_format'), 'error');
        elements.formatSelect.focus();
        elements.formatSelect.classList.add('input-error');
        setTimeout(() => elements.formatSelect.classList.remove('input-error'), 2000);
        return;
    }

    const tabImage = elements.tabs.input.buttons[1];
    if (tabImage && tabImage.classList.contains('active') && state.getUploadedImages().length === 0) {
        return ui.showToast(ui.t('toast_upload_img_first'), 'error');
    }
    const text = elements.textInput ? elements.textInput.value : '';
    if (!text.trim() && state.getUploadedImages().length === 0) return;
    if (elements.previewPlaceholder && !elements.previewPlaceholder.classList.contains('hidden')) {
        elements.previewPlaceholder.classList.add('hidden');
    }
    let languageChoice = 'chinese';
    if (isEnglish(text)) {
        try {
            languageChoice = await ui.askForLanguageChoice();
        } catch (error) {
            console.log("語言選擇被取消");
            return; 
        }
    }
    proceedWithGeneration(languageChoice);
}

async function proceedWithGeneration(languageChoice) {
    const apiKey = getApiKey();
    if (!apiKey) {
        return ui.showToast(ui.t('error_api_missing'), 'error');
    }
    const text = elements.textInput ? elements.textInput.value : '';
    const totalQuestions = elements.numQuestionsInput ? parseInt(elements.numQuestionsInput.value, 10) : 0;
    const questionType = elements.questionTypeSelect ? elements.questionTypeSelect.value : 'multiple_choice';
    const difficulty = elements.difficultySelect ? elements.difficultySelect.value : '中等';
    const questionStyle = elements.questionStyleSelect ? elements.questionStyleSelect.value : 'knowledge-recall';
    const studentLevel = elements.studentLevelSelect ? elements.studentLevelSelect.value : '1-2';
    
    if ((!text.trim() && state.getUploadedImages().length === 0) || totalQuestions <= 0) {
        if (elements.questionsContainer) elements.questionsContainer.innerHTML = '';
        if (elements.previewActions) elements.previewActions.classList.add('hidden');
        if (elements.previewPlaceholder) elements.previewPlaceholder.classList.remove('hidden');
        return;
    }
    if (state.getCurrentRequestController()) {
        state.getCurrentRequestController().abort();
    }
    state.setCurrentRequestController(new AbortController());
    const signal = state.getCurrentRequestController().signal;
    
    // 智慧載入狀態：開始輪播訊息 (出題版)
    let messageIndex = 0;
    ui.showLoader(questionLoadingMessages[0]);
    const loaderInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % questionLoadingMessages.length;
        ui.showLoader(questionLoadingMessages[messageIndex]);
    }, 3000);

    if (elements.questionsContainer) elements.questionsContainer.innerHTML = '';
    if (elements.previewActions) elements.previewActions.classList.add('hidden');
    
    let allGeneratedQs = [];
    try {
        const BATCH_SIZE = CONFIG.API_BATCH_SIZE;
        const numBatches = Math.ceil(totalQuestions / BATCH_SIZE);
        for (let i = 0; i < numBatches; i++) {
            const questionsInBatch = Math.min(BATCH_SIZE, totalQuestions - allGeneratedQs.length);
            if (questionsInBatch <= 0) break;
            const batchResult = await generateSingleBatch(questionsInBatch, questionType, difficulty, text, state.getUploadedImages(), questionStyle, signal, languageChoice, studentLevel);
            allGeneratedQs = allGeneratedQs.concat(batchResult);
        }
        if (allGeneratedQs.length > 0) {
            state.setGeneratedQuestions(allGeneratedQs);
            ui.renderQuestionsForEditing(state.getGeneratedQuestions());
            ui.initializeSortable();
        } else {
            throw new Error(ui.t('error_question_fail'));
        }
    } catch(error) {
         if (error.name === 'AbortError') {
             console.log('請求被新的操作取消。');
             return; 
         }
         console.error('生成題目時發生錯誤:', error);
         let userFriendlyMessage = error.message;
         if (error.message.includes('503')) {
             userFriendlyMessage = ui.t('error_server_busy');
         } else if (error.message.includes('400')) {
             userFriendlyMessage = ui.t('error_bad_request');
         } else if (error.message.includes('Failed to fetch')) {
             userFriendlyMessage = ui.t('error_network');
         }
         ui.showToast(userFriendlyMessage, 'error');
         if (elements.questionsContainer) elements.questionsContainer.innerHTML = '';
         if (elements.previewPlaceholder) elements.previewPlaceholder.classList.remove('hidden');
    } finally {
        clearInterval(loaderInterval); // 停止輪播
        ui.hideLoader();
        ui.updateRegenerateButtonState();
    }
}

export function handleFile(file) {
    if (elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = ''; 
    if (elements.fileNameDisplay) elements.fileNameDisplay.textContent = ''; 
    if (elements.fileInput) elements.fileInput.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && file.type !== 'text/plain') { const errorMsg = ui.t('error_file_format'); ui.showToast(errorMsg, 'error'); if(elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = errorMsg; return; }
    if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) { const errorMsg = `${ui.t('error_file_size')} (${(CONFIG.MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB).`; ui.showToast(errorMsg, 'error'); if(elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = errorMsg; return; }
    if (elements.fileNameDisplay) elements.fileNameDisplay.textContent = `已選：${file.name}`;
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
        reader.onload = async (e) => {
            try {
                ui.showLoader('正在讀取 PDF 檔案...');
                await loadScript(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js`);
                const pdfjsLib = window.pdfjsLib;
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
                const pdf = await pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise;
                let text = '';
                for (let i = 1; i <= pdf.numPages; i++) { 
                    const page = await pdf.getPage(i); 
                    const content = await page.getTextContent(); 
                    text += content.items.map(item => item.str).join(' '); 
                }
                if (!text.trim()) {
                    throw new Error('此 PDF 為掃描檔或純圖片，無法提取文字內容。');
                }
                if(elements.textInput) elements.textInput.value = text; 
                saveInputDraft(); // 讀取後立即儲存
                ui.showToast(ui.t('toast_pdf_success'), 'success'); 
                if(elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click();
                triggerOrUpdate();
            } catch (error) { 
                console.error("PDF 讀取失敗:", error); 
                const errorMsg = error.message || "無法讀取此PDF檔案。"; 
                ui.showToast(errorMsg, "error"); 
                if(elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = errorMsg;
                if(elements.fileNameDisplay) elements.fileNameDisplay.textContent = ''; 
            } finally {
                ui.hideLoader();
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = (e) => { 
            if(elements.textInput) elements.textInput.value = e.target.result; 
            saveInputDraft(); // 讀取後立即儲存
            ui.showToast(ui.t('toast_txt_success'), 'success'); 
            if(elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click();
            triggerOrUpdate(); 
        };
        reader.readAsText(file);
    }
}

export function handleImageFiles(newFiles) {
    if (!newFiles || newFiles.length === 0) return;
    if(elements.imageErrorDisplay) elements.imageErrorDisplay.innerHTML = ''; 
    const { MAX_IMAGE_SIZE_BYTES, MAX_TOTAL_IMAGE_SIZE_BYTES } = CONFIG;
    let currentTotalSize = state.getUploadedImages().reduce((sum, img) => sum + img.size, 0);
    let errorMessages = [], sizeLimitReached = false;
    const validFiles = Array.from(newFiles).filter(file => {
        if (!file.type.startsWith('image/')) { errorMessages.push(`"${file.name}" 格式不符。`); return false; }
        if (file.size > MAX_IMAGE_SIZE_BYTES) { errorMessages.push(`"${file.name}" 過大。`); return false; }
        if (currentTotalSize + file.size > MAX_TOTAL_IMAGE_SIZE_BYTES) { if (!sizeLimitReached) { errorMessages.push(`圖片總量超過上限。`); sizeLimitReached = true; } return false; }
        currentTotalSize += file.size; return true;
    });
    if (errorMessages.length > 0) { if(elements.imageErrorDisplay) elements.imageErrorDisplay.innerHTML = errorMessages.join('<br>'); ui.showToast(ui.t('toast_img_fail_partial'), 'error'); }
    if (validFiles.length === 0) { if(elements.imageInput) elements.imageInput.value = ''; return; }
    
    const fragment = document.createDocumentFragment();
    let filesToProcess = validFiles.length;

    validFiles.forEach((file) => {
        compressImage(file).then(compressedFile => { 
             const reader = new FileReader();
             reader.onload = (e) => {
                const fullBase64 = e.target.result, base64Data = fullBase64.split(',')[1];
                const fileSize = compressedFile instanceof Blob ? compressedFile.size : file.size;
                
                const imageObject = { id: Date.now() + Math.random(), type: file.type, data: base64Data, size: fileSize };
                let currentImages = state.getUploadedImages();
                currentImages.push(imageObject);
                state.setUploadedImages(currentImages);
                const previewWrapper = document.createElement('div');
                previewWrapper.className = 'relative group';
                const imgElement = document.createElement('img');
                imgElement.src = fullBase64; imgElement.alt = `圖片預覽`; imgElement.className = 'w-full h-32 object-cover rounded-lg shadow-md';
                const removeBtn = document.createElement('div');
                removeBtn.className = 'absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer font-bold leading-none transition-all hover:bg-red-500/90 scale-0 group-hover:scale-100';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = () => { 
                    state.setUploadedImages(state.getUploadedImages().filter(img => img.id !== imageObject.id)); 
                    previewWrapper.remove();
                    triggerOrUpdate();
                };
                previewWrapper.appendChild(imgElement); previewWrapper.appendChild(removeBtn);
                fragment.appendChild(previewWrapper);
                if (--filesToProcess === 0) { 
                    if (elements.imagePreviewContainer) elements.imagePreviewContainer.appendChild(fragment); 
                    triggerOrUpdate();
                }
            };
            reader.readAsDataURL(compressedFile); 
        }).catch(err => {
            console.error("Image compression failed, falling back to original", err);
             const reader = new FileReader();
             reader.onload = (e) => {
                const fullBase64 = e.target.result, base64Data = fullBase64.split(',')[1];
                const imageObject = { id: Date.now() + Math.random(), type: file.type, data: base64Data, size: file.size };
                let currentImages = state.getUploadedImages();
                currentImages.push(imageObject);
                state.setUploadedImages(currentImages);
                const previewWrapper = document.createElement('div');
                previewWrapper.className = 'relative group';
                const imgElement = document.createElement('img');
                imgElement.src = fullBase64; imgElement.alt = `圖片預覽`; imgElement.className = 'w-full h-32 object-cover rounded-lg shadow-md';
                const removeBtn = document.createElement('div');
                removeBtn.className = 'absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer font-bold leading-none transition-all hover:bg-red-500/90 scale-0 group-hover:scale-100';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = () => { 
                    state.setUploadedImages(state.getUploadedImages().filter(img => img.id !== imageObject.id)); 
                    previewWrapper.remove();
                    triggerOrUpdate();
                };
                previewWrapper.appendChild(imgElement); previewWrapper.appendChild(removeBtn);
                fragment.appendChild(previewWrapper);
                if (--filesToProcess === 0) { 
                    if (elements.imagePreviewContainer) elements.imagePreviewContainer.appendChild(fragment); 
                    triggerOrUpdate();
                }
            };
            reader.readAsDataURL(file);
        });
    });
    if(elements.imageInput) elements.imageInput.value = '';
}

export async function exportFile() {
    const questions = state.getGeneratedQuestions();
    const format = elements.formatSelect ? elements.formatSelect.value : '';
    if (!format) return ui.showToast(ui.t('toast_select_format'), 'error');
    if (!questions || questions.length === 0) return ui.showToast(ui.t('toast_no_questions'), 'error');
    
    const titleInput = elements.quizTitleInput ? elements.quizTitleInput.value.trim() : '';
    const title = titleInput || '測驗卷';
    // 若使用者有輸入標題，檔名使用標題；否則使用預設英文前綴以免檔名太長或怪異，但這裡為了符合使用者期待，預設也可用中文
    const safeTitle = titleInput ? titleInput.replace(/[\\/:*?"<>|]/g, '_') : 'Quiz_Paper'; 

    let data, filename, success = false;
    try {
        ui.showLoader('正在準備匯出檔案...');
        
        if (format === 'pdf') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
            
            if (!window.html2canvas || !window.jspdf) {
                throw new Error('PDF 匯出函式庫載入失敗。');
            }

            // 1. 建立隱藏的 PDF 渲染容器
            let pdfContainer = document.getElementById('pdf-export-container');
            if (!pdfContainer) {
                pdfContainer = document.createElement('div');
                pdfContainer.id = 'pdf-export-container';
                // 設定樣式以模擬 A4 紙張 (寬度 210mm，解析度較高以確保清晰)
                pdfContainer.style.position = 'fixed';
                pdfContainer.style.left = '-9999px';
                pdfContainer.style.top = '0';
                pdfContainer.style.width = '210mm';
                pdfContainer.style.minHeight = '297mm';
                pdfContainer.style.padding = '20mm';
                pdfContainer.style.backgroundColor = 'white';
                pdfContainer.style.fontFamily = '"Noto Sans TC", sans-serif';
                pdfContainer.style.color = '#000';
                pdfContainer.style.boxSizing = 'border-box';
                document.body.appendChild(pdfContainer);
            }

            // 2. 產生 HTML 內容
            const date = new Date().toLocaleDateString('zh-TW');
            let htmlContent = `
                <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
                    <h1 style="font-size: 24px; margin: 0; font-weight: bold;">${title}</h1>
                    <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 14px;">
                        <span>日期：${date}</span>
                        <span>班級：__________  姓名：__________  座號：_____</span>
                        <span>得分：__________</span>
                    </div>
                </div>
                <div style="font-size: 14px; line-height: 1.6;">
            `;

            questions.forEach((q, index) => {
                const isTF = q.hasOwnProperty('is_correct');
                htmlContent += `
                    <div style="margin-bottom: 15px; page-break-inside: avoid;">
                        <div style="display: flex; align-items: baseline;">
                            <span style="font-weight: bold; margin-right: 5px;">${index + 1}.</span>
                            <div>${q.text}</div>
                        </div>
                `;

                if (!isTF && q.options) {
                    htmlContent += `<div style="margin-left: 25px; margin-top: 5px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">`;
                    q.options.forEach((opt, i) => {
                        const label = String.fromCharCode(65 + i); // A, B, C, D
                        htmlContent += `<div>(${label}) ${opt}</div>`;
                    });
                    htmlContent += `</div>`;
                } else if (isTF) {
                    htmlContent += `<div style="margin-left: 25px; margin-top: 5px;">(  ) 是   (  ) 否</div>`;
                }
                
                htmlContent += `</div>`;
            });

            htmlContent += `</div>`; // End main content div
            
            pdfContainer.innerHTML = htmlContent;

            // 3. 轉成 Canvas
            const canvas = await window.html2canvas(pdfContainer, {
                scale: 2, // 提高解析度
                useCORS: true
            });

            // 4. 轉成 PDF
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            
            // 分頁處理
            if (pdfHeight > pdf.internal.pageSize.getHeight()) {
                 let heightLeft = pdfHeight;
                 let position = 0;
                 const pageHeight = pdf.internal.pageSize.getHeight();

                 pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
                 heightLeft -= pageHeight;

                 while (heightLeft >= 0) {
                   position = heightLeft - pdfHeight;
                   pdf.addPage();
                   pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
                   heightLeft -= pageHeight;
                 }
            } else {
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }

            pdf.save(`${safeTitle}.pdf`);
            
            // 清理
            document.body.removeChild(pdfContainer);
            success = true;

        } else if (format === 'txt') {
            const date = new Date().toLocaleDateString('zh-TW');
            let txtContent = `${title}\n日期：${date}\n班級：__________  姓名：__________  座號：_____\n得分：__________\n\n`;
            
            questions.forEach((q, index) => {
                txtContent += `${index + 1}. ${q.text}\n`;
                if (q.hasOwnProperty('is_correct')) { // True/False
                    txtContent += `(  ) 是   (  ) 否\n`;
                } else if (q.options) { // MCQ
                    q.options.forEach((opt, i) => {
                        const label = String.fromCharCode(65 + i);
                        txtContent += `(${label}) ${opt}  `;
                    });
                    txtContent += `\n`;
                }
                txtContent += `\n`;
            });
            
            // Append Answer Key at the bottom
            txtContent += `\n\n--- 解答 ---\n`;
            questions.forEach((q, index) => {
                let answer = '';
                if (q.hasOwnProperty('is_correct')) {
                    answer = q.is_correct ? '是' : '否';
                } else if (q.correct && q.correct.length > 0) {
                    answer = q.correct.map(i => String.fromCharCode(65 + i)).join(', ');
                }
                txtContent += `${index + 1}. ${answer}\n`;
            });

            const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeTitle}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            success = true;

        } else {
            // 既有的 Excel 匯出邏輯
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
            const XLSX = window.XLSX;
            if (!XLSX) {
                throw new Error('XLSX library failed to load on window object.');
            }
            const standardMCQs = questions.map(q => q.hasOwnProperty('is_correct') ? { text: q.text, options: ['是', '否'], correct: [q.is_correct ? 0 : 1], time: 30, explanation: q.explanation || '' } : q);
            switch (format) {
                case 'wordwall':
                    data = standardMCQs.map(q => ({ '問題': q.text, '選項1': q.options[0] || '', '選項2': q.options[1] || '', '選項3': q.options[2] || '', '選項4': q.options[3] || '', '正確選項': q.correct.length > 0 ? (q.correct[0] + 1) : '' }));
                    filename = `${safeTitle}_Wordwall.xlsx`; 
                    break;
                case 'kahoot':
                    const kahootData = [ ['Kahoot Quiz Template'], [], [], [], ['Question', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Time limit (sec)', 'Correct answer(s)'] ];
                    standardMCQs.forEach(q => { kahootData.push([ q.text, q.options[0] || '', q.options[1] || '', q.options[2] || '', q.options[3] || '', q.time || 30, q.correct.map(i => i + 1).join(',') ]); });
                    const ws = XLSX.utils.aoa_to_sheet(kahootData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                    XLSX.writeFile(wb, `${safeTitle}_Kahoot.xlsx`);
                    success = true;
                    break;
                case 'blooket':
                    // Blooket CSV Format
                    // Header 1: "Blooket\nImport Template",,,,,,, (Note: The example shows a multi-line cell or just text)
                    // Let's replicate the structure exactly.
                    let csvContentBlooket = '"Blooket\nImport Template",,,,,,,';
                    csvContentBlooket += '\nQuestion #,Question Text,Answer 1,Answer 2,"Answer 3\n(Optional)","Answer 4\n(Optional)","Time Limit (sec)\n(Max: 300 seconds)","Correct Answer(s)\n(Only include Answer #)"';
                    
                    standardMCQs.forEach((q, index) => {
                        // Options: Ensure we have exactly 4 slots, empty if missing
                        const opts = [...(q.options || [])];
                        while(opts.length < 4) opts.push('');
                        
                        // Correct Answer: 1-based index
                        // If multiple correct answers (rare for this format usually), join with comma? The header says "Answer #" so "1" or "2" etc.
                        // Assuming single correct answer for now or taking the first one if multiple to be safe, though header implies "(s)".
                        // Let's support multiple:
                        const correctIndices = (q.correct || []).map(i => i + 1).join(','); 

                        // Escape quotes in text
                        const escapeCsv = (str) => {
                            if (typeof str !== 'string') return '';
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        };

                        const row = [
                            index + 1,
                            escapeCsv(q.text),
                            escapeCsv(opts[0]),
                            escapeCsv(opts[1]),
                            escapeCsv(opts[2]),
                            escapeCsv(opts[3]),
                            q.time || 20, // Default 20s as per example
                            `"${correctIndices}"` // Force quote for correct answer column to match example style if multiple
                        ];
                        csvContentBlooket += '\n' + row.join(',');
                    });

                    const blobBlooket = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContentBlooket], { type: 'text/csv;charset=utf-8;' });
                    const urlBlooket = URL.createObjectURL(blobBlooket);
                    const aBlooket = document.createElement('a');
                    aBlooket.href = urlBlooket;
                    aBlooket.download = `${safeTitle}_Blooket.csv`;
                    document.body.appendChild(aBlooket);
                    aBlooket.click();
                    document.body.removeChild(aBlooket);
                    success = true;
                    break;
                case 'gimkit':
                    // Gimkit CSV Format
                    // Header 1: Gimkit Spreadsheet Import Template,,,,
                    // Header 2: Question,Correct Answer,Incorrect Answer 1,Incorrect Answer 2 (Optional),Incorrect Answer 3 (Optional)
                    let csvContentGimkit = 'Gimkit Spreadsheet Import Template,,,,';
                    csvContentGimkit += '\nQuestion,Correct Answer,Incorrect Answer 1,Incorrect Answer 2 (Optional),Incorrect Answer 3 (Optional)';

                    standardMCQs.forEach(q => {
                        // Logic: Identify correct answer vs incorrect answers
                        // Gimkit expects 1 correct answer in column 2.
                        // If we have multiple correct answers, we might have to pick the first one or this format doesn't support it well.
                        // We will take the first correct answer.
                        const correctIndex = (q.correct && q.correct.length > 0) ? q.correct[0] : -1;
                        let correctAnswerText = '';
                        let incorrectAnswers = [];

                        if (correctIndex !== -1 && q.options && q.options[correctIndex]) {
                            correctAnswerText = q.options[correctIndex];
                            // Filter out the correct one to get incorrect ones
                            incorrectAnswers = q.options.filter((_, idx) => idx !== correctIndex);
                        } else {
                            // Fallback if no correct answer defined
                            incorrectAnswers = q.options || [];
                        }

                        // Ensure we have at least 3 incorrect slots for the CSV columns (though optional, good to fill if exist)
                        // The loop will just iterate what we have.
                        
                        const escapeCsv = (str) => {
                            if (typeof str !== 'string') return '';
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        };

                        const row = [
                            escapeCsv(q.text),
                            escapeCsv(correctAnswerText),
                            escapeCsv(incorrectAnswers[0] || ''),
                            escapeCsv(incorrectAnswers[1] || ''),
                            escapeCsv(incorrectAnswers[2] || '')
                        ];
                        csvContentGimkit += '\n' + row.join(',');
                    });

                    const blobGimkit = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContentGimkit], { type: 'text/csv;charset=utf-8;' });
                    const urlGimkit = URL.createObjectURL(blobGimkit);
                    const aGimkit = document.createElement('a');
                    aGimkit.href = urlGimkit;
                    aGimkit.download = `${safeTitle}_Gimkit.csv`;
                    document.body.appendChild(aGimkit);
                    aGimkit.click();
                    document.body.removeChild(aGimkit);
                    success = true;
                    break;
                case 'wayground':
                    data = standardMCQs.map(q => ({
                        'Question Text': q.text, 'Question Type': (q.correct || []).length > 1 ? 'Checkbox' : 'Multiple Choice', 'Option 1': q.options[0] || '', 'Option 2': q.options[1] || '', 'Option 3': q.options[2] || '', 'Option 4': q.options[3] || '', 'Option 5': '', 'Correct Answer': (q.correct || []).map(i => i + 1).join(','), 'Time in seconds': q.time || 30, 'Image Link': '', 'Answer explanation': q.explanation || ''
                    }));
                    filename = `${safeTitle}_Wayground.xlsx`;
                    break;
                case 'loilonote':
                    data = standardMCQs.map(q => ({
                        '問題（請勿編輯標題）': q.text, '務必作答（若此問題需要回答，請輸入1）': 1, '每題得分（未填入的部分將被自動設為1）': 1, '正確答案的選項（若有複數正確答案選項，請用「、」或「 , 」來分隔選項編號）': (q.correct || []).map(i => i + 1).join(','), '說明': q.explanation || '', '選項1': q.options[0] || '', '選項2': q.options[1] || '', '選項3': q.options[2] || '', '選項4': q.options[3] || '',
                    }));
                    filename = `${safeTitle}_LoiLoNote.xlsx`;
                    break;
                default: throw new Error('未知的格式');
            }
            if(data) {
                const worksheet = XLSX.utils.json_to_sheet(data); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
                XLSX.writeFile(workbook, filename);
                success = true;
            }
        }

        if (success) {
            ui.showPostDownloadModal();
        }
    } catch (error) { 
        console.error('匯出失敗:', error); 
        ui.showToast(ui.t('toast_export_fail'), 'error'); 
    } finally {
        ui.hideLoader();
    }
}

export function clearAllInputs() {
    if(elements.textInput) elements.textInput.value = ''; 
    if(elements.fileInput) elements.fileInput.value = ''; 
    if(elements.fileNameDisplay) elements.fileNameDisplay.textContent = ''; 
    if(elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = '';
    if(elements.imageInput) elements.imageInput.value = ''; 
    if(elements.imagePreviewContainer) elements.imagePreviewContainer.innerHTML = ''; 
    if(elements.imageErrorDisplay) elements.imageErrorDisplay.innerHTML = ''; 
    if(elements.urlInput) elements.urlInput.value = '';
    state.setUploadedImages([]);
    
    if(elements.downloadTxtBtn) elements.downloadTxtBtn.classList.add('hidden');
    if(elements.shareContentBtn) elements.shareContentBtn.classList.add('hidden');
    
    if(elements.topicInput) elements.topicInput.value = ''; 
    if(elements.textTypeSelect) elements.textTypeSelect.value = '科普說明文';
    if(elements.customTextTypeInput) {
        elements.customTextTypeInput.value = '';
        elements.customTextTypeInput.classList.add('hidden');
    }
    if(elements.learningObjectivesInput) elements.learningObjectivesInput.value = '';
    if(elements.toneSelect) elements.toneSelect.value = '客觀中立';
    if(elements.customToneInput) {
        elements.customToneInput.value = '';
        elements.customToneInput.classList.add('hidden');
    }
    if(elements.competencyBasedCheckbox) elements.competencyBasedCheckbox.checked = false;
    if(elements.quizTitleInput) elements.quizTitleInput.value = ''; // Clear Title
    
    // Reset all student level selects
    if(elements.studentLevelSelects) {
        elements.studentLevelSelects.forEach(s => { if(s) s.value = ''; }); 
    } else if(elements.studentLevelSelect) {
        elements.studentLevelSelect.value = '';
    }

    if(elements.questionStyleSelect) elements.questionStyleSelect.value = 'knowledge-recall';
    if(elements.formatSelect) elements.formatSelect.value = ''; // Reset format

    state.setGeneratedQuestions([]);
    if(elements.questionsContainer) elements.questionsContainer.innerHTML = '';
    if(elements.previewPlaceholder) elements.previewPlaceholder.classList.remove('hidden');
    
    localStorage.removeItem('questwiz_draft_inputs_v1'); // 清除草稿
    state.clearDraftState(); // 清除 state 草稿

    checkContentAndToggleButton(); // 更新按鈕顯示狀態
    ui.showToast(ui.t('toast_cleared'), 'success');
}