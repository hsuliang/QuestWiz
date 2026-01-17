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
import * as EditorHandlers from './handlers/editor.js';
import * as AdaptiveUIHandlers from './handlers/adaptive_ui.js'; // [Phase 2]
import { registerNotifier } from './utils/errorHandler.js'; // [New]

// ---------------------------------------------------------
// 1. 全域功能優先暴露 (即便後續報錯，這些也能在 HTML 中被呼叫)
// ---------------------------------------------------------
window.switchAppMode = (mode) => { if (typeof ui.switchAppMode === 'function') ui.switchAppMode(mode); };
window.switchExpertType = (btn, type) => { if (typeof ui.switchExpertType === 'function') ui.switchExpertType(btn, type); };

document.addEventListener('DOMContentLoaded', () => {
    console.log('%c[QuestWiz] Starting Resilient Bootloader...', 'color: #6366f1; font-weight: bold;');

    // [Init] 注入 UI 通知器給錯誤處理模組 (解決循環依賴)
    registerNotifier(ui.showToast);

    const safeExecute = (name, task) => {
        try {
            task();
            // console.log(`[Init] ${name} success.`);
        } catch (e) {
            console.error(`[Init] ${name} failed:`, e);
        }
    };

    // ---------------------------------------------------------
    // 2. 響應式系統初始化
    // ---------------------------------------------------------
    safeExecute('Reactive Core', () => {
        if (!state.subscribe) return;
        const editorCallbacks = {
            onUpdateField: (index, field, value) => EditorHandlers.updateQuestionField(index, field, value),
            onUpdateOption: (index, optIndex, value) => EditorHandlers.updateOption(index, optIndex, value),
            onUpdateCorrect: (index, correctArr) => EditorHandlers.updateCorrectAnswer(index, correctArr),
            onDelete: (index) => EditorHandlers.deleteQuestion(index),
            onCopy: (index) => { EditorHandlers.copyQuestion(index); ui.showToast('題目已複製', 'success'); }
        };

        state.subscribe((key, value) => {
            try {
                if (key === 'generatedQuestions') {
                    if (state.isBusy('generate') || !document.activeElement?.closest('#questions-container')) {
                        ui.renderQuestionsForEditing(value || [], editorCallbacks);
                        ui.initializeSortable();
                    }
                } else if (key === 'quizSummary') {
                    if (value) ui.renderQuizSummary(value);
                    else document.getElementById('quiz-summary-card')?.remove();
                } else if (key === 'selectedKeywords') {
                    AnalyzerHandlers.updateHighlighter();
                    if (ui.refreshUI) ui.refreshUI();
                } else if (['uploadedImages', 'uiRefreshTrigger'].includes(key)) {
                    ui.hideLoader();
                    if (ui.refreshUI) ui.refreshUI();
                }
            } catch (err) { console.error(`[Reactive Notification] Error for ${key}:`, err); }
        });
    });

    // ---------------------------------------------------------
    // 3. UI 基礎組件初始化 (分段執行，確保一處壞掉不影響他處)
    // ---------------------------------------------------------
    safeExecute('Populate History', () => ui.populateVersionHistory());
    safeExecute('Populate Dropdowns', () => ui.populateDropdowns());
    
    // [New] 管理員模式偵測
    safeExecute('Detect Admin', () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('admin') === 'hsuliang') {
            state.setAdminMode(true);
            console.log('%c[System] 管理員權限已啟動', 'color: #ef4444; font-weight: bold;');
            ui.showToast('管理員模式已啟動', 'success');
        }
    });

    safeExecute('Apply Layout', () => ui.applyLayoutPreference());
    safeExecute('Apply Theme', () => ui.applyThemePreference());
    safeExecute('Init Language', () => ui.initLanguage());
    safeExecute('Init Model', () => ui.initModelSelection());
    safeExecute('Visitor Count', () => ui.updateVisitorCount());
    
    safeExecute('Restore Mode', () => {
        const savedMode = localStorage.getItem('appMode_v1') || 'quick';
        ui.switchAppMode(savedMode);
    });

    safeExecute('Restore API Key', () => {
        const keyDataString = sessionStorage.getItem('gemini_api_key_data');
        if (keyDataString) {
            const keyData = JSON.parse(keyDataString);
            if (Date.now() < keyData.expires) {
                // [Fix] 相容舊格式：若有 value 則還原 (支援陣列或單字串)
                const val = Array.isArray(keyData.value) ? keyData.value.join('\n') : keyData.value;
                if (elements.apiKeyInput) elements.apiKeyInput.value = val;
                ui.startKeyTimer(keyData.expires);
            }
        }
    });

    // ---------------------------------------------------------
    // 4. 事件監聽器安全綁定
    // ---------------------------------------------------------
    const bind = (el, event, handler, name) => {
        if (el) utils.addSafeEventListener(el, event, handler, name);
    };

    safeExecute('Event Bindings', () => {
        // 出題
        bind(elements.regenerateBtn, 'click', () => { ui.showLoader('AI正在出題...'); GenHandlers.triggerQuestionGeneration(); }, 'regenerateBtn');
        bind(elements.expertGenerateBtn, 'click', () => { ui.showLoader('專家模式正在出題...'); GenHandlers.triggerQuestionGeneration(); }, 'expertGenerateBtn');
        
        // 分析
        bind(elements.analyzeContentBtn, 'click', AnalyzerHandlers.handleAnalyzeContent, 'analyzeContentBtn');
        bind(elements.reAnalyzeBtn, 'click', AnalyzerHandlers.handleAnalyzeContent, 'reAnalyzeBtn');
        bind(elements.addCustomKeywordBtn, 'click', () => AnalyzerHandlers.handleAddCustomKeyword(), 'addCustomKeywordBtn');
        
        if (elements.customKeywordInput) {
            bind(elements.customKeywordInput, 'keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); AnalyzerHandlers.handleAddCustomKeyword(); } }, 'customKeywordInput');
        }

        // 文字輸入區
        if (elements.textInput) {
            bind(elements.textInput, 'input', (e) => {
                SessionHandlers.triggerOrUpdate(e);
                AnalyzerHandlers.updateHighlighter();
                if (ui.refreshUI) ui.refreshUI();
                elements.analyzeContentBtn?.classList.toggle('hidden', e.target.value.trim().length < 50);
            }, 'textInputMain');
            bind(elements.textInput, 'scroll', () => AnalyzerHandlers.syncScroll(), 'textInputScrollSync');
            bind(elements.textInput, 'mouseup', AnalyzerHandlers.handleSelectionChange, 'textInputSelection');
            bind(elements.textInput, 'keyup', AnalyzerHandlers.handleSelectionChange, 'textInputSelectionKey');
        }

        // 下載與其他
        bind(elements.fileInput, 'change', (event) => IOHandlers.handleFile(event.target.files[0]), 'fileInput');
        bind(elements.imageInput, 'change', (event) => {
            IOHandlers.handleImageFiles(event.target.files);
            setTimeout(() => { if (ui.refreshUI) ui.refreshUI(); }, 500);
        }, 'imageInput');
        
        if (elements.textInput) ui.setupDragDrop(elements.textInput, IOHandlers.handleFile, false);
        if (elements.imageDropZone) ui.setupDragDrop(elements.imageDropZone, IOHandlers.handleImageFiles, true);
        
        bind(elements.downloadBtn, 'click', IOHandlers.exportFile, 'downloadBtn');
        bind(elements.clearContentBtn, 'click', SessionHandlers.clearContent, 'clearContentBtn');
        bind(elements.resetBtn, 'click', SessionHandlers.hardReset, 'resetBtn');
        bind(elements.extractFromUrlBtn, 'click', ContentHandlers.handleExtractFromUrl, 'extractFromUrlBtn');
        bind(elements.generateContentBtn, 'click', ContentHandlers.generateContentFromTopic, 'generateContentBtn');
        bind(elements.downloadTxtBtn, 'click', ContentHandlers.handleDownloadTxt, 'downloadTxtBtn');
        bind(elements.shareContentBtn, 'click', ContentHandlers.handleShareContent, 'shareContentBtn');
        bind(elements.editPromptBtn, 'click', ContentHandlers.handlePreviewPrompt, 'editPromptBtn');
        
        // 彈窗與分享按鈕
        bind(elements.uploadCommunityBtn, 'click', LibHandlers.handleUploadModalOpen, 'uploadCommunityBtn');
        bind(elements.closeUploadModalBtn, 'click', () => ui.toggleUploadModal(false), 'closeUploadModalBtn');
        bind(elements.uploadForm, 'submit', LibHandlers.handleUploadSubmit, 'uploadForm'); // [Fix] 綁定表單提交
        bind(elements.continueEditingBtn, 'click', () => ui.hidePostDownloadModal(), 'continueEditingBtn');
        bind(elements.clearAndNewBtn, 'click', () => {
            ui.hidePostDownloadModal();
            SessionHandlers.clearAllInputs();
        }, 'clearAndNewBtn');

        bind(elements.saveApiKeyBtn, 'click', () => {
            const rawValue = elements.apiKeyInput?.value || '';
            // 解析多組金鑰：支援換行、逗號、分號分隔
            const keys = rawValue.split(/[\n,;]+/).map(k => k.trim()).filter(k => k.length > 5);
            
            if (keys.length > 0) {
                const expires = Date.now() + (2 * 60 * 60 * 1000);
                // 儲存為陣列
                const storageData = { value: keys, expires, isMulti: keys.length > 1 };
                sessionStorage.setItem('gemini_api_key_data', JSON.stringify(storageData));
                
                const msg = keys.length > 1 ? `已儲存 ${keys.length} 組金鑰！` : 'API Key 已儲存！';
                ui.showToast(msg, 'success');
                ui.startKeyTimer(expires);
            } else {
                ui.showToast('請輸入有效的 API Key', 'error');
            }
        }, 'saveApiKeyBtn');
        bind(elements.clearApiKeyBtn, 'click', () => {
            sessionStorage.removeItem('gemini_api_key_data');
            if (elements.apiKeyInput) elements.apiKeyInput.value = '';
            ui.showToast('API Key 已清除', 'success');
        }, 'clearApiKeyBtn');
        
        bind(elements.toggleApiStepsBtn, 'click', () => {
            if (elements.apiStepsContainer && elements.apiStepsArrow) {
                elements.apiStepsContainer.classList.toggle('hidden');
                elements.apiStepsArrow.classList.toggle('rotate-180');
            }
        }, 'toggleApiStepsBtn');

        bind(elements.toggleApiKeyVisibilityBtn, 'click', () => {
            if (elements.apiKeyInput) {
                // 文字框改用 class 切換遮罩
                elements.apiKeyInput.classList.toggle('password-mask');
            }
        }, 'toggleApiKeyVisibilityBtn');

        // 初始狀態：預設遮罩
        if (elements.apiKeyInput) {
            elements.apiKeyInput.classList.add('password-mask');
        }

        // 文字選取與標記
        const handleKeywordAdd = () => {
            AnalyzerHandlers.addKeywordFromSelection();
            if (elements.textInput) {
                // 隱藏選單
                const menu = document.getElementById('text-selection-menu');
                if (menu) menu.classList.add('hidden');
            }
        };
        // 綁定「設為考點」按鈕 (假設 ID 為 add-selection-as-keyword-btn)
        const addKeyBtn = document.getElementById('add-selection-as-keyword-btn');
        bind(addKeyBtn, 'click', handleKeywordAdd, 'addSelectionKeywordBtn');

        // 分享彈窗按鈕
        bind(elements.copyLinkBtn, 'click', ContentHandlers.handleCopyLink, 'copyLinkBtn');
        bind(elements.closeShareModalBtn, 'click', ui.hideShareModal, 'closeShareModalBtn');

        // 版本歷程
        bind(elements.versionBtn, 'click', () => ui.showVersionModal(), 'versionBtn');
        bind(elements.closeModalBtn, 'click', () => ui.hideVersionModal(), 'closeModalBtn');

        bind(elements.collapseSettingsBtn, 'click', () => {
            elements.commonSettingsCard?.classList.toggle('is-collapsed');
        }, 'collapseSettingsBtn');

        bind(elements.toggleBloomBtn, 'click', () => {
            elements.bloomOptionsContainer?.classList.toggle('hidden');
            elements.bloomArrow?.classList.toggle('rotate-180');
        }, 'toggleBloomBtn');

        bind(elements.mobileFab, 'click', () => {
            const isUp = elements.mobileFab?.classList.contains('rotate-180');
            if (!isUp) elements.previewColumn?.scrollIntoView({ behavior: 'smooth' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 'mobileFab');

        // Tabs
        elements.tabs.settings.buttons?.forEach((btn, i) => bind(btn, 'click', () => ui.switchTab('settings', i)));
        elements.tabs.input.buttons?.forEach((btn, i) => bind(btn, 'click', () => ui.switchTab('input', i)));
        elements.workTabs.buttons?.forEach((btn, i) => bind(btn, 'click', () => {
            const id = i === 0 ? 'edit' : 'library';
            ui.switchWorkTab(id);
            if (id === 'library') LibHandlers.refreshLibrary();
        }));

        // 學生程度連動 (治本版：事件委派)
        const updateAllLevels = (val) => {
            document.querySelectorAll('.student-level-sync').forEach(s => {
                if (s.value !== val) s.value = val;
            });
            // [Fix] 強制同步適性化滑桿
            if (AdaptiveUIHandlers && typeof AdaptiveUIHandlers.updateSliderFromExternal === 'function') {
                AdaptiveUIHandlers.updateSliderFromExternal(val);
            }
            if (typeof ui.refreshUI === 'function') ui.refreshUI();
        };

        // 監聽整個文件的 change 事件，只處理帶有 .student-level-sync 的元素
        document.addEventListener('change', (e) => {
            if (e.target && e.target.classList.contains('student-level-sync')) {
                updateAllLevels(e.target.value);
            }
        });

        // 題庫篩選器
        const filterIds = ['lib-domain-select', 'lib-grade-select', 'lib-publisher-select', 'lib-issue-select'];
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) bind(el, 'change', LibHandlers.handleLibraryFilterChange, id);
        });
    });

    // [Phase 2] 適性化 UI 初始化
    safeExecute('Adaptive UI Init', () => {
        AdaptiveUIHandlers.initAdaptiveUI();
    });

    // ---------------------------------------------------------
    // 5. 終端啟動
    // ---------------------------------------------------------
    safeExecute('Final Post-Init', () => {
        SessionHandlers.restoreDraft();
        SessionHandlers.bindAutoSave();
        SessionHandlers.checkContentAndToggleButton();
        ui.updateRegenerateButtonState();
        LibHandlers.refreshLibrary();
    });

    console.log('%c[QuestWiz] Resilient Boot Complete.', 'color: #10b981; font-weight: bold;');
});