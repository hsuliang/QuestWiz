import { QUESTION_STYLE } from '../constants.js';
import { CONTENT_ROLE } from './blocks/content_role.js';
import { getContentRules } from './blocks/content_rules.js';
import { getQuestionRole } from './blocks/question_role.js?v=20261012-question-quality-5';
import { getBloomDistributionText } from './blocks/question_bloom.js';
import { COMPETENCY_RULES } from './blocks/question_style_competency.js?v=20261012-question-quality-5';
import { STANDARD_RULES } from './blocks/question_style_standard.js';
import { SHARED_QUESTION_QUALITY_RULES, HIGH_QUALITY_REVIEW_RULES } from './blocks/question_quality.js?v=20261012-question-quality-5';
import { buildQuestionTypePlan, getQuestionSchema } from './blocks/question_schema.js?v=20261012-question-quality-5';
import { getAdaptiveRules, getCompetencyContext } from './adaptive_matrix.js?v=20261012-question-quality-5';
import { getDomainGuidelines } from './domain_matrix.js?v=20261012-domain-review-1';

// [v11.0] New Modular Blocks
import { SCENARIO_BLOCKS } from './blocks/scenarios.js?v=20261012-question-quality-5';
import { STYLE_LEVEL_BLOCKS } from './blocks/style_levels.js?v=20261012-question-quality-5';

export { PROMPT_VERSION } from './versions.js?v=20261012-question-quality-5';

export function getContentSystemInstruction(params) {
    return [CONTENT_ROLE.trim(), getContentRules(params).trim()].join('\n\n');
}

/**
 * 核心系統提示詞產生器 (支援通用模式與專家模式)
 * @deprecated 請優先使用 getAdaptiveSystemInstruction
 */
export function getQuestionSystemInstruction(count, type, difficulty, style, language, studentLevel, bloomDistribution, keywords = [], expertParams = null, isHighQuality = false, domain = 'chinese', contextType = '', questionTypePlan = null) {
    // 為了向後相容，直接呼叫新邏輯
    return getAdaptiveSystemInstruction(count, type, difficulty, style, language, studentLevel, bloomDistribution, keywords, expertParams, isHighQuality, domain, contextType, questionTypePlan);
}

/**
 * [v11.0 New] 適性化系統提示詞工廠
 * 根據三維矩陣 (年級 x 層次 x 情境) 動態組裝 Prompt
 * 融合了 v9.8.1 的多樣性策略與關鍵字優先權，並實作風格光譜化 (Style Spectrum)
 */
export function getAdaptiveSystemInstruction(count, type, difficulty, style, language, studentLevel, bloomDistribution, keywords = [], expertParams = null, isHighQuality = false, domain = 'chinese', contextType = '', questionTypePlan = null) {
    const adaptiveRules = getAdaptiveRules(studentLevel);
    
    // [Style Logic] Determine Style Level
    // 風格決定題目呈現方式；Bloom 批次設定決定實際認知要求。
    const styleLevel = style === QUESTION_STYLE.COMPETENCY_BASED ? 'LEVEL_3' : 'LEVEL_1';
    
    const isCompetency = styleLevel === 'LEVEL_3';
    const contextRules = isCompetency ? getCompetencyContext(studentLevel) : null;
    const distributionText = getBloomDistributionText(bloomDistribution);
    const effectiveTypePlan = Array.isArray(questionTypePlan) && questionTypePlan.length === count
        ? questionTypePlan
        : buildQuestionTypePlan(count, type);
    const bloomLevels = Object.keys(bloomDistribution || {}).filter(level => bloomDistribution[level] > 0);
    const targetBloomLevel = bloomLevels.length === 1 ? bloomLevels[0] : '';
    const questionTypeLabel = type === 'true_false' ? '是非題' : type === 'mixed' ? '是非題與選擇題' : '選擇題';
    const questionRole = getQuestionRole(count, questionTypeLabel, distributionText, difficulty, adaptiveRules.label, language, targetBloomLevel, effectiveTypePlan);

    // 1. 角色定義
    let prompt = `# Role: Adaptive Learning Assessment Specialist
You are an expert in educational measurement, specializing in creating adaptive assessments tailored to specific cognitive stages.
Your goal is to generate ${count} high-quality, non-repetitive questions based on the provided content.

## 🎯 Target Audience Profile
- **Level**: ${adaptiveRules.label}
- **Language**: ${language === 'english' ? 'English' : 'Traditional Chinese (台灣繁體中文)'}
- **Difficulty**: ${difficulty}
`.trim();
    const domainGuidelines = getDomainGuidelines(domain);
    if (domainGuidelines) prompt += `\n\n${domainGuidelines}`;

    // 2. 教師標記重點只決定內容範圍，不覆蓋題型與 Bloom 目標。
    if (keywords && keywords.length > 0) {
        prompt += `

### ⚠️ 核心命題任務 (MANDATORY)
老師已明確標記以下「${keywords.length} 個重點」為本次測驗的內容範圍優先項。
請優先從這些重點選材；此要求只決定測驗內容，不得改變本批題數、題型或指定的 Bloom 層次（${distributionText}）。
**重點清單**：
- ${keywords.join('\n- ')}`;
    }

    // 3. 固定本批題數、題型與認知目標，避免風格規則覆蓋命題設定。
    // [Scenario Logic] Inject Dynamic Scenario Rules based on Style Level
    const scenarioRule = styleLevel === 'LEVEL_3' ? SCENARIO_BLOCKS.COMPETENCY : SCENARIO_BLOCKS.FORBIDDEN;

    prompt += `

## ⚖️ 命題設定優先序
題數、題型與 Bloom 認知目標是硬性條件；命題風格、年級、難度及模式品質要求只能在這些條件內調整，不得改變題型或提升、降低認知要求。

${questionRole}

## 🔄 Diversity & Coverage Guidelines (Strict)
1. 本批題目不得重複測量同一個事實或概念；若使用者訊息附有本卷先前題目，也不得與那些題目重複。
2. 根據提供內容分散選材；內容不足時不可為了多樣性補造事實。
${scenarioRule}`;

    // 4. 所有模式都必須達到同一題幹與選項標準；高品質模式只增加更嚴格的複核。
    prompt += `

${SHARED_QUESTION_QUALITY_RULES}
${isHighQuality ? HIGH_QUALITY_REVIEW_RULES : ''}`;

    // 5. 語言學風格指南 (Linguistic Style Guide) - 作為「風格濾鏡」
    prompt += `

## 📝 Linguistic Guidelines (Adaptive Style Guide)`;
    if (adaptiveRules.semantics) prompt += `
- **Vocabulary**: ${adaptiveRules.semantics}`;
    if (adaptiveRules.syntax) prompt += `
- **Syntax**: ${adaptiveRules.syntax}`;
    if (adaptiveRules.style_guide) prompt += `
- **Style**: ${adaptiveRules.style_guide}`;
    if (adaptiveRules.style_reference) prompt += `
- **Tone Reference**: ${adaptiveRules.style_reference}`;

    // 6. 核心命題規範 (Core Rules) - 融合素養與標準
    // [Style Logic] Inject Specific Style Level Instructions
    prompt += `\n\n${styleLevel === 'LEVEL_3' ? STYLE_LEVEL_BLOCKS.LEVEL_3 : STYLE_LEVEL_BLOCKS.LEVEL_1}`;

    if (isCompetency) {
        prompt += `

${COMPETENCY_RULES}`;
        if (contextRules) {
            prompt += `
### 🌏 Adaptive Context Scope (依年級調整情境)`;
            prompt += `
- **Scenario Scope**: ${contextRules.scope}`;
            prompt += `
- **Task Type**: ${contextRules.task}`;
            prompt += `
- **Instruction**: ${contextRules.instruction}`;
        }
    } else {
        prompt += `

${STANDARD_RULES}`;
        // [Legacy] The "Adaptive Knowledge Strategy" for grades 1-4 is REMOVED.
        // It is now superseded by STYLE_LEVEL_BLOCKS.LEVEL_1 which allows direct definitions.
    }

    // 7. 負面限制 (Negative Constraints)
    if (adaptiveRules.constraints && adaptiveRules.constraints.length > 0) {
        prompt += `

## 🚫 Negative Constraints (Prohibited)
`;
        adaptiveRules.constraints.forEach(c => prompt += `- ${c}\n`);
    }

    // 8. 誘答項策略
    if (adaptiveRules.distractor_logic) {
        prompt += `

## 💡 Distractor Design Strategy
${adaptiveRules.distractor_logic}`;
    }

    // 9. 輸出格式 (Schema)
    prompt += `

## 📦 Output Format
${getQuestionSchema(effectiveTypePlan, targetBloomLevel)}`;

    return prompt;
}

export function getQuestionUserPrompt({ count, bloomLevel }) {
    return `請根據提供的參考內容，生成題目並給予一個語意完整的專業標題。`;
}
