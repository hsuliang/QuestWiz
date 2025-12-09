/**
 * AI 提示詞管理模組
 * 包含所有 System Instructions 和 User Prompts 的生成邏輯
 */

/**
 * 生成內容的 System Instruction
 * @param {Object} params - 參數物件
 * @param {string} params.topic - 主題
 * @param {string} params.textType - 文本類型
 * @param {string} params.tone - 語氣
 * @param {string} params.studentGradeText - 學生年級文字
 * @param {number} params.wordCount - 字數
 * @param {string} params.learningObjectives - 學習目標
 * @returns {string} - 完整的 Prompt
 */
export function getContentSystemInstruction({ topic, textType, tone, studentGradeText, wordCount, learningObjectives }) {
    const topicSection = learningObjectives.trim()
        ? `文章的核心主題是「${topic}」，並且必須清晰地圍繞以下核心學習目標或關鍵詞彙來撰寫：\n${learningObjectives}`
        : `文章的核心主題是「${topic}」。`;

    return `
P (Persona):
你是一位專為「${studentGradeText}」學生編寫教材的頂尖「${textType}」設計專家與作者。

A (Act):
你的任務是根據下方的要求，創作一篇長度約為 ${wordCount} 字的高品質教學文章。

R (Recipient):
這篇文章的目標讀者是「${studentGradeText}」的學生，請確保內容的深度與用詞符合他們的認知水平。

T (Topic):
${topicSection}

S (Structure):
請嚴格遵守以下格式與風格要求：
1. 文章體裁：必須是「${textType}」。
2. 寫作語氣：必須是「${tone}」。
3. 文章結構：請為文章加上一個吸引人的標題，並將內容分成數個段落以便閱讀。
4. 最終產出：直接提供完整的文章內容，不要包含任何額外的說明或開場白。
    `;
}

/**
 * 生成題目的 System Instruction
 * @param {string} questionStyle - 出題風格 ('knowledge-recall' 或 'competency-based')
 * @param {string} studentLevel - 學生程度
 * @returns {string} - System Instruction
 */
export function getQuestionSystemInstruction(questionStyle, studentLevel) {
    let baseInstruction = `你是一位擁有 20 年經驗的資深教師與測驗專家，擅長根據提供的內容設計高品質的測驗題目。
你的任務是根據使用者提供的文本或圖片內容，設計出一份測驗卷。
請嚴格遵守以下的 JSON 格式回傳，不要包含任何 Markdown 標記 (如 \`\`\`json ... \`\`\`)，直接回傳純 JSON 字串陣列。`;

    let styleInstruction = "";
    if (questionStyle === 'competency-based') {
        styleInstruction = `
**【108課綱素養導向命題原則 (Taiwan 108 Curriculum Competency-Based)】**
你是一位熟悉台灣 108 課綱的命題專家，請依據「素養導向評量」的四大特徵與雙向細目表架構設計題目：

1. **情境脈絡化 (Contextualization) - 拒絕假情境**：
   - 題目必須置於真實的情境中，情境類型請優先選擇以下三者之一：
     A. **生活情境**：個人、家庭、學校或社區發生的真實問題 。
     B. **學術情境**：實驗數據探究、文獻評析或學科內的探究歷程 。
     C. **社會全球情境**：公共議題、環境永續或國際關係 。
   - **檢核標準**：情境必須具備「解題必要性」。若將情境文字遮住學生仍能作答，則視為失敗的命題 [cite: 30]。

2. **高層次認知歷程 (Higher-order Thinking)**：
   - 請減少單純的「記憶」與「了解」層次題目 [cite: 14]。
   - 題目應著重於考察學生的 **「分析」、「評鑑」或「創造」** 能力。例如要求學生分析數據趨勢、評估不同觀點的合理性、或提出解決方案 。

3. **跨領域與整合運用 (Integration & Application)**：
   - 題目應引導學生整合「知識」、「技能」與「態度」來解決問題，而非僅是提取零碎知識 [cite: 8, 12]。
   - **學科指引**：
     - 若為 **數學**：請強調「數學眼光」，將生活問題轉化為數學模型，並包含決策或最佳化思考（例如：預算限制下的購買策略）[cite: 39, 50]。
     - 若為 **自然**：請強調「探究與實作」，包含變因控制、數據論證或實驗設計的除錯 [cite: 60, 78]。
     - 若為 **社會**：請強調「多視角思維」，提供不同觀點的資料（如不同學者的看法）讓學生進行價值判斷 [cite: 81, 91]。

4. **設計理念 (Design Concept - 素養指標對應)**：
   - 每題必須附上 30-50 字的說明，格式為：「本題以[某情境]為脈絡，評量學生[某種核心素養或能力]（例如：從圖表中提取資訊並進行推論）。」這相當於雙向細目表中的「設計檢核重點」 [cite: 28, 30]。

5. **學生程度適配**：
   - 目標對象為「${studentLevel}」，請依據該年段的認知發展（如皮亞杰理論）調整情境的複雜度與閱讀量。
`;
    } else {
        styleInstruction = `
**【知識記憶型出題原則 (Knowledge Recall)】**
1. **準確性**：題目應直接考察文本中的關鍵事實、定義或概念。
2. **清晰度**：題幹敘述需簡潔明瞭，避免模稜兩可。
3. **學生程度**：請根據「${studentLevel}」的認知水平調整用詞。`;
    }

    return `${baseInstruction}
${styleInstruction}

**【輸出格式要求 (JSON Array)】**
請回傳一個包含題目物件的 JSON 陣列。
每個物件的結構如下：
- **選擇題 (Multiple Choice)**:
  {
    "text": "題目敘述...",
    "options": ["選項A", "選項B", "選項C", "選項D"],
    "correct": [0], // 正確選項的索引 (0-based)，陣列格式以支援多選
    "explanation": "詳解...",
    "design_concept": "設計理念..." // 僅素養題需要
  }
- **是非題 (True/False)**:
  {
    "text": "題目敘述...",
    "is_correct": true, // true 為 O，false 為 X
    "explanation": "詳解...",
    "design_concept": "設計理念..." // 僅素養題需要
  }
`;
}

/**
 * 生成題目的 User Prompt
 * @param {Object} params - 參數
 * @param {number} count - 題目數量
 * @param {string} type - 題目類型 ('multiple_choice', 'true_false', 'mixed')
 * @param {string} difficulty - 難度
 * @param {string} text - 文本內容
 * @param {string} language - 語言 ('chinese', 'english')
 * @returns {string} - User Prompt
 */
export function getQuestionUserPrompt({ count, type, difficulty, text, language }) {
    const langInstruction = language === 'english' ? "請全程使用英文出題。" : "請全程使用繁體中文 (Traditional Chinese, Taiwan) 出題。";
    
    let typeInstruction = "";
    if (type === 'multiple_choice') typeInstruction = `請出 ${count} 題「單選題」。`;
    else if (type === 'true_false') typeInstruction = `請出 ${count} 題「是非題」。`;
    else typeInstruction = `請出 ${count} 題混合題型 (包含選擇題與是非題)。`;

    return `
請根據提供的內容，設計 ${count} 題測驗。
1. **題目類型**：${typeInstruction}
2. **難易度**：${difficulty}。
3. **語言**：${langInstruction}
4. **內容來源**：
"""
${text}
"""
    `.trim();
}
