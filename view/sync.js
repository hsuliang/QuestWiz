import { elements } from '../dom.js';
import * as state from '../state.js';
import { UI_RULES } from '../rules.js';
import { translations } from '../translations.js';

/**
 * 全域 UI 同步中心
 */
export function refreshUI() {
    const text = elements.textInput ? elements.textInput.value.trim() : '';
    const imageCount = state.getUploadedImages().length;
    const studentLevel = elements.studentLevelSelect ? elements.studentLevelSelect.value : '';
    const hasQuestions = state.getGeneratedQuestions().length > 0;
    const lang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    const t = translations[lang];

    // 1. 同步所有學生程度選單
    if (elements.studentLevelSelects) {
        elements.studentLevelSelects.forEach(select => {
            if (select.value !== studentLevel) select.value = studentLevel;
        });
    }

    // 2. 更新分析按鈕狀態
    if (elements.analyzeContentBtn) {
        const visible = UI_RULES.shouldShowAnalyze(text.length, imageCount);
        elements.analyzeContentBtn.classList.toggle('hidden', !visible);
    }

    // 3. 更新出題按鈕狀態與文字 (解決語言切不回來的核心點)
    if (elements.regenerateBtn) {
        const visible = UI_RULES.shouldShowGenerate(text.length > 0 || imageCount > 0, studentLevel !== '');
        elements.regenerateBtn.classList.toggle('hidden', !visible);

        // 更新文字：使用翻譯檔獲取文字，並保留圖示結構
        const icon = hasQuestions 
            ? `<svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 mr-2' viewBox='0 0 20 20' fill='currentColor'><path fill-rule='evenodd' d='M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 10a1 1 0 01-1 1H5a1 1 0 110-2h5.001a5.002 5.002 0 004.087-7.885 1 1 0 111.732-1.001A7.002 7.002 0 0114 12z' clip-rule='evenodd' /></svg>` 
            : `<svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 mr-2' viewBox='0 0 20 20' fill='currentColor'><path fill-rule='evenodd' d='M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z' clip-rule='evenodd' /></svg>`;
        
        const label = hasQuestions ? (t ? t.regenerate_btn : '重新生成') : (t ? t.generate_btn : '開始出題');
        elements.regenerateBtn.innerHTML = icon + `<span>${label}</span>`;
    }

    // 4. 更新分析區域顯示
    if (elements.keywordAnalysisArea) {
        const hasKeywords = elements.keywordContainer && elements.keywordContainer.children.length > 0;
        const visible = UI_RULES.shouldShowKeywordArea(hasKeywords, text.length > 0 || imageCount > 0);
        elements.keywordAnalysisArea.classList.toggle('hidden', !visible);
    }
}
