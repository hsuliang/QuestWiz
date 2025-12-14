import { CONFIG } from './config.js';
import { showToast, stopKeyTimer, t } from './ui.js';
import { elements } from './dom.js'; // Use centralized DOM elements
import { getQuestionSystemInstruction, getQuestionUserPrompt } from './prompts.js'; // Import prompt builders
import { parseGeminiError } from './utils.js'; // Import error parser

/**
 * 【修改】加上 export，讓此函式可以被其他檔案使用
 * 新增：帶有重試機制的 Fetch 函式
 * @param {string} url - 請求的 URL
 * @param {object} options - Fetch 的設定選項
 * @param {number} retries - 最大重試次数
 * @param {number} delay - 初始延遲時間 (毫秒)
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 503 && i < retries - 1) {
                console.warn(`Attempt ${i + 1} failed with 503. Retrying in ${delay / 1000}s...`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2; // 指數退避策略
                continue;
            }
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.warn(`Attempt ${i + 1} failed with network error. Retrying in ${delay / 1000}s...`);
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
}

/**
 * 從 sessionStorage 獲取並驗證 API Key
 */
export function getApiKey() {
    const keyDataString = sessionStorage.getItem('gemini_api_key_data');
    if (!keyDataString) {
        return null;
    }
    const keyData = JSON.parse(keyDataString);
    const now = new Date().getTime();

    if (now > keyData.expires) {
        sessionStorage.removeItem('gemini_api_key_data');
        stopKeyTimer();
        if (document.body.contains(document.getElementById('toast'))) {
           showToast(t('error_api_expired'), 'error');
        }
        return null;
    }
    return keyData.value;
}

/**
 * 產生單一批次的題目
 */
export async function generateSingleBatch(questionsInBatch, questionType, difficulty, text, images, questionStyle, signal, languageChoice, studentLevel) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error(t('error_api_missing'));

    const apiUrl = CONFIG.API_URL;
    const selectedFormat = elements.formatSelect ? elements.formatSelect.value : '';
    const needsExplanation = selectedFormat === 'loilonote' || selectedFormat === 'wayground';
    const interfaceLanguage = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';

    // 如果 studentLevelSelect 存在，優先使用選單文字，否則使用傳入的 studentLevel 代碼
    const studentGradeText = elements.studentLevelSelect && elements.studentLevelSelect.selectedIndex >= 0
        ? elements.studentLevelSelect.options[elements.studentLevelSelect.selectedIndex].text
        : studentLevel;

    // 1. 構建 System Instruction (來自 prompts.js)
    const systemPromptText = getQuestionSystemInstruction(questionStyle, studentGradeText, interfaceLanguage);

    // 2. 構建 JSON Schema (定義輸出結構)
    let jsonSchema;
    const mcProperties = { text: { type: "string" }, options: { type: "array", items: { type: "string" } }, correct: { type: "array", items: { type: "number" } }, time: { type: "number", "default": 30 } };
    let mcRequired = ["text", "options", "correct"];
    
    if (needsExplanation) { 
        mcProperties.explanation = { type: "string" }; 
        mcRequired.push("explanation"); 
    }
    if (questionStyle === 'competency-based') { 
        mcProperties.design_concept = { type: "string" }; 
    }

    switch(questionType) {
        case 'true_false':
            const tfProperties = { text: { type: "string" }, is_correct: { type: "boolean" } };
            let tfRequired = ["text", "is_correct"];
            if (needsExplanation) { 
                tfProperties.explanation = { type: "string" }; 
                tfRequired.push("explanation"); 
            }
            if (questionStyle === 'competency-based') { 
                tfProperties.design_concept = { type: "string" }; 
            }
            jsonSchema = { type: "array", items: { type: "object", properties: tfProperties, required: tfRequired }};
            break;
        case 'mixed':
        case 'multiple_choice':
        default:
             jsonSchema = { type: "array", items: { type: "object", properties: mcProperties, required: mcRequired }};
            break;
    }

    // 3. 構建 User Prompt (來自 prompts.js)
    const userPromptText = getQuestionUserPrompt({
        count: questionsInBatch,
        type: questionType,
        difficulty,
        text: "", // 這裡不傳 text，因為 text 會作為獨立的 part 傳入，避免 prompt 過長
        language: languageChoice,
        interfaceLanguage
    });

    const parts = [{ text: userPromptText }];
    if(text.trim()){ parts.push({ text: `參考文本內容:\n${text}`}); }
    images.forEach(img => { parts.push({ inline_data: { mime_type: img.type, data: img.data } }); });

    const payload = {
        "contents": [{ "parts": parts }],
        "systemInstruction": { "parts": [{ "text": systemPromptText }] },
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": { "type": "ARRAY", "items": jsonSchema.items }
        }
    };

    // 使用帶有重試機制的 fetch 函式
    const response = await fetchWithRetry(apiUrl, { 
        method: 'POST', 
        headers: { 
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        }, 
        body: JSON.stringify(payload), 
        signal 
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: { message: '無法讀取錯誤內容' } }));
        // 使用工具函式解析錯誤訊息
        const friendlyMessage = parseGeminiError(new Error(`${response.status} ${errorBody.error.message}`));
        throw new Error(friendlyMessage);
    }
    const result = await response.json();
    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // 檢查是否有被 Safety Filter 攔截 (finishReason)
    if (result.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error(t('error_safety_filter'));
    }

    if (!jsonText) throw new Error(t('error_api_format'));

    let parsedJson;
    try {
        parsedJson = JSON.parse(jsonText);
    } catch (e) {
        console.error("解析 JSON 失敗:", jsonText);
        throw new Error(t('error_api_json'));
    }

    return parsedJson.map(q => {
        if (q.options && Array.isArray(q.options)) {
            while (q.options.length < 4) {
                q.options.push("");
            }
        }
        return q;
    });
}

