/**
 * 黃金範例積木 (Few-Shot Examples)
 * 提供 AI 具體的 Good/Bad 範例對照，強化風格遵循度
 */

export function getStyleExamples(level) {
    if (level === 'LEVEL_1') {
        return `
## 💡 Few-Shot Examples (Level 1: Knowledge Recall)

**Example 1 (Definition)**
- ❌ BAD (Too wordy/Context): 小華在自然課看到一個發光的球體。請問太陽系中心的恆星叫什麼？
- ✅ GOOD (Direct): 太陽系的中心恆星是下列何者？

**Example 2 (Concept)**
- ❌ BAD (Storytelling): 媽媽去超市買水果，她想選一種富含維生素C的水果。請問她該買什麼？
- ✅ GOOD (Direct): 下列哪一種水果的維生素C含量最高？
`;
    }

    if (level === 'LEVEL_3') {
        return `
## 💡 Few-Shot Examples (Level 3: Competency Based)

**Example 1 (Application)**
- ❌ BAD (Fake Context): 小明知道牛頓第二運動定律。請問公式是什麼？ (This is just recall)
- ✅ GOOD (Real Context): 小明想要讓玩具車跑得更快。根據牛頓第二運動定律 (F=ma)，在推力不變的情況下，他應該如何調整玩具車？

**Example 2 (Analysis)**
- ❌ BAD (Direct): 光合作用的產物是什麼？
- ✅ GOOD (Scenario): 科學家在封閉的玻璃罩中放入一株植物並給予光照。一段時間後，檢測儀器顯示罩內的氣體成分發生變化。請問下列哪張圖表最能代表氧氣濃度的變化趨勢？
`;
    }

    return '';
}
