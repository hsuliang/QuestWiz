/**
 * QuestWiz v11.0 Bloom Verb Dictionary
 * 根據布魯姆提問法定義各認知層次的精準動詞庫
 */

export const BLOOM_VERBS = {
    'remember': {
        label: '記憶 (Remember)',
        verbs: ['指出', '列舉', '命名', '辨認', '複述', '寫出'],
        requirement: '直接回憶或辨認提供內容中的事實、名詞與定義；不要求解釋、推論或跨段整合。'
    },
    'understand': {
        label: '理解 (Understand)',
        verbs: ['說明', '歸納', '改寫', '解釋', '分類'],
        requirement: '解釋、詮釋或分類內容的意義；不要求套用到新的問題。'
    },
    'apply': {
        label: '應用 (Apply)',
        verbs: ['解決', '計算', '運用', '操作', '依原則判斷'],
        requirement: '將內容中的概念或規則用於新的、簡短且條件明確的問題；不額外要求分析或評價。'
    },
    'analyze': {
        label: '分析 (Analyze)',
        verbs: ['比較異同', '區分事實與觀點', '找出因果', '檢驗', '分析結構'],
        requirement: '辨識資訊的組成、關係、因果或差異，並以題目提供的內容為依據。'
    },
    'evaluate': {
        label: '評鑑 (Evaluate)',
        verbs: ['評論', '論證理由', '判斷價值', '評估效益', '支持或反駁觀點'],
        requirement: '依題目明示的標準判斷主張、證據或方案，不得使用題目未提供的判準。'
    },
    'create': {
        label: '創造 (Create)',
        verbs: ['設計方案', '提出新結局', '擬定計畫', '改編', '建構模式', '創作'],
        requirement: '依明確條件組合資訊或提出方案，並提供可判定的評量依據。'
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

export function getBloomTargetInstruction(level) {
    const target = BLOOM_VERBS[level];
    if (!target) return '只測量本批指定的認知層次，不升級或降低認知要求。';
    return `${target.requirement} 可優先使用的題幹動詞：${target.verbs.join('、')}。`;
}
