import { generateSingleBatch } from '../api.js';
import * as ui from '../ui.js';
import * as state from '../state.js';
import { elements } from '../dom.js';
import { isEnglish, handleError } from '../utils.js';
import { normalizeQuestions } from '../utils/normalizer.js';
import { questionLoadingMessages } from '../config.js';
import { QUESTION_STYLE, DIFFICULTY, BLOOM_LEVELS } from '../constants.js';

function calculateBloomDistribution(totalQuestions, questionStyle, difficulty, userSelectedLevels) {
    if (userSelectedLevels.length > 0) {
        const distribution = {};
        const baseCount = Math.floor(totalQuestions / userSelectedLevels.length);
        let remainder = totalQuestions % userSelectedLevels.length;
        userSelectedLevels.forEach(level => { distribution[level] = baseCount; });
        for (let i = 0; i < remainder; i++) { distribution[userSelectedLevels[i]] += 1; }
        return distribution;
    }
    let config;
    if (questionStyle === QUESTION_STYLE.KNOWLEDGE_RECALL) {
        config = {
            [DIFFICULTY.EASY]: { [BLOOM_LEVELS.REMEMBER]: 0.7, [BLOOM_LEVELS.UNDERSTAND]: 0.3 },
            [DIFFICULTY.MEDIUM]: { [BLOOM_LEVELS.REMEMBER]: 0.5, [BLOOM_LEVELS.UNDERSTAND]: 0.4, [BLOOM_LEVELS.APPLY]: 0.1 },
            [DIFFICULTY.HARD]: { [BLOOM_LEVELS.UNDERSTAND]: 0.5, [BLOOM_LEVELS.APPLY]: 0.3, [BLOOM_LEVELS.ANALYZE]: 0.2 }
        }[difficulty] || { [BLOOM_LEVELS.REMEMBER]: 0.5, [BLOOM_LEVELS.UNDERSTAND]: 0.5 };
    } else {
        config = {
            [DIFFICULTY.EASY]: { [BLOOM_LEVELS.UNDERSTAND]: 0.5, [BLOOM_LEVELS.APPLY]: 0.5 },
            [DIFFICULTY.MEDIUM]: { [BLOOM_LEVELS.UNDERSTAND]: 0.3, [BLOOM_LEVELS.APPLY]: 0.4, [BLOOM_LEVELS.ANALYZE]: 0.3 },
            [DIFFICULTY.HARD]: { [BLOOM_LEVELS.APPLY]: 0.3, [BLOOM_LEVELS.ANALYZE]: 0.4, [BLOOM_LEVELS.EVALUATE]: 0.3 }
        }[difficulty] || { [BLOOM_LEVELS.APPLY]: 0.5, [BLOOM_LEVELS.ANALYZE]: 0.5 };
    }
    const activeLevels = Object.keys(config).filter(level => config[level] > 0);
    const distribution = {};
    activeLevels.forEach(level => distribution[level] = 0);
    let remainingQuestions = totalQuestions;
    if (totalQuestions >= activeLevels.length) {
        activeLevels.forEach(level => { distribution[level] = 1; remainingQuestions--; });
    }
    if (remainingQuestions > 0) {
        const items = activeLevels.map(level => {
            const exact = remainingQuestions * config[level];
            return { level, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
        });
        let currentTotalUsed = items.reduce((sum, item) => sum + item.count, 0);
        let diff = remainingQuestions - currentTotalUsed;
        items.sort((a, b) => b.remainder - a.remainder || config[b.level] - config[a.level]);
        for (let i = 0; i < diff; i++) { items[i].count++; }
        items.forEach(item => { distribution[item.level] += item.count; });
    }
    return distribution;
}

export async function triggerQuestionGeneration() {
    if (state.isBusy('generate')) return;
    if (!elements.studentLevelSelect.value) { ui.showToast('請先選擇學生程度', 'error'); return; }
    const text = elements.textInput ? elements.textInput.value : '';
    if (!text.trim() && state.getUploadedImages().length === 0) { return ui.showToast('請先提供內容或上傳圖片！', 'error'); }
    
    ui.switchWorkTab('edit');
    const settings = {
        totalQuestions: parseInt(elements.numQuestionsInput.value, 10) || 5,
        questionType: elements.questionTypeSelect.value,
        difficulty: elements.difficultySelect.value,
        questionStyle: elements.questionStyleSelect.value,
        studentLevel: elements.studentLevelSelect.value,
        text,
        uploadedImages: state.getUploadedImages(),
        userSelectedLevels: Array.from(elements.bloomLevelCheckboxes).filter(cb => cb.checked).map(cb => cb.value)
    };
    let languageChoice = 'chinese';
    if (isEnglish(text)) {
        try { languageChoice = await ui.askForLanguageChoice(); } catch (e) { return; }
    }
    settings.languageChoice = languageChoice;
    proceedWithGeneration(settings);
}

function commitGeneratedQuestions(questions, summaryMeta = null) {
    state.setGeneratedQuestions(questions);
    ui.renderQuestionsForEditing(questions);
    ui.initializeSortable();
    ui.updateRegenerateButtonState();
    if (summaryMeta) { ui.renderQuizSummary(summaryMeta); }
}

async function proceedWithGeneration(settings) {
    const { requestId, signal } = state.startTask('generate');
    
    ui.showLoader(questionLoadingMessages[Math.floor(Math.random() * questionLoadingMessages.length)]);
    ui.renderQuestionsForEditing([]); 
    if(document.getElementById('quiz-summary-card')) document.getElementById('quiz-summary-card').remove();

    try {
        const bloomDistribution = calculateBloomDistribution(settings.totalQuestions, settings.questionStyle, settings.difficulty, settings.userSelectedLevels);
        const levelsToProcess = Object.keys(bloomDistribution).filter(l => bloomDistribution[l] > 0);
        let allGeneratedQs = [];
        let titleUpdated = false;
        let lastMeta = null;

        for (const level of levelsToProcess) {
            let count = bloomDistribution[level];
            const MAX_BATCH = settings.questionStyle === QUESTION_STYLE.COMPETENCY_BASED ? 3 : 5;
            while (count > 0) {
                if (signal.aborted || !state.isTaskValid('generate', requestId)) return;
                
                const batchSize = Math.min(count, MAX_BATCH);
                const result = await generateSingleBatch(batchSize, settings.questionType, settings.difficulty, settings.text, settings.uploadedImages, settings.questionStyle, signal, settings.languageChoice, settings.studentLevel, level);
                
                if (state.isTaskValid('generate', requestId) && result.questions && result.questions.length > 0) {
                    const sanitizedBatch = normalizeQuestions(result.questions, level);
                    allGeneratedQs = allGeneratedQs.concat(sanitizedBatch);
                    ui.renderQuestionsForEditing(allGeneratedQs);
                    ui.initializeSortable();
                    if (!titleUpdated && result.suggestedTitle && elements.quizTitleInput) {
                        elements.quizTitleInput.value = result.suggestedTitle.trim();
                        titleUpdated = true;
                    }
                    if (result.meta) lastMeta = result.meta;
                }
                count -= batchSize;
                if (count > 0) await new Promise(res => setTimeout(res, 800));
            }
        }

        if (state.isTaskValid('generate', requestId) && allGeneratedQs.length > 0) {
            commitGeneratedQuestions(allGeneratedQs, {
                questionStyle: settings.questionStyle,
                difficulty: settings.difficulty,
                totalQuestions: allGeneratedQs.length,
                distribution: bloomDistribution,
                isAutoGenerated: settings.userSelectedLevels.length === 0
            });
        }
    } catch(error) {
         if (error.name === 'AbortError') return;
         handleError(error, 'ProceedWithGeneration', ui.showToast);
         ui.showErrorState(error.message, () => triggerQuestionGeneration());
    } finally {
        if (state.isTaskValid('generate', requestId)) {
            state.endTask('generate');
            ui.hideLoader();
            ui.updateRegenerateButtonState();
        }
    }
}
