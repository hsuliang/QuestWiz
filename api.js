import { CONFIG } from './config.js';
import { showToast, stopKeyTimer, t, showLoader } from './ui.js';
import { elements } from './dom.js'; 
import { getAdaptiveSystemInstruction, getQuestionUserPrompt, PROMPT_VERSION } from './prompts/index.js'; 
import { parseGeminiError } from './utils.js'; 

const MODEL_FRIENDLY_NAMES = {
    'gemini-3-flash-preview': 'Gemini 3.0 Flash',
    'gemini-3.5-flash': 'Gemini 3.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-flash-latest': 'Gemini Flash'
};

function getFriendlyModelName(modelName) {
    if (!modelName) return 'Gemini 2.5 Flash Lite';
    const key = modelName.toLowerCase();
    for (const [k, v] of Object.entries(MODEL_FRIENDLY_NAMES)) {
        if (key.includes(k)) {
            return v;
        }
    }
    return modelName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
} 

// 快取金鑰對應的模型清單：apiKey -> ['gemini-2.5-flash', 'gemini-1.5-flash', ...]
const modelCache = new Map();

// 當完全無法取得模型清單時的最後保險版本（官方常綠別名）
const FALLBACK_MODEL = 'gemini-flash-latest';

// 瀏覽器環境下，因 Google /models 列表 API 不支援 CORS，此清單作為穩健的本地保底階梯
const BROWSER_FALLBACK_LIST = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

/**
 * 解析特定 API Key 可用的所有 Flash 模型，並按版本從新到舊排序
 * @param {string} apiKey - Gemini API Key
 * @param {boolean} throwOnError - 是否在網路錯誤時直接拋出異常（用於儲存驗證）
 * @returns {Promise<string[]>} 排序後的模型名稱陣列
 */
export async function resolveFlashModelsList(apiKey, throwOnError = false) {
    if (!apiKey) {
        return [...BROWSER_FALLBACK_LIST];
    }
    
    if (modelCache.has(apiKey)) {
        return modelCache.get(apiKey);
    }

    try {
        const response = await fetch(`${CONFIG.BASE_URL}/models?key=${apiKey}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status}`);
        }
        const data = await response.json();
        if (!data.models || !Array.isArray(data.models)) {
            throw new Error('Invalid response format');
        }

        // 1. 過濾：只保留包含 'flash' 且支援 'generateContent' 的正式模型，排除預覽版 (preview, lite)
        const flashModels = data.models.filter(m => {
            const name = m.name || '';
            const nameLower = name.toLowerCase();
            const hasGenerateContent = m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent');
            return hasGenerateContent && 
                   nameLower.includes('flash') && 
                   !nameLower.includes('preview') && 
                   !nameLower.includes('lite');
        });

        if (flashModels.length === 0) {
            return [...BROWSER_FALLBACK_LIST];
        }

        // 2. 解析版本號：提取 'gemini-X.Y-flash' 中的 X.Y 數字
        const parsedModels = flashModels.map(m => {
            const parts = m.name.split('/');
            const suffix = parts[parts.length - 1];
            const versionMatch = suffix.match(/gemini-(\d+\.?\d*)-flash/i);
            const versionNum = versionMatch ? parseFloat(versionMatch[1]) : 0;
            
            return { suffix, versionNum };
        });

        // 3. 版本號由高到低排序 (降冪)
        parsedModels.sort((a, b) => {
            if (b.versionNum !== a.versionNum) {
                return b.versionNum - a.versionNum;
            }
            return b.suffix.localeCompare(a.suffix, undefined, { numeric: true, sensitivity: 'base' });
        });

        const list = parsedModels.map(m => m.suffix).filter(m => m);
        
        // 確保極穩定的底線模型存在於清單中
        if (!list.includes(FALLBACK_MODEL)) {
            list.push(FALLBACK_MODEL);
        }

        console.log("Resolved Flash models order:", list);
        modelCache.set(apiKey, list);
        return list;
    } catch (e) {
        console.warn("[系統警告] 動態模型解析失敗 (可能因瀏覽器 CORS 限制)，已啟用本地保底階梯方案:", e);
        modelCache.set(apiKey, [...BROWSER_FALLBACK_LIST]);
        if (throwOnError) throw e;
        return [...BROWSER_FALLBACK_LIST];
    }
}

/**
 * 取得最新的一款可用 Flash 模型（保留向後相容性用）
 */
export async function resolveLatestFlashModel(apiKey, throwOnError = false) {
    try {
        const list = await resolveFlashModelsList(apiKey, throwOnError);
        return list[0] || FALLBACK_MODEL;
    } catch (e) {
        if (throwOnError) throw e;
        return FALLBACK_MODEL;
    }
}

/**
 * 驗證金鑰是否可用 (使用支援 CORS 的 countTokens 輕量端點)
 * @param {string} apiKey 
 * @returns {Promise<boolean>}
 */
export async function validateApiKey(apiKey) {
    if (!apiKey) throw new Error('API key is empty');
    
    const apiUrl = `${CONFIG.BASE_URL}/models/gemini-flash-latest?key=${apiKey}`;
    try {
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(`INVALID_KEY: ${errorBody.error?.message || `HTTP ${response.status}`}`);
        }
        
        // 驗證成功後，為其預熱快取，嘗試動態獲取最新可用模型；若失敗則快取本地保底清單
        await resolveFlashModelsList(apiKey).catch(() => {});
        return true;
    } catch (e) {
        if (e.message && e.message.startsWith('INVALID_KEY:')) {
            throw e;
        }
        throw new Error(`NETWORK_ERROR: ${e.message}`);
    }
}


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
export async function makeCentralizedRequest(payload, signal, modelName = CONFIG.MODEL_NAME) {
    const keys = getApiKeyList();
    if (keys.length === 0) throw new Error(t('error_api_missing'));

    // [New] 隨機起點策略 (Random Start)
    // 只有在第一次請求時隨機選一個，之後就照順序
    if (currentKeyPointer === -1) {
        currentKeyPointer = Math.floor(Math.random() * keys.length);
        console.log(`[API] Randomized start key index: ${currentKeyPointer}`);
    }

    const startIndex = currentKeyPointer;
    let lastError = null;

    // 第一層：輪詢所有金鑰
    for (let i = 0; i < keys.length; i++) {
        const keyIndex = (startIndex + i) % keys.length;
        const apiKey = keys[keyIndex];
        currentKeyPointer = keyIndex; // 更新目前使用的金鑰指針

        // 取得該金鑰適用的模型階梯
        const resolvedModels = await resolveFlashModelsList(apiKey);
        
        // 建立該次請求的模型階梯佇列
        const modelQueue = [];
        if (modelName === CONFIG.MODELS.HIGH_QUALITY) {
            modelQueue.push(modelName);
            for (const m of resolvedModels) {
                if (!modelQueue.includes(m)) {
                    modelQueue.push(m);
                }
            }
        } else {
            // 標準模式：直接使用動態模型階梯，以求自動升級與保底
            for (const m of resolvedModels) {
                if (!modelQueue.includes(m)) {
                    modelQueue.push(m);
                }
            }
            // 如果請求特定模型（非 standard），且不在佇列中，將其推入最前方以求向後相容
            if (modelName && modelName !== CONFIG.MODELS.STANDARD && !modelQueue.includes(modelName)) {
                modelQueue.unshift(modelName);
            }
        }

        let keyErrorOccurred = false;

        // 第二層：依序嘗試版本由新到舊的模型
        for (const model of modelQueue) {
            try {
                // 動態更新出題等待畫面 (Loader) 的模型提示文字
                const friendlyName = getFriendlyModelName(model);
                showLoader(`AI 正在出題中...\n(使用模型： ${friendlyName})`);

                // 如果嘗試的不是高品質模型，清除 payload 中不支援的 thinking 設定
                const currentPayload = JSON.parse(JSON.stringify(payload));
                if (model !== CONFIG.MODELS.HIGH_QUALITY && currentPayload.generationConfig) {
                    delete currentPayload.generationConfig.thinking;
                    delete currentPayload.generationConfig.include_thoughts;
                }

                const maskedKey = apiKey ? `${apiKey.substring(0, 6)}...${apiKey.slice(-4)}` : 'INVALID';
                console.log(`%c[API Request] Trying Key #${keyIndex + 1} (${maskedKey}) | Model: ${model}`, "color: #10b981;");

                const apiUrl = `${CONFIG.BASE_URL}/models/${model}:generateContent`;
                const response = await fetchWithRetry(apiUrl, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, 
                    body: JSON.stringify(currentPayload), 
                    signal 
                });

                if (!response.ok) {
                    const errorBody = await response.json().catch(() => ({ error: { message: '無法讀取錯誤內容' } }));
                    const errorMsg = errorBody.error?.message || response.statusText;
                    const status = response.status;

                    console.warn(`[API] Key #${keyIndex + 1} with Model ${model} failed (HTTP ${status}): ${errorMsg}`);

                    // 核心容錯邏輯：
                    // - 400 (金鑰無效) 或 429 (額度耗盡) 屬於金鑰問題，應直接中斷當前模型階梯，切換金鑰
                    if (status === 429) {
                        showToast(`金鑰 #${keyIndex + 1} 額度耗盡 (429)，正在嘗試下一組金鑰...`, 'warning');
                        throw new Error(`QUOTA_EXCEEDED: ${errorMsg}`);
                    }
                    if (status === 400 && (errorMsg.includes('API key') || errorMsg.includes('key not valid') || errorMsg.includes('API_KEY_INVALID'))) {
                        showToast(`金鑰 #${keyIndex + 1} 無效 (400)，正在嘗試下一組金鑰...`, 'warning');
                        throw new Error(`INVALID_KEY: ${errorMsg}`);
                    }

                    // 如果是 modelName === HIGH_QUALITY 失敗，提示降級
                    if (model === CONFIG.MODELS.HIGH_QUALITY) {
                        showToast('Gemini 3 暫時無法使用，已自動切換回穩定的 Gemini 2.5/Flash', 'warning');
                    }
                    
                    const err = new Error(`MODEL_ERROR: ${errorMsg}`);
                    err.status = status;
                    throw err;
                }

                // 請求成功，注入實際成功的模型，然後回傳
                const resultJson = await response.json();
                if (resultJson) {
                    resultJson._actualModelUsed = model;
                }
                return resultJson;

            } catch (error) {
                lastError = error;

                // 若為金鑰問題，中斷模型循環
                if (error.message.startsWith('QUOTA_EXCEEDED') || error.message.startsWith('INVALID_KEY')) {
                    keyErrorOccurred = true;
                    break;
                }

                // 處理 AbortError
                if (error.name === 'AbortError') {
                    throw error;
                }

                // 其他錯誤 (404/503等模型問題) 繼續執行 model 循環
                console.warn(`[API] Model ${model} failed: ${error.message}. Trying next fallback model...`);
            }
        }

        // 若因為金鑰問題而中斷，繼續下一個金鑰
        if (keyErrorOccurred) {
            continue;
        }
    }

    // 若全部金鑰與模型均失敗，拋出最終錯誤
    const finalErrorMsg = lastError ? lastError.message : 'Unknown Error';
    throw new Error(`所有金鑰與模型嘗試皆失敗。最後錯誤: ${finalErrorMsg}`);
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
    const actualModel = result?._actualModelUsed || modelName;
    if (!parsedResult.error && parsedResult.questions.length > 0) {
        return { questions: parsedResult.questions, suggestedTitle: parsedResult.suggestedTitle, meta: { promptVersion: PROMPT_VERSION, modelName: actualModel } };
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
    const actualModelRepaired = result?._actualModelUsed || modelName;
    parsedResult = parseGeminiResponse(result);
    if (!parsedResult.error && parsedResult.questions.length > 0) {
        return { questions: parsedResult.questions, suggestedTitle: parsedResult.suggestedTitle, meta: { promptVersion: PROMPT_VERSION, modelName: actualModelRepaired, repaired: true } };
    }
    throw new Error("AI 輸出格式修復失敗。");
}
