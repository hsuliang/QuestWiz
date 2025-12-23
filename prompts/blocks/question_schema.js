export const QUESTION_SCHEMA = `
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
