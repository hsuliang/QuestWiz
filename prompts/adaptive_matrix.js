/**
 * QuestWiz v11.0 Adaptive Prompt Matrix
 * 基於《台灣 K-12 閱讀分級規範》定義的適性化命題規則
 * 核心目標：精準對應識字量、語法結構與認知發展階段
 */

export const ADAPTIVE_MATRIX = {
    GRADES: {
        '1-2': { // Level 1: 識字萌芽期
            label: '國小低年級 (Lower Elementary)',
            semantics: '語彙嚴格限制在教育部規定的 1,000 個基礎識字量內。禁止使用任何成語。多用具象名詞與動詞 (有畫面感的詞)。',
            syntax: '句型必須是「誰+做+什麼」的簡單結構。單句長度控制在 15 字以內。避免倒裝句。',
            constraints: [
                '嚴禁使用疊字 (Baby talk) 與兒語。',
                '嚴禁使用「雙重否定句」。',
                '禁止使用成語。',
                '避免使用「下列何者錯誤」這種正式語氣，但可使用簡單的「誰不是...」或「哪一個沒有...」。'
            ],
            distractor_logic: '錯誤選項必須是「事實錯誤」或「文中未提及」。選項應為短語或圖形化描述。',
            style_reference: '語氣請模仿：『我家有爸爸、媽媽和我。爸爸很高，媽媽很溫柔。』'
        },
        '3-4': { // Level 2: 流暢閱讀期
            label: '國小中年級 (Middle Elementary)',
            semantics: '識字量擴展至 2,100 字。可以開始使用常見成語。',
            syntax: '開始使用複句 (因為...所以...)。段落結構開始分明。',
            constraints: [
                '禁止使用反諷或隱喻修辭。',
                '避免複雜的科普概念堆疊，需用生活例子解釋。'
            ],
            distractor_logic: '錯誤選項可包含「部分正確」資訊，測試細心度。'
        },
        '5-6': { // Level 3: 閱讀學習期
            label: '國小高年級 (Higher Elementary)',
            semantics: '識字量達 2,700 字。引入「議論文」與「科普長文」詞彙。',
            syntax: '結構完整的說明文。使用連接詞增強邏輯流暢度 (如：因此、然而)。',
            constraints: [
                '全篇專有名詞/人名總量上限為 2 個。',
                '避免過度口語化的表達。'
            ],
            distractor_logic: '設計「倒果為因」或「張冠李戴」的誘答項。'
        },
        '7-9': { // Level 4: 抽象轉化期
            label: '國中 (Junior High)',
            semantics: '抽象詞彙解鎖 (如：正義、體制)。引入學術基礎術語，但需提供簡要脈絡。',
            syntax: '複雜複句與多重轉折。論證結構需包含「主張+證據」。',
            constraints: [
                '避免使用缺乏根據的推論。',
                '過渡性指令：解釋高中層級概念時，需使用國中生熟悉的生活類比。'
            ],
            distractor_logic: '設計「邏輯謬誤」或「過度推論」的誘答項。'
        },
        '10-12': { // Level 5: 學術應用期
            label: '高中 (Senior High)',
            semantics: '專業領域語言 (Domain-Specific Language)。允許引用古文典故。後設認知詞彙 (如：辯證)。',
            syntax: '長難句與從屬子句。多層次論述結構 (正-反-合)。',
            constraints: [
                '禁止邏輯鬆散的論述。',
                '必須模擬「圖表描述」或「跨文本對讀」的情境。'
            ],
            distractor_logic: '誘答項需極具似真性，需精確理解文本脈絡與邏輯細節才能排除。'
        }
    },

    // === 維度三：素養導向情境演變 (Competency Context Evolution) ===
    COMPETENCY_CONTEXTS: {
        '1-2': {
            scope: '個人/家庭/學校',
            task: '辨識與分類 (如：看懂標示)',
            instruction: '情境應圍繞學生自身經驗 (第一人稱視角)。'
        },
        '3-4': {
            scope: '社區/公共場所',
            task: '資訊應用 (如：讀時刻表、計算花費)',
            instruction: '情境應涉及日常生活中的簡單問題解決。'
        },
        '5-6': {
            scope: '社會/自然環境',
            task: '多步驟解決 (如：規劃行程)',
            instruction: '情境可結合簡單數據判讀與圖表分析。'
        },
        '7-9': {
            scope: '公民社會/全球議題',
            task: '批判思考 (如：假新聞辨識)',
            instruction: '情境強調邏輯推論、證據引用與觀點分析。'
        },
        '10-12': {
            scope: '學術/職涯模擬',
            task: '專題探究/決策',
            instruction: '模擬真實世界的複雜決策與價值權衡 (跨學科整合)。'
        }
    }
};

/**
 * 輔助函式：取得適性化規則
 * @param {string} level - 1-2, 3-4, 5-6, 7-9, 9-12
 */
export function getAdaptiveRules(level) {
    // 處理 9-12 的重疊映射 -> 轉為 10-12 (高中)
    if (level === '9-12') level = '10-12';
    
    // 如果輸入了未定義的 level (如已移除的 '其他')，回退至國中水平
    return {
        type: 'grade',
        ...ADAPTIVE_MATRIX.GRADES[level] || ADAPTIVE_MATRIX.GRADES['7-9']
    };
}

/**
 * 輔助函式：取得素養情境指引
 */
export function getCompetencyContext(level) {
    if (level === '9-12') level = '10-12';
    return ADAPTIVE_MATRIX.COMPETENCY_CONTEXTS[level] || ADAPTIVE_MATRIX.COMPETENCY_CONTEXTS['7-9'];
}