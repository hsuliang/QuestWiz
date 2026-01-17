/**
 * 命題風格分級積木 (Question Style Level Blocks)
 * 定義不同層級的命題行為準則與認知層次轉譯邏輯
 */

export const STYLE_LEVEL_BLOCKS = {
    // [Level 1] 基礎檢索 (Drill & Practice)
    LEVEL_1: `
### 🛡️ Level 1: Foundation & Recall Strategy (Strict)
- **Direct Approach**: All questions must be direct and explicit.
- **Bloom's Translation**:
  - If Bloom is "Analyze/Evaluate": Ask the student to "Compare", "Classify", or "Select the best description" DIRECTLY. Do NOT create a scenario to test this.
  - If Bloom is "Apply": Ask "Which situation fits definition X?" instead of "Xiao Ming did X...".
- **Concept Check**: Ensure the answer relies ONLY on the provided text's definitions and facts.`,

    // [Level 3] 深度素養 (Competency-Based)
    LEVEL_3: `
### 🚀 Level 3: Competency & Application Strategy (Strict)
- **Context First**: Every question must be embedded in a realistic context or problem-solving scenario.
- **Refuse False Context**:
  - BAD: "Xiao Ming knows that [Fact]. What is [Fact]?" (This is fake context).
  - GOOD: "Xiao Ming observes [Phenomenon]. Based on [Principle], what should he do next?"
- **Bloom's Translation**:
  - If Bloom is "Remember": Do NOT ask for definitions. Create a situation where the student must *recall* the term to solve a problem.
  - If Bloom is "Evaluate": Provide specific criteria or data in the question for the student to judge.
- **Reasoning Requirement**: The answer must require synthesizing information from the text, not just matching keywords.`
};
