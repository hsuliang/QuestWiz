export function buildQuestionTypePlan(count, type = 'multiple_choice') {
    return Array.from({ length: Math.max(0, count) }, (_, index) => {
        if (type === 'true_false') return 'true_false';
        if (type === 'mixed') return index % 2 === 0 ? 'multiple_choice' : 'true_false';
        return 'multiple_choice';
    });
}

export function getQuestionSchema(questionTypePlan = [], targetBloomLevel = '') {
    const typeRows = questionTypePlan.length
        ? questionTypePlan.map((type, index) => `第 ${index + 1} 題：${type}`).join('；')
        : '每題依照上方題型設定輸出。';
    const questionCount = questionTypePlan.length || '指定';
    return `
【JSON 輸出格式】
只能回傳一個 JSON 物件，不得包含 Markdown 或其他文字。questions 必須恰好有 ${questionCount} 題，並依下列順序輸出題型：${typeRows}
quizTitle 須是語意完整且專業的標題，10 字內，且不含「測驗」二字。
每題都必須包含 text、options、correct、bloomLevel、explanation、design_concept。
- 選擇題：options 恰好 4 個互不重複的完整選項。
- 是非題：options 恰好 2 個，依序為「是」「否」。
- correct 是只含一個整數的陣列，索引從 0 開始；依各題實際正解填入，不可固定使用同一位置。
- bloomLevel 填入 ${targetBloomLevel || '本批指定的英文層次'}；必須反映題目實際要求的認知操作。
- explanation 說明正解根據；design_concept 指出本題測量的具體概念或事實，且同卷各題不可重複。
物件結構：quizTitle 為字串；questions 為題目物件陣列。每個題目物件包含 text 字串、options 字串陣列、correct 整數陣列、bloomLevel 字串、explanation 字串、design_concept 字串。
`;
}
