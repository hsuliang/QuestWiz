/**
 * 資料正規化與清洗模組
 * 負責確保進入 State 的題目資料結構一致且正確
 */

/**
 * 正規化單一題目物件
 * @param {Object} q - 原始題目物件
 * @param {string} fallbackLevel - 預設的認知層次
 * @returns {Object} - 完美的題目物件
 */
export function normalizeQuestion(q, fallbackLevel = 'understand') {
    // 1. 處理正確答案 (統一轉為 number[])
    let normalizedCorrect = [];
    if (Array.isArray(q.correct)) {
        normalizedCorrect = q.correct.map(v => parseInt(v, 10)).filter(v => !isNaN(v));
    } else if (q.hasOwnProperty('correct') && (typeof q.correct === 'number' || typeof q.correct === 'string')) {
        normalizedCorrect = [parseInt(q.correct, 10)];
    } else if (q.hasOwnProperty('is_correct')) {
        // 容錯是非題格式：若 API 回傳 is_correct (true/false)
        normalizedCorrect = [q.is_correct ? 0 : 1];
    } else {
        normalizedCorrect = [0]; // 最終保底
    }

    // 2. 處理選項 (確保是陣列且補滿 4 個)
    let normalizedOptions = [];
    if (q.hasOwnProperty('is_correct')) {
        // 是非題固定選項
        normalizedOptions = ['是', '否'];
    } else {
        // 選擇題邏輯
        if (Array.isArray(q.options) && q.options.length > 0) {
            normalizedOptions = q.options.map(opt => String(opt));
        } else {
            normalizedOptions = [];
        }
        
        // 自動補齊不足的選項 (至少 4 個)
        const defaultLabels = ['選項 A', '選項 B', '選項 C', '選項 D'];
        while (normalizedOptions.length < 4) {
            normalizedOptions.push(defaultLabels[normalizedOptions.length] || `選項 ${normalizedOptions.length + 1}`);
        }
    }

    // 3. 組裝最終物件
    return {
        text: String(q.text || '（題目內容缺失）').trim(),
        options: normalizedOptions,
        correct: normalizedCorrect,
        bloomLevel: q.bloomLevel || fallbackLevel,
        explanation: String(q.explanation || '').trim(),
        design_concept: String(q.design_concept || '').trim(),
        time: parseInt(q.time, 10) || 30
    };
}

/**
 * 正規化題目陣列
 * @param {Array} questions - 原始題目陣列
 * @param {string} fallbackLevel - 預設的認知層次
 * @returns {Array} - 正規化後的題目陣列
 */
export function normalizeQuestions(questions, fallbackLevel) {
    if (!Array.isArray(questions)) return [];
    return questions.map(q => normalizeQuestion(q, fallbackLevel));
}

/**
 * 驗證題目是否基本合格 (用於決定是否觸發 Retry)
 * @param {Object} q 
 * @returns {boolean}
 */
export function isQuestionValid(q) {
    // 基本要求：有題目文字、有至少兩個選項、有正確答案索引
    return (
        q.text && 
        q.text !== '（題目內容缺失）' && 
        Array.isArray(q.options) && 
        q.options.length >= 2 && 
        Array.isArray(q.correct) && 
        q.correct.length > 0
    );
}
