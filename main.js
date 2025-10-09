import { CONFIG } from './config.js';
import * as ui from './ui.js';
import * as handlers from './handlers.js';
import * as utils from './utils.js';
import { getApiKey } from './api.js';
import * as state from './state.js';

// --- DOM 元素 (用於綁定) ---
const mainContainer = document.getElementById('main-container');
const textInput = document.getElementById('text-input');
const fileInput = document.getElementById('file-input');
const imageInput = document.getElementById('image-input');
const numQuestionsInput = document.getElementById('num-questions');
const formatSelect = document.getElementById('format-select');
const versionBtn = document.getElementById('version-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const versionModal = document.getElementById('version-modal');
const postDownloadModal = document.getElementById('post-download-modal');
const continueEditingBtn = document.getElementById('continue-editing-btn');
const clearAndNewBtn = document.getElementById('clear-and-new-btn');
const questionTypeSelect = document.getElementById('question-type-select');
const difficultySelect = document.getElementById('difficulty-select');
const copyContentBtn = document.getElementById('copy-content-btn');
const clearContentBtn = document.getElementById('clear-content-btn');
const questionStyleSelect = document.getElementById('question-style-select');
const studentLevelSelect = document.getElementById('student-level-select');
const layoutToggleBtn = document.getElementById('layout-toggle-btn');
const themeRadios = document.querySelectorAll('input[name="theme"]');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const clearApiKeyBtn = document.getElementById('clear-api-key-btn');
const autoGenerateToggle = document.getElementById('auto-generate-toggle');
const commonSettingsCard = document.getElementById('common-settings-card');
const collapseSettingsBtn = document.getElementById('collapse-settings-btn');
const settingsTabs = {
    buttons: [ document.getElementById('settings-tab-api'), document.getElementById('settings-tab-level'), document.getElementById('settings-tab-mode'), document.getElementById('settings-tab-theme'), document.getElementById('settings-tab-layout')],
    contents: [ document.getElementById('settings-content-api'), document.getElementById('settings-content-level'), document.getElementById('settings-content-mode'), document.getElementById('settings-content-theme'), document.getElementById('settings-content-layout')]
};
const tabText = document.getElementById('tab-text');
const tabImage = document.getElementById('tab-image');
const tabAi = document.getElementById('tab-ai');
const contentText = document.getElementById('content-text');
const contentImage = document.getElementById('content-image');
const contentAi = document.getElementById('content-ai');
const generateContentBtn = document.getElementById('generate-content-btn');
const generateFromImagesBtn = document.getElementById('generate-from-images-btn');
const downloadBtn = document.getElementById('download-btn');
const regenerateBtn = document.getElementById('regenerate-btn');
const imageDropZone = document.getElementById('image-drop-zone');
const inputTabs = [tabText, tabImage, tabAi];
const inputContents = [contentText, contentImage, contentAi];
const controls = [textInput, numQuestionsInput, questionTypeSelect, difficultySelect, questionStyleSelect, studentLevelSelect];


// --- 事件監聽器與初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    // 初始化 UI
    ui.populateVersionHistory();
    ui.applyLayoutPreference();
    ui.applyThemePreference();
    ui.updateVisitorCount();

    // 檢查並恢復 API 金鑰狀態
    const keyDataString = sessionStorage.getItem('gemini_api_key_data');
    if (keyDataString) {
        const keyData = JSON.parse(keyDataString);
        if (new Date().getTime() < keyData.expires) {
            if (apiKeyInput) apiKeyInput.value = keyData.value;
            ui.startKeyTimer(keyData.expires);
        } else {
            sessionStorage.removeItem('gemini_api_key_data');
        }
    }
    
    // 初始化「自動出題」開關
    if (autoGenerateToggle) {
        autoGenerateToggle.checked = utils.isAutoGenerateEnabled();
        if (autoGenerateToggle.checked) {
            controls.forEach(control => utils.addSafeEventListener(control, control.type === 'number' || control.tagName === 'TEXTAREA' ? 'input' : 'change', handlers.debouncedGenerate));
        }
    }
    ui.updateRegenerateButtonState();


    // --- 綁定所有事件監聽器 ---
    utils.addSafeEventListener(generateContentBtn, 'click', handlers.generateContentFromTopic, 'generateContentBtn');
    utils.addSafeEventListener(copyContentBtn, 'click', handlers.copyContentToClipboard, 'copyContentBtn');
    utils.addSafeEventListener(clearContentBtn, 'click', handlers.clearAllInputs, 'clearContentBtn');
    utils.addSafeEventListener(downloadBtn, 'click', handlers.exportFile, 'downloadBtn');
    utils.addSafeEventListener(regenerateBtn, 'click', handlers.triggerQuestionGeneration, 'regenerateBtn');
    utils.addSafeEventListener(generateFromImagesBtn, 'click', handlers.triggerQuestionGeneration, 'generateFromImagesBtn');
    
    utils.addSafeEventListener(fileInput, 'change', (event) => handlers.handleFile(event.target.files[0]), 'fileInput');
    utils.addSafeEventListener(imageInput, 'change', (event) => handlers.handleImageFiles(event.target.files), 'imageInput');
    
    utils.addSafeEventListener(textInput, 'input', ui.updateRegenerateButtonState, 'textInput for button state');

    utils.addSafeEventListener(formatSelect, 'change', () => {
        const newFormat = formatSelect.value;
        const needsExplanation = newFormat === 'loilonote' || newFormat === 'wayground';
        const questions = state.getGeneratedQuestions();
        const hasQuestions = questions.length > 0;
        const missingExplanation = hasQuestions && !questions[0].hasOwnProperty('explanation');

        if (needsExplanation && missingExplanation) {
            ui.showToast('偵測到格式需要題目說明，將為您自動更新...', 'success');
            handlers.triggerQuestionGeneration();
        }
    }, 'formatSelect');

    ui.setupDragDrop(textInput, (file) => handlers.handleFile(file), false);
    ui.setupDragDrop(imageDropZone, handlers.handleImageFiles, true);
    
    // API 金鑰儲存/清除
    utils.addSafeEventListener(saveApiKeyBtn, 'click', () => {
        if (apiKeyInput) {
            const key = apiKeyInput.value.trim();
            if (key) {
                const expirationTime = new Date().getTime() + (2 * 60 * 60 * 1000); // 2 小時
                const keyData = { value: key, expires: expirationTime };
                sessionStorage.setItem('gemini_api_key_data', JSON.stringify(keyData));
                ui.showToast('API Key 已儲存！有效期限 2 小時。', 'success');
                ui.startKeyTimer(expirationTime);
            } else {
                ui.showToast('API Key 不能為空！', 'error');
            }
        }
    }, 'saveApiKeyBtn');

    utils.addSafeEventListener(clearApiKeyBtn, 'click', () => {
        sessionStorage.removeItem('gemini_api_key_data');
        if (apiKeyInput) apiKeyInput.value = '';
        ui.showToast('API Key 已清除。', 'success');
        ui.stopKeyTimer();
    }, 'clearApiKeyBtn');

    // UI 偏好設定
    utils.addSafeEventListener(layoutToggleBtn, 'click', () => {
        if (!mainContainer) return;
        mainContainer.classList.toggle('lg:flex-row-reverse');
        const isReversed = mainContainer.classList.contains('lg:flex-row-reverse');
        localStorage.setItem('quizGenLayout_v2', isReversed ? 'reversed' : 'default');
        const placeholderP = document.querySelector('#preview-placeholder p');
        if (placeholderP) placeholderP.textContent = isReversed ? '請在右側提供內容並設定選項' : '請在左側提供內容並設定選項';
    }, 'layoutToggleBtn');

    utils.addSafeEventListener(autoGenerateToggle, 'change', (e) => {
        const isEnabled = e.target.checked;
        localStorage.setItem('quizGenAutoGenerate_v1', isEnabled);
        controls.forEach(control => {
            const eventType = control.type === 'number' || control.tagName === 'TEXTAREA' ? 'input' : 'change';
            control.removeEventListener(eventType, handlers.debouncedGenerate); // 先移除避免重複綁定
            if (isEnabled) {
                utils.addSafeEventListener(control, eventType, handlers.debouncedGenerate);
            }
        });
        ui.updateRegenerateButtonState();
    }, 'autoGenerateToggle');
    
    if (themeRadios) {
        themeRadios.forEach(radio => {
            utils.addSafeEventListener(radio, 'change', () => {
                if(radio.checked) {
                    localStorage.setItem('quizGenTheme_v1', radio.id.replace('theme-', ''));
                }
            });
        });
    }

    // Tabs
    if (settingsTabs.buttons.length > 0) {
        settingsTabs.buttons.forEach((clickedTab, index) => {
            utils.addSafeEventListener(clickedTab, 'click', () => {
                if(!clickedTab) return;
                settingsTabs.buttons.forEach(tab => tab?.classList.remove('active'));
                settingsTabs.contents.forEach(content => content?.classList.remove('active'));
                clickedTab.classList.add('active');
                if (settingsTabs.contents[index]) {
                    settingsTabs.contents[index].classList.add('active');
                }
            }, `settings-tab-${index}`);
        });
    }

    if (inputTabs && inputContents) {
        inputTabs.forEach((clickedTab, index) => {
            utils.addSafeEventListener(clickedTab, 'click', () => {
                if(!clickedTab) return;
                inputTabs.forEach(tab => { if(tab) { tab.classList.remove('active'); tab.setAttribute('aria-selected', 'false'); }});
                inputContents.forEach(content => { if(content) content.classList.remove('active'); });
                clickedTab.classList.add('active');
                clickedTab.setAttribute('aria-selected', 'true');
                if (inputContents[index]) {
                    inputContents[index].classList.add('active');
                }
                ui.updateRegenerateButtonState();
            }, `input-tab-${index}`);
        });
    }
    
    // 設定區收合
    utils.addSafeEventListener(collapseSettingsBtn, 'click', () => {
        if(commonSettingsCard) {
            const isCollapsed = commonSettingsCard.classList.toggle('is-collapsed');
            localStorage.setItem('settingsCollapsed_v1', isCollapsed);
        }
    }, 'collapseSettingsBtn');

    if (commonSettingsCard && localStorage.getItem('settingsCollapsed_v1') === 'true') {
        commonSettingsCard.classList.add('is-collapsed');
    }
    
    // Modals
    utils.addSafeEventListener(versionBtn, 'click', () => { if(versionModal) versionModal.classList.remove('hidden') }, 'versionBtn');
    utils.addSafeEventListener(closeModalBtn, 'click', () => { if(versionModal) versionModal.classList.add('hidden') }, 'closeModalBtn');
    utils.addSafeEventListener(versionModal, 'click', (event) => { if (event.target === versionModal && versionModal) versionModal.classList.add('hidden'); }, 'versionModal');
    
    utils.addSafeEventListener(continueEditingBtn, 'click', ui.hidePostDownloadModal, 'continueEditingBtn');
    utils.addSafeEventListener(clearAndNewBtn, 'click', () => {
        ui.hidePostDownloadModal();
        handlers.clearAllInputs();
    }, 'clearAndNewBtn');
});