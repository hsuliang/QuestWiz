/**
 * Adaptive UI Handler (Phase 4.2 - Themed UI & Subject Support)
 * 負責處理適性化字數連動、閱讀時間預估、學科同步及情境切換
 */

const WORD_COUNT_DEFAULTS = {
    '1-2': 100,   // Level 1: 識字萌芽期 (60-100字)
    '3-4': 300,   // Level 2: 流暢閱讀期 (80-300字)
    '5-6': 600,   // Level 3: 閱讀學習期 (450-700字)
    '7-9': 800,   // Level 4: 抽象轉化期 (500-800字)
    '9-12': 1200  // Level 5: 學術應用期
};

// 基於《分級規範》的閱讀速率 (字/分鐘)
const READING_SPEEDS = {
    '1-2': 120,
    '3-4': 145,
    '5-6': 170,
    '7-9': 180,
    '9-12': 200
};

export function initAdaptiveUI() {
    const slider = document.getElementById('word-count-slider');
    const wordCountDisplay = document.getElementById('word-count-display');
    const hiddenWordCount = document.getElementById('adaptive-word-count');
    const readingTimeBadge = document.getElementById('reading-time-badge');
    const competencyContextContainer = document.getElementById('competency-context-container');

    if (!slider) {
        console.warn('[Adaptive UI] Slider not found.');
        return;
    }

    // 1. 全域監聽變更 (事件委派)
    document.addEventListener('change', (e) => {
        // A. 程度選單變更 -> 連動滑桿與時間
        if (e.target && e.target.classList.contains('student-level-sync')) {
            const val = e.target.value;
            const defaultCount = WORD_COUNT_DEFAULTS[val] || 300;
            slider.value = defaultCount;
            updateSliderDisplay(defaultCount, true);
            updateReadingTime(val, defaultCount);
        }

        // B. 學習領域同步邏輯
        if (e.target && e.target.classList.contains('domain-sync')) {
            const val = e.target.value;
            document.querySelectorAll('.domain-sync').forEach(s => {
                if (s.value !== val) s.value = val;
            });
        }

        // C. 素養情境選單切換
        if (e.target && e.target.id === 'question-style-select') {
            const isCompetency = e.target.value === 'competency-based';
            if (competencyContextContainer) {
                competencyContextContainer.classList.toggle('hidden', !isCompetency);
            }
        }
    });

    // 2. 監聽滑桿拖動 (連動時間)
    slider.addEventListener('input', (e) => {
        const count = e.target.value;
        const levelSelect = document.querySelector('.student-level-sync');
        const level = levelSelect ? levelSelect.value : '3-4';
        updateSliderDisplay(count, false);
        updateReadingTime(level, count);
    });

    // Helper: 更新顯示與數值
    function updateSliderDisplay(val, isDefault) {
        if (!wordCountDisplay || !hiddenWordCount) return;
        const prefix = isDefault ? '預設' : '自訂';
        wordCountDisplay.textContent = `${prefix}: ${val} 字`;
        wordCountDisplay.className = 'text-xs font-bold px-2 py-1 rounded-full shadow-sm transition-all';
        if (isDefault) {
            wordCountDisplay.classList.add('bg-gray-100', 'text-gray-500');
        } else {
            wordCountDisplay.classList.add('themed-button-primary');
        }
        hiddenWordCount.value = val;
    }

    // Helper: 更新預估閱讀時間
    function updateReadingTime(level, count) {
        if (!readingTimeBadge) return;
        const speed = READING_SPEEDS[level] || 150;
        const minutes = Math.ceil(count / speed);
        readingTimeBadge.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            預估閱讀：${minutes} 分鐘
        `;
    }

    // 初始化狀態
    const currentSelect = document.querySelector('.student-level-sync');
    if (currentSelect && currentSelect.value) {
        const val = currentSelect.value;
        slider.value = WORD_COUNT_DEFAULTS[val] || 300;
        updateSliderDisplay(slider.value, true);
        updateReadingTime(val, slider.value);
    }
}

/**
 * 外部同步介面 (由 main.js 呼叫)
 */
export function updateSliderFromExternal(val) {
    const slider = document.getElementById('word-count-slider');
    const defaultCount = WORD_COUNT_DEFAULTS[val] || 300;
    
    if (slider) {
        slider.value = defaultCount;
        
        const wordCountDisplay = document.getElementById('word-count-display');
        const hiddenWordCount = document.getElementById('adaptive-word-count');
        const readingTimeBadge = document.getElementById('reading-time-badge');
        
        if (wordCountDisplay) {
            wordCountDisplay.textContent = `預設: ${defaultCount} 字`;
            wordCountDisplay.className = 'text-xs font-bold px-2 py-1 rounded-full shadow-sm bg-gray-100 text-gray-500';
        }
        if (hiddenWordCount) hiddenWordCount.value = defaultCount;
        
        if (readingTimeBadge) {
            const speed = READING_SPEEDS[val] || 150;
            const minutes = Math.ceil(defaultCount / speed);
            readingTimeBadge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                預估閱讀：${minutes} 分鐘
            `;
        }
    }
}
