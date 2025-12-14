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
 * @param {string} params.interfaceLanguage - 介面語言 ('zh-TW' or 'en')
 * @param {boolean} params.isTargetEnglish - 是否強制目標內容為英文
 * @returns {string} - 完整的 Prompt
 */
export function getContentSystemInstruction({ topic, textType, tone, studentGradeText, wordCount, learningObjectives, interfaceLanguage = 'zh-TW', isTargetEnglish = false }) {
    const isEnInterface = interfaceLanguage === 'en';
    
    // 決定最終輸出的語言指令
    // 如果偵測到主題是英文 (isTargetEnglish 為 true)，則強制要求輸出英文
    // 否則，如果介面是英文，預設輸出英文；介面是中文，預設輸出中文
    let outputLangInstruction = "";
    if (isTargetEnglish) {
        outputLangInstruction = isEnInterface 
            ? "5. Language: Please write the entire article in English." 
            : "5. 語言要求：請全程使用英文撰寫這篇文章。";
    } else {
        // 若沒有強制英文，則預設跟隨介面語言 (或不做額外限制，讓 AI 自由發揮，但通常建議明確指定)
        outputLangInstruction = isEnInterface
            ? "5. Language: Please write the entire article in English."
            : "5. 語言要求：請全程使用繁體中文 (Traditional Chinese, Taiwan) 撰寫。";
    }

    if (isEnInterface) {
        const topicSection = learningObjectives.trim()
            ? `The core topic is "${topic}", and it must clearly revolve around the following learning objectives or keywords:\n${learningObjectives}`
            : `The core topic is "${topic}".`;

        return `
P (Persona):
You are a top-tier "${textType}" design expert and author specializing in writing educational materials for "${studentGradeText}" students.

A (Act):
Your task is to create a high-quality educational article of approximately ${wordCount} words based on the requirements below.

R (Recipient):
The target audience is "${studentGradeText}" students. Ensure the depth and vocabulary are appropriate for their cognitive level.

T (Topic):
${topicSection}

S (Structure):
Please strictly adhere to the following format and style requirements:
1. Genre: Must be "${textType}".
2. Tone: Must be "${tone}".
3. Structure: Provide an engaging title and divide the content into several paragraphs for readability.
4. Output: Provide the complete article content directly, without any additional explanations or opening remarks.
${outputLangInstruction}
        `;
    } else {
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
${outputLangInstruction}
        `;
    }
}

/**
 * 生成題目的 System Instruction
 * @param {string} questionStyle - 出題風格 ('knowledge-recall' 或 'competency-based')
 * @param {string} studentLevel - 學生程度
 * @param {string} interfaceLanguage - 介面語言 ('zh-TW' or 'en')
 * @returns {string} - System Instruction
 */
export function getQuestionSystemInstruction(questionStyle, studentLevel, interfaceLanguage = 'zh-TW') {
    const isEn = interfaceLanguage === 'en';

    if (isEn) {
        let baseInstruction = [
            "You are a senior teacher and assessment expert with 20 years of experience, specializing in designing high-quality quiz questions based on provided content.",
            "Your task is to design a quiz based on the user-provided text or images.",
            "Please strictly adhere to the following JSON format for the response. Do not include any Markdown markers (like ```json ... ```), return raw JSON string array only."
        ].join("\n");

        let styleInstruction = "";
        if (questionStyle === 'competency-based') {
            styleInstruction = `
**【Competency-Based Design Principles】**
1. **Contextualization**: Questions should include real-life or academic inquiry scenarios, avoiding simple rote memorization.
2. **Integration**: Encourage students to apply knowledge from the text to solve problems, not just extract information.
3. **Multidimensional**: Design questions for different cognitive levels like "Understand", "Analyze", "Apply", or "Evaluate".
4. **Design Concept**: Each question must include a 20-50 word "Design Concept" explaining the core competency or skill being tested (e.g., assessing the ability to extract info and infer).
5. **Student Level**: Adjust difficulty and scenario complexity for "${studentLevel}" cognitive level.`;
        } else {
            styleInstruction = `
**【Knowledge Recall Design Principles】**
1. **Accuracy**: Questions should directly test key facts, definitions, or concepts from the text.
2. **Clarity**: Question stems must be concise and clear, avoiding ambiguity.
3. **Student Level**: Adjust vocabulary for "${studentLevel}" cognitive level.`;
        }

        return `${baseInstruction}
${styleInstruction}

**【Output Format Requirements (JSON Array)】**
Please return a JSON array containing question objects.
Structure for each object:
- **Multiple Choice**:
  {
    "text": "Question text...",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": [0], // Index of correct option (0-based), array to support multiple correct answers
    "explanation": "Explanation...",
    "design_concept": "Design concept..." // Only for competency-based
  }
- **True/False**:
  {
    "text": "Question text...",
    "is_correct": true, // true for True/O, false for False/X
    "explanation": "Explanation...",
    "design_concept": "Design concept..." // Only for competency-based
  }
`;
    } else {
        let baseInstruction = [
            "你是一位擁有 20 年經驗的資深教師與測驗專家，擅長根據提供的內容設計高品質的測驗題目。",
            "你的任務是根據使用者提供的文本或圖片內容，設計出一份測驗卷。",
            "請嚴格遵守以下的 JSON 格式回傳，不要包含任何 Markdown 標記 (如 ```json ... ```)，直接回傳純 JSON 字串陣列。"
        ].join("\n");

        let styleInstruction = "";
        if (questionStyle === 'competency-based') {
            styleInstruction = `
**【素養導向出題原則 (Competency-Based)】**
1. **情境化 (Contextualization)**：題目應包含真實生活情境或學術探究情境，避免單純的記憶背誦。
2. **整合運用 (Integration)**：鼓勵學生運用文本中的知識解決問題，而非僅是提取資訊。
3. **跨領域/層次 (Multidimensional)**：題目可設計為「理解」、「分析」、「應用」或「評鑑」等不同認知層次。
4. **設計理念 (Design Concept)**：每題必須附上 20-50 字的「設計理念」，說明此題考察的核心素養或能力 (例如：考察學生提取訊息與推論的能力)。
5. **學生程度**：請根據「${studentLevel}」的認知水平調整題目的難度與情境複雜度。`;
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
}

/**
 * 生成題目的 User Prompt
 * @param {Object} params - 參數
 * @param {number} params.count - 題目數量
 * @param {string} params.type - 題目類型 ('multiple_choice', 'true_false', 'mixed')
 * @param {string} params.difficulty - 難度
 * @param {string} params.text - 文本內容
 * @param {string} params.language - 輸出語言 ('chinese', 'english') - 這是生成題目的目標語言
 * @param {string} params.interfaceLanguage - 介面語言 ('zh-TW', 'en') - 這是Prompt本身的語言
 * @returns {string} - User Prompt
 */
export function getQuestionUserPrompt({ count, type, difficulty, text, language, interfaceLanguage = 'zh-TW' }) {
    const isEn = interfaceLanguage === 'en';
    
    // Output language instruction (Target Language)
    const langInstruction = language === 'english' 
        ? (isEn ? "Please generate questions entirely in English." : "請全程使用英文出題。")
        : (isEn ? "Please generate questions entirely in Traditional Chinese (Taiwan)." : "請全程使用繁體中文 (Traditional Chinese, Taiwan) 出題。");

    if (isEn) {
        let typeInstruction = "";
        if (type === 'multiple_choice') typeInstruction = `Create ${count} "Multiple Choice" questions.`;
        else if (type === 'true_false') typeInstruction = `Create ${count} "True/False" questions.`;
        else typeInstruction = `Create ${count} mixed questions (Multiple Choice and True/False).`;

        return `
Please design ${count} quiz questions based on the provided content.
1. **Question Type**: ${typeInstruction}
2. **Difficulty**: ${difficulty}.
3. **Language**: ${langInstruction}
4. **Content Source**:
"""
${text}
"""
        `.trim();
    } else {
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
}
