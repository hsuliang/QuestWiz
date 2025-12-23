import { CONFIG } from './config.js';
import { showToast, stopKeyTimer, t } from './ui.js';
import { elements } from './dom.js'; 
import { getQuestionSystemInstruction, getQuestionUserPrompt, PROMPT_VERSION } from './prompts/index.js'; 
import { parseGeminiError } from './utils.js'; 

export async function fetchWithRetry(url, options, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if ((response.status === 503 || response.status === 429) && i < retries - 1) {
                const waitTime = response.status === 429 ? 5000 : delay;
                await new Promise(res => setTimeout(res, waitTime));
                continue;
            }
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
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
 * 解析 Gemini 回傳的文字內容
 */
function parseGeminiResponse(result) {
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error(t('error_api_format'));

    let cleanJsonText = rawText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    
    // 基礎容錯處理：補齊結尾
    if (cleanJsonText.includes('"questions":') && !cleanJsonText.endsWith('}')) {
        if (!cleanJsonText.endsWith(']')) cleanJsonText += ']';
        else cleanJsonText += '}';
    }

    try {
        const parsed = JSON.parse(cleanJsonText);
        return {
            questions: parsed.questions || [],
            suggestedTitle: parsed.quizTitle || '',
            rawText // 用於重試時回傳給 AI
        };
    } catch (e) {
        // 回傳錯誤物件而非拋出 Error，以便上層決定是否重試
        return { error: e, rawText };
    }
}

/**
 * 產生單一批次的題目 (核心出題函數，含自動修復機制)
 */
export async function generateSingleBatch(count, type, difficulty, text, images, questionStyle, signal, languageChoice, studentLevel, bloomLevel) {
    // 1. 準備 Payload
    const bloomDistribution = { [bloomLevel]: count };
    const systemPromptText = getQuestionSystemInstruction(count, type, difficulty, questionStyle, languageChoice, studentLevel, bloomDistribution);

    const taskParts = [{ text: "很好。現在請根據學習內容生成題目並給予標題。" }];
    if (text.trim()) taskParts.push({ text: `\n---【參考內容】---\n${text}` });
    images.forEach(img => taskParts.push({ inline_data: { mime_type: img.type, data: img.data } }));

    const initialPayload = {
        "systemInstruction": { "parts": [{ "text": systemPromptText }] },
        "contents": [{ "role": "user", "parts": taskParts }],
        "generationConfig": { "temperature": 0.7, "maxOutputTokens": 8192, "responseMimeType": "application/json" }
    };

    // 2. 第一次嘗試
    let result = await makeGeminiRequest(initialPayload, signal);
    let parsedResult = parseGeminiResponse(result);

    // 3. 如果解析成功，直接回傳
    if (!parsedResult.error && parsedResult.questions.length > 0) {
        return {
            questions: parsedResult.questions,
            suggestedTitle: parsedResult.suggestedTitle,
            meta: { promptVersion: PROMPT_VERSION, modelName: CONFIG.MODEL_NAME }
        };
    }

    // 4. 自動修復 (Auto-Repair) 機制
    console.warn("⚠️ JSON 解析失敗或格式有誤，嘗試自動修復...", parsedResult.error);
    
    // 構建修復請求：將對話歷史 + 錯誤輸出 + 修正指令 一起送出
    const repairPayload = {
        ...initialPayload,
        "contents": [
            ...initialPayload.contents,
            { "role": "model", "parts": [{ "text": parsedResult.rawText || "{}" }] }, // 模擬 AI 上次講錯的話
            { "role": "user", "parts": [{ "text": "你剛剛輸出的 JSON 格式有語法錯誤（Syntax Error），導致解析失敗。請修正 JSON 格式，確保屬性名稱有雙引號，且陣列與物件正確閉合。只需輸出修正後的純 JSON，不要解釋。" }] }
        ]
    };

    // 發送第二次請求
    result = await makeGeminiRequest(repairPayload, signal);
    parsedResult = parseGeminiResponse(result);

    if (!parsedResult.error && parsedResult.questions.length > 0) {
        console.log("%c✅ 自動修復成功！", "color: green; font-weight: bold;");
        return {
            questions: parsedResult.questions,
            suggestedTitle: parsedResult.suggestedTitle,
            meta: { promptVersion: PROMPT_VERSION, modelName: CONFIG.MODEL_NAME, repaired: true }
        };
    }

    // 如果還是失敗，拋出最後的錯誤
    throw new Error("AI 輸出格式持續異常，自動修復失敗。請嘗試減少題目數量或簡化內容。");
}
