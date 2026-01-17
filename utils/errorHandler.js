// [Refactor] 移除 import，改用依賴注入避免循環引用
// import { showToast } from '../ui.js';

let notifyFn = null;

export function registerNotifier(fn) {
    notifyFn = fn;
}

/**
 * 統一的應用程式錯誤類別
 */
export class AppError extends Error {
    constructor(code, message, detail = null) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.detail = detail;
    }
}

/**
 * 統一的錯誤處理入口
 * @param {Error|AppError|string} error - 錯誤物件或訊息
 * @param {string} context - 發生錯誤的上下文 (例如 'Generator', 'API')
 */
export function handleError(error, context = 'General') {
    const message = error.message || String(error);
    const code = error.code || (error.status) || 'UNKNOWN';

    console.error(`[${context}][${code}] `, error);

    // 人性化轉譯邏輯
    const translatedMessage = translateError(error, message);

    // 統一發送 UI 通知
    if (notifyFn) {
        console.log('[DEBUG] Calling notifyFn with:', translatedMessage);
        notifyFn(translatedMessage, 'error');
    } else {
        console.warn('[ErrorHandler] Notifier not registered. Message:', translatedMessage);
        // Fallback: 嘗試直接 alert (開發階段用)
        // alert(translatedMessage);
    }
}

/**
 * 將技術性錯誤訊息轉譯為人話
 */
function translateError(error, originalMessage) {
    const msg = originalMessage.toLowerCase();
    
    if (msg.includes('abort') || msg.includes('cancel')) {
        return ' 操作已取消。';
    }

    // 3. HTTP 狀態碼判斷 (優先級提高)
    if (originalMessage.includes('429') || msg.includes('too many requests') || msg.includes('exhausted')) {
        return ' AI 暫時忙不過來（額度上限），請稍等 30 秒後再試。';
    }
    if (originalMessage.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('not valid')) {
        return ' API 金鑰無效或已過期，請到「設定」中重新輸入。';
    }
    if (originalMessage.includes('400')) {
        return ' 請求內容有誤，請檢查 API Key 是否正確或輸入文字是否過長。';
    }
    if (originalMessage.includes('500') || originalMessage.includes('503')) {
        return ' AI 伺服器連線不穩，Google 正在修復中，請稍後再重試一次。';
    }

    // 4. 原樣回傳 (如果已經是中文，且沒有命中上述錯誤碼)
    if (/[\u4e00-\u9fa5]/.test(originalMessage)) {
        return originalMessage;
    }

    // 4. 保底訊息
    return `發生了點小狀況：${originalMessage} (請稍後再試)`;
}
