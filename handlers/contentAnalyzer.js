import * as api from '../api.js';
import * as ui from '../ui.js';
import * as state from '../state.js';
import { elements } from '../dom.js';
import { handleError } from '../utils.js';
import { CONFIG } from '../config.js';

/**
 * 觸發內容分析 (支援文字與圖片)
 */
export async function handleAnalyzeContent() {
    const text = elements.textInput ? elements.textInput.value.trim() : '';
    const images = state.getUploadedImages();
    
    // 1. 基本檢查
    if (!text && images.length === 0) {
        ui.showToast('請先提供內容或上傳圖片再進行分析', 'error');
        return;
    }

    // 2. 金鑰檢查 (修正 key=null 的問題)
    const apiKey = api.getApiKey();
    if (!apiKey) {
        ui.showToast('請先在右上方「設定」中儲存您的 API 金鑰', 'error');
        if (elements.commonSettingsCard) {
            // 自動展開設定區提醒使用者
            elements.commonSettingsCard.classList.remove('collapsed');
        }
        return;
    }

    if (state.isBusy('analyze')) return;

    if (elements.analyzeContentBtn) {
        elements.analyzeContentBtn.disabled = true;
        elements.analyzeContentBtn.innerHTML = `
            <svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>正在分析內容...</span>
        `;
    }

    const { requestId, signal } = state.startTask('analyze');

    try {
        const keywords = await requestKeywordAnalysis(text, images, apiKey, signal);
        if (state.isTaskValid('analyze', requestId)) {
            renderKeywords(keywords);
            if (elements.keywordAnalysisArea) {
                elements.keywordAnalysisArea.classList.remove('hidden');
            }
            ui.showToast('考點分析完成', 'success');
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        ui.showToast('分析失敗：' + (error.message || '未知錯誤'), 'error');
    } finally {
        if (state.isTaskValid('analyze', requestId)) {
            state.endTask('analyze');
            resetAnalyzeButton();
        }
    }
}

/**
 * 更新文字高亮層
 */
export function updateHighlighter() {
    const textarea = elements.textInput;
    const backdrop = document.getElementById('text-input-backdrop');
    if (!textarea || !backdrop) return;

    let text = textarea.value;
    const keywords = state.getSelectedKeywords();

    if (keywords.length === 0) {
        backdrop.innerHTML = text.replace(/\n/g, '<br>');
        return;
    }

    // 將關鍵字按長度排序 (由長到短)，防止短詞嵌入長詞導致高亮破碎
    const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
    
    // 使用正則表達式進行全域替換 (忽略大小寫，支援多語系)
    // 這裡我們需要一個暫存機制來防止嵌套替換
    let highlightedText = text;
    
    // 安全起見，我們先處理 HTML 轉義
    highlightedText = highlightedText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    sortedKeywords.forEach(word => {
        if (!word.trim()) return;
        // 轉義正則特殊字元
        const escapedWord = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        
        // [Fix] 針對英文關鍵字啟用「單字邊界」判定，防止標記到單字的一部分 (如 run -> running)
        // 判斷是否全為 ASCII (英文/數字/符號)
        const isEnglish = /^[\x00-\x7F]+$/.test(word);
        const pattern = isEnglish ? `\\b${escapedWord}\\b` : escapedWord;
        
        const regex = new RegExp(`(${pattern})`, 'gi');
        
        // 使用特殊的標記來避免重複替換 (使用不可見字元或自訂標記)
        highlightedText = highlightedText.replace(regex, '<span class="highlight-keyword">$1</span>');
    });

    // 處理換行
    backdrop.innerHTML = highlightedText.replace(/\n/g, '<br>') + (text.endsWith('\n') ? '<br>' : '');
    
    // 同步捲動
    syncScroll();
}

/**
 * 同步捲動位置
 */
export function syncScroll() {
    const textarea = elements.textInput;
    const backdrop = document.getElementById('text-input-backdrop');
    if (textarea && backdrop) {
        backdrop.scrollTop = textarea.scrollTop;
        backdrop.scrollLeft = textarea.scrollLeft;
    }
}

/**
 * 手動新增自訂關鍵字 (支援參數傳入)
 */
export function handleAddCustomKeyword(providedText = null) {
    const input = elements.customKeywordInput;
    // 關鍵修正：判斷傳入的是否為純文字字串
    const textToUse = (typeof providedText === 'string') ? providedText : (input ? input.value : '');
    const word = textToUse.trim();
    
    if (!word) return;
    if (state.getSelectedKeywords().includes(word)) return;
    
    // 如果是選取文字產生的，隱藏選單
    hideSelectionMenu();

    elements.keywordContainer.appendChild(createKeywordTag(word, true));
    state.toggleKeyword(word);
    
    // 更新高亮
    updateHighlighter();
    
    if (input && typeof providedText !== 'string') {
        input.value = '';
        input.focus();
    }
}

/**
 * 處理文字選取事件
 */
export function handleSelectionChange(e) {
    const textarea = e.target;
    const menu = document.getElementById('text-selection-menu');
    if (!menu) return;

    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd).trim();

    if (selectedText && selectedText.length > 0 && selectedText.length < 50) {
        // 計算選單位置 (簡化版：出現在滑鼠點擊位置附近)
        const rect = textarea.getBoundingClientRect();
        // 我們使用滑鼠事件的座標
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY - 40}px`; 
        menu.classList.remove('hidden');
        
        // 儲存選取的文字供按鈕使用
        menu.dataset.selectedText = selectedText;
    } else {
        hideSelectionMenu();
    }
}

export function hideSelectionMenu() {
    const menu = document.getElementById('text-selection-menu');
    menu?.classList.add('hidden');
}

/**
 * 向 AI 請求關鍵字分析 (傳入已驗證的 apiKey)
 */
async function requestKeywordAnalysis(text, images, apiKey, signal) {
    const prompt = `你是一位專業的教育診斷專家。請閱讀以下提供的教學內容或圖片，並提取出 5 到 10 個最適合用來「命題」的關鍵字或核心考點（實體名詞、專業術語或重要概念）。
    請嚴格以 JSON 格式回傳： { "keywords": ["重點1", "重點2", ...] }。只需輸出純 JSON，不要有任何解釋文字。`;

    const apiUrl = `${CONFIG.BASE_URL}/models/${CONFIG.MODEL_NAME}:generateContent?key=${apiKey}`;

    const taskParts = [{ text: prompt }];
    if (text) taskParts.push({ text: `內容如下：\n${text.substring(0, 3000)}` });
    images.forEach(img => {
        taskParts.push({ inline_data: { mime_type: img.type, data: img.data } });
    });

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            "contents": [{ "role": "user", "parts": taskParts }],
            "generationConfig": { "temperature": 0.2, "responseMimeType": "application/json" }
        }),
        signal
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'API 請求失敗');
    }
    
    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(rawText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    return parsed.keywords || [];
}

function createKeywordTag(word, isAutoSelected = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const updateStyle = (selected) => {
        btn.className = selected 
            ? 'px-3 py-1.5 rounded-full text-sm font-medium transition-all border border-transparent themed-button-primary shadow-sm'
            : 'px-3 py-1.5 rounded-full text-sm font-medium transition-all border border-gray-200 bg-white text-gray-600 hover:bg-gray-50';
    };
    updateStyle(isAutoSelected);
    btn.textContent = word;
    btn.onclick = (e) => {
        e.preventDefault();
        state.toggleKeyword(word);
        updateStyle(state.getSelectedKeywords().includes(word));
    };
    return btn;
}

function renderKeywords(keywords) {
    if (!elements.keywordContainer) return;
    elements.keywordContainer.innerHTML = '';
    state.setSelectedKeywords([]); 
    keywords.forEach(word => {
        elements.keywordContainer.appendChild(createKeywordTag(word, false));
    });
}

function resetAnalyzeButton() {
    if (!elements.analyzeContentBtn) return;
    elements.analyzeContentBtn.disabled = false;
    elements.analyzeContentBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> AI 提取重點';
}
