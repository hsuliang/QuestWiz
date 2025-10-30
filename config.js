// --- 組態常數 ---
export const CONFIG = {
    // 更新為新的 v1 穩定版 API URL
    API_URL: `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent`,
    API_BATCH_SIZE: 6,
    DEBOUNCE_DELAY: 800,
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
    MAX_IMAGE_SIZE_BYTES: 4 * 1024 * 1024, // 4MB
    MAX_TOTAL_IMAGE_SIZE_BYTES: 15 * 1024 * 1024, // 15MB
    ADD_CONTENT_URL: 'https://asia-east1-questwiz.cloudfunctions.net/addContent',
    VIEW_PAGE_URL: 'view.html',
    EXTRACT_URL_FUNCTION_URL: 'https://asia-east1-questwiz.cloudfunctions.net/extractContentFromUrl',
    // 【新增】YouTube 字幕擷取函式的 URL
    GET_YOUTUBE_TRANSCRIPT_URL: 'https://asia-east1-questwiz.cloudfunctions.net/getYouTubeTranscript',
};

export const questionLoadingMessages = [ "AI 老師正在絞盡腦汁出題中...", "靈感正在匯集中，題目即將問世...", "您的專屬考卷即將熱騰騰出爐！", "正在召喚出題小精靈為您服務...", "題目正在精心烹煮中，請稍候..." ];
export const contentLoadingMessages = [ "AI 作家正在揮灑靈感，撰寫文章中...", "學習內文生成中，請稍待片刻...", "正在為您編織一篇精彩的故事...", "知識正在匯入，請稍候..." ];
