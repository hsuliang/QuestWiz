import { STORAGE_KEYS } from './constants.js';
import { ReactiveStore } from './utils/reactive.js';

// --- 狀態管理模組 (v10.0 Reactive Edition) ---

// 1. 初始化響應式核心
const store = new ReactiveStore({
    generatedQuestions: [],
    uploadedImages: [],
    selectedKeywords: [],
    quizSummary: null, // [New] 測驗摘要資訊
    // UI 狀態 (原本分散在各處，現在統一管理)
    uiRefreshTrigger: 0 
});

// 2. 對外暴露的狀態 (Proxy)
const state = store.get();

// 3. 訂閱介面 (讓 View 層使用)
export function subscribe(callback) {
    return store.subscribe(callback);
}

// --- Request State (Non-Reactive, for logic control) ---
export const requestState = {
    activeTasks: new Map(),
    keyTimerInterval: null,
    sortableInstance: null
};

export const appState = {
    isAdmin: false
};

// --- Quiz Summary Management ---
export function getQuizSummary() { return state.quizSummary; }
export function setQuizSummary(summary) { state.quizSummary = summary; }

// --- Keywords Management ---
export function getSelectedKeywords() { return [...state.selectedKeywords]; }
export function setSelectedKeywords(keywords) { state.selectedKeywords = keywords; saveDraftState(); }
export function toggleKeyword(keyword) {
    const list = [...state.selectedKeywords];
    const index = list.indexOf(keyword);
    if (index === -1) list.push(keyword);
    else list.splice(index, 1);
    state.selectedKeywords = list; // 這會觸發 notify
    saveDraftState();
}

// --- Task Management ---
export function startTask(taskName) {
    if (requestState.activeTasks.has(taskName)) {
        const oldTask = requestState.activeTasks.get(taskName);
        if (oldTask.controller) oldTask.controller.abort();
    }
    const requestId = Date.now();
    const controller = new AbortController();
    requestState.activeTasks.set(taskName, { id: requestId, controller: controller });
    return { requestId, signal: controller.signal };
}

export function endTask(taskName) { requestState.activeTasks.delete(taskName); }
export function isTaskValid(taskName, requestId) {
    const current = requestState.activeTasks.get(taskName);
    return current && current.id === requestId;
}
export function isBusy(taskName) { return requestState.activeTasks.has(taskName); }

// --- Questions Getter / Setter (Adapter Layer) ---
export function getGeneratedQuestions() { return [...state.generatedQuestions]; }

export function setGeneratedQuestions(questions) { 
    state.generatedQuestions = questions; // 自動觸發通知
    saveDraftState(); 
}

export function updateGeneratedQuestions(updater) {
    if (typeof updater !== 'function') throw new Error('updateGeneratedQuestions requires a function');
    const next = updater([...state.generatedQuestions]);
    state.generatedQuestions = next; // 自動觸發通知
    saveDraftState();
}

export function getUploadedImages() { return state.uploadedImages.map(img => ({ ...img })); }
export function setUploadedImages(images) { state.uploadedImages = images; saveDraftState(); }

// --- UI Sync Helper ---
// 用來強制觸發 UI 更新 (給那些還沒完全遷移的邏輯使用)
export function triggerUIUpdate() {
    state.uiRefreshTrigger = Date.now();
}

// --- UI State Getters ---
export function getKeyTimerInterval() { return requestState.keyTimerInterval; }
export function setKeyTimerInterval(id) { requestState.keyTimerInterval = id; }
export function getCurrentRequestController() {
    const tasks = Array.from(requestState.activeTasks.values());
    return tasks.length > 0 ? tasks[tasks.length - 1].controller : null;
}
export function getSortableInstance() { return requestState.sortableInstance; }
export function setSortableInstance(ins) { requestState.sortableInstance = ins; }
export function setAdminMode(status) { appState.isAdmin = !!status; }
export function isAdminMode() { return appState.isAdmin; }

// --- Draft Storage ---
let saveTimeout = null;
function performSave() {
    try {
        const draftData = { 
            generatedQuestions: state.generatedQuestions, 
            uploadedImages: state.uploadedImages, 
            selectedKeywords: state.selectedKeywords,
            timestamp: Date.now() 
        };
        localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify(draftData));
    } catch (e) { console.error('草稿儲存失敗:', e); }
}
export function saveDraftState() {
    if (saveTimeout) clearTimeout(saveTimeout); 
    saveTimeout = setTimeout(() => { performSave(); saveTimeout = null; }, 500);
}
export function saveDraftStateImmediately() { if (saveTimeout) clearTimeout(saveTimeout); performSave(); }
if (typeof window !== 'undefined') { window.addEventListener('beforeunload', () => { saveDraftStateImmediately(); }); }
export function loadDraftState() {
    try {
        const draftString = localStorage.getItem(STORAGE_KEYS.DRAFT);
        if (!draftString) return null;
        return JSON.parse(draftString);
    } catch (e) { return null; }
}
export function clearDraftState() { localStorage.removeItem(STORAGE_KEYS.DRAFT); }
