# Gemini API 動態保底與故障降級優化稽核報告

本報告整理了針對 Gemini API 的動態模型解析與保底（Fallback）降級機制的稽核與優化過程。您可以參考本報告中的設計概念與具體實作方法，將此設計應用於修正其他 AI 連接模組中，以防止因 Google 官方模型版本淘汰（Deprecation）所產生的系統性崩潰。

---

## 1. 核心問題背景與設計漏洞

在原先的系統設計中，為了應對網路問題、金鑰權限不足或特定高版本模型服務暫時不可用（如 503 錯誤），我們實作了**「動態模型解析」**與**「保底降級」**機制。然而，該機制存在以下維護性隱憂：

1. **特定硬編碼版本風險**
   原本系統的保底常數被寫死為特定的版本號（例如 `const FALLBACK_MODEL = 'gemini-1.5-flash'`）。當 Google API 廢棄並關閉此舊版型號後，一旦動態取得模型清單失敗，系統在退回到保底模型時會引發 `404 Model not found` 錯誤，導致保底機制名存實亡。
2. **缺乏明確的錯誤可追蹤性**
   在捕獲動態模型解析失敗的 `catch` 區塊中，僅使用了一般的警告日誌，不利於維運人員（或日誌監控系統）在生產環境中即時察覺「模型解析失敗已進入降級方案」的警訊。

---

## 2. 解決方案：官方常綠別名（Evergreen Alias）降級策略

為了解決以上問題，我們提出了常綠別名降級策略，核心改動包含 **「引入常綠模型別名」** 以及 **「強化錯誤追蹤警告」**。

### 概念 A：常綠別名（Evergreen Alias）
* **定義**：Google Gemini 提供了常綠別名 `'gemini-flash-latest'`。此別名會永遠指向目前官方推薦的最穩定、最主流的 Flash 模型版本，而不需要手動更動程式碼中的版本數字。
* **優勢**：在動態取得可用模型失敗時，將保底變數設為此常綠別名，即可確保系統永遠有可用的 Flash 模型保底，徹底擺脫因硬編碼版本廢棄而帶來的定期更新成本。

### 概念 B：排序相容性（Priority Queue Compatibility）
將保底模型替換為 `'gemini-flash-latest'` 時，必須確保它不會干擾原本動態模型的排序機制。
* **排序邏輯**：系統會透過正規表達式 `/gemini-(\d+\.?\d*)-flash/i` 提取版本號（如 `1.5`、`2.5`）並進行**降冪排序**（從新到舊優先選用）。
* **相容機制**：由於常綠別名 `gemini-flash-latest` 不含數字版本號，會被解析為 `versionNum = 0`。這會使其在排序時被安全地排在**清單的最後方**。因此，系統在健康狀態下依然會優先調用具體版本號的最新模型，只有在前方所有具體型號都嘗試失敗、或完全無法連線時，才會調用保底的常綠模型，完美符合「最底線保險」的定位。

---

## 3. 具體修改步驟與程式碼範例

### 步驟一：定位目標並修改保底常數
在負責 API 呼叫的模組中，將保底模型從硬編碼的特定版號替換為官方常綠別名：

```javascript
// ❌ 舊做法：硬編碼特定數字版本，易隨官方下架而失效
// const FALLBACK_MODEL = 'gemini-1.5-flash';

//  新做法：使用官方常綠別名，確保永不下架與自動更新
const FALLBACK_MODEL = 'gemini-flash-latest';
```

### 步驟二：更新模型解析邏輯與排序相容
在解析可用模型清單時，提取版本號並進行降冪排序，最後確保 `FALLBACK_MODEL` 被作為底線模型加入清單尾端：

```javascript
async function resolveFlashModelsList(apiKey, throwOnError = false) {
    if (!apiKey) return [FALLBACK_MODEL];
    if (modelCache.has(apiKey)) return modelCache.get(apiKey);

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        
        const data = await response.json();
        
        // 1. 過濾出 Flash 且支援 generateContent 的正式模型
        const flashModels = data.models.filter(m => {
            const name = (m.name || '').toLowerCase();
            const hasGenerate = m.supportedGenerationMethods?.includes('generateContent');
            return hasGenerate && name.includes('flash') && !name.includes('preview') && !name.includes('lite');
        });

        if (flashModels.length === 0) return [FALLBACK_MODEL];

        // 2. 提取版本號
        const parsedModels = flashModels.map(m => {
            const suffix = m.name.split('/').pop();
            // 提取例如 gemini-2.5-flash 中的 2.5
            const versionMatch = suffix.match(/gemini-(\d+\.?\d*)-flash/i);
            const versionNum = versionMatch ? parseFloat(versionMatch[1]) : 0; // 'gemini-flash-latest' 會是 0
            return { suffix, versionNum };
        });

        // 3. 降冪排序（版本號高到低）
        parsedModels.sort((a, b) => {
            if (b.versionNum !== a.versionNum) {
                return b.versionNum - a.versionNum;
            }
            return b.suffix.localeCompare(a.suffix, undefined, { numeric: true, sensitivity: 'base' });
        });

        const list = parsedModels.map(m => m.suffix);

        // 4. 確保保底模型作為最後安全網存在於清單中
        if (!list.includes(FALLBACK_MODEL)) {
            list.push(FALLBACK_MODEL);
        }

        modelCache.set(apiKey, list);
        return list;

    } catch (e) {
        // ❌ 舊做法：一般日誌警告，難以在大量日誌中識別故障自癒狀態
        // console.warn("Failed to resolve flash models list, using fallback:", e);

        //  新做法：強化錯誤追蹤，加上明確且易被日誌收集器監控的 [系統警告] 前綴
        console.warn("[系統警告] 動態模型解析失敗，已啟用動態常綠降級方案:", FALLBACK_MODEL, e);
        
        if (throwOnError) throw e;
        return [FALLBACK_MODEL];
    }
}
```

---

## 4. 稽核檢驗表（Checklist）

當您在修正另外一支程式時，請使用此檢驗表進行稽核：

- [ ] **是否已移除所有特定的數字版本保底字串**（如 `'gemini-1.5-flash'`、`'gemini-2.5-flash'` 等）？
- [ ] **是否已將全域保底常數改為常綠別名 `'gemini-flash-latest'`**？
- [ ] **解析與排序邏輯中，是否能相容不帶版本號的常綠別名字串**（例如確保其轉換的 `versionNum` 為最小值 `0`，避免其排序至最前頭而干擾新版本的優先選用）？
- [ ] **當模型解析觸發 `catch` 時，是否輸出帶有明確前綴 `[系統警告]` 的日誌**，且明確指出所選用的保底降級方案？
- [ ] **降級方案是否已被安全地推入模型清單的最後一位**，作為最後防線？

---

## 5. 總結

此優化方案的核心精神是**「動態優先、常綠保底、透明監控」**。透過此設計，您的應用程式不僅能優先享有最新模型所帶來的性能與生成品質提升，更能在 Google API 發生版本迭代或網路震盪時，自動完成無感知的平滑降級，大幅提升了系統的強健性（Robustness）與自動修復力。
