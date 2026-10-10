import { CONFIG } from './config.js';
import { showToast, stopKeyTimer, t, showLoader } from './ui.js';
import { elements } from './dom.js'; 
import { getAdaptiveSystemInstruction, getQuestionUserPrompt, PROMPT_VERSION } from './prompts/index.js'; 
import { parseGeminiError } from './utils.js'; 

const MODEL_FRIENDLY_NAMES = {
    'gemini-3.8-flash': 'Gemini 3.8 Flash',
    'gemini-3.6-flash': 'Gemini 3.6 Flash',
    'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
    'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
};

function getFriendlyModelName(modelName) {
    if (!modelName) return 'Gemini Flash';
    const key = modelName.toLowerCase();
    for (const [k, v] of Object.entries(MODEL_FRIENDLY_NAMES)) {
        if (key.includes(k)) {
            return v;
        }
    }
    return modelName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
} 

const FLASH_ALLOWLIST = [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash'
];
const STANDARD_PRIORITY = [FLASH_ALLOWLIST[2], FLASH_ALLOWLIST[3], FLASH_ALLOWLIST[0], FLASH_ALLOWLIST[1], FLASH_ALLOWLIST[4]];
const MODEL_CACHE_MS = 60 * 60 * 1000;
const DAY_MS = 24 * MODEL_CACHE_MS;
const modelCache = new Map();
const routing = new Map();

function getRoute(key) {
    if (!routing.has(key)) routing.set(key, { count: 0, lastAt: 0, cooldownUntil: 0, models: {} });
    return routing.get(key);
}

export function resetGeminiRouting() {
    routing.clear();
    modelCache.clear();
}

function modelId(name) {
    return (name || '').replace(/^models\//, '');
}

function isAllowedModel(name) {
    return FLASH_ALLOWLIST.some(base => name === base || /^-\d{3,}$/.test(name.slice(base.length)) && name.startsWith(base));
}

function modelPriority(name, highQuality) {
    const order = highQuality ? FLASH_ALLOWLIST : STANDARD_PRIORITY;
    return order.findIndex(base => name === base || name.startsWith(`${base}-`));
}

export async function resolveFlashModelsList(apiKey, throwOnError = false) {
    if (!apiKey) return [];
    const cached = modelCache.get(apiKey);
    if (cached && cached.expires > Date.now()) return cached.models;
    try {
        const models = [];
        let pageToken = '';
        do {
            const url = new URL(`${CONFIG.BASE_URL}/models`);
            url.searchParams.set('pageSize', '1000');
            if (pageToken) url.searchParams.set('pageToken', pageToken);
            const response = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });
            if (!response.ok) {
                const error = new Error(`Models API HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }
            const data = await response.json();
            if (!Array.isArray(data.models)) throw new Error('Models API 格式錯誤');
            models.push(...data.models);
            pageToken = data.nextPageToken || '';
        } while (pageToken);
        const available = [...new Set(models.filter(item => item.supportedGenerationMethods?.includes('generateContent'))
            .map(item => modelId(item.name)).filter(isAllowedModel))];
        modelCache.set(apiKey, { models: available, expires: Date.now() + MODEL_CACHE_MS });
        return available;
    } catch (error) {
        if (throwOnError || [401, 403, 429].includes(error.status) || error.status >= 500) throw error;
        // Models API 無法連線時，僅讓生成端嘗試兩個已知候選；404 仍受一次降級限制。
        return ['gemini-3.8-flash', 'gemini-2.5-flash'];
    }
}

export async function resolveLatestFlashModel(apiKey, throwOnError = false) {
    const models = await resolveFlashModelsList(apiKey, throwOnError);
    return models.sort((a, b) => modelPriority(a, true) - modelPriority(b, true))[0] || null;
}

export async function validateApiKey(apiKey) {
    if (!apiKey) throw new Error('INVALID_KEY: API Key 為空');
    try {
        const models = await resolveFlashModelsList(apiKey, true);
        if (!models.length) throw new Error('INVALID_KEY: 此專案沒有可用的 Flash 模型');
        return true;
    } catch (error) {
        if (error.message.startsWith('INVALID_KEY:')) throw error;
        if ([400, 401, 403].includes(error.status)) throw new Error('INVALID_KEY: API Key 無效或沒有 Models API 權限');
        throw new Error(`NETWORK_ERROR: ${error.message}`);
    }
}

export async function fetchWithRetry(url, options, retries = 2, initialDelay = 1000) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (![408, 500, 502, 503, 504].includes(response.status) || attempt === retries - 1) return response;
        } catch (error) {
            if (error.name === 'AbortError' || attempt === retries - 1) throw error;
        }
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, initialDelay + Math.floor(Math.random() * 500));
            options.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); }, { once: true });
        });
    }
}

function keyData() {
    try {
        const data = JSON.parse(sessionStorage.getItem('gemini_api_key_data') || 'null');
        if (!data || Date.now() >= data.expires) {
            sessionStorage.removeItem('gemini_api_key_data');
            stopKeyTimer();
            resetGeminiRouting();
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

export function getApiKey() {
    const value = keyData()?.value;
    return Array.isArray(value) ? value[0] : value || null;
}

export function getApiKeyList() {
    const value = keyData()?.value;
    return [...new Set((Array.isArray(value) ? value : [value]).filter(Boolean))];
}

function nextPacificMidnight() {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = formatter.format(new Date());
    let low = Date.now();
    let high = low + 48 * MODEL_CACHE_MS;
    while (high - low > 1000) {
        const middle = Math.floor((low + high) / 2);
        if (formatter.format(new Date(middle)) === today) low = middle;
        else high = middle;
    }
    return high;
}

function quotaCooldown(body) {
    const text = JSON.stringify(body || {});
    if (/per day|daily|RPD|GenerateRequestsPerDay/i.test(text)) return nextPacificMidnight();
    const seconds = Number(text.match(/"retryDelay"\s*:\s*"(\d+)s"/)?.[1]);
    return Date.now() + (seconds > 0 ? seconds * 1000 : 60000);
}

export async function makeCentralizedRequest(payload, signal, modelName = CONFIG.MODEL_NAME) {
    const keys = getApiKeyList();
    if (!keys.length) throw new Error(t('error_api_missing'));
    const highQuality = modelName === CONFIG.MODELS.HIGH_QUALITY;
    const orderedKeys = keys.map((key, index) => ({ key, index, route: getRoute(key) }))
        .filter(item => item.route.cooldownUntil <= Date.now())
        .sort((a, b) => a.route.count - b.route.count || a.route.lastAt - b.route.lastAt || a.index - b.index);
    if (!orderedKeys.length) throw new Error('所有 Gemini 專案暫時冷卻中，請稍後再試。');

    for (const item of orderedKeys) {
        item.route.count++;
        item.route.lastAt = Date.now();
        let available;
        try {
            available = await resolveFlashModelsList(item.key);
        } catch (error) {
            if ([401, 403].includes(error.status)) {
                item.route.cooldownUntil = Date.now() + DAY_MS;
                continue;
            }
            if (error.status === 429) item.route.cooldownUntil = Date.now() + 60000;
            throw error;
        }
        const models = available.filter(name => (item.route.models[name] || 0) <= Date.now())
            .sort((a, b) => modelPriority(a, highQuality) - modelPriority(b, highQuality) || b.localeCompare(a, undefined, { numeric: true }));
        if (!models.length) continue;

        let unauthorized = false;
        for (const model of models.slice(0, 2)) {
            showLoader(`AI 正在出題中...\n(使用模型： ${getFriendlyModelName(model)})`);
            const currentPayload = structuredClone(payload);
            if (model !== CONFIG.MODELS.HIGH_QUALITY && currentPayload.generationConfig) {
                delete currentPayload.generationConfig.thinking;
                delete currentPayload.generationConfig.include_thoughts;
            }
            let response;
            try {
                response = await fetchWithRetry(`${CONFIG.BASE_URL}/models/${model}:generateContent`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': item.key },
                    body: JSON.stringify(currentPayload), signal
                });
            } catch (error) {
                if (error.name === 'AbortError') throw error;
                item.route.models[model] = Date.now() + 60000;
                throw new Error('Gemini 網路連線失敗，請稍後再試。');
            }
            if (response.ok) {
                const result = await response.json();
                if (result) result._actualModelUsed = model;
                return result;
            }
            const body = await response.json().catch(() => ({}));
            if ([401, 403].includes(response.status)) {
                item.route.cooldownUntil = Date.now() + DAY_MS;
                unauthorized = true;
                break;
            }
            if (response.status === 404) {
                item.route.models[model] = Date.now() + DAY_MS;
                continue;
            }
            if (response.status === 429) {
                const until = quotaCooldown(body);
                if (/PerModel|per.model|model quota/i.test(JSON.stringify(body))) item.route.models[model] = until;
                else item.route.cooldownUntil = until;
                throw new Error('Gemini 額度或速率已達限制，請稍後重新操作。');
            }
            if ([408, 500, 502, 503, 504].includes(response.status)) item.route.models[model] = Date.now() + 60000;
            throw new Error(`Gemini 呼叫失敗 (HTTP ${response.status})：${body.error?.message || '請稍後再試'}`);
        }
        if (unauthorized) continue;
        // 兩個模型都 404 後停止，避免將相同內容擴散到其他 Key。
        if (models.length) throw new Error('這組 Gemini Key 的候選模型目前不可用，請稍後再試。');
    }
    throw new Error('目前沒有可用的 Gemini Key 與 Flash 模型。');
}

// 為了內部向後相容
async function makeGeminiRequest(payload, signal, modelName = CONFIG.MODEL_NAME) {
    return await makeCentralizedRequest(payload, signal, modelName);
}
function parseGeminiResponse(result) {
    const candidate = result.candidates?.[0];
    if (result.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(candidate?.finishReason)) {
        throw new Error("【AI 拒絕服務】內容違反安全政策。");
    }
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

    const genConfig = { "temperature": isHighQuality ? 0.4 : 0.7, "maxOutputTokens": 8192, "responseMimeType": "application/json" };

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
