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
 * 檢查「自動出題」設定是否啟用 (已棄用，恆回傳 false)
 * @returns {boolean}
 */
export function isAutoGenerateEnabled() {
    return false;
}

/**
 * 壓縮圖片
 * @param {File} file - 原始圖片檔案
 * @param {number} maxWidth - 最大寬度 (預設 1024px)
 * @param {number} quality - 壓縮品質 (0.1 - 1.0，預設 0.7)
 * @returns {Promise<Blob>} - 回傳壓縮後的 Blob 物件
 */
export function compressImage(file, maxWidth = 1024, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas to Blob conversion failed'));
                    }
                }, file.type, quality);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

/**
 * 解析 Gemini API 錯誤訊息，回傳使用者友善的說明
 * @param {Error|Object} error - 錯誤物件或 API 回傳的錯誤內容
 * @returns {string} - 友善的錯誤訊息
 */
export function parseGeminiError(error) {
    const msg = error.message || JSON.stringify(error);
    
    // 1. 檢查 HTTP Status Code
    if (msg.includes('400')) return "請求內容有誤 (400)：請檢查輸入文字是否過長，或圖片格式是否正確。";
    if (msg.includes('401')) return "驗證失敗 (401)：API Key 可能無效或已過期，請檢查設定。";
    if (msg.includes('403')) return "權限不足 (403)：您的 API Key 可能沒有權限，或所在地區不支援。";
    if (msg.includes('429')) return "額度用盡 (429)：API 呼叫次數過多，請稍後再試或更換 API Key。";
    if (msg.includes('500') || msg.includes('503')) return "伺服器忙碌中 (503)：Google AI 暫時無法回應，請稍待片刻再試。";

    // 2. 檢查安全性攔截 (Safety Ratings)
    if (msg.includes('SAFETY') || msg.includes('BLOCKED')) {
        return "內容被攔截：輸入的文字或圖片可能包含敏感或不安全的內容，AI 拒絕生成。";
    }

    // 3. 檢查解析錯誤
    if (msg.includes('JSON')) {
        return "格式解析錯誤：AI 生成的內容格式不正確，請嘗試減少題目數量或簡化內容。";
    }

    // 4. 網路錯誤
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        return "網路連線失敗：請檢查您的網路連線是否正常。";
    }

    // 5. 預設錯誤
    console.warn("未知的 API 錯誤:", error);
    return `發生未預期的錯誤：${msg.slice(0, 50)}... (請查看控制台以獲取更多資訊)`;
}
