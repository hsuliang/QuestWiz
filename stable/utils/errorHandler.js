import { showToast } from '../ui.js';

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
    const isAppError = error instanceof AppError;
    const code = isAppError ? error.code : 'UNKNOWN_ERROR';
    const message = error.message || String(error);

    console.error(`[${context}][${code}] `, error);

    // 統一發送 UI 通知
    showToast(message, 'error');
}
