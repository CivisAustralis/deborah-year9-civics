(function (global) {
    "use strict";

    const bands = ["Sustained", "Generally consistent", "Variable", "Limited evidence of sustained engagement", "Emerging", "Developing", "Secure", "Sophisticated", "Insufficient evidence"];
    const dataNote = "Engagement information is based on interaction with the learning website. A focus-loss event means that the lesson page became hidden or was no longer the active browser window. It does not establish why the page lost focus or what occurred during that interval. Active learning time is an estimate and should be interpreted alongside completed work, teacher observations and classroom context.";

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function text(value, limit = 5000) { return String(value || "").trim().slice(0, limit); }
    function formatDuration(ms) {
        const minutes = Math.round((Number(ms) || 0) / 60000);
        if (minutes < 1) return "less than 1 minute";
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        return hours ? `${hours} hr${hours === 1 ? "" : "s"}${remainder ? ` ${remainder} min` : ""}` : `${minutes} min`;
    }
    function flattenIndicators(profile) {
        const indicators = profile && profile.indicators || {};
        return [indicators.engagement, indicators.comprehension, ...Object.values(indicators.skills || {}), indicators.persistence, indicators.selfCorrection, indicators.transferOfLearning, indicators.metacognition, indicators.criticalReasoning, indicators.observedVocabularySophistication].filter(Boolean).map((item, index) => ({ id: item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `indicator-${index}`, ...item }));
    }
    function normaliseDraft(profile, saved = {}) {
        const overrides = {};
        flattenIndicators(profile).forEach(item => {
            const prior = saved.indicatorOverrides && saved.indicatorOverrides[item.id] || {};
            overrides[item.id] = { generatedBand: item.band, selectedBand: bands.includes(prior.selectedBand) ? prior.selectedBand : item.band, evidenceStatement: text(prior.evidenceStatement || item.evidenceSummary, 2000), reason: text(prior.reason, 2000), notReported: Boolean(prior.notReported) };
        });
        const generated = flattenIndicators(profile);
        const generatedStrengths = generated.filter(item => ["Secure", "Sophisticated", "Sustained", "Generally consistent"].includes(item.band)).slice(0, 3).map(item => `${item.name}: ${item.evidenceStatements[0]}`);
        const generatedNextSteps = generated.filter(item => ["Emerging", "Developing", "Variable", "Limited evidence of sustained engagement", "Insufficient evidence"].includes(item.band)).slice(0, 3).map(item => item.band === "Insufficient evidence" ? `Gather further evidence for ${item.name.toLowerCase()}.` : `Consolidate ${item.name.toLowerCase()} through further application and explanation.`);
        return {
            indicatorOverrides: overrides,
            includeFocus: saved.includeFocus !== false,
            strengths: (Array.isArray(saved.strengths) ? saved.strengths : generatedStrengths).map(item => text(item, 500)).filter(Boolean).slice(0, 3),
            nextSteps: (Array.isArray(saved.nextSteps) ? saved.nextSteps : generatedNextSteps).map(item => text(item, 500)).filter(Boolean).slice(0, 3),
            teacherComment: text(saved.teacherComment, 3000),
            teacherName: text(saved.teacherName, 150),
            reportingPeriod: text(saved.reportingPeriod, 100) || new Date().getFullYear().toString(),
            extracts: (saved.extracts || []).map(item => ({ lessonId: text(item.lessonId, 80), fieldId: text(item.fieldId, 100), excerpt: text(item.excerpt, 1400), label: text(item.label, 160), teacherNote: text(item.teacherNote, 500) })).filter(item => item.excerpt).slice(0, 5)
        };
    }
    function quality(profile) {
        const metrics = profile.rawEvidence.metrics;
        const lessons = profile.rawEvidence.lessons || [];
        const indicators = flattenIndicators(profile);
        const missing = Math.max(0, metrics.lessonsAvailable - metrics.lessonsStarted);
        const pending = lessons.filter(item => item.remoteSync && item.remoteSync.pending).length;
        const migration = lessons.filter(item => item.migration && item.migration.warning).length;
        return {
            missingLessons: missing,
            pendingSync: pending,
            lowConfidence: indicators.filter(item => item.confidence === "Low").length,
            insufficient: indicators.filter(item => item.band === "Insufficient evidence").length,
            incompleteCapstone: (metrics.capstoneCompleted || []).length < 3,
            migrationWarnings: migration,
            partial: missing > 0 || pending > 0
        };
    }
    function eligibleResponses(profile) {
        return (profile.rawEvidence.lessons || []).flatMap(lesson => Object.values(lesson.writtenResponses || {}).map(response => ({ lessonId: lesson.lessonId, lessonTitle: lesson.lessonTitle || lesson.lessonId, fieldId: response.fieldId, fieldLabel: response.fieldLabel || response.fieldId, currentText: text(response.currentText, 10000), wordCount: response.wordCount || 0, revisionCount: response.revisionCount || 0 }))).filter(item => item.currentText.length >= 40);
    }
    function parentReport(profile, student, classRecord, draft) {
        const metrics = profile.rawEvidence.metrics;
        const indicators = flattenIndicators(profile).filter(item => !draft.indicatorOverrides[item.id]?.notReported).map(item => ({ ...item, finalBand: draft.indicatorOverrides[item.id]?.selectedBand || item.band, teacherWording: draft.indicatorOverrides[item.id]?.evidenceStatement || item.evidenceSummary }));
        const engagement = indicators.find(item => item.name === "Engagement");
        const focus = `The learning page lost focus ${metrics.focusLossCount} times across the unit for a combined total of ${formatDuration(metrics.hiddenTimeMs)}. The student returned after ${metrics.returnAfterInterruptionCount} recorded interruptions.`;
        const topicNames = { 1: "constitutional systems", 2: "Parliament and law-making", 3: "courts and justice", 4: "participation and elections", 5: "media, identity and belonging" };
        const topicResults = (profile.rawEvidence.lessons || []).map(lesson => { const attempts = Object.values(lesson.knowledgeChecks || {}).flatMap(check => check.attempts || []); return attempts.length ? { week: lesson.week, score: Number(attempts[attempts.length - 1].normalisedScore) || 0 } : null; }).filter(Boolean).reduce((groups, item) => { (groups[item.week] ||= []).push(item.score); return groups; }, {});
        const topicAverages = Object.entries(topicResults).map(([week, scores]) => ({ topic: topicNames[week], score: scores.reduce((a, b) => a + b, 0) / scores.length }));
        const strongest = topicAverages.filter(item => item.score >= 0.75).sort((a, b) => b.score - a.score).map(item => item.topic);
        const consolidation = topicAverages.filter(item => item.score < 0.65).sort((a, b) => a.score - b.score).map(item => item.topic);
        return {
            student: { name: student.displayName || student.accountCode || "Student", code: student.accountCode || "", className: classRecord.className || "", reportingPeriod: draft.reportingPeriod },
            generatedDate: new Date().toISOString().slice(0, 10),
            overview: { completed: metrics.lessonsCompleted, available: metrics.lessonsAvailable, status: metrics.lessonsCompleted === metrics.lessonsAvailable ? "Unit completed" : "Unit in progress", activeTime: formatDuration(metrics.activeTimeMs), sessions: metrics.totalSessions },
            engagement: engagement ? { band: engagement.finalBand, confidence: engagement.confidence, interpretation: engagement.teacherWording, focus: draft.includeFocus ? focus : null, activeTime: formatDuration(metrics.activeTimeMs), longestFocus: formatDuration(metrics.longestFocusLossMs), completion: `${Math.round(metrics.completionConsistency * 100)}%`, persistence: profile.indicators.persistence?.evidenceSummary || "Insufficient evidence" } : null,
            indicators,
            knowledge: { latest: metrics.knowledgeChecksCompleted ? `${Math.round(metrics.knowledgeLatestAverage * 100)}%` : "Insufficient evidence", highest: metrics.knowledgeChecksCompleted ? `${Math.round(metrics.knowledgeHighestAverage * 100)}%` : "Insufficient evidence", attempts: metrics.knowledgeAttemptCount, improvement: metrics.knowledgeImprovement > 0.05 ? "Improvement observed across recorded checks." : metrics.knowledgeImprovement < -0.05 ? "Later results require consolidation." : "Results were broadly stable or evidence was limited.", strongestTopics: strongest.length ? strongest.join(", ") : "No topic claim is made from the available evidence.", consolidationTopics: consolidation.length ? consolidation.join(", ") : "No consolidation area is identified from the available evidence." },
            behaviours: [profile.indicators.persistence, profile.indicators.selfCorrection, profile.indicators.metacognition, profile.indicators.transferOfLearning].filter(Boolean).map(item => ({ name: item.name, band: item.band, evidence: item.evidenceSummary })),
            extracts: clone(draft.extracts), strengths: clone(draft.strengths), nextSteps: clone(draft.nextSteps), teacherComment: draft.teacherComment, teacherName: draft.teacherName, dataNote
        };
    }
    function pdfFilename(studentName, date = new Date().toISOString().slice(0, 10)) { return `Deborah_Year9_Civics_${text(studentName, 80).normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "Student"}_${date}.pdf`; }
    global.DeborahReportingView = { bands, dataNote, formatDuration, flattenIndicators, normaliseDraft, quality, eligibleResponses, parentReport, pdfFilename };
})(window);
