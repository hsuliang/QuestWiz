import { CONFIG } from './config.js';
import { showToast, stopKeyTimer, t, showLoader, updateApiKeyBadge } from './ui.js?v=20261012-question-quality-5';
import { elements } from './dom.js'; 
import { getAdaptiveSystemInstruction, getQuestionUserPrompt, PROMPT_VERSION } from './prompts/index.js?v=20261012-domain-review-1';
import { buildQuestionTypePlan } from './prompts/blocks/question_schema.js?v=20261012-question-quality-5';
import { validateQuestionBatch } from './utils/normalizer.js?v=20261012-question-quality-5';
import { parseGeminiError } from './utils.js'; 

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
const FLASH_ALLOWLIST = [...new Set(Object.values(MODEL_ALLOWLISTS).flat())];
const MODEL_CACHE_MS = 60 * 60 * 1000;
const DAY_MS = 24 * MODEL_CACHE_MS;
const MINUTE_MS = 60 * 1000;
const GEMINI_REQUEST_TIMEOUT_MS = 90 * 1000;
const modelCache = new Map();
const routing = new Map();
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

function getRoute(key) {
    if (!routing.has(key)) routing.set(key, { count: 0, lastAt: 0, cooldownUntil: 0, models: {} });
    return routing.get(key);
}

export function resetGeminiRouting() {
    routing.clear();
    modelCache.clear();
}

function useAllowlistModelFallback(apiKey) {
    const models = [...FLASH_ALLOWLIST];
    modelCache.set(apiKey, { models, expires: Date.now() + MODEL_CACHE_MS });
    return models;
}

function modelId(name) {
    return (name || '').replace(/^models\//, '');
}

function matchesModel(name, base) {
    return name === base || (name.startsWith(base) && /^-\d{3,}$/.test(name.slice(base.length)));
}

function isAllowedModel(name, allowlist = FLASH_ALLOWLIST) {
    return allowlist.some(base => matchesModel(name, base));
}

function modelPriority(name, highQuality) {
    const order = highQuality ? MODEL_ALLOWLISTS.HIGH_QUALITY : MODEL_ALLOWLISTS.STANDARD;
    return order.findIndex(base => matchesModel(name, base));
}

export async function resolveFlashModelsList(apiKey, throwOnError = false) {
    if (!apiKey) return [];
    const cached = modelCache.get(apiKey);
    if (cached && cached.expires > Date.now()) return cached.models;
    try {
        const models = [];
        let pageToken = '';
        do {
            const url = new URL(`${CONFIG.BASE_URL}/models`);
            url.searchParams.set('pageSize', '1000');
            if (pageToken) url.searchParams.set('pageToken', pageToken);
            const response = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });
            if (!response.ok) {
                const error = new Error(`Models API HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }
            const data = await response.json();
            if (!Array.isArray(data.models)) throw new Error('Models API 格式錯誤');
            models.push(...data.models);
            pageToken = data.nextPageToken || '';
        } while (pageToken);
        const available = [...new Set(models.filter(item => item.supportedGenerationMethods?.includes('generateContent'))
            .map(item => modelId(item.name)).filter(isAllowedModel))];
        if (!available.length) return useAllowlistModelFallback(apiKey);
        modelCache.set(apiKey, { models: available, expires: Date.now() + MODEL_CACHE_MS });
        return available;
    } catch (error) {
        if (throwOnError) throw error;
        // 模型清單查詢只作為最佳化；失敗時仍以實際 generateContent 請求判斷金鑰與模型是否可用。
        return useAllowlistModelFallback(apiKey);
    }
}

export async function resolveLatestFlashModel(apiKey, throwOnError = false) {
    const models = await resolveFlashModelsList(apiKey, throwOnError);
    return models.filter(name => isAllowedModel(name, MODEL_ALLOWLISTS.HIGH_QUALITY))
        .sort((a, b) => modelPriority(a, true) - modelPriority(b, true) || b.localeCompare(a, undefined, { numeric: true }))[0] || null;
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

function keyData() {
    try {
        const data = JSON.parse(sessionStorage.getItem('gemini_api_key_data') || 'null');
        if (!data || Date.now() >= data.expires) {
            sessionStorage.removeItem('gemini_api_key_data');
            stopKeyTimer();
            resetGeminiRouting();
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

export function getApiKey() {
    const value = keyData()?.value;
    return Array.isArray(value) ? value[0] : value || null;
}

export function getApiKeyList() {
    const value = keyData()?.value;
    return [...new Set((Array.isArray(value) ? value : [value]).filter(Boolean))];
}

function setApiKeyStatus(apiKey, status) {
    const data = keyData();
    if (!data) return;
    const values = Array.isArray(data.value) ? data.value : [data.value];
    const index = values.indexOf(apiKey);
    if (index < 0) return;
    const statuses = Array.isArray(data.keyStatuses) ? [...data.keyStatuses] : values.map(() => 'unverified');
    statuses[index] = status;
    data.keyStatuses = statuses;
    try {
        sessionStorage.setItem('gemini_api_key_data', JSON.stringify(data));
        updateApiKeyBadge();
    } catch { /* Keep request routing functional if browser storage is unavailable. */ }
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

function quotaCooldown(body) {
    const text = JSON.stringify(body || {});
    if (/per day|daily|RPD|GenerateRequestsPerDay/i.test(text)) return nextPacificMidnight();
    const seconds = Number(text.match(/"retryDelay"\s*:\s*"(\d+)s"/)?.[1]);
    return Date.now() + (seconds > 0 ? seconds * 1000 : 60000);
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

function fallbackKeyFingerprint(apiKey) {
    // This is a storage namespace, not a security primitive; never persist the API key itself.
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < apiKey.length; index++) {
        const code = apiKey.charCodeAt(index);
        first = Math.imul(first ^ code, 0x01000193) >>> 0;
        second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
    }
    return `${first.toString(16)}${second.toString(16)}`;
}

async function getProjectFingerprint(apiKey) {
    try {
        if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
            const digest = await globalThis.crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(apiKey));
            return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        }
    } catch { /* Use a non-secret namespace if Web Crypto is unavailable, e.g. over LAN HTTP. */ }
    return fallbackKeyFingerprint(apiKey);
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

function inspectAndReserveQuota(projectHash, mode, estimatedTokens) {
    return withQuotaLedgerLock(() => {
        const limits = CONFIG.QUOTAS[mode];
        const now = Date.now();
        const ledger = readQuotaLedger();
        const ledgerKey = `${projectHash}:${mode}`;
        let bucket = ledger[ledgerKey];
        const today = pacificDateKey(now);
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
        if (bucket.dailyRequests >= limits.RPD) {
            writeQuotaLedger(ledger);
            return { dailyLimited: true };
        }

        const rpmWait = bucket.samples.length >= limits.RPM
            ? bucket.samples[0].at + MINUTE_MS - now
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
        const spacingMs = Math.ceil((MINUTE_MS / limits.RPM) * 1.15);
        const spacingWait = (bucket.nextRequestAt || 0) - now;
        const waitMs = Math.max(0, rpmWait, tpmWait, spacingWait);
        if (waitMs > 0) {
            writeQuotaLedger(ledger);
            return { waitMs };
        }

        const reservationId = `${now}-${Math.random().toString(36).slice(2)}`;
        bucket.dailyRequests++;
        bucket.samples.push({ id: reservationId, at: now, tokens: estimatedTokens });
        bucket.nextRequestAt = now + spacingMs;
        writeQuotaLedger(ledger);
        return { reservation: { ledgerKey, reservationId } };
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

async function reserveNextCandidate(candidates, mode, payload, signal) {
    const estimatedTokens = Math.ceil(estimateInputTokens(payload) * 1.2);
    let lastBlockedReason = null;
    while (candidates.length) {
        let earliestWait = Infinity;
        let activeCandidates = 0;
        let dailyLimitedCandidates = 0;
        let tokenLimitedCandidates = 0;
        for (const candidate of candidates) {
            const now = Date.now();
            if (candidate.route.cooldownUntil > now || (candidate.route.models[candidate.model] || 0) > now) continue;
            activeCandidates++;
            const result = await inspectAndReserveQuota(candidate.projectHash, mode, estimatedTokens);
            if (result.reservation) return { ...candidate, reservation: result.reservation };
            if (result.dailyLimited) { dailyLimitedCandidates++; lastBlockedReason = 'daily'; continue; }
            if (result.tooLarge) { tokenLimitedCandidates++; lastBlockedReason = 'tpm'; continue; }
            if (result.waitMs > 0) earliestWait = Math.min(earliestWait, result.waitMs);
        }
        if (earliestWait < Infinity) {
            await waitForQuota(earliestWait + Math.floor(Math.random() * 250), signal);
            continue;
        }
        if (activeCandidates > 0 && dailyLimitedCandidates + tokenLimitedCandidates === activeCandidates) {
            return { blocked: tokenLimitedCandidates > 0 ? 'tpm' : 'daily' };
        }
        return null;
    }
    return lastBlockedReason ? { blocked: lastBlockedReason } : null;
}

function localQuotaError(mode, reason) {
    if (mode === 'HIGH_QUALITY') {
        if (reason === 'daily') return new Error(t('model_mode_error_hq_daily'));
        if (reason === 'tpm') return new Error(t('model_mode_error_hq_tpm'));
    }
    if (reason === 'daily') return new Error(t('model_mode_error_standard_daily'));
    if (reason === 'tpm') return new Error(t('model_mode_error_tpm'));
    return null;
}

export async function makeCentralizedRequest(payload, signal, requestedModelName = null, operationLabel = '出題') {
    const keys = getApiKeyList();
    if (!keys.length) throw new Error(t('error_api_missing'));

    const mode = requestedModelName === CONFIG.MODELS.HIGH_QUALITY
        ? 'HIGH_QUALITY'
        : requestedModelName === CONFIG.MODELS.STANDARD
            ? 'STANDARD'
            : getGeminiMode();
    const highQuality = mode === 'HIGH_QUALITY';
    const modeAllowlist = MODEL_ALLOWLISTS[mode];
    const orderedKeys = keys.map((key, index) => ({ key, index, route: getRoute(key) }))
        .filter(item => item.route.cooldownUntil <= Date.now())
        .sort((a, b) => a.route.count - b.route.count || a.route.lastAt - b.route.lastAt || a.index - b.index);
    if (!orderedKeys.length) {
        throw new Error(t(highQuality ? 'model_mode_error_all_projects_hq' : 'model_mode_error_all_projects_standard'));
    }

    let quotaLimited = false;
    let modelUnavailable = false;
    let transientFailureSeen = false;
    let invalidKeySeen = false;
    for (const item of orderedKeys) {
        try {
            item.available = await resolveFlashModelsList(item.key, false);
        } catch (error) {
            if ([401, 403].includes(error.status)) {
                item.route.cooldownUntil = Date.now() + DAY_MS;
                modelUnavailable = true;
                continue;
            }
            if (error.status === 429) {
                item.route.cooldownUntil = quotaCooldown({ error: { message: error.message } });
                quotaLimited = true;
                continue;
            }
            if (error.status >= 500) {
                item.route.cooldownUntil = Date.now() + 60000;
                modelUnavailable = true;
                continue;
            }
            throw error;
        }
        if (!item.available.some(name => isAllowedModel(name, modeAllowlist))) modelUnavailable = true;
        item.projectHash = await getProjectFingerprint(item.key);
    }

    const models = [...new Set(orderedKeys.flatMap(item => item.available || []))]
        .filter(name => isAllowedModel(name, modeAllowlist))
        .sort((a, b) => modelPriority(a, highQuality) - modelPriority(b, highQuality) || b.localeCompare(a, undefined, { numeric: true }));
    const candidates = models.flatMap(model => orderedKeys
        .filter(item => (item.available || []).includes(model) && item.projectHash)
        .map(item => ({ ...item, model })));
    const primaryModelPriority = models.length ? modelPriority(models[0], highQuality) : -1;
    const attemptedPairs = new Set();
    const transientFailuresByPriority = new Map();
    const exhaustedTransientPriorities = new Set();
    let transientFailureCount = 0;

    async function advanceAfterTransientFailure(model, route, projectHash) {
        route.models[model] = Date.now() + 60000;
        const priority = modelPriority(model, highQuality);
        const failuresAtPriority = (transientFailuresByPriority.get(priority) || 0) + 1;
        transientFailuresByPriority.set(priority, failuresAtPriority);

        const canRetryPrimaryAcrossProject = priority === primaryModelPriority
            && failuresAtPriority === 1
            && candidates.some(candidate => modelPriority(candidate.model, highQuality) === priority
                && candidate.projectHash !== projectHash
                && !attemptedPairs.has(`${candidate.projectHash}:${candidate.model}`)
                && candidate.route.cooldownUntil <= Date.now()
                && (candidate.route.models[candidate.model] || 0) <= Date.now());
        if (!canRetryPrimaryAcrossProject) exhaustedTransientPriorities.add(priority);

        const hasNextCandidate = candidates.some(candidate =>
            !attemptedPairs.has(`${candidate.projectHash}:${candidate.model}`)
            && !exhaustedTransientPriorities.has(modelPriority(candidate.model, highQuality))
            && candidate.route.cooldownUntil <= Date.now()
            && (candidate.route.models[candidate.model] || 0) <= Date.now()
        );
        if (!hasNextCandidate) return false;

        const delayMs = Math.min(1000 * (2 ** transientFailureCount), 8000) + Math.floor(Math.random() * 250);
        transientFailureCount++;
        const fallbackType = canRetryPrimaryAcrossProject ? 'one cross-project retry of the current model' : 'the next model in this mode';
        console.warn(`[Gemini API] Backing off ${delayMs} ms before ${fallbackType}.`);
        await waitForQuota(delayMs, signal);
        return true;
    }

    while (true) {
        const pending = candidates.filter(candidate =>
            !attemptedPairs.has(`${candidate.projectHash}:${candidate.model}`)
            && !exhaustedTransientPriorities.has(modelPriority(candidate.model, highQuality))
        );
        const selected = await reserveNextCandidate(pending, mode, payload, signal);
        if (selected?.blocked) throw localQuotaError(mode, selected.blocked);
        if (!selected) break;

        const { key, route, model, projectHash, reservation } = selected;
        attemptedPairs.add(`${projectHash}:${model}`);
        route.count++;
        route.lastAt = Date.now();
        showLoader(`AI 正在${operationLabel}中...\n(使用模型： ${getFriendlyModelName(model)})`);

        const currentPayload = structuredClone(payload);
        if (!highQuality && currentPayload.generationConfig) {
            delete currentPayload.generationConfig.thinking;
            delete currentPayload.generationConfig.include_thoughts;
        }

        let response;
        let responseText = '';
        const requestStartedAt = Date.now();
        const requestController = new AbortController();
        const abortForTask = () => requestController.abort(signal?.reason);
        if (signal?.aborted) abortForTask();
        else signal?.addEventListener('abort', abortForTask, { once: true });
        const timeoutId = setTimeout(() => {
            requestController.abort(new DOMException('Gemini 回應逾時', 'TimeoutError'));
        }, GEMINI_REQUEST_TIMEOUT_MS);
        console.info(`[Gemini API] Request started: ${model}`);
        try {
            // Each provider attempt gets a separate quota reservation; don't burst-retry one project.
            response = await fetch(`${CONFIG.BASE_URL}/models/${model}:generateContent`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify(currentPayload), signal: requestController.signal
            });
            responseText = await response.text();
            console.info(`[Gemini API] HTTP ${response.status}: ${model} (${Date.now() - requestStartedAt} ms)`);
        } catch (error) {
            if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
            transientFailureSeen = true;
            const elapsedMs = Date.now() - requestStartedAt;
            if (requestController.signal.aborted) {
                console.error(`[Gemini API] Timed out: ${model} (${elapsedMs} ms)`);
            } else {
                console.error(`[Gemini API] Network request failed: ${model} (${elapsedMs} ms)`, error);
            }
            if (await advanceAfterTransientFailure(model, route, projectHash)) continue;
            break;
        } finally {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', abortForTask);
        }
        let responseData = {};
        try { responseData = JSON.parse(responseText) || {}; } catch { /* Report malformed successful responses through the normal parser. */ }

        if (response.ok) {
            const result = responseData;
            await updateQuotaReservation(reservation, result?.usageMetadata?.promptTokenCount);
            setApiKeyStatus(key, 'used');
            if (invalidKeySeen) showToast(t('api_key_invalid_skipped'), 'warning');
            if (result) {
                result._actualModelUsed = model;
                result._generationMode = mode;
            }
            return result;
        }

        const body = responseData;
        const providerError = `${body.error?.status || ''} ${body.error?.message || ''}`;
        const invalidApiKey = response.status === 401
            || (response.status === 400 && /API_KEY_INVALID|API key (?:is )?(?:not valid|invalid)|invalid API key/i.test(providerError));
        if (invalidApiKey) {
            route.cooldownUntil = Date.now() + DAY_MS;
            setApiKeyStatus(key, 'invalid');
            invalidKeySeen = true;
            modelUnavailable = true;
            continue;
        }
        if (response.status === 403) {
            route.cooldownUntil = Date.now() + DAY_MS;
            modelUnavailable = true;
            continue;
        }
        if (response.status === 404) {
            route.models[model] = Date.now() + DAY_MS;
            modelUnavailable = true;
            continue;
        }
        if (response.status === 429) {
            const until = quotaCooldown(body);
            if (/PerModel|per.model|model quota/i.test(JSON.stringify(body))) route.models[model] = until;
            else route.cooldownUntil = until;
            quotaLimited = true;
            continue;
        }
        if ([408, 500, 502, 503, 504].includes(response.status)) {
            transientFailureSeen = true;
            if (await advanceAfterTransientFailure(model, route, projectHash)) continue;
            break;
        }
        throw new Error(`Gemini 呼叫失敗 (HTTP ${response.status})：${body.error?.message || '請稍後再試'}`);
    }

    if (highQuality && quotaLimited) throw new Error(t('model_mode_error_hq_limited'));
    if (quotaLimited) throw new Error('目前 Gemini 模型額度或速率已達限制，請稍後重新操作。');
    if (transientFailureSeen) {
        const nextStep = highQuality ? '請稍後重試，或手動切換標準模式。' : '請稍後重試。';
        throw new Error(`Gemini ${highQuality ? '高品質' : ''}模型暫時無法回應，已依目前模式嘗試可用備援。${nextStep}`);
    }
    if (invalidKeySeen) throw new Error('有 API 金鑰未通過實際生成驗證，請在金鑰設定中更正或移除。系統已嘗試其他可用金鑰。');
    if (highQuality && modelUnavailable) throw new Error(t('model_mode_error_hq_unavailable'));
    if (modelUnavailable) throw new Error('目前設定的專案沒有可用的此模式模型，請確認 API Key 與模型權限。');
    throw new Error('目前沒有可用的 Gemini Key 與 Flash 模型。');
}

// 為了內部向後相容
async function makeGeminiRequest(payload, signal, modelName = null) {
    return await makeCentralizedRequest(payload, signal, modelName);
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

export async function generateSingleBatch(count, type, difficulty, text, images, questionStyle, signal, languageChoice, studentLevel, bloomLevel, keywords = [], expertParams = null, isHighQuality = getGeminiMode() === 'HIGH_QUALITY', domain = 'chinese', contextType = '', questionTypePlan = null, previousQuestionNotes = []) {
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

    let result = await makeGeminiRequest(initialPayload, signal, modelName);
    let parsedResult = parseGeminiResponse(result);
    const initialDiagnostics = responseDiagnostics(result, parsedResult);
    let repaired = false;
    let retried = false;

    while (true) {
        if (parsedResult.error && !parsedResult.validJson) {
            if (repaired || !parsedResult.rawText.trim()) {
                throw createFormatFailureError(initialDiagnostics, responseDiagnostics(result, parsedResult));
            }
            console.warn('[Gemini API] Invalid JSON, attempting syntax repair:', responseDiagnostics(result, parsedResult));
            const repairPayload = {
                systemInstruction: { parts: [{ text: '你是 JSON 語法修復器。只修正給定回應的 JSON 格式，完整保留題目文字、選項、答案與解析；不得新增、刪除或改寫題目內容。只輸出合法 JSON，不要 Markdown 或說明。' }] },
                contents: [{ role: 'user', parts: [{ text: `請修復下列 JSON。解析錯誤：${parsedResult.error?.message || '格式不完整'}\n\n原始回應：\n${parsedResult.rawText}` }] }],
                generationConfig: { ...genConfig, temperature: 0 }
            };
            result = await makeGeminiRequest(repairPayload, signal, modelName);
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
        if (retried) {
            throw createQualityFailureError(issues, initialDiagnostics, responseDiagnostics(result, parsedResult));
        }

        console.warn('[Gemini API] Incomplete question batch, retrying once:', issues);
        const retryParts = [...taskParts, { text: `上一份輸出未符合格式要求：${issues.join('；')}。請重新從參考內容生成完整的 ${count} 題，依指定題型順序與認知層次輸出；不要沿用缺漏或重複的題目。` }];
        result = await makeGeminiRequest({ ...initialPayload, contents: [{ role: 'user', parts: retryParts }] }, signal, modelName);
        parsedResult = parseGeminiResponse(result);
        retried = true;
    }
}
