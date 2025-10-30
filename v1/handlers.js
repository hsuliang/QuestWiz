import { CONFIG, contentLoadingMessages, questionLoadingMessages } from './config.js';
import * as state from './state.js';
import { getApiKey, generateSingleBatch, fetchWithRetry } from './api.js';
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
const urlInput = document.getElementById('url-input');
const urlTypeWebRadio = document.getElementById('url-type-web');
const numQuestionsInput = document.getElementById('num-questions');
const formatSelect = document.getElementById('format-select');
const questionTypeSelect = document.getElementById('question-type-select');
const difficultySelect = document.getElementById('difficulty-select');
const downloadTxtBtn = document.getElementById('download-txt-btn');
const shareContentBtn = document.getElementById('share-content-btn');
const questionStyleSelect = document.getElementById('question-style-select');
const studentLevelSelect = document.getElementById('student-level-select');
const tabImage = document.getElementById('tab-image');
const tabText = document.getElementById('tab-text');
const topicInput = document.getElementById('topic-input');
const textTypeSelect = document.getElementById('text-type-select');
const customTextTypeInput = document.getElementById('custom-text-type-input');
const learningObjectivesInput = document.getElementById('learning-objectives-input');
const toneSelect = document.getElementById('tone-select');
const customToneInput = document.getElementById('custom-tone-input');
const competencyBasedCheckbox = document.getElementById('competency-based-checkbox');
const previewLoader = document.getElementById('preview-loader');
const loadingText = document.getElementById('loading-text');
const previewPlaceholder = document.getElementById('preview-placeholder');
const questionsContainer = document.getElementById('questions-container');
const previewActions = document.getElementById('preview-actions');
const promptDisplayArea = document.getElementById('prompt-display-area');

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
    const topic = topicInput.value;
    if (!topic.trim()) {
        ui.showToast('請輸入一個主題、單字或語詞！', 'error');
        return null;
    }

    const textType = textTypeSelect.value === 'custom' ? customTextTypeInput.value.trim() : textTypeSelect.value;
    const tone = toneSelect.value === 'custom' ? customToneInput.value.trim() : toneSelect.value;

    if ((textTypeSelect.value === 'custom' && !textType) || (toneSelect.value === 'custom' && !tone)) {
        ui.showToast('「自訂」選項的內容不能為空！', 'error');
        return null;
    }
    
    const studentLevel = studentLevelSelect.value;
    const studentGradeText = studentLevelSelect.options[studentLevelSelect.selectedIndex].text;
    const learningObjectives = learningObjectivesInput.value;
    const wordCountMap = { '1-2': 200, '3-4': 400, '5-6': 600, '7-9': 800, '9-12': 1000 };
    const wordCount = wordCountMap[studentLevel];
    
    const topicSection = learningObjectives.trim()
        ? `文章的核心主題是「${topic}」，並且必須清晰地圍繞以下核心學習目標或關鍵詞彙來撰寫：\n${learningObjectives}`
        : `文章的核心主題是「${topic}」。`;

    return `
P (Persona):
你是一位專為「${studentGradeText}」學生編寫教材的頂尖「${textType}」設計專家與作者。

A (Act):
你的任務是根據下方的要求，創作一篇長度約為 ${wordCount} 字的高品質教學文章。

R (Recipient):
這篇文章的目標讀者是「${studentGradeText}」的學生，請確保內容的深度與用詞符合他們的認知水平。

T (Topic):
${topicSection}

S (Structure):
請嚴格遵守以下格式與風格要求：
1. 文章體裁：必須是「${textType}」。
2. 寫作語氣：必須是「${tone}」。
3. 文章結構：請為文章加上一個吸引人的標題，並將內容分成數個段落以便閱讀。
4. 最終產出：直接提供完整的文章內容，不要包含任何額外的說明或開場白。
    `;
}

/**
 * 2. 呼叫 Gemini API 請求生成內容
 * @param {string} promptString - 完整的提示詞
 */
export async function callGeminiForContent(promptString) {
    const apiKey = getApiKey();
    if (!apiKey) {
        return ui.showToast('請先在「常用設定」中輸入您的 Gemini API Key！', 'error');
    }

    ui.showLoader('AI 作家生成中...');
    
    try {
        // 【最終修正】修改 requestBody，移除 v1beta 專屬的 systemInstruction，
        // 將完整的提示詞直接放入 contents 中，以與 v1 正式版 API 相容。
        const requestBody = {
            "contents": [{
                "parts": [{ "text": promptString }]
            }]
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
            textInput.value = generatedText;
            ui.showToast('學習內文已成功生成！', 'success');
            if (downloadTxtBtn) downloadTxtBtn.classList.remove('hidden');
            if (shareContentBtn) shareContentBtn.classList.remove('hidden');
            if (tabText) tabText.click();
            if (competencyBasedCheckbox) competencyBasedCheckbox.checked = true;
            if (questionStyleSelect) questionStyleSelect.value = 'competency-based';
            triggerOrUpdate();
        } else { 
            throw new Error('AI未能生成內容，請檢查您的 API Key 或稍後再試。'); 
        }
    } catch (error) {
        console.error('生成內文時發生錯誤:', error);
        ui.showToast(error.message, 'error');
    } finally {
        ui.hideLoader();
    }
}

/**
 * 3. 主按鈕「生成學習內文」的處理函式 (快速生成)
 */
export function generateContentFromTopic() {
    const prompt = buildContentPrompt();
    if (prompt) {
        callGeminiForContent(prompt);
    }
}

/**
 * 4. 「預覽/修改提示詞」按鈕的處理函式
 */
export function handlePreviewPrompt() {
    const prompt = buildContentPrompt();
    if (prompt && promptDisplayArea) {
        promptDisplayArea.value = prompt.trim();
        ui.showPromptModal();
    }
}

/**
 * 5. 彈出視窗中「複製提示詞」按鈕的處理函式
 */
export function handleCopyPrompt() {
    if (!promptDisplayArea) return;
    const textToCopy = promptDisplayArea.value;
    if (!textToCopy.trim()) {
        ui.showToast('沒有內容可以複製！', 'error');
        return;
    }
    navigator.clipboard.writeText(textToCopy)
        .then(() => ui.showToast('提示詞已成功複製！', 'success'))
        .catch(err => {
            console.error('複製失敗:', err);
            ui.showToast('無法複製內容。', 'error');
        });
}

/**
 * 6. 彈出視窗中「以此提示詞生成內容」按鈕的處理函式
 */
export function handleGenerateWithEditedPrompt() {
    if (!promptDisplayArea) return;
    const finalPrompt = promptDisplayArea.value;
    if (!finalPrompt.trim()) {
        ui.showToast('提示詞內容不能為空！', 'error');
        return;
    }
    ui.hidePromptModal();
    callGeminiForContent(finalPrompt);
}

/**
 * 7. 處理下載 .txt 檔案
 */
export function handleDownloadTxt() {
    const textToSave = textInput.value;
    if (!textToSave.trim()) {
        return ui.showToast('沒有內容可以下載！', 'error');
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
    const textToShare = textInput.value;
    if (!textToShare.trim()) {
        return ui.showToast('沒有內容可以分享！', 'error');
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
        ui.showToast('分享失敗，請檢查後端服務或網路連線。', 'error');
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
            .then(() => ui.showToast('連結已成功複製！', 'success'))
            .catch(() => ui.showToast('複製失敗。', 'error'));
    }
}

/**
 * 10. 處理從 URL 擷取內容的函式
 */
export async function handleExtractFromUrl() {
    const url = urlInput ? urlInput.value.trim() : '';
    const isYouTube = urlTypeWebRadio ? !urlTypeWebRadio.checked : false;
    
    if (!url) {
        return ui.showToast('請輸入網址！', 'error');
    }
    
    try {
        new URL(url);
    } catch (_) {
        return ui.showToast('網址格式不正確！', 'error');
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
            fullText = `標題：${result.title}\n\n內文：\n${result.content}`;
        }
        
        textInput.value = fullText;
        ui.showToast('內容擷取成功！', 'success');
        
        const tabText = document.getElementById('tab-text');
        if (tabText) tabText.click();

        if (downloadTxtBtn) downloadTxtBtn.classList.remove('hidden');
        if (shareContentBtn) shareContentBtn.classList.remove('hidden');

    } catch (error) {
        console.error('擷取內容失敗:', error);
        ui.showToast(error.message, 'error');
    } finally {
        ui.hideLoader();
    }
}


// --- 其餘既有函式 ---

export function triggerOrUpdate() {
    if (isAutoGenerateEnabled()) {
        debouncedGenerate();
    } else {
        ui.updateRegenerateButtonState();
    }
}
export const debouncedGenerate = debounce(triggerQuestionGeneration, CONFIG.DEBOUNCE_DELAY);

export async function triggerQuestionGeneration() {
    if (tabImage && tabImage.classList.contains('active') && state.getUploadedImages().length === 0) {
        return ui.showToast('請先上傳圖片！', 'error');
    }
    const text = textInput ? textInput.value : '';
    if (!text.trim() && state.getUploadedImages().length === 0) return;
    if (previewPlaceholder && !previewPlaceholder.classList.contains('hidden')) {
        previewPlaceholder.classList.add('hidden');
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
    ui.showLoader(questionLoadingMessages[Math.floor(Math.random() * questionLoadingMessages.length)]);
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
        ui.hideLoader();
        ui.updateRegenerateButtonState();
    }
}

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
                if(textInput) textInput.value = text; 
                ui.showToast('PDF 讀取成功！', 'success'); 
                if(tabText) tabText.click(); 
                triggerOrUpdate();
            } catch (error) { 
                console.error("PDF 讀取失敗:", error);
                const errorMsg = "無法讀取此PDF，函式庫可能載入失敗。"; 
                ui.showToast(errorMsg, "error"); 
                if(fileErrorDisplay) fileErrorDisplay.textContent = errorMsg; 
                if(fileNameDisplay) fileNameDisplay.textContent = ''; 
            } finally {
                ui.hideLoader();
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = (e) => { if(textInput) textInput.value = e.target.result; ui.showToast('文字檔讀取成功！', 'success'); if(tabText) tabText.click(); triggerOrUpdate(); };
        reader.readAsText(file);
    }
}

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

export async function exportFile() {
    const questions = state.getGeneratedQuestions();
    const format = formatSelect ? formatSelect.value : '';
    if (!format) return ui.showToast('請選擇匯出檔案格式！', 'error');
    if (!questions || questions.length === 0) return ui.showToast('沒有可匯出的題目！', 'error');
    let data, filename, success = false;
    try {
        ui.showLoader('正在準備匯出檔案...');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const XLSX = window.XLSX;
        if (!XLSX) {
            throw new Error('XLSX library failed to load on window object.');
        }
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
    } finally {
        ui.hideLoader();
    }
}

export function clearAllInputs() {
    if(textInput) textInput.value = ''; 
    if(fileInput) fileInput.value = ''; 
    if(fileNameDisplay) fileNameDisplay.textContent = ''; 
    if(fileErrorDisplay) fileErrorDisplay.textContent = '';
    if(imageInput) imageInput.value = ''; 
    if(imagePreviewContainer) imagePreviewContainer.innerHTML = ''; 
    if(imageErrorDisplay) imageErrorDisplay.innerHTML = ''; 
    if(urlInput) urlInput.value = '';
    state.setUploadedImages([]);
    
    if(downloadTxtBtn) downloadTxtBtn.classList.add('hidden');
    if(shareContentBtn) shareContentBtn.classList.add('hidden');
    
    if(topicInput) topicInput.value = ''; 
    if(textTypeSelect) textTypeSelect.value = '科普說明文';
    if(customTextTypeInput) {
        customTextTypeInput.value = '';
        customTextTypeInput.classList.add('hidden');
    }
    if(learningObjectivesInput) learningObjectivesInput.value = '';
    if(toneSelect) toneSelect.value = '客觀中立';
    if(customToneInput) {
        customToneInput.value = '';
        customToneInput.classList.add('hidden');
    }
    if(competencyBasedCheckbox) competencyBasedCheckbox.checked = false;
    
    if(questionStyleSelect) questionStyleSelect.value = 'knowledge-recall';
    state.setGeneratedQuestions([]);
    if(questionsContainer) questionsContainer.innerHTML = '';
    if(previewPlaceholder) previewPlaceholder.classList.remove('hidden');
    ui.updateRegenerateButtonState();
    ui.showToast('內容已全部清除！', 'success');
}