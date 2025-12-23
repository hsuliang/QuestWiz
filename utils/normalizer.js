import { BLOOM_LEVELS } from '../constants.js';

/**
 * 1. 驗證題目原始格式 (不修改資料，僅判斷是否合格)
 */
export function validateQuestion(q) {
    if (!q || typeof q !== 'object') return false;
    const hasText = !!(q.text && String(q.text).trim());
    const hasOptions = Array.isArray(q.options) && q.options.length >= 2;
    return hasText && hasOptions;
}

/**
 * 2. 基礎資料清洗 (型別轉化與修剪)
 */
export function normalizeQuestion(q) {
    return {
        text: String(q.text || '').trim(),
        options: Array.isArray(q.options) ? q.options.map(opt => String(opt).trim()) : [],
        correct: Array.isArray(q.correct) 
            ? q.correct.map(v => parseInt(v, 10)).filter(v => !isNaN(v)) 
            : (q.hasOwnProperty('correct') ? [parseInt(q.correct, 10)] : []),
        bloomLevel: q.bloomLevel || '',
        explanation: String(q.explanation || '').trim(),
        design_concept: String(q.design_concept || '').trim(),
        time: parseInt(q.time, 10) || 30
    };
}

/**
 * 3. 補全缺失欄位 (Fallbacks)
 */
export function applyFallbacks(q, fallbackLevel = BLOOM_LEVELS.UNDERSTAND) {
    const result = { ...q };
    
    if (!result.text) result.text = '（題目內容缺失）';
    
    // 補齊選項 (至少 4 個)
    const defaultLabels = ['選項 A', '選項 B', '選項 C', '選項 D'];
    if (result.options.length < 4) {
        while (result.options.length < 4) {
            result.options.push(defaultLabels[result.options.length] || `選項 ${result.options.length + 1}`);
        }
    }

    if (result.correct.length === 0) result.correct = [0];
    if (!result.bloomLevel) result.bloomLevel = fallbackLevel;
    
    return result;
}

/**
 * 組合技：將原始資料轉為可用資料
 */
export function processQuestion(q, fallbackLevel) {
    const cleaned = normalizeQuestion(q);
    return applyFallbacks(cleaned, fallbackLevel);
}

export function normalizeQuestions(questions, fallbackLevel) {
    if (!Array.isArray(questions)) return [];
    return questions.map(q => processQuestion(q, fallbackLevel));
}
