import { QUESTION_STYLE } from '../constants.js';
import { CONTENT_ROLE } from './blocks/content_role.js';
import { getContentRules } from './blocks/content_rules.js';
import { getQuestionRole } from './blocks/question_role.js';
import { getBloomDistributionText } from './blocks/question_bloom.js';
import { COMPETENCY_RULES } from './blocks/question_style_competency.js';
import { STANDARD_RULES } from './blocks/question_style_standard.js';
import { QUESTION_SCHEMA } from './blocks/question_schema.js';

export { PROMPT_VERSION } from './versions.js';

export function getContentSystemInstruction(params) {
    return [CONTENT_ROLE.trim(), getContentRules(params).trim()].join('\n\n');
}

export function getQuestionSystemInstruction(count, type, difficulty, style, language, studentLevel, bloomDistribution, keywords = []) {
    let typeText = "";
    if (type === 'multiple_choice') typeText = "選擇題 (Multiple Choice)";
    else if (type === 'true_false') typeText = "是非題 (True/False)";
    else if (type === 'mixed') typeText = "「選擇題」與「是非題」混合 (請盡量平均分配，各佔約 50%)";

    const distributionText = getBloomDistributionText(bloomDistribution);
    
    // 1. 角色與基本規範
    const rolePart = getQuestionRole(count, typeText, distributionText, difficulty, studentLevel, language).trim();

    // 2. 風格規則
    const styleRules = style === QUESTION_STYLE.COMPETENCY_BASED ? COMPETENCY_RULES : STANDARD_RULES;

    // 3. 處理關鍵字指令 (如果有選取的話)
    let keywordInstruction = "";
    if (keywords && keywords.length > 0) {
        keywordInstruction = `
### ⚠️ 核心命題任務 (Teacher's Constraints)
老師已明確標記以下「${keywords.length} 個重點」為本次測驗的核心考點。
請遵守以下命題邏輯：
1. **重點優先**：請優先針對這些重點設計題目。
2. **智慧分配**：若重點數量 (${keywords.length}) 大於預定總題數 (${count} 題)，請優先挑選「最核心、最具代表性」的點進行命題，確保總題數精準維持在 ${count} 題。
3. **不要超出題數**：嚴禁因為重點多就產生多於 ${count} 個題目。
4. **重點列表**：
   - ${keywords.join('\n   - ')}
        `.trim();
    }

    // 4. 組合所有部分
    return [
        rolePart,
        keywordInstruction, // 插入關鍵字指令
        styleRules.trim(),
        QUESTION_SCHEMA.trim()
    ].join('\n\n');
}

export function getQuestionUserPrompt({ count, bloomLevel }) {
    return `請根據提供的參考內容，生成題目並給予一個語意完整的專業標題。`;
}
