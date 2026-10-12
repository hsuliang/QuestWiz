// --- 組態常數 ---
export const CONFIG = {
    BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    MODEL_MODE_STORAGE_KEY: 'gemini_model_mode_v1',
    RATE_LEDGER_STORAGE_KEY: 'questwiz_gemini_rate_ledger_v1',
    MODELS: {
        STANDARD: 'gemini-3.5-flash-lite',
        HIGH_QUALITY: 'gemini-3.8-flash',
    },
    QUOTAS: {
        // 本機安全上限，不是 Google 配額保證；實際值依專案、模型與用量層級變動。
        STANDARD: { RPM: 12, TPM: 200000, RPD: 400 },
        HIGH_QUALITY: { RPM: 4, TPM: 120000, RPD: 20 }
    },
    ADD_CONTENT_URL: 'https://addcontent-2xblwpocfa-de.a.run.app',
    VIEW_PAGE_URL: 'view.html',
    EXTRACT_URL_FUNCTION_URL: 'https://extractcontentfromurl-2xblwpocfa-de.a.run.app',
    GET_YOUTUBE_TRANSCRIPT_URL: 'https://getyoutubetranscript-2xblwpocfa-de.a.run.app',
    DELETE_QUIZ_FUNCTION_URL: 'https://deletequizasadmin-2xblwpocfa-de.a.run.app',
    VISITOR_COUNT_FUNCTION_URL: 'https://asia-east1-questwiz.cloudfunctions.net/trackVisitorCount',

    // Firebase 設定
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyAItStwfaWVIrOXRk5CfufUxLT20cy8E-g",
        authDomain: "questwiz.firebaseapp.com",
        projectId: "questwiz",
        storageBucket: "questwiz.firebasestorage.app",
        messagingSenderId: "844538442885",
        appId: "1:844538442885:web:9bf66be2c8a4081c1ee5ec"
    }
};

export const questionLoadingMessages = [ "AI 老師正在絞盡腦汁出題中...", "靈感正在匯集中，題目即將問世...", "您的專屬考卷即將熱騰騰出爐！", "正在召喚出題小精靈為您服務...", "題目正在精心烹煮中，請稍候..." ];
export const contentLoadingMessages = [ "AI 作家正在揮灑靈感，撰寫文章中...", "學習內文生成中，請稍待片刻...", "正在為您編織一篇精彩的故事...", "知識正在匯入，請稍候..." ];

// 台灣教育領域與議題常數
export const TAIWAN_EDU_DOMAINS = [
    "語文", "數學", "社會", "自然科學", "藝術", "綜合活動", "科技", "健康與體育", "其他"
];

export const TAIWAN_EDU_ISSUES = [
    "無", "性別平等", "人權", "環境", "海洋", "品德", "生命", "法治", "科技", "資訊", 
    "能源", "安全", "防災", "家庭教育", "生涯規劃", "多元文化", "閱讀素養", "戶外教育", 
    "國際教育", "原住民族教育", "其他"
];

export const TAIWAN_PUBLISHERS = [
    "康軒", "翰林", "南一", "其他"
];
