export function validateQuestionBatch(questions, expectedCount, questionTypePlan, targetBloomLevel) {
    const issues = [];
    if (!Array.isArray(questions) || questions.length !== expectedCount) {
        return [`題數須為 ${expectedCount} 題`];
    }

    const seenStems = new Set();
    questions.forEach((question, index) => {
        const label = `第 ${index + 1} 題`;
        if (!question || typeof question !== 'object' || Array.isArray(question)) {
            issues.push(`${label}不是題目物件`);
            return;
        }

        const stem = typeof question.text === 'string' ? question.text.trim() : '';
        if (!stem) issues.push(`${label}缺少題幹`);
        else {
            const stemKey = stem.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
            if (seenStems.has(stemKey)) issues.push(`${label}題幹重複`);
            seenStems.add(stemKey);
        }

        const expectedType = questionTypePlan[index];
        const expectedOptions = expectedType === 'true_false' ? 2 : 4;
        const options = question.options;
        if (!Array.isArray(options) || options.length !== expectedOptions || options.some(option => typeof option !== 'string' || !option.trim())) {
            issues.push(`${label}選項數量或內容錯誤`);
        } else {
            const normalizedOptions = options.map(option => option.trim().normalize('NFKC').replace(/\s+/g, '').toLowerCase());
            if (new Set(normalizedOptions).size !== options.length) issues.push(`${label}選項重複`);
            if (expectedType === 'true_false') {
                const trueWords = ['是', '正確', 'true', 'o'];
                const falseWords = ['否', '錯誤', 'false', 'x'];
                if (!trueWords.includes(normalizedOptions[0]) || !falseWords.includes(normalizedOptions[1])) {
                    issues.push(`${label}是非選項順序錯誤`);
                }
            }
        }

        if (!Array.isArray(question.correct) || question.correct.length !== 1 ||
            !Number.isInteger(question.correct[0]) || question.correct[0] < 0 || question.correct[0] >= expectedOptions) {
            issues.push(`${label}正解索引錯誤`);
        }
        if (String(question.bloomLevel || '').trim().toLowerCase() !== targetBloomLevel) issues.push(`${label}認知層次不符`);
        if (typeof question.explanation !== 'string' || !question.explanation.trim()) issues.push(`${label}缺少解析`);
        if (typeof question.design_concept !== 'string' || !question.design_concept.trim()) issues.push(`${label}缺少考查概念`);
    });
    return issues;
}

export function normalizeQuestion(q) {
    return {
        text: q.text.trim(),
        options: q.options.map(option => option.trim()),
        correct: [...q.correct],
        bloomLevel: q.bloomLevel.trim().toLowerCase(),
        explanation: q.explanation.trim(),
        design_concept: q.design_concept.trim(),
        time: parseInt(q.time, 10) || 30
    };
}

export function normalizeQuestions(questions, expectedLevel, questionTypePlan = []) {
    const issues = validateQuestionBatch(questions, questions?.length, questionTypePlan, expectedLevel);
    if (issues.length) throw new Error(`題目資料不完整：${issues.join('；')}`);
    return questions.map((question, index) => {
        const normalized = normalizeQuestion(question);
        if (questionTypePlan[index] === 'true_false') normalized.options = ['Ｏ', 'Ｘ'];
        return normalized;
    });
}
