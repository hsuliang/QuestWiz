import * as state from '../state.js';

/**
 * 刪除指定索引的題目
 * @param {number} index - 題目在陣列中的索引
 */
export function deleteQuestion(index) {
    state.updateGeneratedQuestions(prev => {
        const next = [...prev];
        next.splice(index, 1);
        return next;
    });
}

/**
 * 複製指定索引的題目並插入到下一位置
 * @param {number} index - 題目在陣列中的索引
 */
export function copyQuestion(index) {
    state.updateGeneratedQuestions(prev => {
        const next = [...prev];
        const questionToCopy = JSON.parse(JSON.stringify(next[index]));
        next.splice(index + 1, 0, questionToCopy);
        return next;
    });
}

/**
 * 更新題目特定欄位 (如 text)
 * @param {number} index - 題目索引
 * @param {string} field - 欄位名稱
 * @param {any} value - 新值
 */
export function updateQuestionField(index, field, value) {
    state.updateGeneratedQuestions(prev => {
        const next = [...prev];
        // 淺拷貝該題物件以觸發變更
        next[index] = { ...next[index], [field]: value };
        return next;
    });
}

/**
 * 更新題目選項
 * @param {number} index - 題目索引
 * @param {number} optIndex - 選項索引
 * @param {string} value - 新選項文字
 */
export function updateOption(index, optIndex, value) {
    state.updateGeneratedQuestions(prev => {
        const next = [...prev];
        const newOptions = [...next[index].options];
        newOptions[optIndex] = value;
        next[index] = { ...next[index], options: newOptions };
        return next;
    });
}

/**
 * 更新正確答案
 * @param {number} index - 題目索引
 * @param {Array<number>} correctArray - 正確選項的索引陣列
 */
export function updateCorrectAnswer(index, correctArray) {
    state.updateGeneratedQuestions(prev => {
        const next = [...prev];
        next[index] = { ...next[index], correct: correctArray };
        return next;
    });
}