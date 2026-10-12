/**
 * 情境控制積木 (Scenario Control Blocks)
 * 控制是否在題目中使用角色、場景或故事包裝
 */

export const SCENARIO_BLOCKS = {
    // 素養題只在情境有助於作答時加入必要資訊。
    COMPETENCY: `
4. **任務情境**：情境要服務於明確的問題或決定，必須使用題幹資料作答；題幹不得以「根據 XXX」開場，也不得套用「關於 X，下列何者正確」句型。避免無關人物故事。`,

    // 知識記憶題不使用人物故事；應用題可保留必要條件。
    FORBIDDEN: `
4. **直接提問**：記憶與理解題直接詢問重要概念或事實；不得以空泛的「根據 XXX」起手，也不得加入人物故事或無關情境。應用題僅加入完成指定認知任務所需的簡短條件。`,

    // [Level 2] 簡單情境 (保留給未來擴充)
    SIMPLE: `
4. **Simple Context**: You may use simple "Subject + Action" contexts (e.g., "If you want to...", "When observing..."), but avoid complex character backstories.`
};
