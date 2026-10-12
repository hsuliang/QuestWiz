// 學習領域只決定考查視角；題型、Bloom 目標和教材事實仍由其他設定決定。
const DOMAIN_FOCUS = {
    chinese: ['語文', '文意、語句、觀點、論證或表達效果'],
    math: ['數學', '數量關係、運算、圖形、測量或規律'],
    science: ['自然科學', '科學概念、觀察、證據與因果關係'],
    social: ['社會', '社會現象、制度、時序、因果與觀點'],
    humanities: ['人文', '文化脈絡、文本意涵、歷史與價值觀點'],
    arts: ['藝術', '作品元素、表現手法與詮釋依據'],
    health: ['健體', '健康概念、身體活動與有根據的行為判斷'],
    technology: ['科技', '技術原理、設計選擇、使用情境與影響']
};

export function getDomainGuidelines(domain) {
    const focus = DOMAIN_FOCUS[domain];
    if (!focus) return '';
    return `## 學習領域：${focus[0]}\n優先考查教材中與${focus[1]}有關、適合學生程度的內容。領域是選材與評量視角，不是強制每題加入情境或運算；不得憑領域名稱補造教材沒有的事實，也不得改變指定題型、Bloom 層次與出題風格。`;
}
