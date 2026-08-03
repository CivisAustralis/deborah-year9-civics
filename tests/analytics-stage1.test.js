const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const reportingSource = fs.readFileSync("js/reporting-config.js", "utf8");
const analyticsSource = fs.readFileSync("js/analytics-common.js", "utf8");

class MemoryStorage {
    constructor(seed = {}) { this.values = { ...seed }; }
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; }
    setItem(key, value) { this.values[key] = String(value); }
    removeItem(key) { delete this.values[key]; }
}

function createEnvironment(storage, initialTime = 100000) {
    let clock = initialTime;
    const documentListeners = {};
    const windowListeners = {};
    const fields = {
        reflection: { value: "A meaningful reflection about democracy and accountability." },
        exitTicket: { value: "" }
    };
    const document = {
        hidden: false,
        focused: true,
        hasFocus() { return this.focused; },
        getElementById(id) { return fields[id] || null; },
        addEventListener(type, handler) { (documentListeners[type] ||= []).push(handler); }
    };
    class FakeDate extends Date {
        constructor(value) { super(value === undefined ? clock : value); }
        static now() { return clock; }
    }
    const window = {
        document,
        localStorage: storage,
        Date: FakeDate,
        Promise,
        JSON,
        Math,
        Set,
        Object,
        Array,
        String,
        Number,
        Boolean,
        RegExp,
        Intl,
        console,
        setInterval() { return 1; },
        clearInterval() {},
        addEventListener(type, handler) { (windowListeners[type] ||= []).push(handler); }
    };
    window.window = window;
    const context = vm.createContext(window);
    new vm.Script(reportingSource, { filename: "reporting-config.js" }).runInContext(context);
    new vm.Script(analyticsSource, {
        filename: "analytics-common.js",
        importModuleDynamically: async () => { throw new Error("network disabled in synthetic test"); }
    }).runInContext(context);
    return {
        api: window.DeborahAnalytics,
        document,
        fields,
        advance(ms) { clock += ms; return clock; },
        time() { return clock; },
        fireDocument(type, event = {}) { (documentListeners[type] || []).forEach(handler => handler(event)); },
        fireWindow(type, event = {}) { (windowListeners[type] || []).forEach(handler => handler(event)); }
    };
}

async function settle() {
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
}

(async function run() {
    const legacy = {
        started: 50000,
        seconds: 10,
        tabSwitches: 2,
        activities: ["legacy-activity"],
        progress: 20,
        completed: false
    };
    const storage = new MemoryStorage({ week2lesson1: JSON.stringify(legacy) });
    const env = createEnvironment(storage);
    env.api.start({ lessonId: "week2lesson1", week: 2, lesson: 1, title: "Synthetic Lesson" });

    let record = env.api.getRecord();
    assert.equal(record.schemaVersion, 1, "new session uses schema v1");
    assert.equal(record.sessionCount, 1, "new page load increments one session");
    assert.equal(record.totalOpenTimeMs, 10000, "legacy seconds migrate once");
    assert.equal(record.focusLossCount, 2, "legacy tab switches migrate once");
    assert.deepEqual(record.activitiesCompleted, ["legacy-activity"], "legacy activities migrate");
    assert.equal(record.unitProgress.totalLessons, 16, "unit progress knows the complete lesson count");
    assert.equal(record.unitProgress.startedLessonCount, 1, "unit progress detects the started lesson");

    env.advance(5000);
    env.api.__test.accumulate(env.time());
    record = env.api.getRecord();
    assert.equal(record.activeTimeMs, 5000, "visible focused time is active");

    env.advance(90000);
    env.api.__test.accumulate(env.time());
    env.advance(5000);
    env.api.__test.accumulate(env.time());
    record = env.api.getRecord();
    assert.equal(record.activeTimeMs, 90000, "time before threshold remains active");
    assert.equal(record.idleTimeMs, 10000, "visible time after threshold is idle");

    env.document.hidden = true;
    env.document.focused = false;
    env.fireDocument("visibilitychange");
    env.fireWindow("blur");
    assert.equal(env.api.getRecord().focusLossCount, 3, "visibility and blur are deduplicated");
    env.advance(20000);
    env.api.__test.accumulate(env.time());
    env.document.hidden = false;
    env.document.focused = true;
    env.fireWindow("focus");
    record = env.api.getRecord();
    assert.equal(record.hiddenTimeMs, 20000, "unfocused interval is counted only as hidden");
    assert.equal(record.returnAfterFocusLossCount, 1, "return is recorded");
    assert.equal(record.longestFocusLossMs, 20000, "long interruption is retained");

    for (let index = 0; index < 3; index++) {
        env.document.focused = false;
        env.fireWindow("blur");
        env.advance(1000);
        env.document.focused = true;
        env.fireWindow("focus");
    }
    record = env.api.getRecord();
    assert.equal(record.focusLossCount, 6, "separate short interruptions are counted");
    assert.equal(record.returnAfterFocusLossCount, 4, "each genuine return is counted");

    assert.equal(env.api.recordActivityCompletion("analysis"), true, "first activity completion records");
    assert.equal(env.api.recordActivityCompletion("analysis"), false, "activity completion is idempotent");
    assert.equal(env.api.getRecord().activitiesCompleted.filter(value => value === "analysis").length, 1);

    assert.equal(env.api.recordKnowledgeCheck({ activityId: "knowledge-check", score: 3, maxScore: 6, attemptNumber: 1 }), true);
    assert.equal(env.api.recordKnowledgeCheck({ activityId: "knowledge-check", score: 3, maxScore: 6, attemptNumber: 1 }), false, "duplicate attempt event ignored");
    assert.equal(env.api.recordKnowledgeCheck({ activityId: "knowledge-check", score: 3, maxScore: 6, attemptNumber: 2 }), false, "rapid duplicate handler with a new counter is ignored");
    assert.equal(env.api.recordKnowledgeCheck({ activityId: "knowledge-check", score: 5, maxScore: 6, attemptNumber: 2 }), true);
    record = env.api.getRecord();
    assert.equal(record.knowledgeAttemptCount, 2);
    assert.equal(record.latestKnowledgeScore.score, 5);
    assert.equal(record.highestKnowledgeScore.score, 5);
    assert(record.knowledgeChecks["knowledge-check"].improvement > 0, "improvement retained");

    env.api.flush();
    assert.equal(env.api.getRecord().writtenResponses.reflection.revisionCount, 0, "first response is not a revision");
    env.fields.reflection.value = "A substantially revised reflection applying democracy, Parliament, rule of law, evidence and accountability across the unit.";
    env.advance(5000);
    env.api.flush();
    record = env.api.getRecord();
    assert.equal(record.writtenResponses.reflection.revisionCount, 1, "substantial response revision counted once");
    assert(record.reportFieldStatistics.vocabularyObserved.includes("democracy"), "subject vocabulary observed");

    env.api.setSyncAdapter(async () => { throw Object.assign(new Error("offline"), { code: "offline" }); });
    env.api.flush();
    await settle();
    assert.equal(env.api.getRecord().remoteSync.pending, true, "offline save remains pending locally");

    env.api.setSyncAdapter(async () => ({ synced: true, identity: { studentUid: "student-1", studentCode: "SYNTHETIC", teacherUid: null, classId: null } }));
    env.api.flush();
    await settle();
    record = env.api.getRecord();
    assert.equal(record.remoteSync.pending, false, "later sync clears pending state");
    assert.equal(record.studentUid, "student-1", "authenticated identity attached");

    const reopened = createEnvironment(storage, env.time() + 60000);
    reopened.api.start({ lessonId: "week2lesson1", week: 2, lesson: 1, title: "Synthetic Lesson" });
    const reopenedRecord = reopened.api.getRecord();
    assert.equal(reopenedRecord.sessionCount, 2, "reopening creates exactly one additional session");
    assert.equal(reopenedRecord.migration.legacyLessonRecord, true);
    assert(reopenedRecord.totalOpenTimeMs >= record.totalOpenTimeMs, "reopening does not reset cumulative totals");

    const limitations = reopenedRecord.dataLimitations;
    assert(limitations.focusLoss && limitations.activeTime && limitations.hiddenTime && limitations.assistance && limitations.review);
    console.log("PASS analytics Stage 1 synthetic scenarios");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
