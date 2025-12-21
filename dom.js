// --- DOM 元素集中管理 ---
// 將所有 document.getElementById 和其他選擇器集中於此，方便維護

export const elements = {
    // 主容器
    mainContainer: document.getElementById('main-container'),
    
    // 輸入區
    textInput: document.getElementById('text-input'),
    fileInput: document.getElementById('file-input'),
    fileErrorDisplay: document.getElementById('file-error-display'),
    fileNameDisplay: document.getElementById('file-name-display'),
    imageInput: document.getElementById('image-input'),
    imageDropZone: document.getElementById('image-drop-zone'),
    imagePreviewContainer: document.getElementById('image-preview-container'),
    imageErrorDisplay: document.getElementById('image-error-display'),
    urlInput: document.getElementById('url-input'),
    urlTypeWebRadio: document.getElementById('url-type-web'),
    
    // 設定區
    numQuestionsInput: document.getElementById('num-questions'),
    quizTitleInput: document.getElementById('quiz-title-input'), // 新增
    formatSelect: document.getElementById('format-select'),
    questionTypeSelect: document.getElementById('question-type-select'),
    difficultySelect: document.getElementById('difficulty-select'),
    questionStyleSelect: document.getElementById('question-style-select'),
    studentLevelSelect: document.getElementById('student-level-select'),
    studentLevelSelectQuiz: document.getElementById('student-level-select-quiz'), // 新增
    
    // API Key 相關
    apiKeyInput: document.getElementById('api-key-input'),
    saveApiKeyBtn: document.getElementById('save-api-key-btn'),
    clearApiKeyBtn: document.getElementById('clear-api-key-btn'),
    apiStepsContainer: document.getElementById('api-steps-container'),
    toggleApiStepsBtn: document.getElementById('toggle-api-steps-btn'),
    apiStepsArrow: document.getElementById('api-steps-arrow'),
    toggleApiKeyVisibilityBtn: document.getElementById('toggle-api-key-visibility'),

    // 按鈕
    versionBtn: document.getElementById('version-btn'),
    downloadTxtBtn: document.getElementById('download-txt-btn'),
    shareContentBtn: document.getElementById('share-content-btn'),
    clearContentBtn: document.getElementById('clear-content-btn'),
    generateContentBtn: document.getElementById('generate-content-btn'),
    extractFromUrlBtn: document.getElementById('extract-from-url-btn'),
    generateFromImagesBtn: document.getElementById('generate-from-images-btn'),
    downloadBtn: document.getElementById('download-btn'),
    resetBtn: document.getElementById('reset-btn'),
    regenerateBtn: document.getElementById('regenerate-btn'),
    layoutToggleBtn: document.getElementById('layout-toggle-btn'),
    collapseSettingsBtn: document.getElementById('collapse-settings-btn'),
    
    // FAB
    mobileFab: document.getElementById('mobile-fab'),
    fabIconDown: document.getElementById('fab-icon-down'),
    fabIconUp: document.getElementById('fab-icon-up'),

    // 分頁 (Tabs)
    tabs: {
        settings: {
            buttons: [
                document.getElementById('settings-tab-api'),
                document.getElementById('settings-tab-level'),
                document.getElementById('settings-tab-theme'),
                document.getElementById('settings-tab-layout'),
                document.getElementById('settings-tab-language')
            ],
            contents: [
                document.getElementById('settings-content-api'),
                document.getElementById('settings-content-level'),
                document.getElementById('settings-content-theme'),
                document.getElementById('settings-content-layout'),
                document.getElementById('settings-content-language')
            ]
        },
        input: {
            buttons: [
                document.getElementById('tab-text'),
                document.getElementById('tab-image'),
                document.getElementById('tab-url'),
                document.getElementById('tab-ai')
            ],
            contents: [
                document.getElementById('content-text'),
                document.getElementById('content-image'),
                document.getElementById('content-url'),
                document.getElementById('content-ai')
            ]
        }
    },

    // Workplace Tabs (Right Column)
    workTabs: {
        buttons: [
            document.getElementById('work-tab-edit'),
            document.getElementById('work-tab-library')
        ],
        contents: [
            document.getElementById('work-content-edit'),
            document.getElementById('work-content-library')
        ]
    },

    // Upload Modal
    uploadModal: document.getElementById('upload-modal'),
    closeUploadModalBtn: document.getElementById('close-upload-modal-btn'),
    uploadForm: document.getElementById('upload-form'),
    uploadAuthor: document.getElementById('upload-author'),
    uploadDomain: document.getElementById('upload-domain'),
    uploadGrade: document.getElementById('upload-grade'),
    uploadIssue: document.getElementById('upload-issue'),
    uploadPublisher: document.getElementById('upload-publisher'),
    uploadUnit: document.getElementById('upload-unit'),

    // Community Library
    uploadCommunityBtn: document.getElementById('upload-community-btn'),
    libDomainSelect: document.getElementById('lib-domain-select'),
    libGradeSelect: document.getElementById('lib-grade-select'),
    libIssueSelect: document.getElementById('lib-issue-select'),
    libPublisherSelect: document.getElementById('lib-publisher-select'),
    libQuizList: document.getElementById('lib-quiz-list'),

    // Modals (Version, Post-Download, Prompt, Share)
    versionModal: document.getElementById('version-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    
    postDownloadModal: document.getElementById('post-download-modal'),
    continueEditingBtn: document.getElementById('continue-editing-btn'),
    clearAndNewBtn: document.getElementById('clear-and-new-btn'),

    promptModal: document.getElementById('prompt-modal'),
    closePromptModalBtn: document.getElementById('close-prompt-modal-btn'),
    copyPromptBtn: document.getElementById('copy-prompt-btn'),
    generateWithEditedPromptBtn: document.getElementById('generate-with-edited-prompt-btn'),
    
    shareModal: document.getElementById('share-modal'),
    closeShareModalBtn: document.getElementById('close-share-modal-btn'),
    copyLinkBtn: document.getElementById('copy-link-btn'),

    // AI 生成內容相關
    topicInput: document.getElementById('topic-input'),
    textTypeSelect: document.getElementById('text-type-select'),
    customTextTypeInput: document.getElementById('custom-text-type-input'),
    learningObjectivesInput: document.getElementById('learning-objectives-input'),
    toneSelect: document.getElementById('tone-select'),
    customToneInput: document.getElementById('custom-tone-input'),
    competencyBasedCheckbox: document.getElementById('competency-based-checkbox'),
    editPromptBtn: document.getElementById('edit-prompt-btn'),
    studentLevelSelectContent: document.getElementById('student-level-select-content'), // 新增

    // 其他
    commonSettingsCard: document.getElementById('common-settings-card'),
    themeRadios: document.querySelectorAll('input[name="theme"]'),
    previewPlaceholder: document.querySelector('#preview-placeholder p'),
    previewActions: document.getElementById('preview-actions'),
    questionsContainer: document.getElementById('questions-container'),
    studentLevelSelects: [ // 新增：方便同步的陣列
        document.getElementById('student-level-select'),
        document.getElementById('student-level-select-content'),
        document.getElementById('student-level-select-quiz')
    ]
};

// 為了向後相容舊代碼，暫時保留一些 getter
export function getControls() {
    return [
        elements.textInput,
        elements.numQuestionsInput,
        elements.questionTypeSelect,
        elements.difficultySelect,
        elements.questionStyleSelect,
        elements.studentLevelSelect
    ];
}