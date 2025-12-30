/**
 * UI 行為規則中心 (憲法)
 * 這裡定義了所有的顯示邏輯，不再散落在各個 Handler 中
 */

export const UI_RULES = {
    // 分析按鈕顯示條件
    shouldShowAnalyze: (textLen, imageCount) => {
        return textLen >= 50 || imageCount > 0;
    },

    // 出題按鈕顯示條件
    shouldShowGenerate: (hasContent, hasLevel) => {
        return hasContent && hasLevel;
    },

    // 關鍵字區域顯示條件
    shouldShowKeywordArea: (hasKeywords, hasContent) => {
        return hasKeywords && hasContent;
    }
};
