const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let source = fs.readFileSync("js/analytics-sync.js", "utf8");
source = source
    .replace(/^import .*?;\n/gm, "")
    .replace("export async function createAnalyticsSyncAdapter", "async function createAnalyticsSyncAdapter")
    .replace("export const __test =", "globalThis.syncTest =");

const context = vm.createContext({ console });
new vm.Script(source, { filename: "analytics-sync.js" }).runInContext(context);

const local = {
    schemaVersion: 1,
    lastSavedAt: "2026-08-03T10:00:00.000Z",
    totalOpenTimeMs: 12000,
    activeTimeMs: 8000,
    sessionCount: 2,
    activitiesCompleted: ["a", "b"],
    activityResults: { b: { score: 2 } },
    unitProgress: { lessonProgress: 60, completed: false, startedLessonCount: 3, completedLessonCount: 1, totalLessons: 16 },
    writtenResponses: { reflection: { currentText: "new local response" } },
    knowledgeChecks: {
        "knowledge-check": {
            attempts: [
                { dedupeKey: "k:1", attemptNumber: 1, score: 3, maxScore: 6, normalisedScore: 0.5, recordedAt: "2026-08-03T09:00:00.000Z" },
                { dedupeKey: "k:2", attemptNumber: 2, score: 5, maxScore: 6, normalisedScore: 5 / 6, recordedAt: "2026-08-03T10:00:00.000Z" }
            ]
        }
    }
};
const remote = {
    schemaVersion: 1,
    lastSavedAt: "2026-08-03T09:30:00.000Z",
    totalOpenTimeMs: 15000,
    activeTimeMs: 6000,
    sessionCount: 1,
    activitiesCompleted: ["a", "c"],
    activityResults: { c: { score: 4 } },
    unitProgress: { lessonProgress: 80, completed: true, startedLessonCount: 2, completedLessonCount: 2, totalLessons: 16 },
    writtenResponses: { reflection: { currentText: "older remote response" } },
    knowledgeChecks: {
        "knowledge-check": {
            attempts: [
                { dedupeKey: "k:1", attemptNumber: 1, score: 3, maxScore: 6, normalisedScore: 0.5, recordedAt: "2026-08-03T09:00:00.000Z" }
            ]
        }
    }
};

const merged = context.syncTest.mergeRecords(local, remote);
assert.equal(merged.totalOpenTimeMs, 15000, "cumulative total cannot move backwards");
assert.equal(merged.activeTimeMs, 8000, "newer local cumulative evidence retained");
assert.deepEqual(Array.from(merged.activitiesCompleted).sort(), ["a", "b", "c"], "activities unioned");
assert.equal(merged.knowledgeAttemptCount, 2, "duplicate remote knowledge attempt removed");
assert.equal(merged.highestKnowledgeScore.score, 5, "highest knowledge result retained");
assert.equal(merged.latestKnowledgeScore.score, 5, "latest knowledge result retained");
assert.equal(merged.writtenResponses.reflection.currentText, "new local response", "newer response wins");
assert.equal(merged.unitProgress.lessonProgress, 80, "progress cannot move backwards");
assert.equal(merged.unitProgress.completed, true, "completion unioned");
assert.equal(merged.unitProgress.startedLessonCount, 3, "unit started count cannot move backwards");
assert.equal(merged.unitProgress.completedLessonCount, 2, "unit completed count cannot move backwards");
console.log("PASS analytics Firestore conflict merge");
