/**
 * QuestWiz v11.0 Bloom Verb Dictionary
 * 根據布魯姆提問法定義各認知層次的精準動詞庫
 */

export const BLOOM_VERBS = {
    'remember': {
        label: '記憶 (Remember)',
        verbs: ['指出', '列舉', '命名', '描述', '複述', '寫出']
    },
    'understand': {
        label: '理解 (Understand)',
        verbs: ['說明', '歸納', '改寫', '辨識', '解釋', '分類']
    },
    'apply': {
        label: '應用 (Apply)',
        verbs: ['解決', '計算', '運用', '示範', '操作', '預測']
    },
    'analyze': {
        label: '分析 (Analyze)',
        verbs: ['比較異同', '區分事實與觀點', '解構', '找出因果', '檢驗', '分析結構']
    },
    'evaluate': {
        label: '評鑑 (Evaluate)',
        verbs: ['評論', '論證理由', '判斷價值', '評估效益', '辯護', '支持某觀點']
    },
    'create': {
        label: '創造 (Create)',
        verbs: ['設計方案', '提出新結局', '擬定計畫', '改編', '建構模式', '創作']
    }
};

/**
 * 取得布魯姆動詞指令
 */
export function getBloomVerbGuideline() {
    let text = `### 🎯 層次動詞精準化 (Bloom's Verb Enforcement)\n請根據不同的認知層次，優先使用以下動詞來引導題目：\n`;
    for (const level in BLOOM_VERBS) {
        text += `- **${BLOOM_VERBS[level].label}**: ${BLOOM_VERBS[level].verbs.join('、')}\n`;
    }
    return text.trim();
}
