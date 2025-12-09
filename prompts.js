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
**【素養導向出題原則 (Competency-Based) - 強制情境版】**
你現在必須嚴格遵守「PISA 測驗」的命題架構，請依照以下規範設計題目：

1. **真實情境導入 (The Scenario)**：
   - 每一題都 **必須** 以一段具體的「情境描述」開始。
   - 情境範例：一段兩人對話、一個實驗數據表、一則新聞摘要、或是生活中的具體難題。
   - **核心規則 (遮蔽測試)**：這個情境必須是解題的「必要條件」。如果把情境遮住，學生還能憑記憶回答出答案，代表此題設計失敗。

2. **任務與挑戰 (The Task)**：
   - 題目應要求學生利用情境中的資訊來：解決問題、預測結果、判斷真偽或提出建議。
   - 禁止使用「下列何者正確？」這種單純檢索事實的問法，請改用「根據上述情境，主角接下來最合理的行動是？」或「這個數據變化意味著什麼？」。

3. **選項設計 (Meaningful Options)**：
   - 正確答案：必須是邏輯上最符合情境的最佳解。
   - 誘答項 (Distractors)：必須設計成「學生常見的迷思概念」或「看似合理但忽略了某個情境條件的錯誤推論」，而不能是湊數的無意義選項。

4. **設計理念 (Design Concept)**：
   - 每題必須附上 30-50 字的說明，解釋這題運用了什麼情境，以及測驗了學生的何種核心素養（例如：提取訊息、統整解釋、省思評鑑）。

5. **學生程度適配**：
   - 目標對象為「${studentLevel}」，請確保情境的複雜度與詞彙量符合該年齡層的生活經驗。`;
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
