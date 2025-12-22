import { generateSingleBatch } from '../api.js';
import * as ui from '../ui.js';
import * as state from '../state.js';
import { elements } from '../dom.js';
import { isEnglish } from '../utils.js';
import { questionLoadingMessages } from '../config.js';

/**
 * 使用「大餘數優先分配法」精確且均衡地計算布魯姆層次分佈
 */
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
    if (questionStyle === 'knowledge-recall') {
        config = {
            '簡單': { remember: 0.7, understand: 0.3 },
            '中等': { remember: 0.5, understand: 0.4, apply: 0.1 },
            '困難': { understand: 0.5, apply: 0.3, analyze: 0.2 }
        }[difficulty] || { remember: 0.5, understand: 0.5 };
    } else {
        config = {
            '簡單': { understand: 0.5, apply: 0.5 },
            '中等': { understand: 0.3, apply: 0.4, analyze: 0.3 },
            '困難': { apply: 0.3, analyze: 0.4, evaluate: 0.3 }
        }[difficulty] || { apply: 0.5, analyze: 0.5 };
    }

    // 1. 識別哪些層次「有份」(權重 > 0)
    const activeLevels = Object.keys(config).filter(level => config[level] > 0);
    const distribution = {};
    activeLevels.forEach(level => distribution[level] = 0);

    let remainingQuestions = totalQuestions;

    // 2. 基本保障：如果總題數夠，給每個有份的層次各 1 題保底
    if (totalQuestions >= activeLevels.length) {
        activeLevels.forEach(level => {
            distribution[level] = 1;
            remainingQuestions--;
        });
    }

    // 3. 分配餘數：依照「小數部分 (Remainder)」由大到小排序，優先分配剩下的題數
    if (remainingQuestions > 0) {
        const items = activeLevels.map(level => {
            const exact = remainingQuestions * config[level];
            return {
                level,
                count: Math.floor(exact),
                remainder: exact - Math.floor(exact)
            };
        });

        let currentTotalUsed = items.reduce((sum, item) => sum + item.count, 0);
        let diff = remainingQuestions - currentTotalUsed;

        // 先按小數點大小排，若小數點相同則按權重排
        items.sort((a, b) => b.remainder - a.remainder || config[b.level] - config[a.level]);
        
        for (let i = 0; i < diff; i++) {
            items[i].count++;
        }

        // 疊加回 distribution
        items.forEach(item => {
            distribution[item.level] += item.count;
        });
    }

    return distribution;
}

export async function triggerQuestionGeneration() {
    if (!elements.studentLevelSelect.value) {
        ui.showToast('請先選擇學生程度', 'error');
        return;
    }
    const text = elements.textInput ? elements.textInput.value : '';
    if (!text.trim() && state.getUploadedImages().length === 0) {
        return ui.showToast('請先提供內容或上傳圖片！', 'error');
    }

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

async function proceedWithGeneration(settings) {
    if (state.getCurrentRequestController()) state.getCurrentRequestController().abort();
    state.setCurrentRequestController(new AbortController());
    const signal = state.getCurrentRequestController().signal;

    ui.showLoader(questionLoadingMessages[Math.floor(Math.random() * questionLoadingMessages.length)]);
    ui.renderQuestionsForEditing([]); 
    if(document.getElementById('quiz-summary-card')) document.getElementById('quiz-summary-card').remove();

    try {
        const bloomDistribution = calculateBloomDistribution(settings.totalQuestions, settings.questionStyle, settings.difficulty, settings.userSelectedLevels);
        
        console.log("%c[出題開始] 執行均衡分佈分配:", "color: #4f46e5; font-weight: bold;", bloomDistribution);

        const levelsToProcess = Object.keys(bloomDistribution).filter(l => bloomDistribution[l] > 0);
        let allGeneratedQs = [];
        let titleUpdated = false;

        for (const level of levelsToProcess) {
            let count = bloomDistribution[level];
            const MAX_BATCH = settings.questionStyle === 'competency-based' ? 3 : 5;
            
            while (count > 0) {
                const batchSize = Math.min(count, MAX_BATCH);
                console.log(`正在生成 [${level}] 層次，本批次 ${batchSize} 題...`);
                
                const result = await generateSingleBatch(batchSize, settings.questionType, settings.difficulty, settings.text, settings.uploadedImages, settings.questionStyle, signal, settings.languageChoice, settings.studentLevel, level);

                if (result.questions && result.questions.length > 0) {
                    const mappedQs = result.questions.map(q => ({...q, bloomLevel: level}));
                    allGeneratedQs = allGeneratedQs.concat(mappedQs);
                    ui.renderQuestionsForEditing(allGeneratedQs);
                    ui.initializeSortable();

                    if (!titleUpdated && result.suggestedTitle && elements.quizTitleInput) {
                        elements.quizTitleInput.value = result.suggestedTitle.trim();
                        titleUpdated = true;
                    }
                }
                count -= batchSize;
                if (count > 0) await new Promise(res => setTimeout(res, 800));
            }
        }

        if (allGeneratedQs.length > 0) {
            state.setGeneratedQuestions(allGeneratedQs);
            ui.renderQuizSummary({
                questionStyle: settings.questionStyle,
                difficulty: settings.difficulty,
                totalQuestions: allGeneratedQs.length,
                distribution: bloomDistribution,
                isAutoGenerated: settings.userSelectedLevels.length === 0
            });
            console.log("%c[出題完成]", "color: #16a34a; font-weight: bold;");
        }
    } catch(error) {
         if (error.name === 'AbortError') return;
         console.error('生成失敗:', error);
         ui.showErrorState(error.message, () => triggerQuestionGeneration());
    } finally {
        ui.hideLoader();
        ui.updateRegenerateButtonState();
    }
}