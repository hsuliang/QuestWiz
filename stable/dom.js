/**
 * 中央管理所有 DOM 元素引用，避免在各處重複查詢
 */
export const elements = {
    // 常用設定 (Settings)
    apiKeyInput: document.getElementById('api-key-input'),
    saveApiKeyBtn: document.getElementById('save-api-key-btn'),
    clearApiKeyBtn: document.getElementById('clear-api-key-btn'),
    toggleApiKeyVisibilityBtn: document.getElementById('toggle-api-key-visibility'),
    collapseSettingsBtn: document.getElementById('collapse-settings-btn'),
    commonSettingsCard: document.getElementById('common-settings-card'),
    toggleApiStepsBtn: document.getElementById('toggle-api-steps-btn'),
    apiStepsContainer: document.getElementById('api-steps-container'),
    apiStepsArrow: document.getElementById('api-steps-arrow'),
    layoutToggleBtn: document.getElementById('layout-toggle-btn'),
    themeRadios: document.querySelectorAll('input[name="theme"]'),
    mainContainer: document.getElementById('main-container'),

    // 提供內容 (Content Input)
    textInput: document.getElementById('text-input'),
    fileInput: document.getElementById('file-input'),
    fileNameDisplay: document.getElementById('file-name-display'),
    fileErrorDisplay: document.getElementById('file-error-display'),
    imageInput: document.getElementById('image-input'),
    imageDropZone: document.getElementById('image-drop-zone'),
    imagePreviewContainer: document.getElementById('image-preview-container'),
    imageErrorDisplay: document.getElementById('image-error-display'),
    urlInput: document.getElementById('url-input'),
    urlTypeWebRadio: document.getElementById('url-type-web'),
    downloadTxtBtn: document.getElementById('download-txt-btn'),
    shareContentBtn: document.getElementById('share-content-btn'),
    clearContentBtn: document.getElementById('clear-content-btn'),
    topicInput: document.getElementById('topic-input'),
    textTypeSelect: document.getElementById('text-type-select'),
    customTextTypeInput: document.getElementById('custom-text-type-input'),
    learningObjectivesInput: document.getElementById('learning-objectives-input'),
    toneSelect: document.getElementById('tone-select'),
    customToneInput: document.getElementById('custom-tone-input'),
    outputLangSelect: document.getElementById('output-lang-select'),
    generateContentBtn: document.getElementById('generate-content-btn'),
    extractFromUrlBtn: document.getElementById('extract-from-url-btn'),
    editPromptBtn: document.getElementById('edit-prompt-btn'),

    // 題目生成設定 (Quiz Settings)
    quizTitleInput: document.getElementById('quiz-title-input'),
    studentLevelSelect: document.getElementById('student-level-select-quiz'),
    studentLevelSelects: document.querySelectorAll('.student-level-sync'), // 全域同步
    numQuestionsInput: document.getElementById('num-questions'),
    formatSelect: document.getElementById('format-select'),
    questionTypeSelect: document.getElementById('question-type-select'),
    difficultySelect: document.getElementById('difficulty-select'),
    questionStyleSelect: document.getElementById('question-style-select'),
    competencyBasedCheckbox: document.getElementById('competency-based-checkbox'),
    
    // 布魯姆認知層次 (Bloom Taxonomy)
    toggleBloomBtn: document.getElementById('toggle-bloom-btn'),
    bloomOptionsContainer: document.getElementById('bloom-options-container'),
    bloomArrow: document.getElementById('bloom-arrow'),
    bloomLevelCheckboxes: document.querySelectorAll('.bloom-checkbox'),

    // 預覽與編輯 (Preview Area)
    previewColumn: document.getElementById('preview-column'),
    controlsColumn: document.getElementById('controls-column'),
    previewLoader: document.getElementById('preview-loader'),
    loadingText: document.getElementById('loading-text'),
    previewPlaceholder: document.getElementById('preview-placeholder'),
    questionsContainer: document.getElementById('questions-container'),
    previewActions: document.getElementById('preview-actions'),
    regenerateBtn: document.getElementById('regenerate-btn'),
    downloadBtn: document.getElementById('download-btn'),
    resetBtn: document.getElementById('reset-btn'),
    mobileFab: document.getElementById('mobile-fab'),

    // 題庫大廳 (Community Library)
    libQuizList: document.getElementById('lib-quiz-list'),
    libDomainSelect: document.getElementById('lib-domain-select'),
    libGradeSelect: document.getElementById('lib-grade-select'),
    libPublisherSelect: document.getElementById('lib-publisher-select'),
    libIssueSelect: document.getElementById('lib-issue-select'),
    uploadCommunityBtn: document.getElementById('upload-community-btn'),

    // 彈出視窗 (Modals)
    versionBtn: document.getElementById('version-btn'),
    versionModal: document.getElementById('version-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    uploadModal: document.getElementById('upload-modal'),
    uploadForm: document.getElementById('upload-form'),
    uploadUnit: document.getElementById('upload-unit'),
    uploadAuthor: document.getElementById('upload-author'),
    uploadGrade: document.getElementById('upload-grade'),
    uploadDomain: document.getElementById('upload-domain'),
    uploadPublisher: document.getElementById('upload-publisher'),
    uploadIssue: document.getElementById('upload-issue'),
    closeUploadModalBtn: document.getElementById('close-upload-modal-btn'),
    postDownloadModal: document.getElementById('post-download-modal'),
    postDownloadModalContent: document.getElementById('post-download-modal-content'),
    continueEditingBtn: document.getElementById('continue-editing-btn'),
    clearAndNewBtn: document.getElementById('clear-and-new-btn'),
    promptModal: document.getElementById('prompt-modal'),
    promptDisplayArea: document.getElementById('prompt-display-area'),
    closePromptModalBtn: document.getElementById('close-prompt-modal-btn'),
    copyPromptBtn: document.getElementById('copy-prompt-btn'),
    generateWithEditedPromptBtn: document.getElementById('generate-with-edited-prompt-btn'),
    shareModal: document.getElementById('share-modal'),
    closeShareModalBtn: document.getElementById('close-share-modal-btn'),
    qrCodeContainer: document.getElementById('qr-code-container'),
    shareLinkInput: document.getElementById('share-link-input'),
    copyLinkBtn: document.getElementById('copy-link-btn'),

    // Tabs 系統
    tabs: {
        settings: {
            buttons: document.querySelectorAll('.settings-tab-btn'),
            contents: document.querySelectorAll('.settings-tab-content')
        },
        input: {
            buttons: document.querySelectorAll('.tab-btn'),
            contents: document.querySelectorAll('.tab-content')
        }
    },
    workTabs: {
        buttons: document.querySelectorAll('.work-tab-btn'),
        contents: document.querySelectorAll('.work-tab-content')
    }
};
