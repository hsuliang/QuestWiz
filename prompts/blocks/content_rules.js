export function getContentRules({ languageInstruction, topic, studentGradeText, wordCount, textType, tone, learningObjectives, adaptiveRules }) {
    let prompt = `
【重要指示】
1. 語言規範：${languageInstruction}
2. 標題要求：請在回應的最開頭，先提供一個精確反映核心內容的「試卷標題」，格式為「TITLE: [標題內容]」。
   - 標題規範：字數控制在 10 個中文字以內。
   - 核心要求：標題必須語意完整且具代表性，禁止在結尾處切斷句子。
3. 內容設定：
---
主題：${topic}
---
目標學生：${studentGradeText}
內文字數：約 ${wordCount} 字左右
文章類型：${textType}
寫作語氣：${tone}
學習目標/關鍵字：${learningObjectives || '由你根據主題專業判斷'}
`;

    // [v11.0] 適性化寫作規範注入
    if (adaptiveRules) {
        prompt += `\n4. 適性化寫作規範 (Adaptive Guidelines):\n`;
        if (adaptiveRules.semantics) prompt += `   - 用詞策略：${adaptiveRules.semantics}\n`;
        if (adaptiveRules.syntax) prompt += `   - 句型結構：${adaptiveRules.syntax}\n`;
        if (adaptiveRules.constraints && adaptiveRules.constraints.length > 0) {
            prompt += `   - ⛔ 禁止事項 (Strictly Prohibited)：\n`;
            adaptiveRules.constraints.forEach(c => prompt += `     * ${c}\n`);
        }
    }

    return prompt;
}
