import { CONFIG } from './config.js';
import { showToast, stopKeyTimer } from './ui.js';

const studentLevelSelect = document.getElementById('student-level-select');
const formatSelect = document.getElementById('format-select');

/**
 * 新增：帶有重試機制的 Fetch 函式
 * @param {string} url - 請求的 URL
 * @param {object} options - Fetch 的設定選項
 * @param {number} retries - 最大重試次數
 * @param {number} delay - 初始延遲時間 (毫秒)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, retries = 3, delay = 2000) {
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
           showToast('API Key 已過期，請重新輸入。', 'error');
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
    if (!apiKey) throw new Error("API Key not available.");

    const apiUrl = `${CONFIG.API_URL}${apiKey}`;
    const selectedFormat = formatSelect ? formatSelect.value : '';
    const needsExplanation = selectedFormat === 'loilonote' || selectedFormat === 'wayground';

    const studentGradeText = studentLevelSelect.options[studentLevelSelect.selectedIndex].text;

    // ... (buildPrompt 和 jsonSchema 邏輯保持不變)
    const buildPrompt = (coreTask) => {
        const baseIntro = `你是一位精通「素養導向評量」的教育專家。你的任務是為「${studentGradeText}」程度的學生，根據使用者提供的文本和圖片來設計評量題目。`;
        const baseFormatRequirement = "你必須嚴格遵守JSON格式，絕不輸出JSON以外的任何文字。";

        let competencyPromptPart = `你的任務是生成「素養導向型」的題目。請務必遵循以下的【素養導向評量核心設計指南】來進行設計：
        【素養導向評量核心設計指南】
        1.  **情境真實性與脈絡化**: 題目必須建立在有意義、貼近真實生活或學術探究的情境之上。避免為了考試而設計的虛假情境。
        2.  **整合運用能力**: 評量重點應放在學生是否能整合知識、技能與態度來解決問題。題目應盡可能跨越單一知識點，著重評量學生的分析、比較、評鑑、創造等更高層次的思維能力。
        3.  **任務導向**: 將題目設計成一個需要學生完成的「任務」。學生需要運用學科知識和能力來分析情境、處理資訊，而不僅僅是回憶事實。
        `;

        if (questionStyle === 'competency-based') {
             competencyPromptPart += `\n4.  **設計理念說明**: 針對每一題，你還必須提供一個名為 'design_concept' 的欄位，用20-40字的繁體中文簡要說明該題的「設計理念」，解釋它如何體現上述指南中的原則（例如：此題旨在評量學生在真實情境中分析圖表並解決問題的能力）。`;
        }

        const langInstruction = languageChoice === 'english'
            ? 'All generated content, including questions, options, and explanations, must be in English.'
            : '所有生成的內容，包含題目、選項、解析，都必須是繁體中文。';

        const finalPrompt = questionStyle === 'competency-based'
            ? `${baseIntro} ${competencyPromptPart}\n\n現在，請開始執行你的任務：${coreTask} ${langInstruction} ${baseFormatRequirement}`
            : `${baseIntro} ${coreTask} ${langInstruction} ${baseFormatRequirement}`;

        return finalPrompt;
    };

    let jsonSchema;
    const mcProperties = { text: { type: "string" }, options: { type: "array", items: { type: "string" } }, correct: { type: "array", items: { type: "number" } }, time: { type: "number", "default": 30 } };
    let mcRequired = ["text", "options", "correct"];
    if (needsExplanation) { mcProperties.explanation = { type: "string" }; mcRequired.push("explanation"); }
    if (questionStyle === 'competency-based') { mcProperties.design_concept = { type: "string" }; }

    let coreTask;
    switch(questionType) {
        case 'true_false':
            const tfProperties = { text: { type: "string" }, is_correct: { type: "boolean" } };
            let tfRequired = ["text", "is_correct"];
            if (needsExplanation) { tfProperties.explanation = { type: "string" }; tfRequired.push("explanation"); }
            if (questionStyle === 'competency-based') { tfProperties.design_concept = { type: "string" }; }
            coreTask = `生成${questionsInBatch}題${difficulty}難度的「是非題」。每個物件必須包含一個題目陳述(text)和一個布林值(is_correct)表示該陳述是否正確。`;
            if (needsExplanation) { coreTask = `生成${questionsInBatch}題${difficulty}難度的「是非題」。每個物件必須包含一個題目陳述(text)、一個布林值(is_correct)，以及一個針對答案的簡短說明(explanation)。`; }
            jsonSchema = { type: "array", items: { type: "object", properties: tfProperties, required: tfRequired }};
            break;
        case 'mixed':
             coreTask = `生成${questionsInBatch}題${difficulty}難度的「選擇題」與「是非題」混合題組。是非題請用 ["是", "否"] 或 ["True", "False"] 作為選項，選擇題請提供4個選項。每題都必須有清楚標示的正確答案（索引值從0開始）。`;
             if(needsExplanation){ coreTask = `生成${questionsInBatch}題${difficulty}難度的「選擇題」與「是非題」混合題組。是非題請用 ["是", "否"] 或 ["True", "False"] 作為選項，選擇題請提供4個選項。每題都必須有清楚標示的正確答案（索引值從0開始），並針對正確答案提供簡短的說明(explanation)。`; }
             jsonSchema = { type: "array", items: { type: "object", properties: mcProperties, required: mcRequired }};
            break;
        case 'multiple_choice':
        default:
            coreTask = `生成${questionsInBatch}題${difficulty}難度的「選擇題」。每題必須有4個選項，並清楚標示哪一個是正確答案（索引值從0開始）。`;
             if(needsExplanation){ coreTask = `生成${questionsInBatch}題${difficulty}難度的「選擇題」。每題必須有4個選項、清楚標示哪一個是正確答案（索引值從0開始），並針對正確答案提供簡短的說明(explanation)。`; }
             jsonSchema = { type: "array", items: { type: "object", properties: mcProperties, required: mcRequired }};
            break;
    }


    const systemPromptText = buildPrompt(coreTask);
    const parts = [{ text: "請根據以下提供的文字和圖片內容出題。" }];
    if(text.trim()){ parts.push({ text: `文字內容:\n${text}`}); }
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
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload), 
        signal 
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: { message: '無法讀取錯誤內容' } }));
        throw new Error(`API 請求失敗: ${response.status} - ${errorBody.error.message}`);
    }
    const result = await response.json();
    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) throw new Error('API 回應格式錯誤，請嘗試減少題目數量或調整內容後再試。');

    let parsedJson;
    try {
        parsedJson = JSON.parse(jsonText);
    } catch (e) {
        console.error("解析 JSON 失敗:", jsonText);
        throw new Error('API 回應了無效的 JSON 格式，請嘗試減少題目數量。');
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
