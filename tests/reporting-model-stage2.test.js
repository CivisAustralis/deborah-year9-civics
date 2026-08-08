const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = vm.createContext({ window: {}, console, Date, JSON, Math, Set, Object, Array, String, Number, Boolean, RegExp });
context.window.window = context.window;
new vm.Script(fs.readFileSync("js/reporting-config.js", "utf8"), { filename: "reporting-config.js" }).runInContext(context);
context.window.DEBORAH_REPORTING_CONFIG = context.window.DEBORAH_REPORTING_CONFIG;
new vm.Script(fs.readFileSync("js/reporting-model.js", "utf8"), { filename: "reporting-model.js" }).runInContext(context);
const model = context.window.DeborahReportingModel;

const lessonIds = [
    "week1lesson1", "week1lesson2", "week1lesson3", "week1lesson4",
    "week2lesson1", "week2lesson2", "week2lesson3", "week2lesson4",
    "week3lesson1", "week3lesson2", "week3lesson3", "week3lesson4",
    "week4lesson1", "week4lesson2", "week5lesson1", "week5lesson2"
];
const fullActivities = [
    "who-should-act", "representation-lens", "route-the-case", "criminal-civil-or-both",
    "committee-evidence-list", "complete-evidence-brief", "campaign-claims-monitor", "stakeholder-dossiers",
    "social-media-verification", "representation-audit", "social-cohesion-stress-test", "media-framing-desk",
    "counterframe-workshop", "representation-hearing", "public-consultation-hearing", "national-editorial-board",
    "community-voice-archive", "dialogue-laboratory", "second-look-briefing", "justice-policy-recommendation",
    "electoral-integrity-finding", "final-influence-brief", "national-portrait-brief", "final-belonging-charter",
    "week-two-synthesis", "government-formation-brief", "consultation-deliberation-board", "whole-unit-systems-map"
];

const richText = "PURPOSE: I recommend a transparent democratic process because evidence from the court, Parliament and community testimony supports accountability. However, competing interests create a tension: freedom of expression may affect minority rights and social cohesion. One counterargument is that majority rule should decide everything. Nevertheless, the rule of law, substantive equality and pluralism limit that claim because the consequence could be discrimination. Overall, a qualified and more defensible conclusion is that participation and scrutiny should continue, subject to evidence and review.";
const shallowText = "Democracy Parliament justice evidence. Democracy Parliament justice evidence. Democracy Parliament justice evidence.";

function response(fieldId, text, revisionCount = 0) {
    return {
        fieldId,
        currentText: text,
        wordCount: text.split(/\s+/).length,
        characterCount: text.length,
        revisionCount,
        vocabularyObserved: ["democracy", "Parliament", "justice", "evidence", "accountability", "rule of law", "pluralism", "social cohesion", "substantive equality", "minority rights", "participation", "scrutiny"]
    };
}

function makeRecords(options = {}) {
    const started = options.started ?? 16;
    const completed = options.completed ?? started;
    const quizScore = options.quizScore ?? 0.85;
    const attempts = options.attempts ?? [Math.max(0, quizScore - 0.15), quizScore];
    const includeCapstone = options.includeCapstone !== false;
    return lessonIds.slice(0, started).map((lessonId, index) => {
        const week = Math.floor(index / 4) + 1 > 3 ? (index < 14 ? 4 : 5) : Math.floor(index / 4) + 1;
        const isKnowledgeLesson = index >= 4;
        const fieldId = index === 11 ? "policyRecommendation" : index === 12 ? "electionBrief" : index === 13 ? "influenceBrief" : index === 14 ? "nationalPortraitBrief" : index === 15 ? "belongingCharter" : "reflection";
        let text = options.shallowWriting ? shallowText : richText;
        if (options.metacognition === "kept" && index >= 12) text += " I kept my original judgement because later evidence made the unresolved tension more precise.";
        if (options.metacognition === "changed" && index >= 12) text += " I changed my original judgement because new evidence showed a consequence I had overlooked.";
        const activities = completed > index ? fullActivities.filter((activity, activityIndex) => activityIndex % started === index % started && (includeCapstone || !["national-portrait-brief", "final-belonging-charter", "whole-unit-systems-map"].includes(activity))) : [];
        if (includeCapstone && index === 14) activities.push("national-portrait-brief");
        if (includeCapstone && index === 15) activities.push("final-belonging-charter", "whole-unit-systems-map");
        const knowledgeAttempts = isKnowledgeLesson ? attempts.map((score, attemptIndex) => ({
            dedupeKey: `${lessonId}:${attemptIndex + 1}`,
            attemptNumber: attemptIndex + 1,
            score: Math.round(score * 10),
            maxScore: 10,
            normalisedScore: score,
            recordedAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:0${attemptIndex}:00.000Z`
        })) : [];
        return {
            schemaVersion: 1,
            studentUid: options.studentUid || "synthetic-student",
            lessonId,
            week,
            lesson: (index % 4) + 1,
            sessionCount: completed > index ? 2 : 1,
            totalOpenTimeMs: 30 * 60000,
            activeTimeMs: 25 * 60000,
            idleTimeMs: 3 * 60000,
            hiddenTimeMs: options.singleLongInterruption ? (index === 0 ? 45 * 60000 : 0) : (options.hiddenTimeMs ?? 2 * 60000),
            focusLossCount: options.singleLongInterruption ? (index === 0 ? 1 : 0) : (options.focusLossCount ?? 2),
            returnAfterFocusLossCount: options.singleLongInterruption ? (index === 0 ? 1 : 0) : (options.returnCount ?? 2),
            longestFocusLossMs: options.singleLongInterruption ? (index === 0 ? 45 * 60000 : 0) : (options.longestFocusLossMs ?? 60000),
            meaningfulInteractionCount: options.interactions ?? 20,
            revisionCount: options.revisions ?? 1,
            activitiesCompleted: activities,
            knowledgeChecks: isKnowledgeLesson ? { "knowledge-check": { attempts: knowledgeAttempts } } : {},
            highestKnowledgeScore: isKnowledgeLesson ? { normalisedScore: Math.max(...attempts) } : null,
            writtenResponses: options.noWriting ? {} : { [fieldId]: response(fieldId, text, options.revisions ?? 1) },
            unitProgress: { lessonProgress: completed > index ? 100 : 30, completed: completed > index }
        };
    });
}

function profile(options) { return model.buildStudentFormativeProfile(makeRecords(options), { studentUid: "synthetic-student", lessonsAvailable: 16 }); }

const sustained = profile({});
assert(["Sustained", "Generally consistent"].includes(sustained.indicators.engagement.band), "complete sustained evidence receives a positive engagement descriptor");
assert.notEqual(sustained.indicators.comprehension.band, "Insufficient evidence");
const everyIndicator = [sustained.indicators.engagement, sustained.indicators.comprehension, ...Object.values(sustained.indicators.skills), sustained.indicators.persistence, sustained.indicators.selfCorrection, sustained.indicators.transferOfLearning, sustained.indicators.metacognition, sustained.indicators.criticalReasoning, sustained.indicators.observedVocabularySophistication];
everyIndicator.forEach(indicator => ["band", "evidenceSummary", "confidence", "underlyingMetrics", "limitations", "supportingLessonIds"].forEach(field => assert(Object.prototype.hasOwnProperty.call(indicator, field), `${indicator.name} missing ${field}`)));

const frequentBriefFocus = profile({ focusLossCount: 14, returnCount: 14, hiddenTimeMs: 8 * 60000, longestFocusLossMs: 45000 });
assert(["Sustained", "Generally consistent"].includes(frequentBriefFocus.indicators.engagement.band), "brief returned focus loss cannot dominate engagement");
assert(frequentBriefFocus.indicators.engagement.evidenceSummary.includes("learning page lost focus"));

const oneLongInterruption = profile({ singleLongInterruption: true });
assert.notEqual(oneLongInterruption.indicators.engagement.band, "Limited evidence of sustained engagement", "one interruption does not erase substantial completion");

const incomplete = profile({ started: 2, completed: 0, noWriting: true, attempts: [] });
assert.equal(incomplete.indicators.engagement.band, "Insufficient evidence");
assert.equal(incomplete.indicators.comprehension.band, "Insufficient evidence");

const lowRecall = profile({ quizScore: 0.3, attempts: [0.2, 0.25, 0.3] });
assert.equal(lowRecall.indicators.skills.civicAndLegalKnowledge.band, "Emerging", "low performance with enough evidence is distinct from absence");
assert.notEqual(lowRecall.indicators.persistence.band, "Insufficient evidence", "retries are persistence evidence rather than automatic weakness");

const improved = profile({ attempts: [0.35, 0.55, 0.85], revisions: 2 });
assert.notEqual(improved.indicators.selfCorrection.band, "Insufficient evidence");
assert(improved.rawEvidence.metrics.knowledgeImprovement > 0);

const strongReasoningModerateRecall = profile({ quizScore: 0.58, attempts: [0.5, 0.58] });
assert(["Secure", "Sophisticated"].includes(strongReasoningModerateRecall.indicators.criticalReasoning.band));
assert.notEqual(strongReasoningModerateRecall.indicators.skills.civicAndLegalKnowledge.band, "Sophisticated");

const recallShallow = profile({ quizScore: 0.96, attempts: [0.96], shallowWriting: true });
assert.notEqual(recallShallow.indicators.comprehension.band, "Sophisticated", "recall alone cannot yield sophisticated comprehension");
assert.notEqual(recallShallow.indicators.skills.counterargument.band, "Sophisticated");

assert(["Secure", "Sophisticated"].includes(sustained.indicators.observedVocabularySophistication.band), "varied contextual vocabulary supported across lessons");
const repeatedTerms = profile({ shallowWriting: true });
assert(!["Secure", "Sophisticated"].includes(repeatedTerms.indicators.observedVocabularySophistication.band), "repetition without explanatory sentences is not sophisticated vocabulary");

const retained = profile({ metacognition: "kept" });
assert.notEqual(retained.indicators.metacognition.band, "Insufficient evidence", "retaining a view with reasons counts as metacognition");
const changed = profile({ metacognition: "changed" });
assert.notEqual(changed.indicators.metacognition.band, "Insufficient evidence", "changing a view with evidence counts as metacognition");

const noCapstone = profile({ includeCapstone: false });
assert.notEqual(noCapstone.indicators.skills.wholeUnitSynthesis.band, "Sophisticated", "no Week 5 capstone cannot yield sophisticated synthesis");

const review = { indicatorOverrides: { engagement: { band: "Variable", reason: "Classroom context" } }, classroomContext: "Observed teacher conference." };
const before = JSON.stringify(sustained.rawEvidence);
const reviewed = model.applyTeacherReview(sustained, review);
assert.equal(JSON.stringify(reviewed.profile.rawEvidence), before, "teacher override does not mutate raw evidence");
assert.equal(reviewed.teacherReview.indicatorOverrides.engagement.band, "Variable");

const output = JSON.stringify(sustained.indicators);
for (const prohibited of ["cheating", "misconduct", "off task", "inattentive", "intelligence", "diagnosis"]) assert(!output.toLowerCase().includes(prohibited));
assert(output.includes("lost focus") && !output.includes("was off task"), "focus wording remains neutral");
assert.equal(sustained.indicators.skills.independentDigitalTaskCompletion.name, "Independent digital task completion");
assert(sustained.indicators.skills.independentDigitalTaskCompletion.limitations.some(value => value.includes("cannot identify all assistance")));

console.log("PASS reporting model Stage 2 synthetic profiles");
