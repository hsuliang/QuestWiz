/**
 * 取得學習內容生成的 System Instruction
 */
export function getContentSystemInstruction({ topic, textType, tone, studentGradeText, wordCount, learningObjectives, interfaceLanguage, isTargetEnglish, languageInstruction }) {
    return `
你是一位專業的教育內容創作者，請根據以下資訊撰寫一篇適合學生的學習內容（內文）。

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
}

/**
 * 取得題目生成的 System Instruction
 */
export function getQuestionSystemInstruction(count, type, difficulty, style, language, studentLevel, bloomDistribution) {
    let typeText = "";
    if (type === 'multiple_choice') typeText = "選擇題 (Multiple Choice)";
    else if (type === 'true_false') typeText = "是非題 (True/False)";
    else if (type === 'mixed') typeText = "「選擇題」與「是非題」混合 (請盡量平均分配，各佔約 50%)";

    const bloomLabels = { remember: '記憶', understand: '理解', apply: '應用', analyze: '分析', evaluate: '評鑑', create: '創造' };
    
    const distributionText = Object.entries(bloomDistribution)
        .filter(([_, c]) => c > 0)
        .map(([level, c]) => `${bloomLabels[level] || level}: ${c} 題`)
        .join('、');

    // 素養導向命題核心原則 (整合用戶建議)
    const competencyRules = `
    【✨ 素養導向命題進階規範】
    你必須嚴格遵守以下「素養導向」設計原則：
    1. 必要資訊原則：題幹情境應僅保留「解題所需」的必要資訊。進行效度檢核：若刪掉某句話不影響作答，該句即為廢話，應刪除。
    2. 拒絕「假情境」：嚴禁寫了長篇故事卻只問課本記憶內容。答案必須要求學生「從情境/文本中提取資訊」並結合「學科知識」才能判斷。
    3. 認知負荷控制：單題題幹（情境+提問）建議精簡。國小程度應多用條列式或結構化文字；國高中可增加資訊密度，但須確保每一句都是解題線索。
    4. 結構化呈現：關鍵數據、實驗條件或對話紀錄，請使用「條列式」或「對談格式」呈現，提升可讀性。
    5. 真實性：情境應模擬真實世界中的問題解決，而非生硬的課本例題轉寫。
    `;

    const standardRules = `
    【知識記憶命題規範】
    1. 專注於學科核心概念的檢索與理解。
    2. 題意應清晰明確，避免模稜兩可的敘述。
    `;

    return `
你是一位頂尖教育評量專家。你的任務是根據提供的【學習內容】，生成 ${count} 題「${typeText}」。

【基本規範】
1. 題目分佈：必須**百分之百嚴格依照**指定的認知層次出題：${distributionText}。
   - 禁止行為：不得擅自將簡單層次「升級」為高層次，反之亦然。
   - 標籤要求：每一題的 "bloomLevel" 必須精確對應。
2. 難易度：符合「${difficulty}」設定。
3. 針對對象：適合「${studentLevel} 年級」學生。
4. 語言：${language === 'english' ? 'English' : '繁體中文'}。

${style === 'competency-based' ? competencyRules : standardRules}

【JSON 輸出格式】
你只能回傳一個 JSON 物件，格式如下，絕對不要包含 Markdown 標籤或額外文字：
{
  "quizTitle": "語意完整且專業的標題 (10字內，不含'測驗'二字)",
  "questions": [
    {
      "text": "題目內容 (若為素養題需包含情境敘述)",
      "options": ["選項A", "選項B", "選項C", "選項D"],
      "correct": [0],
      "bloomLevel": "對應的層次英文名 (如 remember, apply)",
      "explanation": "詳細解析 (結合情境與知識點的說明)",
      "design_concept": "說明此題如何體現素養導向或該認知層次"
    }
  ]
}
`;
}

/**
 * 取得題目生成的 User Prompt
 */
export function getQuestionUserPrompt({ count, bloomLevel }) {
    return `請根據提供的參考內容，生成題目並給予一個語意完整的專業標題。`;
}
