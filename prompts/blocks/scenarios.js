/**
 * 情境控制積木 (Scenario Control Blocks)
 * 控制是否在題目中使用角色、場景或故事包裝
 */

export const SCENARIO_BLOCKS = {
    // [Level 3] 強制多樣化情境 (原本的全域規則)
    COMPLEX: `
4. **Distinct Scenarios**: Use different character names (e.g., Xiao Ming, Xiao Hua, A-Liang) or situational backgrounds for each question. DO NOT reuse the same character or setting unless it's a question set.`,

    // [Level 1] 禁止情境 (新規則 - 知識記憶型專用)
    FORBIDDEN: `
4. **NO Scenarios / No Storytelling**: 
   - Strictly FORBIDDEN to use characters (e.g., Xiao Ming, Teacher Wang) or situational backgrounds.
   - Use DIRECT questions only (e.g., "What is...", "Which of the following...", "Compare A and B").
   - The question must focus purely on the concept itself, stripped of any narrative wrapper.`,

    // [Level 2] 簡單情境 (保留給未來擴充)
    SIMPLE: `
4. **Simple Context**: You may use simple "Subject + Action" contexts (e.g., "If you want to...", "When observing..."), but avoid complex character backstories.`
};
