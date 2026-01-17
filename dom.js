/**
 * 中央管理所有 DOM 元素引用 (Getter 模式)
 * 確保在任何時間點存取都能獲取到當下最新的 DOM 元素，避免 null 引用錯誤
 */
export const elements = {
    // 常用設定 (Settings)
    get apiKeyInput() { return document.getElementById('api-key-input'); },
    get saveApiKeyBtn() { return document.getElementById('save-api-key-btn'); },
    get clearApiKeyBtn() { return document.getElementById('clear-api-key-btn'); },
    get toggleApiKeyVisibilityBtn() { return document.getElementById('toggle-api-key-visibility'); },
    get collapseSettingsBtn() { return document.getElementById('collapse-settings-btn'); },
    get commonSettingsCard() { return document.getElementById('common-settings-card'); },
    get toggleApiStepsBtn() { return document.getElementById('toggle-api-steps-btn'); },
    get apiStepsContainer() { return document.getElementById('api-steps-container'); },
    get apiStepsArrow() { return document.getElementById('api-steps-arrow'); },
    get themeRadios() { return document.querySelectorAll('input[name="theme"]'); },
    get modelRadios() { return document.querySelectorAll('input[name="model-mode"]'); },
    get modelQuotaWarning() { return document.getElementById('model-quota-warning'); },
    get mainContainer() { return document.getElementById('main-container'); },

    // 提供內容 (Content Input)
    get textInput() { return document.getElementById('text-input'); },
    get fileInput() { return document.getElementById('file-input'); },
    get fileNameDisplay() { return document.getElementById('file-name-display'); },
    get fileErrorDisplay() { return document.getElementById('file-error-display'); },
    get imageInput() { return document.getElementById('image-input'); },
    get imageDropZone() { return document.getElementById('image-drop-zone'); },
    get imagePreviewContainer() { return document.getElementById('image-preview-container'); },
    get imageErrorDisplay() { return document.getElementById('image-error-display'); },
    get urlInput() { return document.getElementById('url-input'); },
    get urlTypeWebRadio() { return document.getElementById('url-type-web'); },
    get downloadTxtBtn() { return document.getElementById('download-txt-btn'); },
    get shareContentBtn() { return document.getElementById('share-content-btn'); },
    get clearContentBtn() { return document.getElementById('clear-content-btn'); },
    get topicInput() { return document.getElementById('topic-input'); },
    get textTypeSelect() { return document.getElementById('text-type-select'); },
    get customTextTypeInput() { return document.getElementById('custom-text-type-input'); },
    get learningObjectivesInput() { return document.getElementById('learning-objectives-input'); },
    get toneSelect() { return document.getElementById('tone-select'); },
    get customToneInput() { return document.getElementById('custom-tone-input'); },
    get outputLangSelect() { return document.getElementById('output-lang-select'); },
    get generateContentBtn() { return document.getElementById('generate-content-btn'); },
    get extractFromUrlBtn() { return document.getElementById('extract-from-url-btn'); },
    get editPromptBtn() { return document.getElementById('edit-prompt-btn'); },
    get studentLevelSelectContent() { return document.getElementById('student-level-select'); }, // [Fix] 補回遺失的引用
    get adaptiveWordCount() { return document.getElementById('adaptive-word-count'); }, // [Phase 2]
    get domainSelectContent() { return document.getElementById('domain-select-content'); }, // [Phase 4.2]
    get readingTimeBadge() { return document.getElementById('reading-time-badge'); }, // [Phase 4.2]

    // [New] Phase 1: 內容分析與標記
    get analyzeContentBtn() { return document.getElementById('analyze-content-btn'); },
    get reAnalyzeBtn() { return document.getElementById('re-analyze-btn'); },
    get keywordAnalysisArea() { return document.getElementById('keyword-analysis-area'); },
    get keywordContainer() { return document.getElementById('keyword-container'); },
    get customKeywordInput() { return document.getElementById("custom-keyword-input"); },
    get addCustomKeywordBtn() { return document.getElementById("add-custom-keyword-btn"); },

    // 題目生成設定 (Quiz Settings)
    get quizTitleInput() { return document.getElementById('quiz-title-input'); },
    get studentLevelSelect() { return document.getElementById('student-level-select-quiz'); },
    get numQuestionsInput() { return document.getElementById('num-questions'); },
    get formatSelect() { return document.getElementById('format-select'); },
    get questionTypeSelect() { return document.getElementById('question-type-select'); },
    get difficultySelect() { return document.getElementById('difficulty-select'); },
    get questionStyleSelect() { return document.getElementById('question-style-select'); },
    get domainSelectQuiz() { return document.getElementById('domain-select-quiz'); }, // [Phase 4.2]
    get competencyContextContainer() { return document.getElementById('competency-context-container'); }, // [Phase 4.2]
    get contextTypeSelect() { return document.getElementById('context-type-select'); }, // [Phase 4.2]
    get competencyBasedCheckbox() { return document.getElementById('competency-based-checkbox'); },
    
    // Expert Mode
    get expertGenerateBtn() { return document.getElementById('expert-generate-btn'); },
    get expertTextInput() { return document.getElementById('expert-text-input'); },
    
    // 布魯姆認知層次 (Bloom Taxonomy)
    get toggleBloomBtn() { return document.getElementById('toggle-bloom-btn'); },
    get bloomOptionsContainer() { return document.getElementById('bloom-options-container'); },
    get bloomArrow() { return document.getElementById('bloom-arrow'); },
    get bloomLevelCheckboxes() { return document.querySelectorAll('.bloom-checkbox'); },

    // 預覽與編輯 (Preview Area)
    get previewColumn() { return document.getElementById('preview-column'); },
    get controlsColumn() { return document.getElementById('controls-column'); },
    get previewLoader() { return document.getElementById('preview-loader'); },
    get loadingText() { return document.getElementById('loading-text'); },
    get previewPlaceholder() { return document.getElementById('preview-placeholder'); },
    get questionsContainer() { return document.getElementById('questions-container'); },
    get previewActions() { return document.getElementById('preview-actions'); },
    get regenerateBtn() { return document.getElementById('regenerate-btn'); },
    get downloadBtn() { return document.getElementById('download-btn'); },
    get resetBtn() { return document.getElementById('reset-btn'); },
    get mobileFab() { return document.getElementById('mobile-fab'); },

    // 題庫大廳 (Community Library)
    get libQuizList() { return document.getElementById('lib-quiz-list'); },
    get libDomainSelect() { return document.getElementById('lib-domain-select'); },
    get libGradeSelect() { return document.getElementById('lib-grade-select'); },
    get libPublisherSelect() { return document.getElementById('lib-publisher-select'); },
    get libIssueSelect() { return document.getElementById('lib-issue-select'); },
    get uploadCommunityBtn() { return document.getElementById('upload-community-btn'); },

    // 彈出視窗 (Modals)
    get versionBtn() { return document.getElementById('version-btn'); },
    get versionModal() { return document.getElementById('version-modal'); },
    get closeModalBtn() { return document.getElementById('close-version-modal-btn'); },
    get uploadModal() { return document.getElementById('upload-modal'); },
    get uploadForm() { return document.getElementById("upload-form"); },
    get uploadUnit() { return document.getElementById('upload-unit'); },
    get uploadAuthor() { return document.getElementById('upload-author'); },
    get uploadGrade() { return document.getElementById('upload-grade'); },
    get uploadDomain() { return document.getElementById('upload-domain'); },
    get uploadPublisher() { return document.getElementById('upload-publisher'); },
    get uploadIssue() { return document.getElementById('upload-issue'); },
    get closeUploadModalBtn() { return document.getElementById('close-upload-modal-btn'); },
    get postDownloadModal() { return document.getElementById('post-download-modal'); },
    get postDownloadModalContent() { return document.getElementById('post-download-modal-content'); },
    get continueEditingBtn() { return document.getElementById('continue-editing-btn'); },
    get clearAndNewBtn() { return document.getElementById('clear-and-new-btn'); },
    get promptModal() { return document.getElementById('prompt-modal'); },
    get promptDisplayArea() { return document.getElementById('prompt-display-area'); },
    get closePromptModalBtn() { return document.getElementById('close-prompt-modal-btn'); },
    get copyPromptBtn() { return document.getElementById('copy-prompt-btn'); },
    get generateWithEditedPromptBtn() { return document.getElementById('generate-with-edited-prompt-btn'); },
    get shareModal() { return document.getElementById('share-modal'); },
    get closeShareModalBtn() { return document.getElementById('close-share-modal-btn'); },
    get qrCodeContainer() { return document.getElementById('qr-code-container'); },
    get shareLinkInput() { return document.getElementById('share-link-input'); },
    get copyLinkBtn() { return document.getElementById('copy-link-btn'); },

    // Tabs 系統
    get tabs() {
        return {
            settings: {
                get buttons() { return document.querySelectorAll('.settings-tab-btn'); },
                get contents() { return document.querySelectorAll('.settings-tab-content'); }
            },
            input: {
                get buttons() { return document.querySelectorAll('.tab-btn'); },
                get contents() { return document.querySelectorAll('.tab-content'); }
            }
        };
    },
    get workTabs() {
        return {
            get buttons() { return document.querySelectorAll('.work-tab-btn'); },
            get contents() { return document.querySelectorAll('.work-tab-content'); }
        };
    }
};
