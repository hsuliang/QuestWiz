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
    return generatedQuestions;
}

export function setGeneratedQuestions(questions) {
    generatedQuestions = questions;
    saveDraftState(); // 自動儲存題目狀態
}

export function getUploadedImages() {
    return uploadedImages;
}

export function setUploadedImages(images) {
    uploadedImages = images;
    saveDraftState(); // 自動儲存圖片狀態 (注意：圖片 Base64 可能很大，localStorage 有 5MB 限制，需謹慎)
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

/**
 * 儲存當前草稿到 localStorage
 * 包含：題目列表、輸入設定 (由 main.js/handlers.js 傳入或從 DOM 讀取)、圖片 (若不過大)
 */
export function saveDraftState() {
    // 為了避免循環依賴，這裡只儲存 state 內的資料，
    // 輸入框的值建議在 input 事件中獨立儲存，或者由外部呼叫此函式時傳入
    // 這裡我們先實作一個簡單的 debounced save，但需要獲取 DOM 值
    // 由於 state.js 不應依賴 dom.js，我們將儲存邏輯移至 handlers.js 或 utils.js 更合適
    // 但為了狀態一致性，我們可以只儲存 questions 和 images
    
    // 注意：圖片 Base64 可能會超過 localStorage 上限，這裡做個簡單檢查
    let imagesToSave = uploadedImages;
    const totalSize = JSON.stringify(uploadedImages).length;
    if (totalSize > 2 * 1024 * 1024) { // 超過 2MB 就不存圖片
        console.warn('圖片過大，略過草稿儲存');
        imagesToSave = []; 
    }

    const draftData = {
        generatedQuestions,
        uploadedImages: imagesToSave,
        timestamp: Date.now()
    };
    
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
    } catch (e) {
        console.error('草稿儲存失敗 (可能是空間不足):', e);
    }
}

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
