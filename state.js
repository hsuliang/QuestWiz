import { STORAGE_KEYS } from './constants.js';

// --- 狀態管理模組 (穩定強化版) ---

export const questionState = {
    generatedQuestions: [],
    uploadedImages: []
};

export const requestState = {
    // 追蹤進行中的任務：{ taskName: { id, controller } }
    activeTasks: new Map(),
    keyTimerInterval: null,
    sortableInstance: null
};

export const appState = {
    isAdmin: false
};

/**
 * 開始一個新任務 (自動處理 Abort 與 Busy 標記)
 */
export function startTask(taskName) {
    // 1. 如果舊任務還在跑，先切斷它
    if (requestState.activeTasks.has(taskName)) {
        const oldTask = requestState.activeTasks.get(taskName);
        if (oldTask.controller) oldTask.controller.abort();
    }

    // 2. 建立新任務資訊
    const requestId = Date.now();
    const controller = new AbortController();
    
    requestState.activeTasks.set(taskName, {
        id: requestId,
        controller: controller
    });

    return { requestId, signal: controller.signal };
}

/**
 * 結束一個任務
 */
export function endTask(taskName) {
    requestState.activeTasks.delete(taskName);
}

/**
 * 檢查目前的請求 ID 是否依然有效 (防止舊請求覆蓋新請求)
 */
export function isTaskValid(taskName, requestId) {
    const current = requestState.activeTasks.get(taskName);
    return current && current.id === requestId;
}

export function isBusy(taskName) {
    return requestState.activeTasks.has(taskName);
}

// --- 相容性 Getter / Setter ---

export function getGeneratedQuestions() { return [...questionState.generatedQuestions]; }
export function updateGeneratedQuestions(updater) {
    const next = updater([...questionState.generatedQuestions]);
    questionState.generatedQuestions = next;
    saveDraftState();
}
export function setGeneratedQuestions(questions) { questionState.generatedQuestions = questions; saveDraftState(); }
export function getUploadedImages() { return questionState.uploadedImages.map(img => ({ ...img })); }
export function setUploadedImages(images) { questionState.uploadedImages = images; saveDraftState(); }
export function getKeyTimerInterval() { return requestState.keyTimerInterval; }
export function setKeyTimerInterval(id) { requestState.keyTimerInterval = id; }
export function getCurrentRequestController() {
    // 為了相容，回傳最後一個活動中的 controller
    const tasks = Array.from(requestState.activeTasks.values());
    return tasks.length > 0 ? tasks[tasks.length - 1].controller : null;
}
export function setCurrentRequestController(ctrl) { 
    // 已棄用：改用 startTask 管理
}
export function getSortableInstance() { return requestState.sortableInstance; }
export function setSortableInstance(ins) { requestState.sortableInstance = ins; }
export function setAdminMode(status) { appState.isAdmin = !!status; }
export function isAdminMode() { return appState.isAdmin; }

// --- 草稿儲存邏輯 ---

let saveTimeout = null;
function performSave() {
    try {
        const draftData = { generatedQuestions: questionState.generatedQuestions, uploadedImages: questionState.uploadedImages, timestamp: Date.now() };
        localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify(draftData));
    } catch (e) { console.error('草稿儲存失敗:', e); }
}
export function saveDraftState() {
    if (saveTimeout) clearTimeout(saveTimeout); 
    saveTimeout = setTimeout(() => { performSave(); saveTimeout = null; }, 500);
}
export function saveDraftStateImmediately() {
    if (saveTimeout) clearTimeout(saveTimeout); performSave();
}
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => { saveDraftStateImmediately(); });
}
export function loadDraftState() {
    try {
        const draftString = localStorage.getItem(STORAGE_KEYS.DRAFT);
        if (!draftString) return null;
        return JSON.parse(draftString);
    } catch (e) { return null; }
}
export function clearDraftState() { localStorage.removeItem(STORAGE_KEYS.DRAFT); }
