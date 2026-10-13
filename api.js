import { CONFIG } from './config.js';
import { stopKeyTimer, t, showLoader, updateApiKeyBadge } from './ui.js?v=20261013R1';
import { getAdaptiveSystemInstruction, PROMPT_VERSION } from './prompts/index.js?v=20261012-domain-review-1';
import { buildQuestionTypePlan } from './prompts/blocks/question_schema.js?v=20261012-question-quality-5';
import { validateQuestionBatch } from './utils/normalizer.js?v=20261012-question-quality-5';

const MODEL_FRIENDLY_NAMES = {
    'gemini-3.8-flash': 'Gemini 3.8 Flash',
    'gemini-3.6-flash': 'Gemini 3.6 Flash',
    'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
    'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
};

function getFriendlyModelName(modelName) {
    if (!modelName) return 'Gemini Flash';
    const key = modelName.toLowerCase();
    for (const [k, v] of Object.entries(MODEL_FRIENDLY_NAMES)) {
        if (key.includes(k)) {
            return v;
        }
    }
    return modelName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
} 

const MODEL_ALLOWLISTS = {
    HIGH_QUALITY: [
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-2.5-flash'
    ],
    STANDARD: [
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash-lite'
    ]
};
const MODEL_CACHE_MS = 60 * 60 * 1000;
const DAY_MS = 24 * MODEL_CACHE_MS;
const MINUTE_MS = 60 * 1000;
const GEMINI_REQUEST_TIMEOUT_MS = 90 * 1000;
const unavailableModels = new Set();
let inMemoryGeminiMode = 'STANDARD';
const inMemoryQuotaLedger = {};

export function getGeminiMode() {
    try {
        const saved = localStorage.getItem(CONFIG.MODEL_MODE_STORAGE_KEY);
        if (saved === 'HIGH_QUALITY' || saved === 'STANDARD') inMemoryGeminiMode = saved;
    } catch { /* Use the in-memory default when browser storage is unavailable. */ }
    return inMemoryGeminiMode;
}

export function setGeminiMode(mode) {
    inMemoryGeminiMode = mode === 'HIGH_QUALITY' ? 'HIGH_QUALITY' : 'STANDARD';
    try { localStorage.setItem(CONFIG.MODEL_MODE_STORAGE_KEY, inMemoryGeminiMode); }
    catch { /* Keep this tab's choice when browser storage is unavailable. */ }
    return inMemoryGeminiMode;
}

export function resetGeminiRequestState() { unavailableModels.clear(); }

export function createGeminiRequestBudget(batchCount = 1) {
    return { base: batchCount, correction: batchCount, fallback: 3 };
}

export async function fetchWithRetry(url, options, retries = 2, initialDelay = 1000) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (![408, 500, 502, 503, 504].includes(response.status) || attempt === retries - 1) return response;
        } catch (error) {
            if (error.name === 'AbortError' || attempt === retries - 1) throw error;
        }
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, initialDelay + Math.floor(Math.random() * 500));
            options.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); }, { once: true });
        });
    }
}

const API_KEY_DATA_KEY = 'gemini_api_key_data';
const API_KEY_LIFETIME_KEY = 'gemini_api_key_lifetime_v1';
const KEY_LIFETIMES = { '2h': 2, '4h': 4, '8h': 8, '24h': 24 };

function keyRecord() {
    const stores = [];
    try { stores.push(['local', globalThis.localStorage]); } catch { /* Local storage may be disabled by browser policy. */ }
    try { stores.push(['session', globalThis.sessionStorage]); } catch { /* Session storage may be disabled by browser policy. */ }
    for (const [storageType, storage] of stores) {
        try {
            const raw = storage.getItem(API_KEY_DATA_KEY);
            if (!raw) continue;
            const data = JSON.parse(raw);
            const expires = data?.expires;
            const invalidExpiry = expires !== null && !Number.isFinite(expires);
            if (!data || typeof data.value !== 'string' || !data.value || invalidExpiry
                || (Number.isFinite(expires) && Date.now() >= expires)) {
                storage.removeItem(API_KEY_DATA_KEY);
                stopKeyTimer();
                resetGeminiRequestState();
                continue;
            }
            return { data, storage, storageType };
        } catch {
            try { storage.removeItem(API_KEY_DATA_KEY); } catch { /* Ignore unavailable browser storage. */ }
        }
    }
    return null;
}

function keyData() {
    return keyRecord()?.data || null;
}

export function getApiKeyInfo() {
    const record = keyRecord();
    if (!record) return null;
    return {
        ...record.data,
        storageMode: record.data.storageMode || (record.storageType === 'session' ? '2h' : 'permanent')
    };
}

export function saveApiKey(apiKey, lifetime = '2h') {
    if (!Object.hasOwn(KEY_LIFETIMES, lifetime) && !['session', 'permanent'].includes(lifetime)) {
        throw new Error('金鑰保存期限設定無效。');
    }
    const storageMode = lifetime;
    const storage = lifetime === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    const expires = Object.hasOwn(KEY_LIFETIMES, lifetime)
        ? Date.now() + KEY_LIFETIMES[lifetime] * 60 * 60 * 1000
        : null;
    const data = { value: apiKey, expires, storageMode, status: 'unverified', updatedAt: Date.now() };
    storage.setItem(API_KEY_DATA_KEY, JSON.stringify(data));
    try {
        const otherStorage = lifetime === 'session' ? globalThis.localStorage : globalThis.sessionStorage;
        otherStorage.removeItem(API_KEY_DATA_KEY);
    } catch { /* The latest saved record takes precedence. */ }
    try { globalThis.localStorage.setItem(API_KEY_LIFETIME_KEY, lifetime); }
    catch { /* Saving the key does not depend on remembering the preferred lifetime. */ }
    resetGeminiRequestState();
    updateApiKeyBadge();
    return data;
}

export function getPreferredApiKeyLifetime() {
    try {
        const saved = globalThis.localStorage.getItem(API_KEY_LIFETIME_KEY);
        if (Object.hasOwn(KEY_LIFETIMES, saved) || ['session', 'permanent'].includes(saved)) return saved;
    } catch { /* Fall back to the recommended duration. */ }
    return '2h';
}

export function clearSavedApiKey() {
    const stores = [];
    try { stores.push(globalThis.localStorage); } catch { /* Continue with session storage. */ }
    try { stores.push(globalThis.sessionStorage); } catch { /* Continue with any available store. */ }
    for (const storage of stores) {
        try { storage.removeItem(API_KEY_DATA_KEY); } catch { /* Continue clearing the other browser store. */ }
    }
    stopKeyTimer();
    resetGeminiRequestState();
    updateApiKeyBadge();
}

export function getApiKey() {
    return keyData()?.value || null;
}

function setApiKeyStatus(apiKey, status) {
    const record = keyRecord();
    if (!record || record.data.value !== apiKey) return;
    record.data.status = status;
    try {
        record.storage.setItem(API_KEY_DATA_KEY, JSON.stringify(record.data));
        updateApiKeyBadge();
    } catch { /* Keep the current request functional if browser storage is unavailable. */ }
}

function nextPacificMidnight() {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = formatter.format(new Date());
    let low = Date.now();
    let high = low + 48 * MODEL_CACHE_MS;
    while (high - low > 1000) {
        const middle = Math.floor((low + high) / 2);
        if (formatter.format(new Date(middle)) === today) low = middle;
        else high = middle;
    }
    return high;
}

function pacificDateKey(timestamp = Date.now()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(timestamp));
}

function readQuotaLedger() {
    try {
        const value = JSON.parse(localStorage.getItem(CONFIG.RATE_LEDGER_STORAGE_KEY) || '{}');
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch { /* Fall back to this page's memory when storage is unavailable. */ }
    return inMemoryQuotaLedger;
}

function writeQuotaLedger(ledger) {
    const staleBefore = Date.now() - 2 * DAY_MS;
    Object.keys(ledger).forEach(projectMode => {
        if ((ledger[projectMode]?.updatedAt || 0) < staleBefore) delete ledger[projectMode];
    });
    Object.keys(inMemoryQuotaLedger).forEach(key => delete inMemoryQuotaLedger[key]);
    Object.assign(inMemoryQuotaLedger, ledger);
    try { localStorage.setItem(CONFIG.RATE_LEDGER_STORAGE_KEY, JSON.stringify(ledger)); }
    catch { /* The in-memory copy still protects this page session. */ }
}

function countTextTokens(text) {
    const cjkCount = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    return cjkCount + Math.ceil((text.length - cjkCount) / 4);
}

function estimateInputTokens(value, key = '') {
    if (typeof value === 'string') {
        if (key === 'data') return Math.max(258, Math.ceil(value.length / 32768) * 258);
        return countTextTokens(value);
    }
    if (Array.isArray(value)) return value.reduce((total, item) => total + estimateInputTokens(item), 0);
    if (value && typeof value === 'object') {
        return Object.entries(value).reduce((total, [childKey, child]) => total + estimateInputTokens(child, childKey), 0);
    }
    return 0;
}

function withQuotaLedgerLock(operation) {
    const locks = globalThis.navigator?.locks;
    return locks?.request
        ? locks.request('questwiz-gemini-quota-ledger', operation)
        : operation();
}

function inspectAndReserveQuota(mode, estimatedTokens) {
    return withQuotaLedgerLock(() => {
        const limits = CONFIG.QUOTAS[mode];
        const now = Date.now();
        const ledger = readQuotaLedger();
        const ledgerKey = mode;
        let bucket = ledger[ledgerKey];
        const shared = ledger.shared || { nextRequestAt: 0, providerPauseUntil: 0, samples: [], dailyRequests: 0 };
        ledger.shared = shared;
        shared.updatedAt = now;
        if (shared.providerPauseUntil > now) {
            return { providerWaitMs: shared.providerPauseUntil - now };
        }
        const today = pacificDateKey(now);
        if (shared.day !== today) {
            shared.day = today;
            shared.dailyRequests = 0;
        }
        shared.samples = (shared.samples || []).filter(sample => sample.at > now - MINUTE_MS);
        if (!bucket) {
            bucket = { day: today, dailyRequests: 0, samples: [], nextRequestAt: 0 };
            ledger[ledgerKey] = bucket;
        } else if (bucket.day !== today) {
            // RPD resets at Pacific midnight, but minute windows must survive the date boundary.
            bucket.day = today;
            bucket.dailyRequests = 0;
        }
        bucket.samples = (bucket.samples || []).filter(sample => sample.at > now - MINUTE_MS);
        bucket.updatedAt = now;

        if (estimatedTokens > limits.TPM) {
            writeQuotaLedger(ledger);
            return { tooLarge: true };
        }
        if (bucket.dailyRequests >= limits.RPD || shared.dailyRequests >= CONFIG.QUOTAS.STANDARD.RPD) {
            writeQuotaLedger(ledger);
            return { dailyLimited: true };
        }

        const rpmWait = bucket.samples.length >= limits.RPM
            ? bucket.samples[0].at + MINUTE_MS - now
            : 0;
        const sharedRpmWait = shared.samples.length >= CONFIG.QUOTAS.STANDARD.RPM
            ? shared.samples[0].at + MINUTE_MS - now
            : 0;
        const currentTokens = bucket.samples.reduce((total, sample) => total + sample.tokens, 0);
        let tpmWait = 0;
        let excessTokens = currentTokens + estimatedTokens - limits.TPM;
        if (excessTokens > 0) {
            for (const sample of bucket.samples) {
                excessTokens -= sample.tokens;
                if (excessTokens <= 0) {
                    tpmWait = sample.at + MINUTE_MS - now;
                    break;
                }
            }
        }
        let sharedTpmWait = 0;
        let sharedExcessTokens = shared.samples.reduce((total, sample) => total + sample.tokens, 0)
            + estimatedTokens - CONFIG.QUOTAS.STANDARD.TPM;
        if (sharedExcessTokens > 0) {
            for (const sample of shared.samples) {
                sharedExcessTokens -= sample.tokens;
                if (sharedExcessTokens <= 0) {
                    sharedTpmWait = sample.at + MINUTE_MS - now;
                    break;
                }
            }
        }
        const spacingMs = Math.ceil((MINUTE_MS / limits.RPM) * 1.15);
        const spacingWait = Math.max(bucket.nextRequestAt || 0, shared.nextRequestAt || 0) - now;
        const waitMs = Math.max(0, rpmWait, sharedRpmWait, tpmWait, sharedTpmWait, spacingWait);
        if (waitMs > 0) {
            writeQuotaLedger(ledger);
            return { waitMs };
        }

        const reservationId = `${now}-${Math.random().toString(36).slice(2)}`;
        bucket.dailyRequests++;
        bucket.samples.push({ id: reservationId, at: now, tokens: estimatedTokens });
        shared.dailyRequests++;
        shared.samples.push({ id: reservationId, at: now, tokens: estimatedTokens });
        bucket.nextRequestAt = now + spacingMs;
        shared.nextRequestAt = now + spacingMs;
        writeQuotaLedger(ledger);
        return { reservation: { ledgerKey, reservationId } };
    });
}

function pauseProviderUntil(until) {
    return withQuotaLedgerLock(() => {
        const ledger = readQuotaLedger();
        ledger.shared = ledger.shared || {};
        ledger.shared.providerPauseUntil = Math.max(ledger.shared.providerPauseUntil || 0, until);
        ledger.shared.updatedAt = Date.now();
        writeQuotaLedger(ledger);
    });
}

function updateQuotaReservation(reservation, actualInputTokens) {
    if (!reservation || !Number.isFinite(actualInputTokens) || actualInputTokens < 1) return Promise.resolve();
    return withQuotaLedgerLock(() => {
        const ledger = readQuotaLedger();
        const bucket = ledger[reservation.ledgerKey];
        const sample = bucket?.samples?.find(item => item.id === reservation.reservationId);
        if (!sample) return;
        sample.tokens = Math.ceil(actualInputTokens);
        const sharedSample = ledger.shared?.samples?.find(item => item.id === reservation.reservationId);
        if (sharedSample) sharedSample.tokens = sample.tokens;
        bucket.updatedAt = Date.now();
        writeQuotaLedger(ledger);
    });
}

function waitForQuota(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException('已取消', 'AbortError'));
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException('已取消', 'AbortError'));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, Math.max(1, ms));
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

async function reserveRequest(mode, payload, signal) {
    const estimatedTokens = Math.ceil(estimateInputTokens(payload) * 1.2);
    while (true) {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        const result = await inspectAndReserveQuota(mode, estimatedTokens);
        if (result.reservation) return result.reservation;
        if (result.dailyLimited || result.tooLarge) throw localQuotaError(mode, result.tooLarge ? 'tpm' : 'daily');
        if (result.providerWaitMs > 30000) {
            throw new Error('Google 要求暫停請求，請約 ' + Math.ceil(result.providerWaitMs / 1000) + ' 秒後再試。');
        }
        await waitForQuota(result.providerWaitMs || result.waitMs || 1000, signal);
    }
}

function localQuotaError(mode, reason) {
    if (mode === 'HIGH_QUALITY') {
        if (reason === 'daily') return new Error(t('model_mode_error_hq_daily'));
        if (reason === 'tpm') return new Error(t('model_mode_error_hq_tpm'));
    }
    if (reason === 'daily') return new Error(t('model_mode_error_standard_daily'));
    if (reason === 'tpm') return new Error(t('model_mode_error_tpm'));
    return new Error('本機 Gemini 請求限制已達上限，請稍後重試。');
}

function useRequestSlot(budget, kind) {
    if (budget[kind] < 1) throw new Error('本次操作已達安全重試上限，請稍後再試。');
    budget[kind]--;
}

function retryDelay(response, body) {
    const bodyText = JSON.stringify(body || {});
    if (/per day|daily|RPD|GenerateRequestsPerDay/i.test(bodyText)) {
        return { daily: true, until: nextPacificMidnight() };
    }
    const header = response.headers?.get('Retry-After');
    const headerSeconds = Number(header);
    const headerUntil = header && !Number.isFinite(headerSeconds) ? Date.parse(header) : NaN;
    const bodySeconds = Number(bodyText.match(/"retryDelay"\s*:\s*"([\d.]+)s"/)?.[1]);
    const delayMs = header && Number.isFinite(headerSeconds)
        ? Math.max(0, headerSeconds * 1000)
        : Number.isFinite(headerUntil)
            ? Math.max(0, headerUntil - Date.now())
            : Number.isFinite(bodySeconds)
                ? Math.max(0, bodySeconds * 1000)
                : 60000;
    return { daily: false, until: Date.now() + Math.max(1000, delayMs) };
}

export async function makeCentralizedRequest(payload, signal, requestedModelName = null, operationLabel = '出題', budget = createGeminiRequestBudget(), requestKind = 'base') {
    const key = getApiKey();
    if (!key) throw new Error(t('error_api_missing'));
    const keyStatus = keyData()?.status;
    if (keyStatus === 'restricted') throw new Error('這把 API Key 的專案權限受限。請至 Google AI Studio 檢查或依 Google 通知申訴。');
    if (keyStatus === 'invalid') throw new Error('API Key 無效，請在金鑰設定中更正。');

    const mode = requestedModelName === CONFIG.MODELS.HIGH_QUALITY
        ? 'HIGH_QUALITY'
        : requestedModelName === CONFIG.MODELS.STANDARD ? 'STANDARD' : getGeminiMode();
    const highQuality = mode === 'HIGH_QUALITY';
    const models = MODEL_ALLOWLISTS[mode].filter(model => !unavailableModels.has(model));
    if (!models.length) throw new Error(t(highQuality ? 'model_mode_error_hq_unavailable' : 'model_mode_error_standard_unavailable'));
    const currentPayload = structuredClone(payload);
    if (!highQuality && currentPayload.generationConfig) {
        delete currentPayload.generationConfig.thinking;
        delete currentPayload.generationConfig.include_thoughts;
    }

    let nextKind = requestKind;
    let retry429Used = false;
    let retriedTransient = false;
    let transientCount = 0;
    for (const [index, model] of models.entries()) {
        while (true) {
            if (budget[nextKind] < 1) throw new Error('本次操作已達安全重試上限，請稍後再試。');
            const reservation = await reserveRequest(mode, currentPayload, signal);
            useRequestSlot(budget, nextKind);
            showLoader('AI 正在' + operationLabel + '中...\n(使用模型： ' + getFriendlyModelName(model) + ')');
            const requestController = new AbortController();
            const abortForTask = () => requestController.abort(signal?.reason);
            if (signal?.aborted) abortForTask();
            else signal?.addEventListener('abort', abortForTask, { once: true });
            const timeoutId = setTimeout(() => requestController.abort(new DOMException('Gemini 回應逾時', 'TimeoutError')), GEMINI_REQUEST_TIMEOUT_MS);
            const startedAt = Date.now();
            let response;
            let responseText;
            console.info('[Gemini API] Request started: ' + model);
            try {
                response = await fetch(CONFIG.BASE_URL + '/models/' + model + ':generateContent', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                    body: JSON.stringify(currentPayload), signal: requestController.signal
                });
                responseText = await response.text();
                console.info('[Gemini API] HTTP ' + response.status + ': ' + model + ' (' + (Date.now() - startedAt) + ' ms)');
            } catch (error) {
                if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
                throw new Error(requestController.signal.aborted
                    ? 'Gemini 回應逾時，請稍後再試。'
                    : '無法連線至 Gemini，請檢查網路或瀏覽器限制後再試。');
            } finally {
                clearTimeout(timeoutId);
                signal?.removeEventListener('abort', abortForTask);
            }

            let body = {};
            try { body = JSON.parse(responseText) || {}; } catch { /* The caller handles malformed successful responses. */ }
            if (response.ok) {
                await updateQuotaReservation(reservation, body?.usageMetadata?.promptTokenCount);
                setApiKeyStatus(key, 'used');
                body._actualModelUsed = model;
                body._generationMode = mode;
                return body;
            }
            const providerError = (body.error?.status || '') + ' ' + (body.error?.message || '');
            if (response.status === 401 || (response.status === 400 && /API_KEY_INVALID|API key (?:is )?(?:not valid|invalid)|invalid API key/i.test(providerError))) {
                setApiKeyStatus(key, 'invalid');
                throw new Error('API Key 無效，請在金鑰設定中更正。');
            }
            if (response.status === 403) {
                setApiKeyStatus(key, 'restricted');
                throw new Error('Google 拒絕這把 API Key 的專案權限（403）。本次操作已停止，請至 Google AI Studio 檢查或依通知申訴。');
            }
            if (response.status === 429) {
                const limit = retryDelay(response, body);
                await pauseProviderUntil(limit.until);
                if (limit.daily) throw new Error('Google 專案今日額度已用盡，請待額度重置後再試。');
                const delayMs = limit.until - Date.now();
                if (retry429Used || delayMs > 30000 || budget.fallback < 1) {
                    throw new Error('Google 請求速率已達限制，請約 ' + Math.ceil(delayMs / 1000) + ' 秒後再試。');
                }
                retry429Used = true;
                nextKind = 'fallback';
                await waitForQuota(delayMs, signal);
                continue;
            }
            if (response.status === 404) {
                unavailableModels.add(model);
                nextKind = 'fallback';
                break;
            }
            if ([408, 500, 502, 503, 504].includes(response.status)) {
                if (budget.fallback < 1) throw new Error('Gemini 服務暫時忙碌，已達本次安全重試上限，請稍後再試。');
                const delayMs = Math.min(1000 * (2 ** transientCount++), 8000) + Math.floor(Math.random() * 250);
                nextKind = 'fallback';
                if (!retriedTransient) {
                    retriedTransient = true;
                    await waitForQuota(delayMs, signal);
                    continue;
                }
                if (index < models.length - 1) {
                    await waitForQuota(delayMs, signal);
                    break;
                }
                throw new Error('Gemini 服務暫時忙碌，請稍後再試。');
            }
            throw new Error('Gemini 呼叫失敗 (HTTP ' + response.status + ')：' + (body.error?.message || '請稍後再試'));
        }
    }
    throw new Error(t(highQuality ? 'model_mode_error_hq_unavailable' : 'model_mode_error_standard_unavailable'));
}

async function makeGeminiRequest(payload, signal, modelName = null, budget, requestKind = 'base') {
    return makeCentralizedRequest(payload, signal, modelName, '出題', budget, requestKind);
}
function extractJsonObject(rawText) {
    const text = rawText
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    const start = text.indexOf('{');
    if (start < 0) return text;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index++) {
        const character = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') inString = false;
            continue;
        }
        if (character === '"') inString = true;
        else if (character === '{') depth++;
        else if (character === '}' && --depth === 0) return text.slice(start, index + 1);
    }
    return text.slice(start);
}

function responseDiagnostics(result, parsedResult) {
    const candidate = result?.candidates?.[0];
    return {
        model: result?._actualModelUsed || 'unknown',
        finishReason: candidate?.finishReason || 'unknown',
        blockReason: result?.promptFeedback?.blockReason || null,
        outputTokens: result?.usageMetadata?.candidatesTokenCount ?? null,
        textLength: parsedResult?.rawText?.length || 0,
        validJson: parsedResult?.validJson || false,
        parseError: parsedResult?.error?.message || null
    };
}

function parseGeminiResponse(result) {
    const candidate = result?.candidates?.[0];
    if (result?.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(candidate?.finishReason)) {
        throw new Error("【AI 拒絕服務】內容違反安全政策。");
    }
    const rawText = (candidate?.content?.parts || [])
        .filter(part => typeof part.text === 'string' && !part.thought)
        .map(part => part.text)
        .join('');
    if (!rawText.trim()) {
        return { error: new Error('Gemini 回應沒有可讀文字。'), rawText, finishReason: candidate?.finishReason || 'unknown' };
    }

    const cleanJsonText = extractJsonObject(rawText);
    try {
        const parsed = JSON.parse(cleanJsonText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
            return {
                error: new Error('JSON 未包含有效的 questions 題目陣列。'),
                rawText,
                validJson: true,
                finishReason: candidate?.finishReason || 'unknown'
            };
        }
        return {
            questions: parsed.questions,
            suggestedTitle: typeof parsed.quizTitle === 'string' ? parsed.quizTitle : '',
            rawText,
            validJson: true,
            finishReason: candidate?.finishReason || 'unknown'
        };
    } catch (error) {
        return { error, rawText, validJson: false, finishReason: candidate?.finishReason || 'unknown' };
    }
}

function createFormatFailureError(initialDiagnostics, repairDiagnostics = null) {
    const diagnostics = { initial: initialDiagnostics, repair: repairDiagnostics };
    console.error('[Gemini API] JSON response could not be used. Diagnostic summary:', diagnostics);

    let message;
    if (initialDiagnostics.finishReason === 'MAX_TOKENS' || repairDiagnostics?.finishReason === 'MAX_TOKENS') {
        message = 'AI 回應內容過長而未完成，請減少題數或縮短教材後重試。';
    } else {
        message = 'AI 回應格式無法修復，請重試；若再次發生，請提供主控台的 Gemini API 診斷摘要。';
    }

    const error = new Error(message);
    error.code = 'AI_RESPONSE_FORMAT';
    error.detail = diagnostics;
    return error;
}

function createQualityFailureError(issues, initialDiagnostics, retryDiagnostics) {
    console.error('[Gemini API] Question batch failed validation:', { issues, initial: initialDiagnostics, retry: retryDiagnostics });
    const error = new Error('AI 回傳的題目仍不符合題數、題型或答案格式要求，請重新出題；若再次發生，請縮短教材後再試。');
    error.code = 'AI_RESPONSE_QUALITY';
    error.detail = { issues, initial: initialDiagnostics, retry: retryDiagnostics };
    return error;
}

export async function generateSingleBatch(count, type, difficulty, text, images, questionStyle, signal, languageChoice, studentLevel, bloomLevel, keywords = [], expertParams = null, isHighQuality = getGeminiMode() === 'HIGH_QUALITY', domain = 'chinese', contextType = '', questionTypePlan = null, previousQuestionNotes = [], budget = createGeminiRequestBudget()) {
    // 根據模式選擇模型與配額
    const modelKey = isHighQuality ? 'HIGH_QUALITY' : 'STANDARD';
    const modelName = CONFIG.MODELS[modelKey];
    const batchQuestionTypePlan = Array.isArray(questionTypePlan) && questionTypePlan.length === count
        ? questionTypePlan : buildQuestionTypePlan(count, type);

    const bloomDistribution = { [bloomLevel]: count };
    const systemPromptText = getAdaptiveSystemInstruction(count, type, difficulty, questionStyle, languageChoice, studentLevel, bloomDistribution, keywords, expertParams, isHighQuality, domain, contextType, batchQuestionTypePlan);

    // [Prompt Inspector] 聽診器：在出題前將完整指令印在控制台
    console.log(`%c[AI API Request] --- ${modelKey} Mode (${modelName}) ---`, "color: #6366f1; font-weight: bold;");
    console.log(systemPromptText);
    console.log("%c-------------------------------------------", "color: #6366f1; font-weight: bold;");

    const taskParts = [{ text: "很好。現在請根據學習內容與指定重點生成題目並給予標題。" }];
    if (previousQuestionNotes.length > 0) {
        taskParts.push({ text: `\n---【本卷已生成題目：考查核心與答案位置均須避開重複】---\n${previousQuestionNotes.map((note, index) => `${index + 1}. ${note}`).join('\n')}\n請測量不同的概念或事實，並讓四選一正解位置與前題分散。` });
    }
    if (text.trim()) taskParts.push({ text: `\n---【參考內容】---\n${text}` });
    images.forEach(img => taskParts.push({ inline_data: { mime_type: img.type, data: img.data } }));

    const genConfig = { "temperature": isHighQuality ? 0.4 : 0.7, "maxOutputTokens": 8192, "responseMimeType": "application/json" };

    const initialPayload = {
        "systemInstruction": { "parts": [{ "text": systemPromptText }] },
        "contents": [{ "role": "user", "parts": taskParts }],
        "generationConfig": genConfig
    };

    let result = await makeGeminiRequest(initialPayload, signal, modelName, budget);
    let parsedResult = parseGeminiResponse(result);
    const initialDiagnostics = responseDiagnostics(result, parsedResult);
    let repaired = false;
    let retried = false;

    while (true) {
        if (parsedResult.error && !parsedResult.validJson) {
            if (repaired || retried || !parsedResult.rawText.trim()) {
                throw createFormatFailureError(initialDiagnostics, responseDiagnostics(result, parsedResult));
            }
            console.warn('[Gemini API] Invalid JSON, attempting syntax repair:', responseDiagnostics(result, parsedResult));
            const repairPayload = {
                systemInstruction: { parts: [{ text: '你是 JSON 語法修復器。只修正給定回應的 JSON 格式，完整保留題目文字、選項、答案與解析；不得新增、刪除或改寫題目內容。只輸出合法 JSON，不要 Markdown 或說明。' }] },
                contents: [{ role: 'user', parts: [{ text: `請修復下列 JSON。解析錯誤：${parsedResult.error?.message || '格式不完整'}\n\n原始回應：\n${parsedResult.rawText}` }] }],
                generationConfig: { ...genConfig, temperature: 0 }
            };
            result = await makeGeminiRequest(repairPayload, signal, modelName, budget, 'correction');
            parsedResult = parseGeminiResponse(result);
            repaired = true;
            continue;
        }

        const issues = parsedResult.error
            ? ['缺少題目陣列']
            : validateQuestionBatch(parsedResult.questions, count, batchQuestionTypePlan, bloomLevel);
        if (!issues.length) {
            return {
                questions: parsedResult.questions,
                suggestedTitle: parsedResult.suggestedTitle,
                meta: { promptVersion: PROMPT_VERSION, modelName: result?._actualModelUsed || modelName, repaired, retried }
            };
        }
        if (retried || repaired) {
            throw createQualityFailureError(issues, initialDiagnostics, responseDiagnostics(result, parsedResult));
        }

        console.warn('[Gemini API] Incomplete question batch, retrying once:', issues);
        const retryParts = [...taskParts, { text: `上一份輸出未符合格式要求：${issues.join('；')}。請重新從參考內容生成完整的 ${count} 題，依指定題型順序與認知層次輸出；不要沿用缺漏或重複的題目。` }];
        result = await makeGeminiRequest({ ...initialPayload, contents: [{ role: 'user', parts: retryParts }] }, signal, modelName, budget, 'correction');
        parsedResult = parseGeminiResponse(result);
        retried = true;
    }
}
