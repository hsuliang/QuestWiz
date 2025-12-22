import { CONFIG } from './config.js';
import { showToast, stopKeyTimer, t } from './ui.js';
import { elements } from './dom.js'; 
import { getQuestionSystemInstruction, getQuestionUserPrompt } from './prompts.js'; 
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
 * 產生單一批次的題目 (核心出題函數)
 */
export async function generateSingleBatch(count, type, difficulty, text, images, questionStyle, signal, languageChoice, studentLevel, bloomLevel) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error(t('error_api_missing'));

    const apiUrl = `${CONFIG.BASE_URL}/models/${CONFIG.MODEL_NAME}:generateContent`;
    
    // 構建精確的認知層次與題型指令
    const bloomDistribution = { [bloomLevel]: count };
    const systemPromptText = getQuestionSystemInstruction(count, type, difficulty, questionStyle, languageChoice, studentLevel, bloomDistribution);

    const rulesInstruction = `
        你是一位頂尖教育評量專家。
        你的任務是根據提供的【參考內容】，生成 ${count} 題題目。
        
        【重要規範】
        1. 題目分佈：必須嚴格依照指定層次：${bloomLevel} 共 ${count} 題。
        2. 題型要求：${type === 'mixed' ? '混合「選擇題」與「是非題」(比例約各佔一半)' : (type === 'multiple_choice' ? '全部為「選擇題」' : '全部為「是非題」')}。
        3. 難易度：${difficulty}。
        4. 出題風格：${questionStyle === 'competency-based' ? '素養導向' : '知識記憶'}。
        5. 語言：${languageChoice === 'english' ? 'English' : '繁體中文'}。
        
        【JSON 屬性格式】
        - 若為選擇題：必須包含 "options" (四個選項) 和 "correct" (正確選項索引)。
        - 若為是非題：必須包含 "is_correct" (true/false)，且 "options" 設為 ["是", "否"]。
        
        輸出必須是純 JSON 物件：
        {
          "quizTitle": "專業的標題",
          "questions": [
            {
              "text": "題目內容",
              "bloomLevel": "${bloomLevel}",
              "explanation": "詳細解析",
              "design_concept": "設計理念"
              // 根據題型加入 options/correct 或 is_correct
            }
          ]
        }
    `;

    const taskParts = [{ text: "很好。現在請根據學習內容生成題目並給予標題。" }];
    if (text.trim()) taskParts.push({ text: `\n---【參考內容】---\n${text}` });
    images.forEach(img => taskParts.push({ inline_data: { mime_type: img.type, data: img.data } }));

    const payload = {
        "contents": [
            { "role": "user", "parts": [{ "text": rulesInstruction }] },
            { "role": "model", "parts": [{ "text": "是的，我完全理解。我會嚴格依照要求的層次與混合比例生成題目，並根據選擇題或是非題正確配置 is_correct 或 options 屬性。" }] },
            { "role": "user", "parts": taskParts }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json"
        }
    };

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
    
    const result = await response.json();
    let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error(t('error_api_format'));

    let cleanJsonText = rawText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    
    if (cleanJsonText.includes('"questions":') && !cleanJsonText.endsWith('}')) {
        if (!cleanJsonText.endsWith(']')) cleanJsonText += ']';
        else cleanJsonText += '}';
    }

    try {
        const parsed = JSON.parse(cleanJsonText);
        return {
            questions: parsed.questions || [],
            suggestedTitle: parsed.quizTitle || ''
        };
    } catch (e) {
        console.error("JSON 解析失敗:", rawText);
        throw new Error("AI 回傳的資料量過大導致格式受損，請嘗試減少單次題目數量。");
    }
}
