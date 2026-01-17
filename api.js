import { CONFIG } from './config.js';
import { showToast, stopKeyTimer, t } from './ui.js';
import { elements } from './dom.js'; 
import { getAdaptiveSystemInstruction, getQuestionUserPrompt, PROMPT_VERSION } from './prompts/index.js'; 
import { parseGeminiError } from './utils.js'; 

export async function fetchWithRetry(url, options, retries = 3, initialDelay = 2000) {
    let currentDelay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if ((response.status === 503 || response.status === 429) && i < retries - 1) {
                await new Promise(res => setTimeout(res, currentDelay));
                currentDelay *= 2;
                continue;
            }
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(res => setTimeout(res, currentDelay));
            currentDelay *= 2;
        }
    }
}

export function getApiKey() {
    const keyDataString = sessionStorage.getItem('gemini_api_key_data');
    if (!keyDataString) return null;
    const keyData = JSON.parse(keyDataString);
    
    // [Updated] 恢復過期檢查 (2小時)
    if (new Date().getTime() > keyData.expires) {
        sessionStorage.removeItem('gemini_api_key_data');
        stopKeyTimer();
        return null;
    }
    
    // [New] 支援多金鑰格式：如果是陣列，回傳第一組 (Stage 1 保底)
    if (Array.isArray(keyData.value)) {
        return keyData.value[0];
    }
    return keyData.value;
}

/**
 * 取得完整金鑰列表
 */
export function getApiKeyList() {
    const keyDataString = sessionStorage.getItem('gemini_api_key_data');
    if (!keyDataString) return [];
    const keyData = JSON.parse(keyDataString);
    return Array.isArray(keyData.value) ? keyData.value : [keyData.value];
}

let currentKeyPointer = -1; // [Updated] 初始化為 -1，表示尚未選定起始 Key

/**
 * 中央統一請求入口：支援多金鑰自動切換與限流
 */
export async function makeCentralizedRequest(payload, signal, modelName = CONFIG.MODEL_NAME, retryCount = 0) {
    const keys = getApiKeyList();
    if (keys.length === 0) throw new Error(t('error_api_missing'));

    // [New] 隨機起點策略 (Random Start)
    // 只有在第一次請求時隨機選一個，之後就照順序
    if (currentKeyPointer === -1) {
        currentKeyPointer = Math.floor(Math.random() * keys.length);
        console.log(`[API] Randomized start key index: ${currentKeyPointer}`);
    }

    // 確保指針不越界 (防止使用者中途刪減 Key)
    if (currentKeyPointer >= keys.length) currentKeyPointer = 0;

    const apiKey = keys[currentKeyPointer];
    const apiUrl = `${CONFIG.BASE_URL}/models/${modelName}:generateContent`;

    // [New] 監控目前使用的金鑰
    const maskedKey = apiKey ? `${apiKey.substring(0, 6)}...${apiKey.slice(-4)}` : 'INVALID';
    console.log(`%c[API Request] Using Key #${currentKeyPointer + 1} (${maskedKey}) | Model: ${modelName}`, "color: #10b981;");

    try {
        const response = await fetchWithRetry(apiUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, 
            body: JSON.stringify(payload), 
            signal 
        });

        if (!response.ok) {
            // [Fix] 核心邏輯：捕捉 429 並嘗試切換 Key (圓桌轉盤法)
            // 限制最大重試次數等於 Key 的數量，避免無限迴圈
            if (response.status === 429 && retryCount < keys.length) {
                const oldIndex = currentKeyPointer;
                currentKeyPointer = (currentKeyPointer + 1) % keys.length; // Round-Robin
                
                console.warn(`[API] Key #${oldIndex + 1} exhausted (429). Switching to Key #${currentKeyPointer + 1} (Round-Robin)...`);
                showToast(`正在嘗試第 ${currentKeyPointer + 1} 組備用金鑰...`, 'info');
                
                // 遞迴重試，並增加計數器
                return await makeCentralizedRequest(payload, signal, modelName, retryCount + 1);
            }

            const errorBody = await response.json().catch(() => ({ error: { message: '無法讀取錯誤內容' } }));
            // 直接拋出帶有狀態碼的錯誤，讓 handleError 統一轉譯
            const err = new Error(`${response.status} ${errorBody.error.message}`);
            err.status = response.status;
            throw err;
        }
        return await response.json();
    } catch (error) {
        // [Fallback] 如果是 Gemini 3 失敗 (404/400/500)，自動降級回 Gemini 2.5
        if (modelName === CONFIG.MODELS.HIGH_QUALITY && error.status !== 429) { 
            // ... (保持原樣)
            console.warn(`[API] Gemini 3 failed (${error.message}). Falling back to ${CONFIG.MODELS.HIGH_QUALITY_BACKUP}...`);
            showToast('Gemini 3 暫時無法使用，已自動切換回穩定的 Gemini 2.5', 'warning');
            
            const fallbackPayload = JSON.parse(JSON.stringify(payload));
            if (fallbackPayload.generationConfig) {
                delete fallbackPayload.generationConfig.thinking;
                delete fallbackPayload.generationConfig.include_thoughts;
            }
            return await makeCentralizedRequest(fallbackPayload, signal, CONFIG.MODELS.HIGH_QUALITY_BACKUP);
        }

        // 如果是網路錯誤或 429 且還有其他 Key 可試
        if ((error.message.includes('fetch') || error.status === 429) && retryCount < keys.length) {
            currentKeyPointer = (currentKeyPointer + 1) % keys.length; // Round-Robin
            return await makeCentralizedRequest(payload, signal, modelName, retryCount + 1);
        }
        throw error;
    }
}

// 為了內部向後相容
async function makeGeminiRequest(payload, signal, modelName = CONFIG.MODEL_NAME) {
    return await makeCentralizedRequest(payload, signal, modelName);
}
function parseGeminiResponse(result) {
    const candidate = result.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') throw new Error("【AI 拒絕服務】內容違反安全政策。");
    const rawText = candidate?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error(t('error_api_format'));
    let cleanJsonText = rawText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    if (cleanJsonText.includes('"questions":') && !cleanJsonText.endsWith('}')) {
        if (!cleanJsonText.endsWith(']')) cleanJsonText += ']';
        else cleanJsonText += '}';
    }
    try {
        const parsed = JSON.parse(cleanJsonText);
        return { questions: parsed.questions || [], suggestedTitle: parsed.quizTitle || '', rawText };
    } catch (e) { return { error: e, rawText }; }
}

export async function generateSingleBatch(count, type, difficulty, text, images, questionStyle, signal, languageChoice, studentLevel, bloomLevel, keywords = [], expertParams = null, isHighQuality = false, domain = 'chinese', contextType = '') {
    // 根據模式選擇模型與配額
    const modelKey = isHighQuality ? 'HIGH_QUALITY' : 'STANDARD';
    const modelName = CONFIG.MODELS[modelKey];
    const quota = CONFIG.QUOTAS[modelKey];

    const bloomDistribution = { [bloomLevel]: count };
    const systemPromptText = getAdaptiveSystemInstruction(count, type, difficulty, questionStyle, languageChoice, studentLevel, bloomDistribution, keywords, expertParams, isHighQuality, domain, contextType);

    // [Prompt Inspector] 聽診器：在出題前將完整指令印在控制台
    console.log(`%c[AI API Request] --- ${modelKey} Mode (${modelName}) ---`, "color: #6366f1; font-weight: bold;");
    console.log(systemPromptText);
    console.log("%c-------------------------------------------", "color: #6366f1; font-weight: bold;");

    const taskParts = [{ text: "很好。現在請根據學習內容與指定重點生成題目並給予標題。" }];
    if (text.trim()) taskParts.push({ text: `\n---【參考內容】---\n${text}` });
    images.forEach(img => taskParts.push({ inline_data: { mime_type: img.type, data: img.data } }));

    // [New] 針對 Gemini 3 啟用思考模式
    const genConfig = { "temperature": isHighQuality ? 0.4 : 0.7, "maxOutputTokens": 8192, "responseMimeType": "application/json" };
    if (modelName === CONFIG.MODELS.HIGH_QUALITY) {
        genConfig.thinking = true;
        genConfig.include_thoughts = false;
        console.log('[API] Gemini 3 Thinking Mode Activated 🧠');
    }

    const initialPayload = {
        "systemInstruction": { "parts": [{ "text": systemPromptText }] },
        "contents": [{ "role": "user", "parts": taskParts }],
        "generationConfig": genConfig
    };

    let result = await makeGeminiRequest(initialPayload, signal, modelName);
    
    // 實作硬性限流延遲 (RPM 控制)
    if (quota.DELAY > 0) {
        console.log(`[Rate Limit] Waiting ${quota.DELAY}ms for next request...`);
        await new Promise(r => setTimeout(r, quota.DELAY));
    }

    let parsedResult = parseGeminiResponse(result);
    if (!parsedResult.error && parsedResult.questions.length > 0) {
        return { questions: parsedResult.questions, suggestedTitle: parsedResult.suggestedTitle, meta: { promptVersion: PROMPT_VERSION, modelName: modelName } };
    }

    const repairPayload = {
        ...initialPayload,
        "contents": [
            ...initialPayload.contents,
            { "role": "model", "parts": [{ "text": parsedResult.rawText || "{}" }] },
            { "role": "user", "parts": [{ "text": "你的輸出並非有效的 JSON 格式。請修正並只輸出純 JSON。" }] }
        ]
    };
    result = await makeGeminiRequest(repairPayload, signal, modelName);
    parsedResult = parseGeminiResponse(result);
    if (!parsedResult.error && parsedResult.questions.length > 0) {
        return { questions: parsedResult.questions, suggestedTitle: parsedResult.suggestedTitle, meta: { promptVersion: PROMPT_VERSION, modelName: modelName, repaired: true } };
    }
    throw new Error("AI 輸出格式修復失敗。");
}
