import { CONFIG } from './config.js';
import { showToast, stopKeyTimer } from './ui.js';

const studentLevelSelect = document.getElementById('student-level-select');
const formatSelect = document.getElementById('format-select');

/**
 * 帶有重試機制的 Fetch 函式
 */
export async function fetchWithRetry(url, options, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 503 && i < retries - 1) {
                console.warn(`Attempt ${i + 1} failed with 503. Retrying in ${delay / 1000}s...`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
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

    const apiUrl = CONFIG.API_URL;
    const selectedFormat = formatSelect ? formatSelect.value : '';
    const needsExplanation = selectedFormat === 'loilonote' || selectedFormat === 'wayground';
    const studentGradeText = studentLevelSelect.options[studentLevelSelect.selectedIndex].text;
    const langText = languageChoice === 'english' ? 'English' : '繁體中文';

    const rulesInstruction = `
        你是一位為「${studentGradeText}」學生設計高品質評量題目的頂尖教育專家。
        你的所有輸出都必須是、也只能是一段格式完全正確的 JSON 陣列。
        絕對不要包含任何 JSON 陣列以外的文字、說明、註解或 Markdown 的 \`\`\`json ... \`\`\` 標籤。
        語言必須是${langText}。

        你必須生成以下幾種類型的題目：
        1.  **選擇題 (multiple_choice)**: 格式必須是 {"text": "題目", "options": ["選項A", "選項B", "選項C", "選項D"], "correct": [索引值]}。options 陣列必須剛好有 4 個字串。
        2.  **是非題 (true_false)**: 格式必須是 {"text": "題目", "is_correct": 布林值}。
        
        ${questionStyle === 'competency-based' ? `
        3. **素養導向**: 所有題目都必須是情境化的素養題，並額外包含一個 'design_concept' 欄位，用20-40字簡要說明設計理念。
        ` : ''}
        ${needsExplanation ? `
        4. **包含說明**: 所有題目都必須額外包含一個 'explanation' 欄位，提供簡短的答案說明。
        ` : ''}

        你是否完全理解並會嚴格遵守以上所有規則？
    `;

    let taskInstructionText = `很好。現在請根據我提供的【學習內容】，生成 ${questionsInBatch} 題${difficulty}難度的`;

    switch (questionType) {
        case 'true_false':
            taskInstructionText += "「是非題」。";
            break;
        case 'mixed':
            taskInstructionText += "「選擇題」與「是非題」混合題組。";
            break;
        case 'multiple_choice':
        default:
            taskInstructionText += "「選擇題」。";
            break;
    }

    const taskParts = [{ text: taskInstructionText }];
    if (text.trim()) {
        taskParts.push({ text: `\n---【學習內容】---\n${text}` });
    }
    images.forEach(img => {
        taskParts.push({ inline_data: { mime_type: img.type, data: img.data } });
    });

    const payload = {
        "contents": [
            { "role": "user", "parts": [{ "text": rulesInstruction }] },
            { "role": "model", "parts": [{ "text": "是的，我完全理解並會嚴格遵守以上所有規則。" }] },
            { "role": "user", "parts": taskParts }
        ]
    };

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
        throw new Error(`API 請求失敗: ${response.status} - ${errorBody.error.message}`);
    }
    const result = await response.json();
    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) throw new Error('API 回應格式錯誤，請嘗試減少題目數量或調整內容後再試。');

    let parsedJson;
    try {
        const cleanedJsonText = jsonText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
        parsedJson = JSON.parse(cleanedJsonText);
    } catch (e) {
        console.error("解析 JSON 失敗，原始文字:", jsonText);
        throw new Error('API 回應了無效的 JSON 格式，請嘗試減少題目數量。');
    }

    // --- 【最終修正】修正正規化邏輯，只在 AI 真的回傳 is_correct 時才添加該屬性 ---
    return parsedJson.map(q => {
        const normalizedQuestion = {
            text: q.text || q.question || '',
            options: q.options || [],
            correct: q.correct || [],
            explanation: q.explanation || '',
            design_concept: q.design_concept || ''
        };

        // 只有當原始資料中明確存在 is_correct 屬性時，才將其加入到正規化後的物件中
        if (q.hasOwnProperty('is_correct')) {
            normalizedQuestion.is_correct = q.is_correct;
        }

        if (Array.isArray(normalizedQuestion.options)) {
            while (normalizedQuestion.options.length < 4) {
                normalizedQuestion.options.push("");
            }
        }
        return normalizedQuestion;
    });
}