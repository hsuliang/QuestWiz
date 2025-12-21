import { CONFIG } from './config.js';
import * as ui from './ui.js';
import * as handlers from './handlers.js';
import * as utils from './utils.js';
import { getApiKey } from './api.js';
import * as state from './state.js';
import { elements, getControls } from './dom.js'; // 引入 DOM 模組

// --- 事件監聽器與初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    // [新增] 檢查並啟用管理員模式
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
        state.setAdminMode(true);
        console.log('%c[Admin Mode Enabled]', 'color: #ff4500; font-weight: bold;');
    }

    // 初始化 UI
    ui.populateVersionHistory();
    ui.populateDropdowns(); // 初始化下拉選單
    ui.applyLayoutPreference();
    ui.applyThemePreference();
    ui.initLanguage(); // 初始化語言
    ui.updateVisitorCount();

    // 檢查並恢復 API 金鑰狀態
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
    
    // 恢復草稿
    handlers.restoreDraft();
    handlers.bindAutoSave();
    
    // 初始檢查按鈕狀態
    handlers.checkContentAndToggleButton();

    ui.updateRegenerateButtonState();


    // --- 綁定所有事件監聽器 ---
    utils.addSafeEventListener(elements.generateContentBtn, 'click', handlers.generateContentFromTopic, 'generateContentBtn');
    utils.addSafeEventListener(elements.extractFromUrlBtn, 'click', handlers.handleExtractFromUrl, 'extractFromUrlBtn');
    utils.addSafeEventListener(elements.downloadTxtBtn, 'click', handlers.handleDownloadTxt, 'downloadTxtBtn');
    utils.addSafeEventListener(elements.shareContentBtn, 'click', handlers.handleShareContent, 'shareContentBtn');
    utils.addSafeEventListener(elements.clearContentBtn, 'click', handlers.clearAllInputs, 'clearContentBtn');
    utils.addSafeEventListener(elements.downloadBtn, 'click', handlers.exportFile, 'downloadBtn');
    utils.addSafeEventListener(elements.resetBtn, 'click', handlers.clearAllInputs, 'resetBtn');
    utils.addSafeEventListener(elements.regenerateBtn, 'click', handlers.triggerQuestionGeneration, 'regenerateBtn');
    utils.addSafeEventListener(elements.generateFromImagesBtn, 'click', handlers.triggerQuestionGeneration, 'generateFromImagesBtn');
    
    utils.addSafeEventListener(elements.fileInput, 'change', (event) => handlers.handleFile(event.target.files[0]), 'fileInput');
    utils.addSafeEventListener(elements.imageInput, 'change', (event) => handlers.handleImageFiles(event.target.files), 'imageInput');
    
    utils.addSafeEventListener(elements.textInput, 'input', () => {
        const hasText = elements.textInput.value.trim() !== '';
        elements.downloadTxtBtn.classList.toggle('hidden', !hasText);
        elements.shareContentBtn.classList.toggle('hidden', !hasText);
        handlers.checkContentAndToggleButton();
    }, 'textInput');

    utils.addSafeEventListener(elements.formatSelect, 'change', () => {
        const newFormat = elements.formatSelect.value;
        const needsExplanation = newFormat === 'loilonote' || newFormat === 'wayground';
        const questions = state.getGeneratedQuestions();
        const hasQuestions = questions.length > 0;
        const missingExplanation = hasQuestions && !questions[0].hasOwnProperty('explanation');

        if (needsExplanation && missingExplanation) {
            ui.showToast('偵測到格式需要題目說明，將為您自動更新...', 'success');
            handlers.triggerQuestionGeneration();
        }
    }, 'formatSelect');

    ui.setupDragDrop(elements.textInput, (file) => handlers.handleFile(file), false);
    ui.setupDragDrop(elements.imageDropZone, handlers.handleImageFiles, true);
    
    // --- 題庫大廳與上傳相關事件 ---
    
    // 開啟上傳視窗
    utils.addSafeEventListener(elements.uploadCommunityBtn, 'click', handlers.handleUploadModalOpen, 'uploadCommunityBtn');
    
    // 關閉上傳視窗
    utils.addSafeEventListener(elements.closeUploadModalBtn, 'click', () => ui.toggleUploadModal(false), 'closeUploadModalBtn');
    utils.addSafeEventListener(elements.uploadModal, 'click', (e) => {
        if (e.target === elements.uploadModal) ui.toggleUploadModal(false);
    }, 'uploadModalBackground');

    // 送出上傳表單
    utils.addSafeEventListener(elements.uploadForm, 'submit', handlers.handleUploadSubmit, 'uploadForm');

    // 點擊「題庫大廳」分頁 (右側工作區 Tab)
    if (elements.workTabs && elements.workTabs.buttons) {
        elements.workTabs.buttons.forEach((btn, index) => {
            const tabId = index === 0 ? 'edit' : 'library';
            utils.addSafeEventListener(btn, 'click', () => handlers.handleWorkTabClick(tabId), `workTab-${tabId}`);
        });
    }

    // 題庫篩選器變更
    const filterSelects = [
        elements.libDomainSelect, 
        elements.libGradeSelect, 
        elements.libIssueSelect, 
        elements.libPublisherSelect
    ];
    filterSelects.forEach(select => {
        utils.addSafeEventListener(select, 'change', handlers.handleLibraryFilterChange, `lib-filter-${select.id}`);
    });

    // API 金鑰操作步驟 Toggle
    if (elements.toggleApiStepsBtn && elements.apiStepsContainer && elements.apiStepsArrow) {
        utils.addSafeEventListener(elements.toggleApiStepsBtn, 'click', () => {
            const isHidden = elements.apiStepsContainer.classList.contains('hidden');
            if (isHidden) {
                elements.apiStepsContainer.classList.remove('hidden');
                elements.apiStepsArrow.style.transform = 'rotate(180deg)';
            } else {
                elements.apiStepsContainer.classList.add('hidden');
                elements.apiStepsArrow.style.transform = 'rotate(0deg)';
            }
        }, 'toggleApiStepsBtn');
    }

    // API 金鑰顯示/隱藏 Toggle
    if (elements.toggleApiKeyVisibilityBtn && elements.apiKeyInput) {
        utils.addSafeEventListener(elements.toggleApiKeyVisibilityBtn, 'click', () => {
            const isPassword = elements.apiKeyInput.type === 'password';
            elements.apiKeyInput.type = isPassword ? 'text' : 'password';
            
            // Update Icon
            const svg = elements.toggleApiKeyVisibilityBtn.querySelector('svg');
            if (svg) {
                if (isPassword) {
                    // Switch to "Hide" icon (Slash Eye)
                    svg.innerHTML = `
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    `;
                } else {
                    // Switch to "Show" icon (Normal Eye)
                    svg.innerHTML = `
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    `;
                }
            }
        }, 'toggleApiKeyVisibilityBtn');
    }

    // API 金鑰儲存/清除
    utils.addSafeEventListener(elements.saveApiKeyBtn, 'click', () => {
        if (elements.apiKeyInput) {
            const key = elements.apiKeyInput.value.trim();
            if (key) {
                const expirationTime = new Date().getTime() + (2 * 60 * 60 * 1000);
                const keyData = { value: key, expires: expirationTime };
                sessionStorage.setItem('gemini_api_key_data', JSON.stringify(keyData));
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

    // UI 偏好設定
    utils.addSafeEventListener(elements.layoutToggleBtn, 'click', () => {
        if (!elements.mainContainer) return;
        elements.mainContainer.classList.toggle('lg:flex-row-reverse');
        const isReversed = elements.mainContainer.classList.contains('lg:flex-row-reverse');
        localStorage.setItem('quizGenLayout_v2', isReversed ? 'reversed' : 'default');
        
        const currentLang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
        const t = ui.translations[currentLang]; // Access translations via ui module if exported, or re-import
        // Since main.js doesn't import translations directly, we can rely on ui.updateLanguage or handle it simply here.
        // Better: re-call ui.applyLayoutPreference which now handles text? No, applyLayoutPreference reads storage.
        // Simplest: Just set text based on storage + current lang.
        
        // Actually, ui.js exports 'translations' now? No, I imported it in ui.js but main.js doesn't see it unless exported from ui.js or imported here.
        // Let's import translations in main.js to be safe or use a helper in ui.js
        
        if (elements.previewPlaceholder) {
             // Re-importing translations in main.js might be cleaner, but let's just trigger a language update to refresh text if we want to be lazy, 
             // but that refreshes everything. 
             // Let's use the logic:
             ui.updateLanguage(currentLang); // This will refresh the placeholder text correctly based on the new layout class state check inside updateLanguage
        }
    }, 'layoutToggleBtn');

    if (elements.themeRadios) {
        elements.themeRadios.forEach(radio => {
            utils.addSafeEventListener(radio, 'change', () => {
                if(radio.checked) {
                    localStorage.setItem('quizGenTheme_v1', radio.id.replace('theme-', ''));
                }
            });
        });
    }

    // Tabs
    if (elements.tabs.settings.buttons.length > 0) {
        elements.tabs.settings.buttons.forEach((clickedTab, index) => {
            utils.addSafeEventListener(clickedTab, 'click', () => {
                if(!clickedTab) return;
                elements.tabs.settings.buttons.forEach(tab => tab?.classList.remove('active'));
                elements.tabs.settings.contents.forEach(content => content?.classList.remove('active'));
                clickedTab.classList.add('active');
                if (elements.tabs.settings.contents[index]) {
                    elements.tabs.settings.contents[index].classList.add('active');
                }
            }, `settings-tab-${index}`);
        });
    }

    if (elements.tabs.input.buttons.length > 0) {
        elements.tabs.input.buttons.forEach((clickedTab, index) => {
            utils.addSafeEventListener(clickedTab, 'click', () => {
                if(!clickedTab) return;
                elements.tabs.input.buttons.forEach(tab => { if(tab) { tab.classList.remove('active'); tab.setAttribute('aria-selected', 'false'); }});
                elements.tabs.input.contents.forEach(content => { if(content) content.classList.remove('active'); });
                clickedTab.classList.add('active');
                clickedTab.setAttribute('aria-selected', 'true');
                if (elements.tabs.input.contents[index]) {
                    elements.tabs.input.contents[index].classList.add('active');
                }
                ui.updateRegenerateButtonState();
            }, `input-tab-${index}`);
        });
    }
    
    // 設定區收合
    utils.addSafeEventListener(elements.collapseSettingsBtn, 'click', () => {
        if(elements.commonSettingsCard) {
            const isCollapsed = elements.commonSettingsCard.classList.toggle('is-collapsed');
            localStorage.setItem('settingsCollapsed_v1', isCollapsed);
        }
    }, 'collapseSettingsBtn');

    if (elements.commonSettingsCard && localStorage.getItem('settingsCollapsed_v1') === 'true') {
        elements.commonSettingsCard.classList.add('is-collapsed');
    }
    
    // Modals
    utils.addSafeEventListener(elements.versionBtn, 'click', () => { if(elements.versionModal) elements.versionModal.classList.remove('hidden') }, 'versionBtn');
    utils.addSafeEventListener(elements.closeModalBtn, 'click', () => { if(elements.versionModal) elements.versionModal.classList.add('hidden') }, 'closeModalBtn');
    utils.addSafeEventListener(elements.versionModal, 'click', (event) => { if (event.target === elements.versionModal && elements.versionModal) elements.versionModal.classList.add('hidden'); }, 'versionModal');
    
    utils.addSafeEventListener(elements.continueEditingBtn, 'click', ui.hidePostDownloadModal, 'continueEditingBtn');
    utils.addSafeEventListener(elements.clearAndNewBtn, 'click', () => {
        ui.hidePostDownloadModal();
        handlers.clearAllInputs();
    }, 'clearAndNewBtn');

    // 自訂選項顯示/隱藏
    utils.addSafeEventListener(elements.textTypeSelect, 'change', (e) => {
        if(elements.customTextTypeInput) {
            e.target.value === 'custom' ? elements.customTextTypeInput.classList.remove('hidden') : elements.customTextTypeInput.classList.add('hidden');
        }
    }, 'textTypeSelect');

    utils.addSafeEventListener(elements.toneSelect, 'change', (e) => {
        if(elements.customToneInput) {
            e.target.value === 'custom' ? elements.customToneInput.classList.remove('hidden') : elements.customToneInput.classList.add('hidden');
        }
    }, 'toneSelect');

    // Prompt Modal 事件監聽器
    utils.addSafeEventListener(elements.editPromptBtn, 'click', handlers.handlePreviewPrompt, 'editPromptBtn');
    utils.addSafeEventListener(elements.closePromptModalBtn, 'click', ui.hidePromptModal, 'closePromptModalBtn');
    utils.addSafeEventListener(elements.promptModal, 'click', (e) => { if (e.target === elements.promptModal) ui.hidePromptModal(); }, 'promptModal');
    utils.addSafeEventListener(elements.copyPromptBtn, 'click', handlers.handleCopyPrompt, 'copyPromptBtn');
    utils.addSafeEventListener(elements.generateWithEditedPromptBtn, 'click', handlers.handleGenerateWithEditedPrompt, 'generateWithEditedPromptBtn');

    // Share Modal 事件監聽器
    utils.addSafeEventListener(elements.closeShareModalBtn, 'click', ui.hideShareModal, 'closeShareModalBtn');
    utils.addSafeEventListener(elements.shareModal, 'click', (e) => { if (e.target === elements.shareModal) ui.hideShareModal(); }, 'shareModal');
    utils.addSafeEventListener(elements.copyLinkBtn, 'click', handlers.handleCopyLink, 'copyLinkBtn');

    // 行動版 FAB (懸浮按鈕) 邏輯
    if (elements.mobileFab && elements.fabIconDown && elements.fabIconUp) {
        const updateFabState = () => {
            // 簡單判斷：如果捲動超過 300px，就顯示「向上」箭頭，否則顯示「向下」
            if (window.scrollY > 300) {
                elements.fabIconDown.classList.add('hidden');
                elements.fabIconUp.classList.remove('hidden');
            } else {
                elements.fabIconDown.classList.remove('hidden');
                elements.fabIconUp.classList.add('hidden');
            }
        };

        utils.addSafeEventListener(elements.mobileFab, 'click', () => {
            if (window.scrollY > 300) {
                // 捲動到頂部
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                // 捲動到預覽區 (preview-column)
                const previewColumn = document.getElementById('preview-column');
                if (previewColumn) {
                    previewColumn.scrollIntoView({ behavior: 'smooth' });
                }
            }
        }, 'mobileFab');

        window.addEventListener('scroll', utils.debounce(updateFabState, 100));
        // 初次檢查
        updateFabState();
    }

    // 學生程度選單同步邏輯
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
                    // 觸發自動出題 (若開啟)
                    if (utils.isAutoGenerateEnabled()) {
                        handlers.debouncedGenerate();
                    }
                }, 'studentLevelSelectSync');
            }
        });
    }
});