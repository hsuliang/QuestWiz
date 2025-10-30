/**
 * 安全地為一個元素新增事件監聽器
 */
export function addSafeEventListener(element, event, handler, elementName) {
    if (element) {
        element.addEventListener(event, handler);
    } else {
        console.error(`無法綁定事件：找不到元素 "${elementName || 'unknown'}"`);
    }
}

/**
 * 防抖函式：延遲函式執行，避免頻繁觸發
 * @param {Function} func - 要執行的函式
 * @param {number} delay - 延遲時間 (毫秒)
 * @returns {Function}
 */
export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

/**
 * 檢查文字是否主要為英文
 * @param {string} text - 要檢查的文字
 * @returns {boolean}
 */
export function isEnglish(text) {
    if (!text || text.length < 20) return false; 
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    const ratio = englishChars / text.length;
    return ratio > 0.7;
}

/**
 * 檢查「自動出題」設定是否啟用
 * @returns {boolean}
 */
export function isAutoGenerateEnabled() {
    const setting = localStorage.getItem('quizGenAutoGenerate_v1');
    return setting === null ? true : setting === 'true'; // 預設為啟用
}