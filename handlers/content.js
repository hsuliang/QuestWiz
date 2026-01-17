import { QUESTION_STYLE } from '../constants.js';
import { CONFIG, contentLoadingMessages } from '../config.js';
import * as ui from '../ui.js';
import { getApiKey, fetchWithRetry, makeCentralizedRequest } from '../api.js';
import { elements } from '../dom.js';
import { getContentSystemInstruction } from '../prompts/index.js';
import { getAdaptiveRules } from '../prompts/adaptive_matrix.js'; // [v11.0]
import { isEnglish } from '../utils.js';
import { handleError } from '../utils/errorHandler.js';
import { saveInputDraft, triggerOrUpdate } from './session.js';

// Helper for dynamic script loading
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

export function buildContentPrompt() {
    const topic = elements.topicInput ? elements.topicInput.value : '';
    if (!topic.trim()) {
        ui.showToast(ui.t('toast_enter_topic'), 'error');
        return null;
    }

    // [修正] 正確抓取自訂值
    const textType = elements.textTypeSelect.value === 'custom' ? elements.customTextTypeInput.value.trim() : elements.textTypeSelect.value;
    const tone = elements.toneSelect.value === 'custom' ? elements.customToneInput.value.trim() : elements.toneSelect.value;

    if ((elements.textTypeSelect.value === 'custom' && !textType) || (elements.toneSelect.value === 'custom' && !tone)) {
        ui.showToast(ui.t('toast_custom_empty'), 'error');
        return null;
    }
    
    const studentLevel = elements.studentLevelSelectContent ? elements.studentLevelSelectContent.value : (elements.studentLevelSelect ? elements.studentLevelSelect.value : '1-2');
    const studentGradeText = elements.studentLevelSelect && elements.studentLevelSelect.selectedIndex >= 0 ? elements.studentLevelSelect.options[elements.studentLevelSelect.selectedIndex].text : studentLevel;
    
    // [v11.0] 取得適性化規則
    const adaptiveRules = getAdaptiveRules(studentLevel);

    const learningObjectives = elements.learningObjectivesInput ? elements.learningObjectivesInput.value : '';
    const wordCountMap = { '1-2': 200, '3-4': 400, '5-6': 600, '7-9': 800, '9-12': 1000 };
    let wordCount = wordCountMap[studentLevel] || 500;
    
    // [Phase 2] 適性化字數覆寫 (Adaptive Override)
    if (elements.adaptiveWordCount && elements.adaptiveWordCount.value) {
        wordCount = parseInt(elements.adaptiveWordCount.value, 10);
    }

    const interfaceLanguage = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    const isTargetEnglish = isEnglish(topic);
    const outputLangMode = elements.outputLangSelect ? elements.outputLangSelect.value : 'auto';

    let languageInstruction = "";
    if (outputLangMode === 'full-english') {
        languageInstruction = "請務必產出「全英文」的文章，適合學生進行沉浸式英語閱讀。";
    } else if (outputLangMode === 'bilingual') {
        languageInstruction = "請產出「中英對照」的教學內容。使用繁體中文解釋概念，並將提供的英文關鍵字自然地融入文章中，並附上英文例句。";
    } else if (outputLangMode === 'full-chinese') {
        languageInstruction = "請務必產出「全中文」的文章。即使主題是英文，也請用繁體中文解釋其背後的概念。";
    } else {
        languageInstruction = isTargetEnglish 
            ? "偵測到主題為英文，請優先以英語撰寫核心內容，但可酌情加入中文說明。" 
            : `請使用介面語言 (${interfaceLanguage}) 進行輸出。`;
    }

    return getContentSystemInstruction({
        topic,
        textType,
        tone,
        studentGradeText,
        wordCount,
        learningObjectives,
        interfaceLanguage,
        isTargetEnglish,
        languageInstruction,
        adaptiveRules // [v11.0] 注入規則
    });
}

export async function callGeminiForContent(promptString) {
    const btn = elements.generateContentBtn;
    const originalContent = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>正在生成...</span>`;
    }

    let messageIndex = 0;
    ui.showLoader(contentLoadingMessages[0]); 
    const loaderInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % contentLoadingMessages.length;
        ui.showLoader(contentLoadingMessages[messageIndex]);
    }, 2500); 
    
    try {
        // [New] 讀取模型設定
        const savedModel = localStorage.getItem('quizGenModel_v1') || 'standard';
        const isHighQuality = savedModel === 'high-quality';
        const modelName = isHighQuality ? CONFIG.MODELS.HIGH_QUALITY : CONFIG.MODELS.STANDARD;

        console.log('[Content] Model Selection:', { savedModel, isHighQuality, modelName });

        const genConfig = { "temperature": isHighQuality ? 0.4 : 0.7, "maxOutputTokens": 8192, "responseMimeType": "application/json" };
        if (isHighQuality) { // [New] 如果是高品質模式，嘗試啟用 thinking
             // 注意：內文生成可能不需要嚴格的 thinking，但如果用 v3 模型，參數要對應
             // 若 v3 支援 thinking，則加入
             genConfig.thinking = true;
             genConfig.include_thoughts = false;
        }

        const payload = {
            "contents": [{"parts": [{ "text": "請根據 systemInstruction 中的詳細指令生成內容。" }] }],
            "systemInstruction": {
                "parts": [{ "text": promptString }]
            },
            "generationConfig": genConfig // [New] 傳入動態組態
        };

        // [Refactor] 使用中央化請求 (支援多金鑰與統一錯誤處理)並指定模型
        const result = await makeCentralizedRequest(payload, null, modelName);
        let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (rawText) {
            let generatedText = rawText.trim();
            
            // [New Fix] 預防性檢查：如果 AI 回傳了 JSON 格式
            if (generatedText.startsWith('{') && generatedText.endsWith('}')) {
                try {
                    const parsed = JSON.parse(generatedText);
                    
                    // 智慧提取主文 (處理 v11.0 新結構：learning_content 與 keywords)
                    let contentRaw = parsed.learning_content || parsed.content || parsed.article || parsed.text || parsed.body;
                    
                    if (contentRaw) {
                        if (Array.isArray(contentRaw)) {
                            // 處理陣列：可能是 ["段落1"] 或 [{content: "..."}] 或 [{text: "..."}]
                            generatedText = contentRaw.map(item => {
                                if (typeof item === 'string') return item;
                                return item.content || item.text || JSON.stringify(item);
                            }).join('\n\n');
                        } else if (typeof contentRaw === 'object') {
                            generatedText = contentRaw.text || contentRaw.content || contentRaw.body || JSON.stringify(contentRaw, null, 2);
                        } else {
                            generatedText = String(contentRaw);
                        }
                    } else {
                        const displayObj = { ...parsed };
                        delete displayObj.title;
                        delete displayObj.quizTitle;
                        delete displayObj.keywords; // 移除 keywords 以免干擾正文顯示
                        generatedText = JSON.stringify(displayObj, null, 2);
                    }

                    // [v11.0 New] 自動同步關鍵字至系統
                    if (parsed.keywords && Array.isArray(parsed.keywords)) {
                        import('../state.js').then(state => {
                            state.setSelectedKeywords(parsed.keywords);
                            ui.showToast('AI 已自動建議考點關鍵字', 'info');
                        });
                    }

                    // 如果有標題，也順便更新
                    if (parsed.title && elements.quizTitleInput) {
                        elements.quizTitleInput.value = parsed.title;
                    }
                } catch (e) { 
                    console.warn('[Content] JSON parse failed, using raw text:', e);
                }
            }
            
            if (generatedText.includes('TITLE:')) {
                const parts = generatedText.split('TITLE:');
                const titlePart = parts[1].split('\n')[0].trim();
                if (elements.quizTitleInput) {
                    elements.quizTitleInput.value = titlePart;
                }
                generatedText = generatedText.replace(/TITLE:.*?\n/, '').trim();
            }

            if(elements.textInput) {
                elements.textInput.value = generatedText;
                elements.textInput.dispatchEvent(new Event('input'));
            }
            saveInputDraft(); 
            ui.showToast(ui.t('toast_content_generated'), 'success');
            if (elements.downloadTxtBtn) elements.downloadTxtBtn.classList.remove('hidden');
            if (elements.shareContentBtn) elements.shareContentBtn.classList.remove('hidden');
            if (elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click();
            if (elements.competencyBasedCheckbox) elements.competencyBasedCheckbox.checked = true;
            if (elements.questionStyleSelect) elements.questionStyleSelect.value = QUESTION_STYLE.COMPETENCY_BASED;
            triggerOrUpdate();
        } else { 
            throw new Error(ui.t('error_generate_fail')); 
        }
    } catch (error) {
        console.error('生成內文時發生錯誤:', error);
        handleError(error, 'GenerateContent');
    } finally {
        clearInterval(loaderInterval); 
        ui.hideLoader();
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

export function generateContentFromTopic() {
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

    ui.switchWorkTab('edit');

    const prompt = buildContentPrompt();
    if (prompt) {
        callGeminiForContent(prompt);
    }
}

export function handlePreviewPrompt() {
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

export function handleCopyPrompt() {
    if (!elements.promptDisplayArea) return;
    const textToCopy = elements.promptDisplayArea.value;
    if (!textToCopy.trim()) {
        ui.showToast(ui.t('toast_copy_fail'), 'error'); 
        return;
    }
    navigator.clipboard.writeText(textToCopy)
        .then(() => ui.showToast(ui.t('toast_copy_prompt_success'), 'success'))
        .catch(err => {
            console.error('複製失敗:', err);
            ui.showToast(ui.t('toast_copy_fail'), 'error');
        });
}

export function handleGenerateWithEditedPrompt() {
    if (!elements.promptDisplayArea) return;
    const finalPrompt = elements.promptDisplayArea.value;
    if (!finalPrompt.trim()) {
        ui.showToast(ui.t('toast_custom_empty'), 'error'); 
        return;
    }
    ui.hidePromptModal();
    callGeminiForContent(finalPrompt);
}

export function handleDownloadTxt() {
    const textToSave = elements.textInput.value;
    if (!textToSave.trim()) {
        return ui.showToast(ui.t('toast_no_content_download'), 'error');
    }

    // [修正] 動態產生檔名：優先使用試卷標題，次之主題
    const title = elements.quizTitleInput ? elements.quizTitleInput.value.trim() : '';
    const topic = elements.topicInput ? elements.topicInput.value.trim() : '';
    const baseName = title || topic || '學習內文';
    // [Fix] 放寬檔名長度限制至 100 字元
    const safeName = baseName.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100);

    const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

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
        ui.showToast(ui.t('toast_export_fail'), 'error'); 
    } finally {
        ui.hideLoader();
    }
}

export function handleCopyLink() {
    const shareLinkInput = document.getElementById('share-link-input'); 
    if (shareLinkInput && shareLinkInput.value) {
        navigator.clipboard.writeText(shareLinkInput.value)
            .then(() => ui.showToast(ui.t('toast_copy_link_success'), 'success'))
            .catch(() => ui.showToast(ui.t('toast_copy_fail'), 'error'));
    }
}

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

    ui.switchWorkTab('edit');

    const endpoint = isYouTube ? CONFIG.GET_YOUTUBE_TRANSCRIPT_URL : CONFIG.EXTRACT_URL_FUNCTION_URL;
    let loaderText = isYouTube ? '正在擷取 YouTube 字幕...' : '正在擷取網頁內容...';
    
    const btn = elements.extractFromUrlBtn;
    const originalContent = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>正在擷取...</span>`;
    }

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
        
        // [Fix] 自動將網頁標題填入試卷標題欄位，方便下載時作為檔名
        if (result.title && elements.quizTitleInput) {
            elements.quizTitleInput.value = result.title.trim();
        }
        
        let fullText;
        if (isYouTube) {
            fullText = result.transcript;
        } else {
            // 針對網頁內容，使用 Gemini 進行二次清洗
            ui.showLoader("AI 正在智慧去雜訊與提取主文...");
            
            const rawContent = result.content; 
            const cleaningPrompt = `
你是一位專業的內容編輯。請處理以下從網頁擷取的 Markdown 內容：

**目標**：去除所有導覽列、側邊欄、廣告、頁尾、版權宣告以及「其他人也在看」、「熱門新聞」這類不相關的推薦連結列表。只保留**核心文章的標題**與**正文內容**。

**重要提示**：如果輸入內容是 JSON 格式（例如包含 "content": ...），請只提取並清洗 content 裡面的文字，絕對不要輸出 JSON 括號或鍵名。

**輸入內容**：
${rawContent.substring(0, 30000)} 
(內容若過長已截斷)

**輸出要求**：
1. 直接回傳乾淨的文章標題與內文。
2. 保持 Markdown 格式（如標題用 #, 段落用空行）。
3. 不要包含任何解釋性文字。
4. 輸出必須是純文字，嚴禁輸出 JSON 格式。
`;

            try {
                // [New] 讀取模型設定
                const savedModel = localStorage.getItem('quizGenModel_v1') || 'standard';
                const isHighQuality = savedModel === 'high-quality';
                const modelName = isHighQuality ? CONFIG.MODELS.HIGH_QUALITY : CONFIG.MODELS.STANDARD;

                // [Refactor] 使用中央化請求進行清洗
                const payload = {
                    "contents": [{ "parts": [{ "text": cleaningPrompt }] }]
                };
                
                const cleanResult = await makeCentralizedRequest(payload, null, modelName);
                let cleanedText = cleanResult.candidates?.[0]?.content?.parts?.[0]?.text;
                
                if (cleanedText) {
                    // [Fix] 額外檢查：如果 AI 回傳了 JSON，嘗試解析並提取內容
                    cleanedText = cleanedText.trim();
                    if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
                        try {
                            const parsed = JSON.parse(cleanedText);
                            // 優先取 content，沒有則取 title + content，再沒有就轉字串
                            cleanedText = parsed.content || (parsed.title ? `# ${parsed.title}\n\n${parsed.content || ''}` : JSON.stringify(parsed));
                        } catch (e) { /* 不是標準 JSON，忽略 */ }
                    }
                    fullText = cleanedText;
                } else {
                    throw new Error('AI 回傳為空');
                }
            } catch (e) {
                console.warn("AI 清洗失敗，使用原始內容:", e);
                // 這裡我們不 throw，而是降級使用原始內容，但會顯示 Toast 告知使用者
                handleError(e, 'AICleaningWarning'); 
                fullText = `${ui.t('extracted_title_label')}${result.title}\n\n${ui.t('extracted_content_label')}\n${result.content}`;
            }
        }
        
        if(elements.textInput) {
            elements.textInput.value = fullText;
            elements.textInput.dispatchEvent(new Event('input'));
        }
        saveInputDraft(); 
        ui.showToast(ui.t('toast_content_extracted'), 'success');
        
        if (elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click();

        if (elements.downloadTxtBtn) elements.downloadTxtBtn.classList.remove('hidden');
        if (elements.shareContentBtn) elements.shareContentBtn.classList.remove('hidden');

    } catch (error) {
        console.error('擷取內容失敗:', error);
        handleError(error, 'ExtractContent');
    } finally {
        ui.hideLoader();
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}