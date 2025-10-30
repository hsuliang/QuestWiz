// --- 全域狀態 ---
export let generatedQuestions = [];
export let sortableInstance = null;
export let uploadedImages = [];
export let currentRequestController = null;
export let keyTimerInterval = null;

// --- 狀態修改函式 (State Modifiers) ---
export function setGeneratedQuestions(newQuestions) {
    generatedQuestions = newQuestions;
}
export function getGeneratedQuestions() {
    return generatedQuestions;
}

export function setSortableInstance(instance) {
    sortableInstance = instance;
}
export function getSortableInstance() {
    return sortableInstance;
}

export function setUploadedImages(images) {
    uploadedImages = images;
}
export function getUploadedImages() {
    return uploadedImages;
}

export function setCurrentRequestController(controller) {
    currentRequestController = controller;
}
export function getCurrentRequestController() {
    return currentRequestController;
}

export function setKeyTimerInterval(interval) {
    keyTimerInterval = interval;
}
export function getKeyTimerInterval() {
    return keyTimerInterval;
}