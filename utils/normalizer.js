import { BLOOM_LEVELS } from '../constants.js';

export function validateQuestion(q) {
    if (!q || typeof q !== 'object') return false;
    return !!(q.text && String(q.text).trim());
}

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

export function applyFallbacks(q, fallbackLevel = BLOOM_LEVELS.UNDERSTAND) {
    const result = { ...q };
    if (!result.text) result.text = '（題目內容缺失）';
    
    const tfKeywords = ['是', '否', '正確', '錯誤', 'True', 'False', 'Ｏ', 'Ｘ', 'O', 'X'];
    const isTrueFalse = 
        result.options.some(opt => tfKeywords.includes(opt)) || 
        (result.options.length === 2);

    if (isTrueFalse) {
        // 統一強制轉化為全形 Ｏ, Ｘ
        // 這樣不論 AI 給的是 '是/否' 還是 'O/X'，畫面上一律顯示全形 Ｏ/Ｘ
        result.options = ['Ｏ', 'Ｘ'];
    } else {
        const defaultLabels = ['選項 A', '選項 B', '選項 C', '選項 D'];
        if (result.options.length < 4) {
            while (result.options.length < 4) {
                result.options.push(defaultLabels[result.options.length] || `選項 ${result.options.length + 1}`);
            }
        }
    }

    if (result.correct.length === 0) result.correct = [0];
    if (!result.bloomLevel) result.bloomLevel = fallbackLevel;
    return result;
}

export function processQuestion(q, fallbackLevel) {
    const cleaned = normalizeQuestion(q);
    return applyFallbacks(cleaned, fallbackLevel);
}

export function normalizeQuestions(questions, fallbackLevel) {
    if (!Array.isArray(questions)) return [];
    return questions.map(q => processQuestion(q, fallbackLevel));
}
