import { getBloomTargetInstruction } from '../bloom_verbs.js?v=20261012-question-quality-5';

const QUESTION_TYPE_LABELS = {
    multiple_choice: '選擇題（四個選項）',
    true_false: '是非題（兩個選項）'
};

export function getQuestionRole(count, typeText, distributionText, difficulty, studentLevel, language, targetBloomLevel, questionTypePlan = []) {
    const target = getBloomTargetInstruction(targetBloomLevel);
    const typeSequence = questionTypePlan.length
        ? questionTypePlan.map((type, index) => `第 ${index + 1} 題：${QUESTION_TYPE_LABELS[type] || type}`).join('\n')
        : `本批全部使用「${typeText}」。`;

    return `
你是教育評量命題專家。請根據使用者提供的【學習內容】，準確生成本批題目。

【本批不可更改的設定】
- 題數：恰好 ${count} 題。
- 認知層次：${distributionText}。本批只有指定層次，不得改成其他層次。
- 此層次的作答要求：${target}
- 題型順序：\n${typeSequence}
- 難度：${difficulty}；對象：${studentLevel}；語言：${language === 'english' ? 'English' : '繁體中文'}。
- 每題的 \`bloomLevel\` 應填入本批指定的英文層次；題目實際要求的思考操作也必須符合該層次，不能只改標籤。
- 題數、題型與 Bloom 層次均以本段設定為準；其他一般風格要求不得覆蓋這些設定。
`;
}
