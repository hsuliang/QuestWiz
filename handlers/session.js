import * as ui from '../ui.js';
import * as state from '../state.js';
import * as utils from '../utils.js';
import { elements } from '../dom.js';

const DRAFT_INPUTS_KEY = 'questwiz_draft_inputs_v1';

export function saveInputDraft() {
    const draft = {
        textInput: elements.textInput ? elements.textInput.value : '',
        topicInput: elements.topicInput ? elements.topicInput.value : '',
        learningObjectivesInput: elements.learningObjectivesInput ? elements.learningObjectivesInput.value : '',
        textTypeSelect: elements.textTypeSelect ? elements.textTypeSelect.value : '科普說明文',
        customTextTypeInput: elements.customTextTypeInput ? elements.customTextTypeInput.value : '',
        toneSelect: elements.toneSelect ? elements.toneSelect.value : '客觀中立',
        customToneInput: elements.customToneInput ? elements.customToneInput.value : '',
        urlInput: elements.urlInput ? elements.urlInput.value : '',
        numQuestionsInput: elements.numQuestionsInput ? elements.numQuestionsInput.value : '5',
        questionTypeSelect: elements.questionTypeSelect ? elements.questionTypeSelect.value : 'multiple_choice',
        difficultySelect: elements.difficultySelect ? elements.difficultySelect.value : '中等',
        questionStyleSelect: elements.questionStyleSelect ? elements.questionStyleSelect.value : 'knowledge-recall',
        studentLevelSelect: elements.studentLevelSelect ? elements.studentLevelSelect.value : '1-2',
        competencyBasedCheckbox: elements.competencyBasedCheckbox ? elements.competencyBasedCheckbox.checked : false,
        formatSelect: elements.formatSelect ? elements.formatSelect.value : '',
        quizTitleInput: elements.quizTitleInput ? elements.quizTitleInput.value : '',
        timestamp: Date.now()
    };
    localStorage.setItem(DRAFT_INPUTS_KEY, JSON.stringify(draft));
}

const debouncedSaveDraft = utils.debounce(saveInputDraft, 1000);

export function restoreDraft() {
    const stateDraft = state.loadDraftState();
    if (stateDraft && (Date.now() - stateDraft.timestamp < 24 * 60 * 60 * 1000)) {
        if (stateDraft.generatedQuestions && stateDraft.generatedQuestions.length > 0) {
            state.setGeneratedQuestions(stateDraft.generatedQuestions);
            ui.renderQuestionsForEditing(stateDraft.generatedQuestions);
            ui.initializeSortable();
        }
        if (stateDraft.uploadedImages && stateDraft.uploadedImages.length > 0) {
            state.setUploadedImages(stateDraft.uploadedImages);
            const fragment = document.createDocumentFragment();
            stateDraft.uploadedImages.forEach(img => {
                const previewWrapper = document.createElement('div');
                previewWrapper.className = 'relative group';
                const imgElement = document.createElement('img');
                imgElement.src = `data:${img.type};base64,${img.data}`;
                imgElement.className = 'w-full h-32 object-cover rounded-lg shadow-md';
                const removeBtn = document.createElement('div');
                removeBtn.className = 'absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer font-bold leading-none transition-all hover:bg-red-500/90 scale-0 group-hover:scale-100';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = () => { 
                    state.setUploadedImages(state.getUploadedImages().filter(i => i.id !== img.id)); 
                    previewWrapper.remove();
                    triggerOrUpdate();
                };
                previewWrapper.appendChild(imgElement); previewWrapper.appendChild(removeBtn);
                fragment.appendChild(previewWrapper);
            });
            if(elements.imagePreviewContainer) elements.imagePreviewContainer.appendChild(fragment);
        }
    }

    try {
        const inputsString = localStorage.getItem(DRAFT_INPUTS_KEY);
        if (inputsString) {
            const inputs = JSON.parse(inputsString);
            if (Date.now() - inputs.timestamp < 24 * 60 * 60 * 1000) {
                if(elements.textInput) {
                    elements.textInput.value = inputs.textInput || '';
                    elements.textInput.dispatchEvent(new Event('input')); 
                }
                if(elements.topicInput) elements.topicInput.value = inputs.topicInput || '';
                if(elements.learningObjectivesInput) elements.learningObjectivesInput.value = inputs.learningObjectivesInput || '';
                if(elements.textTypeSelect) elements.textTypeSelect.value = inputs.textTypeSelect || '科普說明文';
                if(elements.customTextTypeInput) {
                    elements.customTextTypeInput.value = inputs.customTextTypeInput || '';
                    if (inputs.textTypeSelect === 'custom') elements.customTextTypeInput.classList.remove('hidden');
                }
                if(elements.toneSelect) elements.toneSelect.value = inputs.toneSelect || '客觀中立';
                if(elements.customToneInput) {
                    elements.customToneInput.value = inputs.customToneInput || '';
                    if (inputs.toneSelect === 'custom') elements.customToneInput.classList.remove('hidden');
                }
                if(elements.urlInput) elements.urlInput.value = inputs.urlInput || '';
                if(elements.numQuestionsInput) elements.numQuestionsInput.value = inputs.numQuestionsInput || '5';
                if(elements.questionTypeSelect) elements.questionTypeSelect.value = inputs.questionTypeSelect || 'multiple_choice';
                if(elements.difficultySelect) elements.difficultySelect.value = inputs.difficultySelect || '中等';
                if(elements.questionStyleSelect) elements.questionStyleSelect.value = inputs.questionStyleSelect || 'knowledge-recall';
                if(elements.studentLevelSelect) elements.studentLevelSelect.value = inputs.studentLevelSelect || '1-2';
                if(elements.quizTitleInput) elements.quizTitleInput.value = inputs.quizTitleInput || '';
                if(elements.competencyBasedCheckbox) elements.competencyBasedCheckbox.checked = inputs.competencyBasedCheckbox || false;
                if(elements.formatSelect) elements.formatSelect.value = inputs.formatSelect || '';

                if (inputs.textInput || inputs.topicInput || (stateDraft && stateDraft.generatedQuestions.length > 0)) {
                    ui.showToast(ui.t('toast_restored'), 'success');
                    ui.updateRegenerateButtonState();
                    
                    if (inputs.topicInput) { if(elements.tabs.input.buttons[3]) elements.tabs.input.buttons[3].click(); } 
                    else if (state.getUploadedImages().length > 0) { if(elements.tabs.input.buttons[1]) elements.tabs.input.buttons[1].click(); } 
                    else if (inputs.textInput) { if(elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click(); }
                }
            }
        }
    } catch (e) {
        console.error('恢復 Input 草稿失敗:', e);
    }
}

export function bindAutoSave() {
    const inputs = [
        elements.textInput, elements.topicInput, elements.learningObjectivesInput, 
        elements.textTypeSelect, elements.customTextTypeInput, elements.toneSelect, 
        elements.customToneInput, elements.urlInput, elements.numQuestionsInput, 
        elements.questionTypeSelect, elements.difficultySelect, elements.questionStyleSelect, 
        elements.studentLevelSelect, elements.competencyBasedCheckbox, elements.formatSelect
    ];
    inputs.forEach(input => {
        if (input) {
            const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input';
            utils.addSafeEventListener(input, eventType, debouncedSaveDraft);
        }
    });
}

export function handleWorkTabClick(tabId) {
    ui.switchWorkTab(tabId);
    // Note: library refresh logic is now in library.js, but handleWorkTabClick might need to call it if tabId is library.
    // However, main.js usually calls library functions directly. Let's keep it simple here.
    // Actually, checking main.js, it calls handlers.handleWorkTabClick.
    // So we need to import refreshLibrary here? Or export a function that does both.
    // To avoid circular dependency hell, let's keep UI switching here, and specific logic in main.js call?
    // No, main.js expects one handler.
    // Let's defer library refresh to library.js and handle it there or via a callback?
    // Simplest: main.js imports both and calls: () => { Session.handleWorkTabClick(...); if(lib) Library.refresh... }
    // But let's stick to the original plan: handleWorkTabClick was in handlers.js.
    // We can move `handleWorkTabClick` to `library.js` if it's primarily about library?
    // No, it handles 'edit' too.
    // Let's put it in session.js but we can't import refreshLibrary easily without circular dep if library imports session.
    // Solution: main.js logic change.
}

export function checkContentAndToggleButton() {
    const hasText = elements.textInput && elements.textInput.value.trim() !== '';
    const hasImages = state.getUploadedImages().length > 0;
    
    if (elements.regenerateBtn) {
        if (hasText || hasImages) {
            elements.regenerateBtn.classList.remove('hidden');
        } else {
            elements.regenerateBtn.classList.add('hidden');
        }
    }
    
    ui.updateRegenerateButtonState();
}

export function triggerOrUpdate() {
    checkContentAndToggleButton();
}

export function clearAllInputs() {
    if(elements.textInput) elements.textInput.value = ''; 
    if(elements.fileInput) elements.fileInput.value = ''; 
    if(elements.fileNameDisplay) elements.fileNameDisplay.textContent = ''; 
    if(elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = '';
    if(elements.imageInput) elements.imageInput.value = ''; 
    if(elements.imagePreviewContainer) elements.imagePreviewContainer.innerHTML = ''; 
    if(elements.imageErrorDisplay) elements.imageErrorDisplay.innerHTML = ''; 
    if(elements.urlInput) elements.urlInput.value = '';
    state.setUploadedImages([]);
    
    if(elements.downloadTxtBtn) elements.downloadTxtBtn.classList.add('hidden');
    if(elements.shareContentBtn) elements.shareContentBtn.classList.add('hidden');
    
    if(elements.topicInput) elements.topicInput.value = ''; 
    if(elements.textTypeSelect) elements.textTypeSelect.value = '科普說明文';
    if(elements.customTextTypeInput) {
        elements.customTextTypeInput.value = '';
        elements.customTextTypeInput.classList.add('hidden');
    }
    if(elements.learningObjectivesInput) elements.learningObjectivesInput.value = '';
    if(elements.toneSelect) elements.toneSelect.value = '客觀中立';
    if(elements.customToneInput) {
        elements.customToneInput.value = '';
        elements.customToneInput.classList.add('hidden');
    }
    if(elements.competencyBasedCheckbox) elements.competencyBasedCheckbox.checked = false;
    if(elements.quizTitleInput) elements.quizTitleInput.value = ''; 
    
    if(elements.studentLevelSelects) {
        elements.studentLevelSelects.forEach(s => { if(s) s.value = ''; }); 
    } else if(elements.studentLevelSelect) {
        elements.studentLevelSelect.value = '';
    }

    if(elements.questionStyleSelect) elements.questionStyleSelect.value = 'knowledge-recall';
    if(elements.formatSelect) elements.formatSelect.value = ''; 

    state.setGeneratedQuestions([]);
    
    ui.renderQuestionsForEditing([]); 
    if (elements.questionsContainer) elements.questionsContainer.innerHTML = '';
    
    const summaryCard = document.getElementById('quiz-summary-card');
    if (summaryCard) summaryCard.remove();

    if(elements.previewPlaceholder) {
        elements.previewPlaceholder.classList.remove('hidden');
        if(elements.previewPlaceholder.parentElement) elements.previewPlaceholder.parentElement.classList.remove('hidden');
    }
    if (elements.previewActions) elements.previewActions.classList.add('hidden');
    
    localStorage.removeItem(DRAFT_INPUTS_KEY); 
    state.clearDraftState(); 

    checkContentAndToggleButton(); 
    
    // [新增] 回到編輯分頁
    ui.switchWorkTab('edit');

    ui.showToast(ui.t('toast_cleared'), 'success');
}
