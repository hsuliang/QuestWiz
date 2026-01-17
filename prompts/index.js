import { QUESTION_STYLE } from '../constants.js';
import { CONTENT_ROLE } from './blocks/content_role.js';
import { getContentRules } from './blocks/content_rules.js';
import { getQuestionRole } from './blocks/question_role.js';
import { getBloomDistributionText } from './blocks/question_bloom.js';
import { COMPETENCY_RULES } from './blocks/question_style_competency.js';
import { STANDARD_RULES } from './blocks/question_style_standard.js';
import { QUESTION_SCHEMA } from './blocks/question_schema.js';
import { getAdaptiveRules, getCompetencyContext } from './adaptive_matrix.js';

// [v11.0] New Modular Blocks
import { SCENARIO_BLOCKS } from './blocks/scenarios.js';
import { STYLE_LEVEL_BLOCKS } from './blocks/style_levels.js';
import { getStyleExamples } from './blocks/examples.js';

export { PROMPT_VERSION } from './versions.js';

export function getContentSystemInstruction(params) {
    return [CONTENT_ROLE.trim(), getContentRules(params).trim()].join('\n\n');
}

/**
 * 核心系統提示詞產生器 (支援通用模式與專家模式)
 * @deprecated 請優先使用 getAdaptiveSystemInstruction
 */
export function getQuestionSystemInstruction(count, type, difficulty, style, language, studentLevel, bloomDistribution, keywords = [], expertParams = null, isHighQuality = false) {
    // 為了向後相容，直接呼叫新邏輯
    return getAdaptiveSystemInstruction(count, type, difficulty, style, language, studentLevel, bloomDistribution, keywords, expertParams, isHighQuality);
}

/**
 * [v11.0 New] 適性化系統提示詞工廠
 * 根據三維矩陣 (年級 x 層次 x 情境) 動態組裝 Prompt
 * 融合了 v9.8.1 的多樣性策略與關鍵字優先權，並實作風格光譜化 (Style Spectrum)
 */
export function getAdaptiveSystemInstruction(count, type, difficulty, style, language, studentLevel, bloomDistribution, keywords = [], expertParams = null, isHighQuality = false) {
    const adaptiveRules = getAdaptiveRules(studentLevel);
    
    // [Style Logic] Determine Style Level
    // LEVEL_1: Knowledge Recall (Drill) - No Scenarios
    // LEVEL_3: Competency Based (Context) - Complex Scenarios
    const styleLevel = style === QUESTION_STYLE.COMPETENCY_BASED ? 'LEVEL_3' : 'LEVEL_1';
    
    const isCompetency = styleLevel === 'LEVEL_3';
    const contextRules = isCompetency ? getCompetencyContext(studentLevel) : null;
    const distributionText = getBloomDistributionText(bloomDistribution);

    // 1. 角色定義
    let prompt = `# Role: Adaptive Learning Assessment Specialist
You are an expert in educational measurement, specializing in creating adaptive assessments tailored to specific cognitive stages.
Your goal is to generate ${count} high-quality, non-repetitive questions based on the provided content.

## 🎯 Target Audience Profile
- **Level**: ${adaptiveRules.label}
- **Language**: ${language === 'english' ? 'English' : 'Traditional Chinese (台灣繁體中文)'}
- **Difficulty**: ${difficulty}
`.trim();

    // 2. [Priority 1] 核心命題任務 (Teacher's Constraints)
    // 確保關鍵字具有最高優先權，解決脫鉤問題
    if (keywords && keywords.length > 0) {
        prompt += `

### ⚠️ 核心命題任務 (MANDATORY)
老師已明確標記以下「${keywords.length} 個重點」為本次測驗的最高優先考點。
你「必須」優先針對這些重點設計題目，總題數精準維持在 ${count} 題。
**重點清單**：
- ${keywords.join('\n- ')}`;
    }

    // 3. 認知分佈與多樣性策略 (Diversity & Coverage)
    // [Scenario Logic] Inject Dynamic Scenario Rules based on Style Level
    const scenarioRule = styleLevel === 'LEVEL_3' ? SCENARIO_BLOCKS.COMPLEX : SCENARIO_BLOCKS.FORBIDDEN;

    prompt += `

## 🧠 Cognitive Distribution (Bloom's Taxonomy)
Strictly follow this distribution:
${distributionText}

## 🔄 Diversity & Coverage Guidelines (Strict)
1. **No Concept Overlap**: Each of the ${count} questions MUST test a COMPLETELY DIFFERENT fact, concept, or paragraph.
2. **Concept Variety**: If Q1 tests "Mechanism", Q2 should test "Impact" or "History", and Q3 should test "Comparison".
3. **Full Content Coverage**: Spread the questions across the entire text. Do not ignore the middle or end of the text.
${scenarioRule}`;

    // 4. 命題品質強化 (Standard/High Quality Mode)
    let qualityInstruction = "";
    if (!isHighQuality) {
        qualityInstruction = `
### 🎓 命題品質強化 (Standard Mode)
為了提升測驗效果，請嚴格遵守：
1. **對稱式選項**：所有選項的字數與結構應盡量接近。
2. **誘答項設計**：禁止使用「以上皆是/非」、「絕對、完全、一定」等極端詞。
3. **格式準確**：選項內容需簡潔，嚴禁包含 "A." "B." 等前綴。
        `.trim();
    } else {
        qualityInstruction = `
### 🧠 精準邏輯命題 (High Quality Mode - CoT)
請發揮深度推理能力，並在輸出前進行內部驗證：
1. **邏輯校驗 (Chain of Thought)**：在生成每一題前，請先在內部確認「題目是否具備單一確定的正解？」以及「誘答項是否具備足夠的干擾力？」。
2. **推論性題目**：著重設計需要跨段落整合資訊的題目。
        `.trim();
    }
    prompt += `

${qualityInstruction}`;

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

    // [New] 9. Few-Shot Examples (Golden Standards)
    prompt += getStyleExamples(styleLevel);

    // 10. 輸出格式 (Schema)
    prompt += `

## 📦 Output Format
${QUESTION_SCHEMA}`;

    // 11. Gemini 3 Thinking Mode Injection (High Quality)
    if (isHighQuality) {
        prompt += `

## 🧠 Chain of Thought (Internal Verification)
Before generating the JSON, verify that:
1. The vocabulary matches the target level (${adaptiveRules.label}).
2. No negative constraints were violated.
3. Each question covers a distinct concept.`;
    }

    return prompt;
}

export function getQuestionUserPrompt({ count, bloomLevel }) {
    return `請根據提供的參考內容，生成題目並給予一個語意完整的專業標題。`;
}
