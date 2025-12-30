import { CONFIG } from './config.js';
import { showToast, stopKeyTimer, t } from './ui.js';
import { elements } from './dom.js'; 
import { getQuestionSystemInstruction, getQuestionUserPrompt, PROMPT_VERSION } from './prompts/index.js'; 
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
    if (new Date().getTime() > keyData.expires) {
        sessionStorage.removeItem('gemini_api_key_data');
        stopKeyTimer();
        return null;
    }
    return keyData.value;
}

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

export async function generateSingleBatch(count, type, difficulty, text, images, questionStyle, signal, languageChoice, studentLevel, bloomLevel, keywords = []) {
    // [Update] 將 keywords 傳入系統提示詞產生器
    const bloomDistribution = { [bloomLevel]: count };
    const systemPromptText = getQuestionSystemInstruction(count, type, difficulty, questionStyle, languageChoice, studentLevel, bloomDistribution, keywords);

    // [Prompt Inspector] 聽診器：在出題前將完整指令印在控制台
    console.log("%c[AI API Request] --- System Instruction ---", "color: #6366f1; font-weight: bold;");
    console.log(systemPromptText);
    console.log("%c-------------------------------------------", "color: #6366f1; font-weight: bold;");

    const taskParts = [{ text: "很好。現在請根據學習內容與指定重點生成題目並給予標題。" }];
    if (text.trim()) taskParts.push({ text: `\n---【參考內容】---\n${text}` });
    images.forEach(img => taskParts.push({ inline_data: { mime_type: img.type, data: img.data } }));

    const initialPayload = {
        "systemInstruction": { "parts": [{ "text": systemPromptText }] },
        "contents": [{ "role": "user", "parts": taskParts }],
        "generationConfig": { "temperature": 0.7, "maxOutputTokens": 8192, "responseMimeType": "application/json" }
    };

    let result = await makeGeminiRequest(initialPayload, signal);
    let parsedResult = parseGeminiResponse(result);
    if (!parsedResult.error && parsedResult.questions.length > 0) {
        return { questions: parsedResult.questions, suggestedTitle: parsedResult.suggestedTitle, meta: { promptVersion: PROMPT_VERSION, modelName: CONFIG.MODEL_NAME } };
    }

    const repairPayload = {
        ...initialPayload,
        "contents": [
            ...initialPayload.contents,
            { "role": "model", "parts": [{ "text": parsedResult.rawText || "{}" }] },
            { "role": "user", "parts": [{ "text": "你的輸出並非有效的 JSON 格式。請修正並只輸出純 JSON。" }] }
        ]
    };
    result = await makeGeminiRequest(repairPayload, signal);
    parsedResult = parseGeminiResponse(result);
    if (!parsedResult.error && parsedResult.questions.length > 0) {
        return { questions: parsedResult.questions, suggestedTitle: parsedResult.suggestedTitle, meta: { promptVersion: PROMPT_VERSION, modelName: CONFIG.MODEL_NAME, repaired: true } };
    }
    throw new Error("AI 輸出格式修復失敗。");
}
