import { BLOOM_LEVELS } from '../constants.js';

export function validateQuestion(q) {
    if (!q || typeof q !== 'object') return false;
    const hasText = !!(q.text && String(q.text).trim());
    const hasOptions = Array.isArray(q.options) && q.options.length >= 2;
    return hasText && hasOptions;
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
    
    // 修正：只有在選項數不是 2 (是非題) 且小於 4 時才補齊
    if (result.options.length !== 2 && result.options.length < 4) {
        const defaultLabels = ['選項 A', '選項 B', '選項 C', '選項 D'];
        while (result.options.length < 4) {
            result.options.push(defaultLabels[result.options.length] || `選項 ${result.options.length + 1}`);
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
