(function (global) {
    "use strict";

    const config = global.DEBORAH_REPORTING_CONFIG || {};
    const SCHEMA_VERSION = 1;
    const KEY_PREFIX = "deborah.analytics.v1.";
    const now = () => Date.now();
    let lesson = null;
    let record = null;
    let heartbeatTimer = null;
    let lastTickAt = 0;
    let lastMeaningfulAt = 0;
    let lastInteractionCountedAt = 0;
    let lastScrollCountedAt = 0;
    let focusLossOpen = null;
    let started = false;
    let syncAdapter = null;
    let syncInFlight = false;
    let syncQueued = false;

    function safeParse(value) {
        try { return value ? JSON.parse(value) : null; } catch (error) { return null; }
    }

    function analyticsKey(lessonId) { return KEY_PREFIX + lessonId; }
    function iso(timestamp) { return new Date(timestamp).toISOString(); }
    function unique(values) { return Array.from(new Set((values || []).filter(Boolean))); }
    function normaliseText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
    function wordCount(value) { const text = normaliseText(value); return text ? text.split(" ").length : 0; }

    function blankRecord(meta, timestamp) {
        return {
            schemaVersion: SCHEMA_VERSION,
            studentUid: null,
            studentCode: null,
            teacherUid: null,
            classId: null,
            lessonId: meta.lessonId,
            week: Number(meta.week) || null,
            lesson: Number(meta.lesson) || null,
            lessonTitle: meta.title || "",
            firstStartedAt: iso(timestamp),
            currentSessionStartedAt: iso(timestamp),
            lastSavedAt: iso(timestamp),
            completedAt: null,
            sessionCount: 0,
            totalOpenTimeMs: 0,
            activeTimeMs: 0,
            idleTimeMs: 0,
            hiddenTimeMs: 0,
            focusLossCount: 0,
            returnAfterFocusLossCount: 0,
            longestFocusLossMs: 0,
            focusLossIntervals: [],
            meaningfulInteractionCount: 0,
            revisionCount: 0,
            activitiesCompleted: [],
            activityResults: {},
            knowledgeChecks: {},
            latestKnowledgeScore: null,
            highestKnowledgeScore: null,
            knowledgeAttemptCount: 0,
            writtenResponses: {},
            reportFieldStatistics: { registeredFieldCount: 0, meaningfulFieldCount: 0, totalWords: 0, totalCharacters: 0, vocabularyObserved: [] },
            unitProgress: { lessonProgress: 0, completed: false, startedLessonCount: 0, completedLessonCount: 0, totalLessons: 16 },
            migration: { legacyLessonRecord: false, migratedAt: null },
            remoteSync: { pending: true, lastAttemptAt: null, lastSuccessAt: null, lastErrorCode: null },
            dataLimitations: {
                focusLoss: "Focus loss does not establish why the lesson page lost focus.",
                activeTime: "Active learning time is a heartbeat-based estimate.",
                hiddenTime: "Hidden or unfocused time is not proof of misconduct.",
                assistance: "Interaction data cannot identify teacher or peer assistance.",
                review: "Automated indicators require teacher review."
            }
        };
    }

    function migrateLegacy(target, timestamp) {
        if (target.migration && target.migration.legacyLessonRecord) return target;
        const legacy = safeParse(global.localStorage.getItem(lesson.lessonId));
        if (legacy && typeof legacy === "object") {
            const legacySeconds = Math.max(0, Number(legacy.seconds) || 0);
            target.totalOpenTimeMs = Math.max(target.totalOpenTimeMs || 0, legacySeconds * 1000);
            target.focusLossCount = Math.max(target.focusLossCount || 0, Math.max(0, Number(legacy.tabSwitches) || 0));
            target.activitiesCompleted = unique([...(target.activitiesCompleted || []), ...(Array.isArray(legacy.activities) ? legacy.activities : [])]);
            target.unitProgress.lessonProgress = Math.max(Number(target.unitProgress.lessonProgress) || 0, Number(legacy.progress) || 0);
            target.unitProgress.completed = Boolean(target.unitProgress.completed || legacy.completed);
            if (legacy.started && Number.isFinite(Number(legacy.started))) target.firstStartedAt = iso(Number(legacy.started));
            if (legacy.completed && !target.completedAt) target.completedAt = legacy.finished || iso(timestamp);
        }
        target.migration = { legacyLessonRecord: true, migratedAt: iso(timestamp) };
        return target;
    }

    function loadOrCreate(meta, timestamp) {
        const saved = safeParse(global.localStorage.getItem(analyticsKey(meta.lessonId)));
        const loaded = saved && saved.schemaVersion === SCHEMA_VERSION ? saved : blankRecord(meta, timestamp);
        loaded.lessonId = meta.lessonId;
        loaded.week = Number(meta.week) || loaded.week || null;
        loaded.lesson = Number(meta.lesson) || loaded.lesson || null;
        loaded.lessonTitle = meta.title || loaded.lessonTitle || "";
        loaded.activitiesCompleted = unique(loaded.activitiesCompleted);
        loaded.focusLossIntervals = Array.isArray(loaded.focusLossIntervals) ? loaded.focusLossIntervals : [];
        loaded.writtenResponses = loaded.writtenResponses || {};
        loaded.activityResults = loaded.activityResults || {};
        loaded.knowledgeChecks = loaded.knowledgeChecks || {};
        loaded.unitProgress = loaded.unitProgress || { lessonProgress: 0, completed: false };
        loaded.remoteSync = loaded.remoteSync || { pending: true, lastAttemptAt: null, lastSuccessAt: null, lastErrorCode: null };
        return migrateLegacy(loaded, timestamp);
    }

    function pageIsHidden() {
        return Boolean(global.document.hidden || (typeof global.document.hasFocus === "function" && !global.document.hasFocus()));
    }

    function accumulate(timestamp) {
        if (!record || !lastTickAt) { lastTickAt = timestamp; return; }
        const elapsed = Math.max(0, timestamp - lastTickAt);
        if (!elapsed) return;
        record.totalOpenTimeMs += elapsed;
        if (pageIsHidden()) {
            record.hiddenTimeMs += elapsed;
        } else {
            const idleBoundary = lastMeaningfulAt + (config.idleThresholdMs || 90000);
            const activePortion = Math.max(0, Math.min(timestamp, idleBoundary) - lastTickAt);
            record.activeTimeMs += Math.min(elapsed, activePortion);
            record.idleTimeMs += elapsed - Math.min(elapsed, activePortion);
        }
        lastTickAt = timestamp;
    }

    function approvedFieldIds() {
        const registry = config.reportFields || {};
        return unique(registry[lesson.lessonId] || []);
    }

    function observedVocabulary(text) {
        const lower = text.toLocaleLowerCase();
        return (config.vocabulary || []).filter(term => new RegExp("\\b" + term.toLocaleLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(lower));
    }

    function isSubstantialRevision(previous, current) {
        const before = normaliseText(previous);
        const after = normaliseText(current);
        if (!before || before === after) return false;
        if (Math.abs(before.length - after.length) >= (config.substantialRevisionCharacters || 20)) return true;
        const beforeWords = new Set(before.toLocaleLowerCase().split(" "));
        const afterWords = new Set(after.toLocaleLowerCase().split(" "));
        let changed = 0;
        beforeWords.forEach(word => { if (!afterWords.has(word)) changed++; });
        afterWords.forEach(word => { if (!beforeWords.has(word)) changed++; });
        return changed >= 4;
    }

    function collectWrittenResponses(timestamp) {
        if (!record || !lesson) return;
        approvedFieldIds().forEach(fieldId => {
            const node = global.document.getElementById(fieldId);
            if (!node || !("value" in node)) return;
            const text = String(node.value || "");
            const meaningful = normaliseText(text).length >= (config.minimumMeaningfulCharacters || 20);
            const previous = record.writtenResponses[fieldId];
            if (!meaningful) {
                if (previous) previous.currentText = text;
                return;
            }
            if (!previous) {
                record.writtenResponses[fieldId] = {
                    fieldId,
                    currentText: text,
                    wordCount: wordCount(text),
                    characterCount: text.length,
                    firstMeaningfulSaveAt: iso(timestamp),
                    latestRevisionAt: null,
                    revisionCount: 0,
                    vocabularyObserved: observedVocabulary(text)
                };
                return;
            }
            if (isSubstantialRevision(previous.currentText, text)) {
                previous.revisionCount = (previous.revisionCount || 0) + 1;
                previous.latestRevisionAt = iso(timestamp);
                record.revisionCount++;
            }
            previous.currentText = text;
            previous.wordCount = wordCount(text);
            previous.characterCount = text.length;
            previous.vocabularyObserved = observedVocabulary(text);
        });
        const responses = Object.values(record.writtenResponses);
        record.reportFieldStatistics = {
            registeredFieldCount: approvedFieldIds().length,
            meaningfulFieldCount: responses.filter(item => normaliseText(item.currentText).length >= (config.minimumMeaningfulCharacters || 20)).length,
            totalWords: responses.reduce((sum, item) => sum + (item.wordCount || 0), 0),
            totalCharacters: responses.reduce((sum, item) => sum + (item.characterCount || 0), 0),
            vocabularyObserved: unique(responses.flatMap(item => item.vocabularyObserved || [])).sort()
        };
    }

    function persist(options) {
        if (!record || !lesson) return;
        const timestamp = now();
        accumulate(timestamp);
        collectWrittenResponses(timestamp);
        const configuredLessons = Object.keys(config.reportFields || {});
        const unitRecords = configuredLessons.map(lessonId => lessonId === lesson.lessonId ? record : safeParse(global.localStorage.getItem(analyticsKey(lessonId)))).filter(Boolean);
        record.unitProgress.startedLessonCount = unitRecords.length;
        record.unitProgress.completedLessonCount = unitRecords.filter(item => item.unitProgress && item.unitProgress.completed).length;
        record.unitProgress.totalLessons = configuredLessons.length || 16;
        record.lastSavedAt = iso(timestamp);
        record.remoteSync.pending = true;
        global.localStorage.setItem(analyticsKey(lesson.lessonId), JSON.stringify(record));
        if (!options || options.sync !== false) requestSync();
    }

    function requestSync() {
        if (!syncAdapter || !record || syncInFlight) { syncQueued = Boolean(syncInFlight); return; }
        syncInFlight = true;
        record.remoteSync.lastAttemptAt = iso(now());
        Promise.resolve(syncAdapter(JSON.parse(JSON.stringify(record)))).then(result => {
            if (result && result.identity) setIdentity(result.identity);
            record.remoteSync.pending = !(result && result.synced);
            record.remoteSync.lastSuccessAt = result && result.synced ? iso(now()) : record.remoteSync.lastSuccessAt;
            record.remoteSync.lastErrorCode = result && result.errorCode ? result.errorCode : null;
            global.localStorage.setItem(analyticsKey(lesson.lessonId), JSON.stringify(record));
        }).catch(error => {
            record.remoteSync.pending = true;
            record.remoteSync.lastErrorCode = error && error.code ? String(error.code) : "sync-failed";
            global.localStorage.setItem(analyticsKey(lesson.lessonId), JSON.stringify(record));
        }).finally(() => {
            syncInFlight = false;
            if (syncQueued) { syncQueued = false; requestSync(); }
        });
    }

    function setIdentity(identity) {
        if (!record || !identity) return;
        record.studentUid = identity.studentUid || record.studentUid || null;
        record.studentCode = identity.studentCode || record.studentCode || null;
        record.teacherUid = identity.teacherUid || null;
        record.classId = identity.classId || null;
    }

    function beginFocusLoss(source, timestamp) {
        accumulate(timestamp);
        if (focusLossOpen) return;
        focusLossOpen = { startTime: timestamp, source: source || "browser-focus" };
        record.focusLossCount++;
        persist();
    }

    function endFocusLoss(timestamp, returned) {
        accumulate(timestamp);
        if (!focusLossOpen) return;
        const duration = Math.max(0, timestamp - focusLossOpen.startTime);
        record.longestFocusLossMs = Math.max(record.longestFocusLossMs || 0, duration);
        if (returned) record.returnAfterFocusLossCount++;
        record.focusLossIntervals.push({
            startedAt: iso(focusLossOpen.startTime),
            endedAt: iso(timestamp),
            durationMs: duration,
            returned: Boolean(returned),
            description: "The lesson page lost focus."
        });
        if (record.focusLossIntervals.length > 50) record.focusLossIntervals = record.focusLossIntervals.slice(-50);
        focusLossOpen = null;
        if (returned) lastMeaningfulAt = timestamp;
        persist();
    }

    function noteMeaningfulInteraction(kind, timestamp) {
        if (!record || pageIsHidden()) return;
        const throttle = kind === "scroll" ? (config.scrollThrottleMs || 10000) : (config.interactionThrottleMs || 1500);
        const last = kind === "scroll" ? lastScrollCountedAt : lastInteractionCountedAt;
        lastMeaningfulAt = timestamp;
        if (timestamp - last < throttle) return;
        record.meaningfulInteractionCount++;
        if (kind === "scroll") lastScrollCountedAt = timestamp;
        else lastInteractionCountedAt = timestamp;
    }

    function onInput(event) {
        if (event.isTrusted === false) return;
        noteMeaningfulInteraction(event.type, now());
    }

    function onClick(event) {
        if (event.isTrusted === false) return;
        if (event.target && event.target.closest && event.target.closest("button, summary, a, [role='button']")) noteMeaningfulInteraction("control", now());
    }

    function start(meta) {
        if (started || !meta || !meta.lessonId) return;
        started = true;
        lesson = { lessonId: meta.lessonId, week: meta.week, lesson: meta.lesson, title: meta.title || "" };
        const timestamp = now();
        record = loadOrCreate(lesson, timestamp);
        record.sessionCount = (record.sessionCount || 0) + 1;
        record.currentSessionStartedAt = iso(timestamp);
        lastTickAt = timestamp;
        lastMeaningfulAt = timestamp;
        global.document.addEventListener("input", onInput, true);
        global.document.addEventListener("change", onInput, true);
        global.document.addEventListener("submit", onInput, true);
        global.document.addEventListener("click", onClick, true);
        global.addEventListener("scroll", () => noteMeaningfulInteraction("scroll", now()), { passive: true });
        global.document.addEventListener("visibilitychange", () => {
            const timestampNow = now();
            if (global.document.hidden) beginFocusLoss("visibility", timestampNow);
            else if (typeof global.document.hasFocus !== "function" || global.document.hasFocus()) endFocusLoss(timestampNow, true);
        });
        global.addEventListener("blur", () => beginFocusLoss("blur", now()));
        global.addEventListener("focus", () => { if (!global.document.hidden) endFocusLoss(now(), true); });
        global.addEventListener("pagehide", () => { if (focusLossOpen) endFocusLoss(now(), false); persist({ sync: false }); });
        global.addEventListener("beforeunload", () => persist({ sync: false }));
        heartbeatTimer = global.setInterval(() => persist(), config.heartbeatMs || 5000);
        persist();
        import("./analytics-sync.js").then(module => module.createAnalyticsSyncAdapter()).then(adapter => {
            setSyncAdapter(adapter);
            requestSync();
        }).catch(() => { record.remoteSync.pending = true; });
    }

    function recordActivityCompletion(activityId) {
        if (!record || !activityId || record.activitiesCompleted.includes(activityId)) return false;
        record.activitiesCompleted.push(activityId);
        record.activityResults[activityId] = Object.assign({}, record.activityResults[activityId], { completedAt: iso(now()) });
        noteMeaningfulInteraction("activity", now());
        persist();
        return true;
    }

    function recordActivityResult(activityId, result) {
        if (!record || !activityId || !result || typeof result !== "object") return;
        const safeResult = {};
        ["score", "maxScore", "numberCorrect", "selectedConclusion", "completedStageCount"].forEach(key => {
            if (Object.prototype.hasOwnProperty.call(result, key)) safeResult[key] = result[key];
        });
        record.activityResults[activityId] = Object.assign({}, record.activityResults[activityId], safeResult, { recordedAt: iso(now()) });
        persist();
    }

    function recordKnowledgeCheck(input) {
        if (!record || !input) return false;
        const activityId = String(input.activityId || "knowledge-check");
        const score = Math.max(0, Number(input.score) || 0);
        const maxScore = Math.max(1, Number(input.maxScore) || 1);
        const normalisedScore = Math.min(1, score / maxScore);
        const check = record.knowledgeChecks[activityId] || { attempts: [], latest: null, highest: null, improvement: 0 };
        const attemptNumber = Math.max(1, Number(input.attemptNumber) || check.attempts.length + 1);
        const token = activityId + ":" + attemptNumber + ":" + score + ":" + maxScore;
        if (check.attempts.some(attempt => attempt.dedupeKey === token)) return false;
        const previousAttempt = check.attempts[check.attempts.length - 1];
        if (previousAttempt && previousAttempt.score === score && previousAttempt.maxScore === maxScore
            && now() - Date.parse(previousAttempt.recordedAt) < 1000) return false;
        const attempt = { dedupeKey: token, attemptNumber, score, maxScore, normalisedScore, recordedAt: iso(now()) };
        check.attempts.push(attempt);
        check.latest = attempt;
        if (!check.highest || normalisedScore > check.highest.normalisedScore) check.highest = attempt;
        check.improvement = check.attempts.length > 1 ? normalisedScore - check.attempts[0].normalisedScore : 0;
        record.knowledgeChecks[activityId] = check;
        record.latestKnowledgeScore = { score, maxScore, normalisedScore };
        const allHighest = Object.values(record.knowledgeChecks).map(item => item.highest).filter(Boolean);
        const highest = allHighest.sort((a, b) => b.normalisedScore - a.normalisedScore)[0];
        record.highestKnowledgeScore = highest ? { score: highest.score, maxScore: highest.maxScore, normalisedScore: highest.normalisedScore } : null;
        record.knowledgeAttemptCount = Object.values(record.knowledgeChecks).reduce((sum, item) => sum + item.attempts.length, 0);
        noteMeaningfulInteraction("knowledge", now());
        persist();
        return true;
    }

    function updateProgress(progress, completed) {
        if (!record) return;
        record.unitProgress.lessonProgress = Math.max(0, Math.min(100, Number(progress) || 0));
        record.unitProgress.completed = Boolean(completed || record.unitProgress.lessonProgress >= 100);
        if (record.unitProgress.completed && !record.completedAt) record.completedAt = iso(now());
    }

    function setSyncAdapter(adapter) { syncAdapter = typeof adapter === "function" ? adapter : null; }
    function getRecord() { return record ? JSON.parse(JSON.stringify(record)) : null; }
    function flush() { persist(); }

    global.DeborahAnalytics = {
        start,
        flush,
        getRecord,
        setIdentity,
        setSyncAdapter,
        recordActivityCompletion,
        recordActivityResult,
        recordKnowledgeCheck,
        updateProgress,
        noteMeaningfulInteraction: kind => noteMeaningfulInteraction(kind || "manual", now()),
        storageKey: analyticsKey,
        __test: { accumulate, beginFocusLoss, endFocusLoss, collectWrittenResponses, isSubstantialRevision }
    };
})(window);
