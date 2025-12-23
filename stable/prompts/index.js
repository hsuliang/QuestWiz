import { CONTENT_ROLE } from './blocks/content_role.js';
import { getContentRules } from './blocks/content_rules.js';
import { getQuestionRole } from './blocks/question_role.js';
import { getBloomDistributionText } from './blocks/question_bloom.js';
import { COMPETENCY_RULES } from './blocks/question_style_competency.js';
import { STANDARD_RULES } from './blocks/question_style_standard.js';
import { QUESTION_SCHEMA } from './blocks/question_schema.js';

export { PROMPT_VERSION } from './versions.js';

/**
 * 取得學習內容生成的 System Instruction
 */
export function getContentSystemInstruction(params) {
    // 簡單地將角色與規則區塊組合起來
    return [
        CONTENT_ROLE.trim(),
        getContentRules(params).trim()
    ].join('\n\n');
}

/**
 * 取得題目生成的 System Instruction
 */
export function getQuestionSystemInstruction(count, type, difficulty, style, language, studentLevel, bloomDistribution) {
    let typeText = "";
    if (type === 'multiple_choice') typeText = "選擇題 (Multiple Choice)";
    else if (type === 'true_false') typeText = "是非題 (True/False)";
    else if (type === 'mixed') typeText = "「選擇題」與「是非題」混合 (請盡量平均分配，各佔約 50%)";

    const distributionText = getBloomDistributionText(bloomDistribution);
    
    // 1. 角色與基本規範
    const rolePart = getQuestionRole(count, typeText, distributionText, difficulty, studentLevel, language).trim();

    // 2. 風格規則
    const styleRules = style === 'competency-based' ? COMPETENCY_RULES : STANDARD_RULES;

    // 3. 組合所有部分
    return [
        rolePart,
        styleRules.trim(),
        QUESTION_SCHEMA.trim()
    ].join('\n\n');
}

/**
 * 取得題目生成的 User Prompt (保持原樣，這部分很短沒拆)
 */
export function getQuestionUserPrompt({ count, bloomLevel }) {
    return `請根據提供的參考內容，生成題目並給予一個語意完整的專業標題。`;
}
