import { QUESTION_STYLE } from '../constants.js';
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
        questionStyleSelect: elements.questionStyleSelect ? elements.questionStyleSelect.value : QUESTION_STYLE.KNOWLEDGE_RECALL,
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
            
            // [Fix] 恢復摘要卡片 (如果有題目)
            // 這裡我們需要重新計算摘要並渲染，但簡單的做法是依賴 generate 時的 meta
            // 不過因為 state 沒存 summary，所以這裡暫時只恢復題目
            // 如果要完美恢復，需要在 state 裡多存 summaryData
        }
        if (stateDraft.uploadedImages && stateDraft.uploadedImages.length > 0) {
            state.setUploadedImages(stateDraft.uploadedImages);
            const fragment = document.createDocumentFragment();
            stateDraft.uploadedImages.forEach(img => {
                const wrap = document.createElement('div');
                wrap.className = 'relative group';
                wrap.innerHTML = `<img src='data:${img.type};base64,${img.data}' class='w-full h-32 object-cover rounded-lg shadow-md'><div class='absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer font-bold leading-none transition-all hover:bg-red-500/90 scale-0 group-hover:scale-100'>&times;</div>`;
                wrap.querySelector('div').onclick = () => { 
                    state.setUploadedImages(state.getUploadedImages().filter(i => i.id !== img.id)); 
                    wrap.remove(); 
                    triggerOrUpdate(); 
                };
                fragment.appendChild(wrap);
            });
            if(elements.imagePreviewContainer) elements.imagePreviewContainer.appendChild(fragment);
        }
        if (stateDraft.selectedKeywords) {
            state.setSelectedKeywords(stateDraft.selectedKeywords);
            // 這裡應該要恢復關鍵字 UI，但目前先從簡，等待使用者重新分析或手動加
        }
    }

    try {
        const inputsString = localStorage.getItem(DRAFT_INPUTS_KEY);
        if (inputsString) {
            const inputs = JSON.parse(inputsString);
            if (Date.now() - inputs.timestamp < 24 * 60 * 60 * 1000) {
                if(elements.textInput) { elements.textInput.value = inputs.textInput || ''; elements.textInput.dispatchEvent(new Event('input')); }
                if(elements.topicInput) elements.topicInput.value = inputs.topicInput || '';
                if(elements.learningObjectivesInput) elements.learningObjectivesInput.value = inputs.learningObjectivesInput || '';
                if(elements.textTypeSelect) elements.textTypeSelect.value = inputs.textTypeSelect || '科普說明文';
                if(elements.customTextTypeInput) { elements.customTextTypeInput.value = inputs.customTextTypeInput || ''; if (inputs.textTypeSelect === 'custom') elements.customTextTypeInput.classList.remove('hidden'); }
                if(elements.toneSelect) elements.toneSelect.value = inputs.toneSelect || '客觀中立';
                if(elements.customToneInput) { elements.customToneInput.value = inputs.customToneInput || ''; if (inputs.toneSelect === 'custom') elements.customToneInput.classList.remove('hidden'); }
                if(elements.urlInput) elements.urlInput.value = inputs.urlInput || '';
                if(elements.numQuestionsInput) elements.numQuestionsInput.value = inputs.numQuestionsInput || '5';
                if(elements.questionTypeSelect) elements.questionTypeSelect.value = inputs.questionTypeSelect || 'multiple_choice';
                if(elements.difficultySelect) elements.difficultySelect.value = inputs.difficultySelect || '中等';
                if(elements.questionStyleSelect) elements.questionStyleSelect.value = inputs.questionStyleSelect || QUESTION_STYLE.KNOWLEDGE_RECALL;
                if(elements.studentLevelSelect) elements.studentLevelSelect.value = inputs.studentLevelSelect || '';
                if(elements.quizTitleInput) elements.quizTitleInput.value = inputs.quizTitleInput || '';
                if(elements.competencyBasedCheckbox) elements.competencyBasedCheckbox.checked = inputs.competencyBasedCheckbox || false;
                if(elements.formatSelect) elements.formatSelect.value = inputs.formatSelect || '';
                if (inputs.textInput || inputs.topicInput || (stateDraft && stateDraft.generatedQuestions.length > 0)) { ui.updateRegenerateButtonState(); }
            }
        }
    } catch (e) { console.error('恢復 Input 草稿失敗:', e); }
}

export function bindAutoSave() {
    const inputs = [ elements.textInput, elements.topicInput, elements.learningObjectivesInput, elements.textTypeSelect, elements.customTextTypeInput, elements.toneSelect, elements.customToneInput, elements.urlInput, elements.numQuestionsInput, elements.questionTypeSelect, elements.difficultySelect, elements.questionStyleSelect, elements.studentLevelSelect, elements.competencyBasedCheckbox, elements.formatSelect ];
    inputs.forEach(input => { if (input) utils.addSafeEventListener(input, (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input', () => { debouncedSaveDraft(); checkContentAndToggleButton(); }); });
}

export function checkContentAndToggleButton() {
    const textValue = elements.textInput ? elements.textInput.value.trim() : '';
    const hasText = textValue !== '';
    const hasImages = state.getUploadedImages().length > 0;
    const studentLevel = elements.studentLevelSelect ? elements.studentLevelSelect.value : '';
    
    if (elements.regenerateBtn) {
        const shouldShowGenerate = (hasText || hasImages) && studentLevel !== '';
        elements.regenerateBtn.classList.toggle('hidden', !shouldShowGenerate);
    }
    if (elements.analyzeContentBtn) {
        const shouldShowAnalyze = (textValue.length >= 50 || hasImages);
        elements.analyzeContentBtn.classList.toggle('hidden', !shouldShowAnalyze);
    }
    
    // 如果內容被清空，自動隱藏分析區域
    if (!hasText && !hasImages && elements.keywordAnalysisArea) { 
        elements.keywordAnalysisArea.classList.add('hidden'); 
        state.setSelectedKeywords([]); 
    }
    
    ui.updateRegenerateButtonState();
}

export function triggerOrUpdate() { checkContentAndToggleButton(); }

/**
 * 清除所有內容並回到初始狀態
 */
export function clearAllInputs() {
    // 1. 清空所有輸入框
    if(elements.textInput) elements.textInput.value = ''; 
    if(elements.fileInput) elements.fileInput.value = ''; 
    if(elements.fileNameDisplay) elements.fileNameDisplay.textContent = ''; 
    if(elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = '';
    if(elements.imageInput) elements.imageInput.value = ''; 
    if(elements.imagePreviewContainer) elements.imagePreviewContainer.innerHTML = ''; 
    if(elements.imageErrorDisplay) elements.imageErrorDisplay.innerHTML = ''; 
    if(elements.urlInput) elements.urlInput.value = '';
    state.setUploadedImages([]);
    
    // 2. 清除分析狀態
    state.setSelectedKeywords([]);
    if (elements.keywordContainer) elements.keywordContainer.innerHTML = '';
    if (elements.keywordAnalysisArea) elements.keywordAnalysisArea.classList.add('hidden');
    if (elements.customKeywordInput) elements.customKeywordInput.value = '';

    // 3. 隱藏操作按鈕
    if(elements.downloadTxtBtn) elements.downloadTxtBtn.classList.add('hidden');
    if(elements.shareContentBtn) elements.shareContentBtn.classList.add('hidden');
    
    // 4. 重置 AI 生成設定
    if(elements.topicInput) elements.topicInput.value = ''; 
    if(elements.textTypeSelect) elements.textTypeSelect.value = '科普說明文';
    if(elements.customTextTypeInput) { elements.customTextTypeInput.value = ''; elements.customTextTypeInput.classList.add('hidden'); }
    if(elements.learningObjectivesInput) elements.learningObjectivesInput.value = '';
    if(elements.toneSelect) elements.toneSelect.value = '客觀中立';
    if(elements.customToneInput) { elements.customToneInput.value = ''; elements.customToneInput.classList.add('hidden'); }
    if(elements.competencyBasedCheckbox) elements.competencyBasedCheckbox.checked = false;
    
    // 5. 重置題目設定
    if(elements.quizTitleInput) elements.quizTitleInput.value = ''; 
    if(elements.studentLevelSelects) elements.studentLevelSelects.forEach(s => { if(s) s.value = ''; }); 
    else if(elements.studentLevelSelect) elements.studentLevelSelect.value = '';
    if(elements.questionStyleSelect) elements.questionStyleSelect.value = QUESTION_STYLE.KNOWLEDGE_RECALL;
    if(elements.formatSelect) elements.formatSelect.value = ''; 

    // 6. 清除已生成題目與摘要
    state.setGeneratedQuestions([]);
    ui.renderQuestionsForEditing([]); // 這會清空列表與操作按鈕
    
    // [Fix] 強制清空摘要容器
    const summaryContainer = document.getElementById('quiz-summary-container');
    if (summaryContainer) summaryContainer.innerHTML = '';

    // 7. 顯示 Placeholder
    if(elements.previewPlaceholder) {
        elements.previewPlaceholder.classList.remove('hidden');
        if(elements.previewPlaceholder.parentElement) elements.previewPlaceholder.parentElement.classList.remove('hidden');
    }
    
    // 8. 清除儲存
    localStorage.removeItem(DRAFT_INPUTS_KEY); 
    state.clearDraftState(); 
    
    // 9. 更新 UI 狀態
    checkContentAndToggleButton(); 
    ui.switchWorkTab('edit');
    ui.showToast(ui.t('toast_cleared'), 'success');
}
