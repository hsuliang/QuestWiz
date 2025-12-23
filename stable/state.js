// --- 狀態管理模組 ---
// 負責管理應用程式的全域狀態，例如生成的題目、上傳的圖片、計時器 ID 等

let generatedQuestions = [];
let uploadedImages = [];
let keyTimerInterval = null;
let currentRequestController = null; // 用於儲存當前 API 請求的 AbortController
let sortableInstance = null; // 用於儲存 SortableJS 實例
let isAdmin = false; // [新增] 管理員模式旗標

// --- Getter / Setter ---

export function getGeneratedQuestions() {
    return [...generatedQuestions];
}

export function updateGeneratedQuestions(updater) {
  if (typeof updater !== 'function') {
    throw new Error('updateGeneratedQuestions requires a function');
  }

  const next = updater([...generatedQuestions]);
  if (!Array.isArray(next)) {
    throw new Error('GeneratedQuestions must be an array');
  }

  generatedQuestions = next;
  saveDraftState();
}

export function setGeneratedQuestions(questions) {
    generatedQuestions = questions;
    saveDraftState();
}

export function getUploadedImages() {
    return uploadedImages.map(img => ({ ...img }));
}

export function setUploadedImages(images) {
    uploadedImages = images;
    saveDraftState();
}

export function getKeyTimerInterval() {
    return keyTimerInterval;
}

export function setKeyTimerInterval(intervalId) {
    keyTimerInterval = intervalId;
}

export function getCurrentRequestController() {
    return currentRequestController;
}

export function setCurrentRequestController(controller) {
    currentRequestController = controller;
}

export function getSortableInstance() {
    return sortableInstance;
}

export function setSortableInstance(instance) {
    sortableInstance = instance;
}

export function setAdminMode(status) {
    isAdmin = !!status; // 確保是布林值
}

export function isAdminMode() {
    return isAdmin;
}

// --- 草稿儲存邏輯 ---

const DRAFT_KEY = 'questwiz_draft_v1';
let saveTimeout = null;

/**
 * 實際執行儲存的內部函式
 */
function performSave() {
    // 注意：圖片 Base64 可能會超過 localStorage 上限，這裡做個簡單檢查
    let imagesToSave = uploadedImages;
    try {
        const imagesSize = JSON.stringify(uploadedImages).length;
        if (imagesSize > 2 * 1024 * 1024) { // 超過 2MB 就不存圖片
            console.warn('圖片過大，略過草稿儲存');
            imagesToSave = []; 
        }

        const draftData = {
            generatedQuestions,
            uploadedImages: imagesToSave,
            timestamp: Date.now()
        };
        
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
        // console.log('Draft saved successfully');
    } catch (e) {
        console.error('草稿儲存失敗 (可能是空間不足):', e);
    }
}

/**
 * 儲存當前草稿到 localStorage (防抖動版本)
 * 頻繁呼叫時會延遲執行，優化效能
 */
export function saveDraftState() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        performSave();
        saveTimeout = null;
    }, 500); // 延遲 500ms 執行
}

/**
 * 立即執行儲存 (忽略防抖動)
 * 用於關鍵操作或視窗關閉前
 */
export function saveDraftStateImmediately() {
    if (saveTimeout) clearTimeout(saveTimeout);
    performSave();
}

// 監聽視窗關閉事件，確保最後一刻有存檔
window.addEventListener('beforeunload', () => {
    saveDraftStateImmediately();
});

export function loadDraftState() {
    try {
        const draftString = localStorage.getItem(DRAFT_KEY);
        if (!draftString) return null;
        return JSON.parse(draftString);
    } catch (e) {
        console.error('草稿讀取失敗:', e);
        return null;
    }
}

export function clearDraftState() {
    localStorage.removeItem(DRAFT_KEY);
}
