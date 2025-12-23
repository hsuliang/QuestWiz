import { CONFIG } from './config.js';
import { showToast, stopKeyTimer, t } from './ui.js';
import { elements } from './dom.js'; 
import { getQuestionSystemInstruction, getQuestionUserPrompt, PROMPT_VERSION } from './prompts/index.js'; 
import { parseGeminiError } from './utils.js'; 

/**
 * 具備指數退避的 Fetch 封裝
 */
export async function fetchWithRetry(url, options, retries = 3, initialDelay = 2000) {
    let currentDelay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            
            // 503 (繁忙) 或 429 (頻率限制) 觸發重試
            if ((response.status === 503 || response.status === 429) && i < retries - 1) {
                console.warn(`[API] 伺服器繁忙 (${response.status}), ${currentDelay}ms 後進行第 ${i+1} 次重試...`);
                await new Promise(res => setTimeout(res, currentDelay));
                currentDelay *= 2; // 指數退避
                continue;
            }
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.warn(`[API] 網路錯誤, ${currentDelay}ms 後重試...`, error);
            await new Promise(res => setTimeout(res, currentDelay));
            currentDelay *= 2;
        }
    }
}

export function getApiKey() {
    const keyDataString = sessionStorage.getItem('gemini_api_key_data');
    if (!keyDataString) return null;
    const keyData = JSON.parse(keyDataString);
    if (new Date().getTime() > keyData.expires) {
        sessionStorage.removeItem('gemini_api_key_data');
        stopKeyTimer();
        return null;
    }
    return keyData.value;
}

/**
 * 執行底層 API 請求
 */
async function makeGeminiRequest(payload, signal) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error(t('error_api_missing'));
    const apiUrl = `${CONFIG.BASE_URL}/models/${CONFIG.MODEL_NAME}:generateContent`;

    const response = await fetchWithRetry(apiUrl, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, 
        body: JSON.stringify(payload), 
        signal 
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: { message: '無法讀取錯誤內容' } }));
        throw new Error(parseGeminiError(new Error(`${response.status} ${errorBody.error.message}`)));
    }
    
    return await response.json();
}

/**
 * 解析 Gemini 回傳的結果，特別處理安全性阻擋
 */
function parseGeminiResponse(result) {
    // 檢查是否被安全性過濾阻擋
    const candidate = result.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') {
        throw new Error("【AI 拒絕服務】內容可能涉及敏感資訊或違反安全政策，請調整輸入內容後再試。");
    }

    const rawText = candidate?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error(t('error_api_format'));

    // 移除 Markdown 標籤 (即使設定了 responseMimeType，有時 AI 還是會加)
    let cleanJsonText = rawText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    
    // 基礎容錯：補齊結尾
    if (cleanJsonText.includes("\"questions\":") && !cleanJsonText.endsWith('}')) {
        if (!cleanJsonText.endsWith(']')) cleanJsonText += ']';
        else cleanJsonText += '}';
    }

    try {
        const parsed = JSON.parse(cleanJsonText);
        return {
            questions: parsed.questions || [],
            suggestedTitle: parsed.quizTitle || '',
            rawText
        };
    } catch (e) {
        return { error: e, rawText };
    }
}

/**
 * 產生單一批次的題目 (含自動修復機制)
 */
export async function generateSingleBatch(count, type, difficulty, text, images, questionStyle, signal, languageChoice, studentLevel, bloomLevel) {
    const bloomDistribution = { [bloomLevel]: count };
    const systemPromptText = getQuestionSystemInstruction(count, type, difficulty, questionStyle, languageChoice, studentLevel, bloomDistribution);

    const taskParts = [{ text: "很好。現在請根據學習內容生成題目並給予標題。" }];
    if (text.trim()) taskParts.push({ text: `\n---【參考內容】---\n${text}` });
    images.forEach(img => taskParts.push({ inline_data: { mime_type: img.type, data: img.data } }));

    const initialPayload = {
        "systemInstruction": { "parts": [{ "text": systemPromptText }] },
        "contents": [{ "role": "user", "parts": taskParts }],
        "generationConfig": { 
            "temperature": 0.7, 
            "maxOutputTokens": 8192, 
            "responseMimeType": "application/json" 
        }
    };

    // --- 第一次嘗試 ---
    let result = await makeGeminiRequest(initialPayload, signal);
    let parsedResult = parseGeminiResponse(result);

    if (!parsedResult.error && parsedResult.questions.length > 0) {
        return {
            questions: parsedResult.questions,
            suggestedTitle: parsedResult.suggestedTitle,
            meta: { promptVersion: PROMPT_VERSION, modelName: CONFIG.MODEL_NAME }
        };
    }

    // --- 自動修復 (Auto-Repair) ---
    console.warn("[API] JSON 解析失敗，啟動二次修復...", parsedResult.error);
    
    const repairPayload = {
        ...initialPayload,
        "contents": [
            ...initialPayload.contents,
            { "role": "model", "parts": [{ "text": parsedResult.rawText || "{}" }] },
            { "role": "user", "parts": [{ "text": "你的輸出並非有效的 JSON 格式。請修正錯誤，只輸出有效的 JSON 物件，確保所有引號正確對稱，不要包含任何解釋文字。" }] }
        ]
    };

    result = await makeGeminiRequest(repairPayload, signal);
    parsedResult = parseGeminiResponse(result);

    if (!parsedResult.error && parsedResult.questions.length > 0) {
        return {
            questions: parsedResult.questions,
            suggestedTitle: parsedResult.suggestedTitle,
            meta: { promptVersion: PROMPT_VERSION, modelName: CONFIG.MODEL_NAME, repaired: true }
        };
    }

    throw new Error("AI 輸出格式異常且修復失敗。這通常發生在內容過於複雜時，請嘗試精簡內容或減少題數。");
}
