import { CONFIG } from './config.js';
import * as ui from './ui.js';
import * as utils from './utils.js';
import * as state from './state.js';
import { elements } from './dom.js';

// Import refactored handlers
import * as IOHandlers from './handlers/io.js';
import * as GenHandlers from './handlers/generator.js';
import * as ContentHandlers from './handlers/content.js';
import * as LibHandlers from './handlers/library.js';
import * as SessionHandlers from './handlers/session.js';

document.addEventListener('DOMContentLoaded', () => {
    // Admin Mode Check
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
        state.setAdminMode(true);
        console.log('%c[Admin Mode Enabled]', 'color: #ff4500; font-weight: bold;');
    }

    // UI Initialization
    ui.populateVersionHistory();
    ui.populateDropdowns();
    ui.applyLayoutPreference();
    ui.applyThemePreference();
    ui.initLanguage();
    ui.updateVisitorCount();

    // API Key Initialization
    const keyDataString = sessionStorage.getItem('gemini_api_key_data');
    if (keyDataString) {
        const keyData = JSON.parse(keyDataString);
        if (new Date().getTime() < keyData.expires) {
            if (elements.apiKeyInput) elements.apiKeyInput.value = keyData.value;
            ui.startKeyTimer(keyData.expires);
        } else {
            sessionStorage.removeItem('gemini_api_key_data');
        }
    }
    
    // Draft & Auto-Save
    SessionHandlers.restoreDraft();
    SessionHandlers.bindAutoSave();
    SessionHandlers.checkContentAndToggleButton();
    ui.updateRegenerateButtonState();

    // --- Event Listeners ---

    // Main Actions
    utils.addSafeEventListener(elements.regenerateBtn, 'click', GenHandlers.triggerQuestionGeneration, 'regenerateBtn');
    utils.addSafeEventListener(elements.downloadBtn, 'click', IOHandlers.exportFile, 'downloadBtn');
    utils.addSafeEventListener(elements.clearContentBtn, 'click', SessionHandlers.clearAllInputs, 'clearContentBtn');
    utils.addSafeEventListener(elements.resetBtn, 'click', SessionHandlers.clearAllInputs, 'resetBtn');

    // Input Area
    utils.addSafeEventListener(elements.fileInput, 'change', (event) => IOHandlers.handleFile(event.target.files[0]), 'fileInput');
    utils.addSafeEventListener(elements.imageInput, 'change', (event) => IOHandlers.handleImageFiles(event.target.files), 'imageInput');
    utils.addSafeEventListener(elements.textInput, 'input', SessionHandlers.triggerOrUpdate, 'textInput');
    
    // Drag & Drop
    if (elements.textInput) {
        ui.setupDragDrop(elements.textInput, IOHandlers.handleFile, false);
    }
    if (elements.imageDropZone) {
        ui.setupDragDrop(elements.imageDropZone, IOHandlers.handleImageFiles, true);
    }
    
    // AI Content Generation Tab
    utils.addSafeEventListener(elements.generateContentBtn, 'click', ContentHandlers.generateContentFromTopic, 'generateContentBtn');
    utils.addSafeEventListener(elements.extractFromUrlBtn, 'click', ContentHandlers.handleExtractFromUrl, 'extractFromUrlBtn');
    utils.addSafeEventListener(elements.downloadTxtBtn, 'click', ContentHandlers.handleDownloadTxt, 'downloadTxtBtn');
    utils.addSafeEventListener(elements.shareContentBtn, 'click', ContentHandlers.handleShareContent, 'shareContentBtn');
    
    // Prompt Editing
    utils.addSafeEventListener(elements.editPromptBtn, 'click', ContentHandlers.handlePreviewPrompt, 'editPromptBtn');
    utils.addSafeEventListener(elements.closePromptModalBtn, 'click', ui.hidePromptModal, 'closePromptModalBtn');
    utils.addSafeEventListener(elements.copyPromptBtn, 'click', ContentHandlers.handleCopyPrompt, 'copyPromptBtn');
    utils.addSafeEventListener(elements.generateWithEditedPromptBtn, 'click', ContentHandlers.handleGenerateWithEditedPrompt, 'generateWithEditedPromptBtn');

    // AI Content Custom Inputs Toggle
    utils.addSafeEventListener(elements.textTypeSelect, 'change', (e) => {
        if (elements.customTextTypeInput) {
            elements.customTextTypeInput.classList.toggle('hidden', e.target.value !== 'custom');
            if (e.target.value === 'custom') elements.customTextTypeInput.focus();
        }
    }, 'textTypeSelect');

    utils.addSafeEventListener(elements.toneSelect, 'change', (e) => {
        if (elements.customToneInput) {
            elements.customToneInput.classList.toggle('hidden', e.target.value !== 'custom');
            if (e.target.value === 'custom') elements.customToneInput.focus();
        }
    }, 'toneSelect');

    // Settings
    utils.addSafeEventListener(elements.saveApiKeyBtn, 'click', () => {
        if (elements.apiKeyInput) {
            const key = elements.apiKeyInput.value.trim();
            if (key) {
                const expirationTime = new Date().getTime() + (2 * 60 * 60 * 1000);
                sessionStorage.setItem('gemini_api_key_data', JSON.stringify({ value: key, expires: expirationTime }));
                ui.showToast('API Key 已儲存！有效期限 2 小時。', 'success');
                ui.startKeyTimer(expirationTime);
            } else {
                ui.showToast('API Key 不能為空！', 'error');
            }
        }
    }, 'saveApiKeyBtn');

    utils.addSafeEventListener(elements.clearApiKeyBtn, 'click', () => {
        sessionStorage.removeItem('gemini_api_key_data');
        if (elements.apiKeyInput) elements.apiKeyInput.value = '';
        ui.showToast('API Key 已清除。', 'success');
        ui.stopKeyTimer();
    }, 'clearApiKeyBtn');
    
    utils.addSafeEventListener(elements.toggleApiKeyVisibilityBtn, 'click', () => {
        if(elements.apiKeyInput) {
            const isPassword = elements.apiKeyInput.type === 'password';
            elements.apiKeyInput.type = isPassword ? 'text' : 'password';
        }
    }, 'toggleApiKeyVisibilityBtn');

    utils.addSafeEventListener(elements.toggleApiStepsBtn, 'click', () => {
        if (elements.apiStepsContainer && elements.apiStepsArrow) {
            elements.apiStepsContainer.classList.toggle('hidden');
            elements.apiStepsArrow.classList.toggle('rotate-180');
        }
    }, 'toggleApiStepsBtn');

    // Layout & Theme
    utils.addSafeEventListener(elements.layoutToggleBtn, 'click', () => {
        const current = localStorage.getItem('quizGenLayout_v2');
        const next = current === 'reversed' ? 'normal' : 'reversed';
        localStorage.setItem('quizGenLayout_v2', next);
        ui.applyLayoutPreference();
    }, 'layoutToggleBtn');

    if (elements.themeRadios) {
        elements.themeRadios.forEach(radio => {
            utils.addSafeEventListener(radio, 'change', (e) => {
                const theme = e.target.id.replace('theme-', '');
                localStorage.setItem('quizGenTheme_v1', theme);
            }, `theme-${radio.id}`);
        });
    }

    // Community Library
    utils.addSafeEventListener(elements.uploadCommunityBtn, 'click', LibHandlers.handleUploadModalOpen, 'uploadCommunityBtn');
    utils.addSafeEventListener(elements.closeUploadModalBtn, 'click', () => ui.toggleUploadModal(false), 'closeUploadModalBtn');
    utils.addSafeEventListener(elements.uploadModal, 'click', (e) => { if (e.target === elements.uploadModal) ui.toggleUploadModal(false); }, 'uploadModal');
    utils.addSafeEventListener(elements.uploadForm, 'submit', LibHandlers.handleUploadSubmit, 'uploadForm');
    
    [elements.libDomainSelect, elements.libGradeSelect, elements.libIssueSelect, elements.libPublisherSelect].forEach(select => {
        utils.addSafeEventListener(select, 'change', LibHandlers.handleLibraryFilterChange, `lib-filter-${select?.id}`);
    });

    // Modals
    utils.addSafeEventListener(elements.versionBtn, 'click', () => { if(elements.versionModal) elements.versionModal.classList.remove('hidden') }, 'versionBtn');
    utils.addSafeEventListener(elements.closeModalBtn, 'click', () => { if(elements.versionModal) elements.versionModal.classList.add('hidden') }, 'closeModalBtn');
    utils.addSafeEventListener(elements.versionModal, 'click', (e) => { if (e.target === elements.versionModal) elements.versionModal.classList.add('hidden'); }, 'versionModal');
    utils.addSafeEventListener(elements.continueEditingBtn, 'click', ui.hidePostDownloadModal, 'continueEditingBtn');
    utils.addSafeEventListener(elements.clearAndNewBtn, 'click', () => { ui.hidePostDownloadModal(); SessionHandlers.clearAllInputs(); }, 'clearAndNewBtn');
    
    // Share Modal
    utils.addSafeEventListener(elements.closeShareModalBtn, 'click', ui.hideShareModal, 'closeShareModalBtn');
    utils.addSafeEventListener(elements.copyLinkBtn, 'click', ContentHandlers.handleCopyLink, 'copyLinkBtn');

    // Collapsible Sections
    utils.addSafeEventListener(elements.collapseSettingsBtn, 'click', () => {
        if(elements.commonSettingsCard) {
            const isCollapsed = elements.commonSettingsCard.classList.toggle('is-collapsed');
            localStorage.setItem('settingsCollapsed_v1', isCollapsed);
        }
    }, 'collapseSettingsBtn');
    if (elements.commonSettingsCard && localStorage.getItem('settingsCollapsed_v1') === 'true') {
        elements.commonSettingsCard.classList.add('is-collapsed');
    }

    utils.addSafeEventListener(elements.toggleBloomBtn, 'click', () => {
        elements.bloomOptionsContainer.classList.toggle('hidden');
        elements.bloomArrow.classList.toggle('rotate-180');
    }, 'toggleBloomBtn');

    // Mobile FAB
    utils.addSafeEventListener(elements.mobileFab, 'click', () => {
        const isPreview = elements.previewColumn.getBoundingClientRect().top > 100;
        if (isPreview) {
            elements.previewColumn.scrollIntoView({ behavior: 'smooth' });
        } else {
            elements.controlsColumn.scrollIntoView({ behavior: 'smooth' });
        }
    }, 'mobileFab');

    // Tabs
    elements.tabs.settings.buttons.forEach((btn, i) => utils.addSafeEventListener(btn, 'click', () => ui.switchTab('settings', i), `settings-tab-${i}`));
    elements.tabs.input.buttons.forEach((btn, i) => utils.addSafeEventListener(btn, 'click', () => ui.switchTab('input', i), `input-tab-${i}`));
    
    // Work Tabs (Edit vs Library)
    elements.workTabs.buttons.forEach((btn, i) => utils.addSafeEventListener(btn, 'click', () => {
        const tabId = i === 0 ? 'edit' : 'library';
        // Handle UI Switch
        ui.switchWorkTab(tabId);
        // Handle Logic (e.g. refresh library)
        if (tabId === 'library') {
            LibHandlers.refreshLibrary();
        }
    }, `work-tab-${i}`));
    
    // Sync student level selects
    if (elements.studentLevelSelects) {
        elements.studentLevelSelects.forEach(select => {
            if (select) {
                utils.addSafeEventListener(select, 'change', (e) => {
                    const newValue = e.target.value;
                    elements.studentLevelSelects.forEach(s => {
                        if (s && s !== e.target) {
                            s.value = newValue;
                        }
                    });
                }, 'studentLevelSelectSync');
            }
        });
    }
});
