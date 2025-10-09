import { CONFIG, contentLoadingMessages, questionLoadingMessages } from './config.js';
import * as state from './state.js';
import { getApiKey, generateSingleBatch } from './api.js';
import * as ui from './ui.js';
import { isEnglish, debounce, isAutoGenerateEnabled } from './utils.js';

// --- DOM 元素 (Handlers-related) ---
const textInput = document.getElementById('text-input');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');
const fileErrorDisplay = document.getElementById('file-error-display');
const imageInput = document.getElementById('image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imageErrorDisplay = document.getElementById('image-error-display');
const numQuestionsInput = document.getElementById('num-questions');
const formatSelect = document.getElementById('format-select');
const questionTypeSelect = document.getElementById('question-type-select');
const difficultySelect = document.getElementById('difficulty-select');
const copyContentBtn = document.getElementById('copy-content-btn');
const questionStyleSelect = document.getElementById('question-style-select');
const studentLevelSelect = document.getElementById('student-level-select');
const tabImage = document.getElementById('tab-image');
const tabText = document.getElementById('tab-text');
const topicInput = document.getElementById('topic-input');
const competencyBasedCheckbox = document.getElementById('competency-based-checkbox');
const previewLoader = document.getElementById('preview-loader');
const loadingText = document.getElementById('loading-text');
const previewPlaceholder = document.getElementById('preview-placeholder');
const questionsContainer = document.getElementById('questions-container');
const previewActions = document.getElementById('preview-actions');


/**
 * 根據主題生成學習內文
 */
export async function generateContentFromTopic() {
    const apiKey = getApiKey();
    if (!apiKey) {
        return ui.showToast('請先在「常用設定」中輸入您的 Gemini API Key！', 'error');
    }

    if (!topicInput || !previewLoader) return;

    const topic = topicInput.value;
    if (!topic.trim()) return ui.showToast('請輸入一個主題、單字或語詞！', 'error');
    
    previewLoader.classList.remove('hidden');
    if (loadingText) loadingText.textContent = contentLoadingMessages[Math.floor(Math.random() * contentLoadingMessages.length)];
    
    try {
        const studentLevel = studentLevelSelect.value;
        const isCompetencyBased = competencyBasedCheckbox.checked;
        const apiUrl = `${CONFIG.API_URL}${apiKey}`;
        const wordCountMap = { '1-2': 200, '3-4': 400, '5-6': 600, '7-9': 800, '9-12': 1000 };
        const wordCount = wordCountMap[studentLevel];
        const studentGradeText = studentLevelSelect.options[studentLevelSelect.selectedIndex].text;
        
        const requestBody = {
            "contents": [{
                "parts": [{ "text": `主題：${topic}` }]
            }],
            "systemInstruction": {
                "parts": [{
                    "text": isCompetencyBased 
                        ? `你是一位頂尖的 K-12 教材設計師與說故事專家，專長是將生硬的知識點轉化為引人入勝的生活情境或故事，以培養學生的素養能力。請根據使用者提供的核心主題：「${topic}」，為「${studentGradeText}」程度的學生，創作一篇長度約為 ${wordCount} 字的素養導向短文。\n- 這篇短文應該包含一個清晰的「情境」或「待解決的問題」。\n- 請將核心主題的相關知識，自然地融入故事情節或問題描述中，而不是條列式地說明。\n- 文章風格需生動有趣，能引發學生的閱讀興趣與思考。\n- 最終產出的內容必須是一篇完整的文章，可以直接用於出題。`
                        : (topic.includes(',') || /^[a-zA-Z\s,]+$/.test(topic) && topic.split(/\s+|,/).filter(Boolean).length <= 10
                            ? `你是一位為K12學生編寫教材的創意寫作專家。請使用使用者提供的單字或語詞，為「${studentGradeText}」的學生，撰寫一篇有趣且連貫、長度約為 ${wordCount} 字的故事或閱讀短文。請確保這些詞彙自然地融入文章中。`
                            : `你是一位知識淵博的教材編寫專家。請根據使用者提供的主題，為「${studentGradeText}」的學生，生成一段約 ${wordCount} 字的簡潔科普短文。`)
                }]
            }
        };

        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        
        if (!response.ok) {
             const errorBody = await response.json().catch(() => ({ error: { message: '無法讀取錯誤內容' } }));
             throw new Error(`API 請求失敗: ${response.status} - ${errorBody.error.message}`);
        }
        
        const result = await response.json();
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (generatedText) {
            textInput.value = generatedText;
            ui.showToast('學習內文已成功生成！', 'success');
            if (copyContentBtn) copyContentBtn.classList.remove('hidden');
            if (tabText) tabText.click();
            if (isCompetencyBased && questionStyleSelect) { questionStyleSelect.value = 'competency-based'; }
            triggerOrUpdate();
        } else { 
            throw new Error('AI未能生成內容，請檢查您的 API Key 或稍後再試。'); 
        }
    } catch (error) {
        console.error('生成內文時發生錯誤:', error);
        ui.showToast(error.message, 'error');
    } finally {
        if (previewLoader) previewLoader.classList.add('hidden'); 
    }
}

/**
 * 根據「自動出題」模式決定是觸發生成還是只更新按鈕
 */
export function triggerOrUpdate() {
    if (isAutoGenerateEnabled()) {
        debouncedGenerate();
    } else {
        ui.updateRegenerateButtonState();
    }
}
export const debouncedGenerate = debounce(triggerQuestionGeneration, CONFIG.DEBOUNCE_DELAY);


/**
 * 觸發題目生成流程的入口函式
 */
export async function triggerQuestionGeneration() {
    if (tabImage && tabImage.classList.contains('active') && state.getUploadedImages().length === 0) {
        return ui.showToast('請先上傳圖片！', 'error');
    }

    const text = textInput ? textInput.value : '';
    if (!text.trim() && state.getUploadedImages().length === 0) return;

    if (previewPlaceholder && !previewPlaceholder.classList.contains('hidden')) {
        previewPlaceholder.classList.add('hidden');
    }

    let languageChoice = 'chinese'; // 預設為中文
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


/**
 * 處理題目生成的流程，包含分批呼叫 API
 */
async function proceedWithGeneration(languageChoice) {
    const apiKey = getApiKey();
    if (!apiKey) {
        return ui.showToast('請先在「常用設定」中輸入您的 Gemini API Key！', 'error');
    }

    const text = textInput ? textInput.value : '';
    const totalQuestions = numQuestionsInput ? parseInt(numQuestionsInput.value, 10) : 0;
    const questionType = questionTypeSelect ? questionTypeSelect.value : 'multiple_choice';
    const difficulty = difficultySelect ? difficultySelect.value : '中等';
    const questionStyle = questionStyleSelect ? questionStyleSelect.value : 'knowledge-recall';
    const studentLevel = studentLevelSelect ? studentLevelSelect.value : '1-2';

    if ((!text.trim() && state.getUploadedImages().length === 0) || totalQuestions <= 0) {
        if (questionsContainer) questionsContainer.innerHTML = '';
        if (previewActions) previewActions.classList.add('hidden');
        if (previewPlaceholder) previewPlaceholder.classList.remove('hidden');
        return;
    }

    if (state.getCurrentRequestController()) {
        state.getCurrentRequestController().abort();
    }
    state.setCurrentRequestController(new AbortController());
    const signal = state.getCurrentRequestController().signal;

    if (previewLoader) previewLoader.classList.remove('hidden');
    if (loadingText) loadingText.textContent = questionLoadingMessages[Math.floor(Math.random() * questionLoadingMessages.length)];
    if (questionsContainer) questionsContainer.innerHTML = '';
    if (previewActions) previewActions.classList.add('hidden');

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
            throw new Error("AI 未能生成任何題目，請檢查您的輸入內容或稍後再試。");
        }
    } catch(error) {
         if (error.name === 'AbortError') {
             console.log('請求被新的操作取消。');
             return; 
         }
         console.error('生成題目時發生錯誤:', error);

         // --- 優化的錯誤提示邏輯 ---
         let userFriendlyMessage = error.message;
         if (error.message.includes('503')) {
             userFriendlyMessage = "伺服器目前忙碌中(503)，已自動重試但仍失敗，請稍後再試或減少單次題目數量。";
         } else if (error.message.includes('400')) {
             userFriendlyMessage = "請求內容可能有問題(400)，請檢查您的輸入文字或 API Key。";
         } else if (error.message.includes('Failed to fetch')) {
             userFriendlyMessage = "網路連線失敗，請檢查您的網路設定。";
         }
         ui.showToast(userFriendlyMessage, 'error');
         
         if (questionsContainer) questionsContainer.innerHTML = '';
         if (previewPlaceholder) previewPlaceholder.classList.remove('hidden');
    } finally {
        if (previewLoader) previewLoader.classList.add('hidden');
        ui.updateRegenerateButtonState();
    }
}


/**
 * 處理檔案輸入 (txt/pdf)
 */
export function handleFile(file) {
    if (fileErrorDisplay) fileErrorDisplay.textContent = ''; 
    if (fileNameDisplay) fileNameDisplay.textContent = ''; 
    if (fileInput) fileInput.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && file.type !== 'text/plain') { const errorMsg = '檔案格式不支援。'; ui.showToast(errorMsg, 'error'); if(fileErrorDisplay) fileErrorDisplay.textContent = errorMsg; return; }
    if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) { const errorMsg = `檔案過大 (${(CONFIG.MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB上限)。`; ui.showToast(errorMsg, 'error'); if(fileErrorDisplay) fileErrorDisplay.textContent = errorMsg; return; }
    if (fileNameDisplay) fileNameDisplay.textContent = `已選：${file.name}`;
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
        reader.onload = async (e) => {
            try {
                const pdf = await pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise;
                let text = '';
                for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const content = await page.getTextContent(); text += content.items.map(item => item.str).join(' '); }
                if(textInput) textInput.value = text; 
                ui.showToast('PDF 讀取成功！', 'success'); 
                if(tabText) tabText.click(); 
                triggerOrUpdate();
            } catch (error) { const errorMsg = "無法讀取此PDF。"; ui.showToast(errorMsg, "error"); if(fileErrorDisplay) fileErrorDisplay.textContent = errorMsg; if(fileNameDisplay) fileNameDisplay.textContent = ''; }
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = (e) => { if(textInput) textInput.value = e.target.result; ui.showToast('文字檔讀取成功！', 'success'); if(tabText) tabText.click(); triggerOrUpdate(); };
        reader.readAsText(file);
    }
}

/**
 * 處理圖片檔案上傳
 */
export function handleImageFiles(newFiles) {
    if (!newFiles || newFiles.length === 0) return;
    if(imageErrorDisplay) imageErrorDisplay.innerHTML = ''; 
    const { MAX_IMAGE_SIZE_BYTES, MAX_TOTAL_IMAGE_SIZE_BYTES } = CONFIG;
    let currentTotalSize = state.getUploadedImages().reduce((sum, img) => sum + img.size, 0);
    let errorMessages = [], sizeLimitReached = false;
    const validFiles = Array.from(newFiles).filter(file => {
        if (!file.type.startsWith('image/')) { errorMessages.push(`"${file.name}" 格式不符。`); return false; }
        if (file.size > MAX_IMAGE_SIZE_BYTES) { errorMessages.push(`"${file.name}" 過大。`); return false; }
        if (currentTotalSize + file.size > MAX_TOTAL_IMAGE_SIZE_BYTES) { if (!sizeLimitReached) { errorMessages.push(`圖片總量超過上限。`); sizeLimitReached = true; } return false; }
        currentTotalSize += file.size; return true;
    });
    if (errorMessages.length > 0) { if(imageErrorDisplay) imageErrorDisplay.innerHTML = errorMessages.join('<br>'); ui.showToast('部分圖片上傳失敗。', 'error'); }
    if (validFiles.length === 0) { if(imageInput) imageInput.value = ''; return; }

    const fragment = document.createDocumentFragment();
    let filesToProcess = validFiles.length;
    validFiles.forEach((file) => {
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
                if (imagePreviewContainer) imagePreviewContainer.appendChild(fragment); 
                triggerOrUpdate();
            }
        };
        reader.readAsDataURL(file);
    });
    if(imageInput) imageInput.value = '';
}

/**
 * 匯出題庫檔案
 */
export function exportFile() {
    const questions = state.getGeneratedQuestions();
    const format = formatSelect ? formatSelect.value : '';
    if (!format) return ui.showToast('請選擇匯出檔案格式！', 'error');
    if (!questions || questions.length === 0) return ui.showToast('沒有可匯出的題目！', 'error');
    
    let data, filename, success = false;
    try {
        const standardMCQs = questions.map(q => q.hasOwnProperty('is_correct') ? { text: q.text, options: ['是', '否'], correct: [q.is_correct ? 0 : 1], time: 30, explanation: q.explanation || '' } : q);
        switch (format) {
            case 'wordwall':
                data = standardMCQs.map(q => ({ '問題': q.text, '選項1': q.options[0] || '', '選項2': q.options[1] || '', '選項3': q.options[2] || '', '選項4': q.options[3] || '', '正確選項': q.correct.length > 0 ? (q.correct[0] + 1) : '' }));
                filename = 'Wordwall_Quiz.xlsx'; 
                break;
            case 'kahoot':
                const kahootData = [ ['Kahoot Quiz Template'], [], [], [], ['Question', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Time limit (sec)', 'Correct answer(s)'] ];
                standardMCQs.forEach(q => { kahootData.push([ q.text, q.options[0] || '', q.options[1] || '', q.options[2] || '', q.options[3] || '', q.time || 30, q.correct.map(i => i + 1).join(',') ]); });
                const ws = XLSX.utils.aoa_to_sheet(kahootData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                XLSX.writeFile(wb, 'Kahoot_Quiz.xlsx');
                success = true;
                break;
            case 'wayground':
                data = standardMCQs.map(q => ({
                    'Question Text': q.text, 'Question Type': (q.correct || []).length > 1 ? 'Checkbox' : 'Multiple Choice', 'Option 1': q.options[0] || '', 'Option 2': q.options[1] || '', 'Option 3': q.options[2] || '', 'Option 4': q.options[3] || '', 'Option 5': '', 'Correct Answer': (q.correct || []).map(i => i + 1).join(','), 'Time in seconds': q.time || 30, 'Image Link': '', 'Answer explanation': q.explanation || ''
                }));
                filename = 'Wayground_Quiz.xlsx';
                break;
            case 'loilonote':
                data = standardMCQs.map(q => ({
                    '問題（請勿編輯標題）': q.text, '務必作答（若此問題需要回答，請輸入1）': 1, '每題得分（未填入的部分將被自動設為1）': 1, '正確答案的選項（若有複數正確答案選項，請用「、」或「 , 」來分隔選項編號）': (q.correct || []).map(i => i + 1).join(','), '說明': q.explanation || '', '選項1': q.options[0] || '', '選項2': q.options[1] || '', '選項3': q.options[2] || '', '選項4': q.options[3] || '',
                }));
                filename = 'LoiLoNote_Quiz.xlsx';
                break;
            default: throw new Error('未知的格式');
        }

        if(data) {
            const worksheet = XLSX.utils.json_to_sheet(data); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
            XLSX.writeFile(workbook, filename);
            success = true;
        }
        
        if (success) {
            ui.showPostDownloadModal();
        }

    } catch (error) { 
        console.error('匯出失敗:', error); 
        ui.showToast('匯出失敗，請檢查主控台錯誤。', 'error'); 
    }
}

export async function copyContentToClipboard() {
    const textToCopy = textInput ? textInput.value : '';
    if (!textToCopy.trim()) { ui.showToast('沒有內容可以複製！', 'error'); return; }
    try { await navigator.clipboard.writeText(textToCopy); ui.showToast('文章內容已成功複製！', 'success'); } catch (err) { console.error('複製失敗:', err); ui.showToast('無法複製內容。', 'error'); }
}

export function clearAllInputs() {
    if(textInput) textInput.value = ''; 
    if(fileInput) fileInput.value = ''; 
    if(fileNameDisplay) fileNameDisplay.textContent = ''; 
    if(fileErrorDisplay) fileErrorDisplay.textContent = '';
    if(imageInput) imageInput.value = ''; 
    if(imagePreviewContainer) imagePreviewContainer.innerHTML = ''; 
    if(imageErrorDisplay) imageErrorDisplay.innerHTML = ''; 
    state.setUploadedImages([]);
    if(copyContentBtn) copyContentBtn.classList.add('hidden'); 
    if(topicInput) topicInput.value = ''; 
    if(questionStyleSelect) questionStyleSelect.value = 'knowledge-recall';
    state.setGeneratedQuestions([]);
    if(questionsContainer) questionsContainer.innerHTML = '';
    if(previewPlaceholder) previewPlaceholder.classList.remove('hidden');
    ui.updateRegenerateButtonState();
    ui.showToast('內容已全部清除！', 'success');
}
