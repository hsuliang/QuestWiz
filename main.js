import { elements } from './dom.js';
import * as ui from './ui.js';
import * as utils from './utils.js';
import * as state from './state.js';

// Import Handlers
import * as SessionHandlers from './handlers/session.js';
import * as GenHandlers from './handlers/generator.js';
import * as LibHandlers from './handlers/library.js';
import * as ContentHandlers from './handlers/content.js';
import * as AnalyzerHandlers from './handlers/contentAnalyzer.js';
import * as IOHandlers from './handlers/io.js';
import * as EditorHandlers from './handlers/editor.js'; // [New] 確保引入編輯器邏輯
import { refreshUI } from './view/sync.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('[main.js] Initializing App (V10.2 Final Fix)...');

    // 定義編輯器回呼函式 (修復按鈕失效的關鍵)
    const editorCallbacks = {
        onUpdateField: (index, field, value) => EditorHandlers.updateQuestionField(index, field, value),
        onUpdateOption: (index, optIndex, value) => EditorHandlers.updateOption(index, optIndex, value),
        onUpdateCorrect: (index, correctArr) => EditorHandlers.updateCorrectAnswer(index, correctArr),
        onDelete: (index) => {
            EditorHandlers.deleteQuestion(index);
            // 刪除後強制重繪 (雖然 state 會觸發，但這樣更保險)
        },
        onCopy: (index) => {
            EditorHandlers.copyQuestion(index);
            ui.showToast('題目已複製', 'success');
        }
    };

    // --- [核心] 響應式 UI 綁定 ---
    if (state.subscribe) {
        state.subscribe((key, value) => {
            if (key === 'generatedQuestions') {
                const isGenerating = state.isBusy('generate');
                const activeEl = document.activeElement;
                const isEditing = activeEl && activeEl.closest('#questions-container') && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
                
                // 正在生成或非編輯狀態 -> 強制更新畫面
                if (isGenerating || !isEditing) {
                    console.log(`[Reactive] Rendering questions. Generating: ${isGenerating}, Editing: ${isEditing}`);
                    // [Fix] 傳入 editorCallbacks，確保事件綁定正確
                    ui.renderQuestionsForEditing(value || [], editorCallbacks);
                    ui.initializeSortable();
                } else {
                    console.log('[Reactive] Skipping render during active edit.');
                }
            } else if (key === 'quizSummary') {
                if (value) {
                    ui.renderQuizSummary(value);
                } else {
                    const el = document.getElementById('quiz-summary-card');
                    if (el) el.remove();
                }
            } else if (key === 'selectedKeywords') {
                AnalyzerHandlers.updateHighlighter();
                refreshUI();
            } else if (['uploadedImages', 'uiRefreshTrigger'].includes(key)) {
                console.log('[Reactive] Refresh trigger received.');
                ui.hideLoader(); // 優先關閉 Loader，避免被 refreshUI 的潛在錯誤卡住
                refreshUI();
            }
        });
    }

    // --- [初始化] UI 與 資料 ---
    ui.populateVersionHistory();
    ui.populateDropdowns();
    ui.applyLayoutPreference();
    ui.applyThemePreference();
    ui.initLanguage();
    ui.updateVisitorCount();
    
    // API Key 復原
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

    // --- [事件監聽] 主要操作 ---

    // 出題與分析
    utils.addSafeEventListener(elements.regenerateBtn, 'click', () => {
        ui.showLoader('AI 老師正在出題中...');
        GenHandlers.triggerQuestionGeneration();
    }, 'regenerateBtn');

    utils.addSafeEventListener(elements.analyzeContentBtn, 'click', AnalyzerHandlers.handleAnalyzeContent, 'analyzeContentBtn');
    utils.addSafeEventListener(elements.reAnalyzeBtn, 'click', AnalyzerHandlers.handleAnalyzeContent, 'reAnalyzeBtn');
    utils.addSafeEventListener(elements.addCustomKeywordBtn, 'click', () => AnalyzerHandlers.handleAddCustomKeyword(), 'addCustomKeywordBtn');
    
    if (elements.customKeywordInput) {
        utils.addSafeEventListener(elements.customKeywordInput, 'keypress', (e) => {
             if (e.key === 'Enter') { e.preventDefault(); AnalyzerHandlers.handleAddCustomKeyword(); }
        }, 'customKeywordInput');
    }

    // 文字輸入區監聽
    if (elements.textInput) {
        utils.addSafeEventListener(elements.textInput, 'input', (e) => {
            SessionHandlers.triggerOrUpdate(e);
            AnalyzerHandlers.updateHighlighter();
            refreshUI();
            if (elements.analyzeContentBtn) {
                elements.analyzeContentBtn.classList.toggle('hidden', e.target.value.trim().length < 50);
            }
        }, 'textInputMain');
        
        utils.addSafeEventListener(elements.textInput, 'scroll', () => {
            AnalyzerHandlers.syncScroll();
        }, 'textInputScrollSync');

        utils.addSafeEventListener(elements.textInput, 'mouseup', AnalyzerHandlers.handleSelectionChange, 'textInputSelection');
        utils.addSafeEventListener(elements.textInput, 'keyup', AnalyzerHandlers.handleSelectionChange, 'textInputSelectionKey');
    }

    // 檔案與下載
    utils.addSafeEventListener(elements.fileInput, 'change', (event) => IOHandlers.handleFile(event.target.files[0]), 'fileInput');
    utils.addSafeEventListener(elements.imageInput, 'change', (event) => {
        IOHandlers.handleImageFiles(event.target.files);
        setTimeout(() => refreshUI(), 500);
    }, 'imageInput');
    
    if (elements.textInput) ui.setupDragDrop(elements.textInput, IOHandlers.handleFile, false);
    if (elements.imageDropZone) ui.setupDragDrop(elements.imageDropZone, IOHandlers.handleImageFiles, true);
    
    utils.addSafeEventListener(elements.downloadBtn, 'click', IOHandlers.exportFile, 'downloadBtn');
    utils.addSafeEventListener(elements.clearContentBtn, 'click', SessionHandlers.clearAllInputs, 'clearContentBtn');
    utils.addSafeEventListener(elements.resetBtn, 'click', SessionHandlers.clearAllInputs, 'resetBtn');

    // AI 內容生成分頁
    utils.addSafeEventListener(elements.generateContentBtn, 'click', ContentHandlers.generateContentFromTopic, 'generateContentBtn');
    utils.addSafeEventListener(elements.extractFromUrlBtn, 'click', ContentHandlers.handleExtractFromUrl, 'extractFromUrlBtn');
    utils.addSafeEventListener(elements.downloadTxtBtn, 'click', ContentHandlers.handleDownloadTxt, 'downloadTxtBtn');
    utils.addSafeEventListener(elements.shareContentBtn, 'click', ContentHandlers.handleShareContent, 'shareContentBtn');

    // 提示詞預覽
    utils.addSafeEventListener(elements.editPromptBtn, 'click', ContentHandlers.handlePreviewPrompt, 'editPromptBtn');
    utils.addSafeEventListener(elements.closePromptModalBtn, 'click', ui.hidePromptModal, 'closePromptModalBtn');
    utils.addSafeEventListener(elements.copyPromptBtn, 'click', ContentHandlers.handleCopyPrompt, 'copyPromptBtn');
    utils.addSafeEventListener(elements.generateWithEditedPromptBtn, 'click', ContentHandlers.handleGenerateWithEditedPrompt, 'generateWithEditedPromptBtn');

    // 選項切換
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

    // 6. Settings & API Key
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

    // 7. Layout & Theme
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
                document.body.className = `theme-${theme}`; 
            }, `theme-${radio.id}`);
        });
    }

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

    // 9. Community Library
    utils.addSafeEventListener(elements.uploadCommunityBtn, 'click', LibHandlers.handleUploadModalOpen, 'uploadCommunityBtn');
    utils.addSafeEventListener(elements.closeUploadModalBtn, 'click', () => ui.toggleUploadModal(false), 'closeUploadModalBtn');
    utils.addSafeEventListener(elements.uploadModal, 'click', (e) => { if (e.target === elements.uploadModal) ui.toggleUploadModal(false); }, 'uploadModal');
    utils.addSafeEventListener(elements.uploadForm, 'submit', LibHandlers.handleUploadSubmit, 'uploadForm');
    
    [elements.libDomainSelect, elements.libGradeSelect, elements.libIssueSelect, elements.libPublisherSelect].forEach(select => {
        utils.addSafeEventListener(select, 'change', LibHandlers.handleLibraryFilterChange, `lib-filter-${select?.id}`);
    });

    // 10. Modals
    utils.addSafeEventListener(elements.versionBtn, 'click', () => { if(elements.versionModal) elements.versionModal.classList.remove('hidden') }, 'versionBtn');
    utils.addSafeEventListener(elements.closeModalBtn, 'click', () => { if(elements.versionModal) elements.versionModal.classList.add('hidden') }, 'closeModalBtn');
    utils.addSafeEventListener(elements.versionModal, 'click', (e) => { if (e.target === elements.versionModal) elements.versionModal.classList.add('hidden'); }, 'versionModal');
    
    utils.addSafeEventListener(elements.continueEditingBtn, 'click', ui.hidePostDownloadModal, 'continueEditingBtn');
    utils.addSafeEventListener(elements.clearAndNewBtn, 'click', () => { ui.hidePostDownloadModal(); SessionHandlers.clearAllInputs(); }, 'clearAndNewBtn');

    utils.addSafeEventListener(elements.closeShareModalBtn, 'click', ui.hideShareModal, 'closeShareModalBtn');
    utils.addSafeEventListener(elements.copyLinkBtn, 'click', ContentHandlers.handleCopyLink, 'copyLinkBtn');

    // 互動式選取按鈕
    const selectionBtn = document.getElementById('add-selection-as-keyword-btn');
    if (selectionBtn) {
        selectionBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const menu = document.getElementById('text-selection-menu');
            const text = menu.dataset.selectedText;
            if (text) AnalyzerHandlers.handleAddCustomKeyword(text);
        });
    }

    const vocabBtn = document.getElementById('add-selection-as-vocab-btn');
    if (vocabBtn) {
        vocabBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const menu = document.getElementById('text-selection-menu');
            const text = menu.dataset.selectedText;
            if (text) AnalyzerHandlers.handleAddCustomKeyword(text); 
        });
    }

    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#text-selection-menu') && !e.target.closest('#text-input')) {
            AnalyzerHandlers.hideSelectionMenu();
        }
    });

    // 11. Tabs Logic
    if (elements.tabs.settings.buttons) {
        elements.tabs.settings.buttons.forEach((btn, i) => {
            utils.addSafeEventListener(btn, 'click', () => ui.switchTab('settings', i), `settings-tab-${i}`);
        });
    }
    if (elements.tabs.input.buttons) {
        elements.tabs.input.buttons.forEach((btn, i) => {
            utils.addSafeEventListener(btn, 'click', () => ui.switchTab('input', i), `input-tab-${i}`);
        });
    }
    
    if (elements.workTabs.buttons) {
        elements.workTabs.buttons.forEach((btn, i) => {
            utils.addSafeEventListener(btn, 'click', () => {
                const tabId = i === 0 ? 'edit' : 'library';
                ui.switchWorkTab(tabId);
                if (tabId === 'library') LibHandlers.refreshLibrary();
            }, `work-tab-${i}`);
        });
    }

    // 12. Student Level Sync
    const levelSelects = document.querySelectorAll('.student-level-sync');
    levelSelects.forEach(select => {
        select.addEventListener('change', (e) => {
            const val = e.target.value;
            levelSelects.forEach(s => { if(s !== e.target) s.value = val; });
            refreshUI();
        });
    });

    // --- [啟動] 初始載入 ---
    SessionHandlers.restoreDraft();
    SessionHandlers.bindAutoSave();
    SessionHandlers.checkContentAndToggleButton();
    ui.updateRegenerateButtonState();
    LibHandlers.refreshLibrary();
    
    console.log('[main.js] Initialization Complete.');
});