import { generateSingleBatch } from '../api.js';
import * as ui from '../ui.js';
import * as state from '../state.js';
import { elements } from '../dom.js';
import { isEnglish } from '../utils.js';
import { handleError } from '../utils/errorHandler.js'; // [Fix] Separate import
import { normalizeQuestions } from '../utils/normalizer.js';
import { QUESTION_STYLE, DIFFICULTY, BLOOM_LEVELS } from '../constants.js';

/**
 * 計算布魯姆分配比例
 */
function calculateBloomDistribution(totalQuestions, questionStyle, difficulty, userSelectedLevels) {
    if (userSelectedLevels && userSelectedLevels.length > 0) {
        const distribution = {};
        const baseCount = Math.floor(totalQuestions / userSelectedLevels.length);
        let remainder = totalQuestions % userSelectedLevels.length;
        userSelectedLevels.forEach(level => { distribution[level] = baseCount; });
        for (let i = 0; i < remainder; i++) { distribution[userSelectedLevels[i]] += 1; }
        return distribution;
    }
    
    // [Restored] 完整的布魯姆分配邏輯
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
    // 確保每個層級至少有一題
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
        
        // 依照餘數排序分配
        items.sort((a, b) => b.remainder - a.remainder || config[b.level] - config[a.level]);
        for (let i = 0; i < diff; i++) { items[i].count++; }
        
        items.forEach(item => { distribution[item.level] += item.count; });
    }
    return distribution;
}

/**
 * 出題主入口
 */
export async function triggerQuestionGeneration() {
    console.log('[Generator] triggerQuestionGeneration called');
    
    if (state.isBusy('generate')) {
        console.warn('[Generator] Already busy, ignoring request');
        return;
    }

    const text = elements.textInput ? elements.textInput.value : '';
    const uploadedImages = state.getUploadedImages();
    
    if (!text.trim() && uploadedImages.length === 0) {
        ui.showToast('請先提供內容或上傳圖片！', 'error');
        return;
    }

    if (!elements.studentLevelSelect.value) {
        ui.showToast('請先選擇學生程度', 'error');
        return;
    }

    // [New] 偵測模式
    const expertSettings = document.getElementById('expert-mode-settings');
    const isExpertMode = expertSettings && !expertSettings.classList.contains('hidden');
    const totalQuestions = parseInt(elements.numQuestionsInput.value, 10) || 5;
    const selectedKeywords = state.getSelectedKeywords();

    console.log(`[Generator] ExpertMode: ${isExpertMode}, Keywords: ${selectedKeywords.length}, TotalQs: ${totalQuestions}`);

    // [恢復] 重點數量檢查
    if (selectedKeywords.length > totalQuestions) {
        console.log('[Generator] Keywords exceed questions, asking for confirmation...');
        const proceed = confirm(`您選取了 ${selectedKeywords.length} 個重點，但設定只出 ${totalQuestions} 題。建議增加題數，否則部分重點將被隨機忽略。是否繼續？`);
        if (!proceed) {
            console.log('[Generator] User cancelled keyword warning.');
            return;
        }
    }
    
    const settings = {
        isExpertMode,
        totalQuestions,
        difficulty: elements.difficultySelect.value,
        studentLevel: elements.studentLevelSelect.value,
        text,
        uploadedImages,
        selectedKeywords,
        languageChoice: 'chinese', // 預設值
        // [Phase 4.3] 注入領域與情境參數
        domain: elements.domainSelectQuiz ? elements.domainSelectQuiz.value : 'chinese',
        contextType: elements.contextTypeSelect ? elements.contextTypeSelect.value : ''
    };

    // [恢復] 語言偵測邏輯
    const isEng = isEnglish(text);
    console.log(`[Generator] Language detection - isEnglish: ${isEng}`);

    if (!isExpertMode && isEng) {
        console.log('[Generator] Prompting for language choice...');
        try {
            settings.languageChoice = await ui.askForLanguageChoice();
            console.log(`[Generator] User selected language: ${settings.languageChoice}`);
        } catch (e) {
            console.log('[Generator] Language choice cancelled or failed:', e);
            return;
        }
    } else {
        console.log('[Generator] Skipping language choice (Not English or Expert Mode)');
    }

    if (isExpertMode) {
        // 抓取專家模式設定
        settings.subject = document.querySelector('input[name="expert-subject"]:checked')?.value || 'chinese';
        settings.expertTypes = Array.from(document.querySelectorAll('.expert-checkbox:checked')).map(cb => cb.value);
        
        if (settings.expertTypes.length === 0) {
            ui.showToast('請至少勾選一種專家題型！', 'error');
            return;
        }
        settings.languageChoice = 'chinese'; // 語文專家模式強制中文
    } else {
        // 通用模式設定
        settings.questionType = elements.questionTypeSelect.value;
        settings.questionStyle = elements.questionStyleSelect.value;
        settings.userSelectedLevels = Array.from(elements.bloomLevelCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
    }

    // [Fix] 立即切換到編輯分頁顯示 Loader
    ui.switchWorkTab('edit');
    await proceedWithGeneration(settings);
}

/**
 * 執行 AI 請求與 State 更新
 */
async function proceedWithGeneration(settings) {
    console.log('[Generator] proceedWithGeneration started');
    const { requestId, signal } = state.startTask('generate');
    
    // [New] 讀取模型設定
    const savedModel = localStorage.getItem('quizGenModel_v1') || 'standard';
    const isHighQuality = savedModel === 'high-quality';

    if (isHighQuality) {
        ui.showLoader("Gemini 3 深度思考中... (這可能需要一點時間)");
        ui.showToast('正在使用 Gemini 3 預覽版進行深度推理', 'info');
    } else {
        ui.showLoader("AI 正在光速生成題目...");
    }

    // 清空舊資料，觸發響應式 UI 清空預覽
    state.setGeneratedQuestions([]);
    state.setQuizSummary(null);

    try {
        const bloomDistribution = calculateBloomDistribution(settings.totalQuestions, settings.questionStyle, settings.difficulty, settings.userSelectedLevels);
        const levelsToProcess = Object.keys(bloomDistribution).filter(l => bloomDistribution[l] > 0);
        let allGeneratedQs = [];

        for (const level of levelsToProcess) {
            let count = bloomDistribution[level];
            while (count > 0) {
                if (signal.aborted || !state.isTaskValid('generate', requestId)) return;
                
                const batchSize = Math.min(count, 5);
                console.log(`[Generator] Requesting batch of ${batchSize} for level ${level} (HighQuality: ${isHighQuality})`);
                
                const result = await generateSingleBatch(
                    batchSize, settings.questionType, settings.difficulty, 
                    settings.text, settings.uploadedImages, settings.questionStyle, 
                    signal, settings.languageChoice, settings.studentLevel, 
                    level, settings.selectedKeywords, settings, isHighQuality,
                    settings.domain, settings.contextType
                );
                
                if (result && result.questions) {
                    const sanitizedBatch = normalizeQuestions(result.questions, level);
                    allGeneratedQs = allGeneratedQs.concat(sanitizedBatch);
                    
                    // 關鍵：更新 State，這會觸發 main.js 渲染 UI
                    console.log(`[Generator] New questions received. Total: ${allGeneratedQs.length}`);
                    state.setGeneratedQuestions([...allGeneratedQs]);
                    
                    if (result.suggestedTitle && elements.quizTitleInput) {
                        elements.quizTitleInput.value = result.suggestedTitle.trim();
                    }
                }
                count -= batchSize;
            }
        }

        // 最後產出摘要
        state.setQuizSummary({
            questionStyle: settings.questionStyle,
            difficulty: settings.difficulty,
            totalQuestions: allGeneratedQs.length,
            distribution: bloomDistribution,
            isAutoGenerated: settings.userSelectedLevels.length === 0
        });
        ui.switchWorkTab('edit'); // 自動切回編輯分頁

    } catch (error) {
        console.error('[Generator] Error during generation:', error);
        handleError(error, 'proceedWithGeneration');
    } finally {
        console.log('[Generator] Task complete, ending session');
        state.endTask('generate');
        state.triggerUIUpdate();
    }
}