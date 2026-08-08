(function (global) {
    "use strict";

    const defaultLimitations = [
        "These formative settings are transparent design thresholds, not validated psychological measures.",
        "Website evidence cannot identify all assistance provided during classroom learning."
    ];

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function unique(values) { return Array.from(new Set((values || []).filter(Boolean))); }
    function sum(values) { return values.reduce((total, value) => total + (Number(value) || 0), 0); }
    function mean(values) { return values.length ? sum(values) / values.length : 0; }
    function clamp(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
    function words(text) { return String(text || "").trim().split(/\s+/).filter(Boolean); }
    function sentences(text) { return String(text || "").split(/[.!?]+/).map(value => value.trim()).filter(value => words(value).length >= 5); }
    function formatDuration(milliseconds) {
        const minutes = Math.round((Number(milliseconds) || 0) / 60000);
        if (minutes < 1) return "less than one minute";
        return minutes === 1 ? "1 minute" : `${minutes} minutes`;
    }

    function getConfig() {
        const reporting = global.DEBORAH_REPORTING_CONFIG || {};
        return {
            model: reporting.formativeModel || {},
            fields: reporting.reportFields || {},
            vocabularyGroups: reporting.vocabularyGroups || {}
        };
    }

    function analyseReasoning(response) {
        const text = String(response.currentText || "");
        const sentenceList = sentences(text);
        const tests = {
            position: /\b(I (?:recommend|conclude|find|argue)|my (?:position|finding)|should|final principle)\b/i.test(text),
            reasons: /\b(because|since|therefore|as a result)\b/i.test(text) && sentenceList.length >= 3,
            evidence: /\b(evidence|data|source|testimony|example|record|finding)\b/i.test(text),
            civicConcepts: (response.vocabularyObserved || []).length >= 2,
            competingInterests: /\b(however|although|on the other hand|competing|tension|trade-off|tradeoff)\b/i.test(text),
            consequences: /\b(consequence|impact|risk|result|effect|would lead|may cause)\b/i.test(text),
            counterargument: /\b(counterargument|strongest argument against|criticism|an opposing view|some may argue)\b/i.test(text),
            responseToCounterargument: /\b(nevertheless|even so|overall|more defensible|on balance|despite)\b/i.test(text),
            qualifiedConclusion: /\b(may|might|depends|uncertain|limitation|provided that|subject to)\b/i.test(text) && /\b(overall|conclude|recommend|finding|principle)\b/i.test(text)
        };
        const featureCount = Object.values(tests).filter(Boolean).length;
        return { ...tests, featureCount, score: featureCount / Object.keys(tests).length, sentenceCount: sentenceList.length, wordCount: words(text).length };
    }

    function aggregateStudentEvidence(records, options = {}) {
        const config = getConfig();
        const lessons = (records || []).filter(record => record && record.lessonId).map(clone).sort((a, b) => (a.week || 0) - (b.week || 0) || (a.lesson || 0) - (b.lesson || 0));
        const responses = lessons.flatMap(lesson => Object.values(lesson.writtenResponses || {}).map(response => ({ ...response, lessonId: lesson.lessonId, week: lesson.week })));
        const knowledgeAttempts = lessons.flatMap(lesson => Object.entries(lesson.knowledgeChecks || {}).flatMap(([activityId, check]) => (check.attempts || []).map(attempt => ({ ...attempt, activityId, lessonId: lesson.lessonId, week: lesson.week }))));
        const latestByLesson = lessons.map(lesson => {
            const attempts = Object.values(lesson.knowledgeChecks || {}).flatMap(check => check.attempts || []);
            return attempts.length ? attempts[attempts.length - 1] : null;
        }).filter(Boolean);
        const completedActivities = lessons.flatMap(lesson => (lesson.activitiesCompleted || []).map(activityId => ({ activityId, lessonId: lesson.lessonId })));
        const reasoningFields = new Set(config.model.majorReasoningFields || []);
        const reasoningEvidence = responses.filter(response => reasoningFields.has(response.fieldId)).map(response => ({ ...response, analysis: analyseReasoning(response) }));
        const earlyKnowledge = latestByLesson.filter(item => (item.week || 0) <= 2).map(item => item.normalisedScore);
        const lateKnowledge = latestByLesson.filter(item => (item.week || 0) >= 4).map(item => item.normalisedScore);
        const vocabulary = analyseVocabulary(responses, config.vocabularyGroups);
        const started = lessons.length;
        const completed = lessons.filter(lesson => lesson.unitProgress && lesson.unitProgress.completed).length;
        const rawMetrics = {
            studentUid: options.studentUid || lessons.find(item => item.studentUid)?.studentUid || null,
            lessonsAvailable: options.lessonsAvailable || Object.keys(config.fields).length || 16,
            lessonsStarted: started,
            lessonsCompleted: completed,
            activitiesCompleted: completedActivities.length,
            totalSessions: sum(lessons.map(lesson => lesson.sessionCount)),
            totalOpenTimeMs: sum(lessons.map(lesson => lesson.totalOpenTimeMs)),
            activeTimeMs: sum(lessons.map(lesson => lesson.activeTimeMs)),
            idleTimeMs: sum(lessons.map(lesson => lesson.idleTimeMs)),
            hiddenTimeMs: sum(lessons.map(lesson => lesson.hiddenTimeMs)),
            focusLossCount: sum(lessons.map(lesson => lesson.focusLossCount)),
            longestFocusLossMs: Math.max(0, ...lessons.map(lesson => Number(lesson.longestFocusLossMs) || 0)),
            returnAfterInterruptionCount: sum(lessons.map(lesson => lesson.returnAfterFocusLossCount)),
            meaningfulInteractionCount: sum(lessons.map(lesson => lesson.meaningfulInteractionCount)),
            revisions: sum(lessons.map(lesson => lesson.revisionCount)),
            meaningfulWrittenResponses: responses.filter(response => (response.characterCount || 0) >= 20).length,
            writtenWords: sum(responses.map(response => response.wordCount)),
            knowledgeChecksCompleted: latestByLesson.length,
            knowledgeAttemptCount: knowledgeAttempts.length,
            knowledgeLatestAverage: mean(latestByLesson.map(item => item.normalisedScore)),
            knowledgeHighestAverage: mean(lessons.map(lesson => lesson.highestKnowledgeScore && lesson.highestKnowledgeScore.normalisedScore).filter(value => value !== null && value !== undefined)),
            knowledgeImprovement: lateKnowledge.length && earlyKnowledge.length ? mean(lateKnowledge) - mean(earlyKnowledge) : mean(Object.values(groupAttempts(knowledgeAttempts)).map(group => group.length > 1 ? group[group.length - 1].normalisedScore - group[0].normalisedScore : 0)),
            completionConsistency: started ? completed / started : 0,
            activeProportion: sum(lessons.map(lesson => lesson.totalOpenTimeMs)) ? sum(lessons.map(lesson => lesson.activeTimeMs)) / sum(lessons.map(lesson => lesson.totalOpenTimeMs)) : 0,
            responseLessonCount: unique(responses.map(response => response.lessonId)).length,
            reasoningResponseCount: reasoningEvidence.length,
            capstoneCompleted: (config.model.capstoneActivities || []).filter(activityId => completedActivities.some(item => item.activityId === activityId)),
            vocabulary,
            earlyVersusLate: {
                earlyKnowledgeAverage: earlyKnowledge.length ? mean(earlyKnowledge) : null,
                lateKnowledgeAverage: lateKnowledge.length ? mean(lateKnowledge) : null,
                earlyVocabularyCount: vocabulary.earlyDistinctTerms,
                lateVocabularyCount: vocabulary.lateDistinctTerms
            }
        };
        return { rawLessons: lessons, responses, knowledgeAttempts, completedActivities, reasoningEvidence, rawMetrics };
    }

    function groupAttempts(attempts) {
        return attempts.reduce((groups, attempt) => {
            const key = `${attempt.lessonId}:${attempt.activityId}`;
            (groups[key] ||= []).push(attempt);
            return groups;
        }, {});
    }

    function analyseVocabulary(responses, groups) {
        const termGroups = Object.entries(groups || {});
        const usage = {};
        responses.forEach(response => {
            const text = String(response.currentText || "");
            const sentenceList = sentences(text);
            termGroups.forEach(([groupName, terms]) => terms.forEach(term => {
                const matching = sentenceList.filter(sentence => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sentence));
                if (!matching.length) return;
                const key = term.toLocaleLowerCase();
                const item = usage[key] ||= { term, groups: [], lessonIds: [], examples: [], early: false, late: false };
                item.groups.push(groupName);
                item.lessonIds.push(response.lessonId);
                item.examples.push({ lessonId: response.lessonId, fieldId: response.fieldId, sentence: matching[0].slice(0, 240) });
                item.early ||= Number(response.week) <= 2;
                item.late ||= Number(response.week) >= 4;
            }));
        });
        const items = Object.values(usage).map(item => ({ ...item, groups: unique(item.groups), lessonIds: unique(item.lessonIds), examples: item.examples.slice(0, 3) }));
        return {
            distinctTerms: items.length,
            topicGroupCount: unique(items.flatMap(item => item.groups)).length,
            contextualLessonCount: unique(items.flatMap(item => item.lessonIds)).length,
            repeatedContextualTerms: items.filter(item => item.lessonIds.length >= 2).length,
            earlyDistinctTerms: items.filter(item => item.early).length,
            lateDistinctTerms: items.filter(item => item.late).length,
            examples: items.flatMap(item => item.examples.map(example => ({ term: item.term, ...example }))).slice(0, 12)
        };
    }

    function confidenceFor(lessonIds, evidenceTypes = 1) {
        const count = unique(lessonIds).length;
        const settings = getConfig().model.confidence || { moderateLessons: 3, highLessons: 8 };
        if (count >= settings.highLessons && evidenceTypes >= 3) return "High";
        if (count >= settings.moderateLessons && evidenceTypes >= 2) return "Moderate";
        return "Low";
    }

    function insufficient(name, metrics, lessonIds, limitation) {
        return {
            name,
            band: "Insufficient evidence",
            descriptor: "Insufficient evidence",
            confidence: "Low",
            supportingLessonIds: unique(lessonIds),
            evidenceStatements: ["The available lesson evidence is not broad enough for a responsible formative judgement."],
            evidenceSummary: "Insufficient evidence across completed lessons and evidence types.",
            underlyingMetrics: metrics,
            limitations: unique([limitation, ...defaultLimitations])
        };
    }

    function indicator(name, band, confidence, lessonIds, statements, metrics, limitations = []) {
        return {
            name,
            band,
            descriptor: band,
            confidence,
            supportingLessonIds: unique(lessonIds),
            evidenceStatements: statements.slice(0, 2),
            evidenceSummary: statements.join(" "),
            underlyingMetrics: metrics,
            limitations: unique([...limitations, ...defaultLimitations])
        };
    }

    function learningBand(score, sophisticatedAllowed = true) {
        const bands = getConfig().model.learningBands || { sophisticated: 0.82, secure: 0.65, developing: 0.45 };
        if (score >= bands.sophisticated && sophisticatedAllowed) return "Sophisticated";
        if (score >= bands.secure) return "Secure";
        if (score >= bands.developing) return "Developing";
        return "Emerging";
    }

    function buildEngagement(evidence) {
        const m = evidence.rawMetrics;
        const model = getConfig().model;
        const lessonIds = evidence.rawLessons.map(lesson => lesson.lessonId);
        if (m.lessonsStarted < (model.minimumStartedLessons || 3) || (!m.meaningfulWrittenResponses && !m.knowledgeChecksCompleted)) return insufficient("Engagement", m, lessonIds, "Opening a lesson alone is not engagement evidence.");
        const weights = model.engagementWeights;
        const persistenceSignals = Number(m.returnAfterInterruptionCount > 0) + Number(m.revisions > 0) + Number(m.knowledgeAttemptCount > m.knowledgeChecksCompleted) + Number(m.knowledgeImprovement > 0.05);
        const returnRatio = m.focusLossCount ? Math.min(1, m.returnAfterInterruptionCount / m.focusLossCount) : 1;
        const hiddenRatio = m.totalOpenTimeMs ? m.hiddenTimeMs / m.totalOpenTimeMs : 0;
        const components = {
            completionConsistency: clamp(m.completionConsistency),
            activeLearningTime: clamp((m.activeTimeMs / Math.max(1, m.lessonsStarted)) / (20 * 60000)),
            substantiveResponses: clamp(m.meaningfulWrittenResponses / Math.max(1, m.lessonsStarted)),
            persistenceAndRevision: clamp(persistenceSignals / 3),
            meaningfulInteractions: clamp(m.meaningfulInteractionCount / Math.max(1, m.lessonsStarted * 8)),
            focusContinuity: clamp((returnRatio * 0.6) + ((1 - Math.min(1, hiddenRatio)) * 0.4))
        };
        const score = Object.entries(weights).reduce((total, [key, weight]) => total + components[key] * weight, 0);
        const thresholds = model.engagementBands;
        const band = score >= thresholds.sustained ? "Sustained" : score >= thresholds.generallyConsistent ? "Generally consistent" : score >= thresholds.variable ? "Variable" : "Limited evidence of sustained engagement";
        const focusStatement = `The learning page lost focus ${m.focusLossCount} times for a combined ${formatDuration(m.hiddenTimeMs)}; ${m.returnAfterInterruptionCount} returns were recorded.`;
        return indicator("Engagement", band, confidenceFor(lessonIds, 5), lessonIds, [
            `${m.lessonsCompleted} of ${m.lessonsStarted} started lessons were completed, with ${m.meaningfulWrittenResponses} substantive responses and ${m.revisions} recorded revisions.`,
            focusStatement
        ], { score, weights, components, focusLossCount: m.focusLossCount, hiddenTimeMs: m.hiddenTimeMs }, ["Focus continuity contributes only 10% of this configurable model and does not reveal why focus changed."]);
    }

    function buildComprehension(evidence) {
        const m = evidence.rawMetrics;
        const ids = unique(evidence.knowledgeAttempts.map(item => item.lessonId).concat(evidence.reasoningEvidence.map(item => item.lessonId)));
        if (m.knowledgeChecksCompleted < (getConfig().model.minimumKnowledgeChecks || 3)) return insufficient("Comprehension", { knowledgeChecksCompleted: m.knowledgeChecksCompleted }, ids, "Too few knowledge checks were completed to distinguish low performance from absent evidence.");
        const reasoning = mean(evidence.reasoningEvidence.map(item => item.analysis.score));
        const application = clamp(evidence.completedActivities.filter(item => /brief|audit|dilemma|hearing|analysis|count|workshop|map/.test(item.activityId)).length / Math.max(1, m.lessonsStarted));
        const score = clamp(m.knowledgeLatestAverage * 0.55 + application * 0.20 + reasoning * 0.25);
        const sophisticated = reasoning >= 0.72 && m.capstoneCompleted.length > 0;
        const band = learningBand(score, sophisticated);
        return indicator("Comprehension", band, confidenceFor(ids, 3), ids, [
            `Latest knowledge-check performance averaged ${Math.round(m.knowledgeLatestAverage * 100)}% across ${m.knowledgeChecksCompleted} checks.`,
            sophisticated ? "Written and capstone evidence also showed application and integration beyond recall." : "The band is constrained where application or integrated written reasoning is limited."
        ], { score, knowledge: m.knowledgeLatestAverage, application, reasoning, sophisticatedGateMet: sophisticated }, ["Multiple-choice results cannot establish sophisticated comprehension by themselves."]);
    }

    function activityCoverage(evidence, activityIds) {
        const matches = evidence.completedActivities.filter(item => activityIds.includes(item.activityId));
        return { matches, lessonIds: unique(matches.map(item => item.lessonId)), ratio: activityIds.length ? matches.length / activityIds.length : 0 };
    }

    function buildSkill(name, evidence, options) {
        const coverage = activityCoverage(evidence, options.activityIds || []);
        const responseEvidence = evidence.reasoningEvidence.filter(options.responseFilter || (() => true));
        const ids = unique(coverage.lessonIds.concat(responseEvidence.map(item => item.lessonId), options.extraLessonIds || []));
        if (ids.length < (options.minimumLessons || 2) || (coverage.matches.length + responseEvidence.length) < (options.minimumEvidence || 2)) return insufficient(name, { activityEvidence: coverage.matches.length, writtenEvidence: responseEvidence.length }, ids, options.insufficientLimitation);
        const responseScore = responseEvidence.length ? mean(responseEvidence.map(item => item.analysis.score)) : 0;
        const score = clamp((options.baseScore ? options.baseScore(evidence) : coverage.ratio) * (options.baseWeight || 0.55) + responseScore * (1 - (options.baseWeight || 0.55)));
        const sophisticated = Boolean(options.sophisticated ? options.sophisticated(evidence, responseEvidence, coverage) : responseScore >= 0.75 && ids.length >= 4);
        const band = learningBand(score, sophisticated);
        return indicator(name, band, confidenceFor(ids, responseEvidence.length ? 3 : 2), ids, [
            `${coverage.matches.length} relevant completed activities and ${responseEvidence.length} major written responses supplied evidence.`,
            options.statement ? options.statement(evidence, responseEvidence, coverage) : "The descriptor reflects observed task evidence and remains open to teacher review."
        ], { score, activityEvidence: coverage.matches.length, writtenEvidence: responseEvidence.length, sophisticatedGateMet: sophisticated }, options.limitations || []);
    }

    function buildVocabulary(evidence) {
        const v = evidence.rawMetrics.vocabulary;
        const ids = unique(v.examples.map(item => item.lessonId));
        if (v.contextualLessonCount < 2 || v.distinctTerms < 4) return insufficient("Observed vocabulary sophistication", v, ids, "Term detection provides too little contextual evidence; repeated terms alone are not sophistication.");
        const score = clamp((v.distinctTerms / 16) * 0.35 + (v.topicGroupCount / 6) * 0.30 + (v.contextualLessonCount / 8) * 0.20 + (v.repeatedContextualTerms / 6) * 0.15);
        const sophisticated = v.distinctTerms >= 14 && v.topicGroupCount >= 5 && v.contextualLessonCount >= 6 && v.repeatedContextualTerms >= 4;
        let band = learningBand(score, sophisticated);
        if (band === "Secure" && (v.topicGroupCount < 3 || v.contextualLessonCount < 3)) band = "Developing";
        return indicator("Observed vocabulary sophistication", band, confidenceFor(ids, 3), ids, [
            `${v.distinctTerms} distinct subject terms were observed contextually across ${v.topicGroupCount} topic groups and ${v.contextualLessonCount} lessons.`,
            `${v.repeatedContextualTerms} terms appeared in explanatory sentences across more than one lesson; examples are retained for teacher review.`
        ], { ...v, score }, ["Keyword context suggests, but cannot prove, semantic accuracy. Length and rarity are not rewarded by themselves."]);
    }

    function buildAdditionalIndicators(evidence) {
        const m = evidence.rawMetrics;
        const allIds = evidence.rawLessons.map(item => item.lessonId);
        const retryGroups = Object.values(groupAttempts(evidence.knowledgeAttempts));
        const improvedGroups = retryGroups.filter(group => group.length > 1 && group[group.length - 1].normalisedScore > group[0].normalisedScore + 0.05);
        const persistenceEvidence = improvedGroups.length + m.revisions + Math.min(m.returnAfterInterruptionCount, 3);
        const persistence = evidence.rawMetrics.lessonsStarted < 3 ? insufficient("Persistence", { persistenceEvidence }, allIds, "Too few lessons were started to interpret persistence.") : indicator("Persistence", learningBand(clamp(persistenceEvidence / 8), persistenceEvidence >= 8), confidenceFor(allIds, 3), allIds, [`${improvedGroups.length} improving retry sequences, ${m.revisions} revisions and ${m.returnAfterInterruptionCount} returns after interruption were recorded.`], { improvingRetries: improvedGroups.length, revisions: m.revisions, returns: m.returnAfterInterruptionCount }, ["Multiple attempts can demonstrate persistence and are not treated automatically as weakness."]);
        const selfIds = unique(improvedGroups.flatMap(group => group.map(item => item.lessonId)).concat(evidence.responses.filter(item => item.revisionCount > 0).map(item => item.lessonId)));
        const selfCorrection = selfIds.length < 2 ? insufficient("Self-correction", { improvingRetries: improvedGroups.length, revisions: m.revisions }, selfIds, "No responsible inference is made from attempts without observable improvement or revision.") : indicator("Self-correction", learningBand(clamp((improvedGroups.length + m.revisions) / 6), improvedGroups.length + m.revisions >= 6), confidenceFor(selfIds, 2), selfIds, [`Improvement was observed in ${improvedGroups.length} knowledge sequences and ${m.revisions} substantive written revisions.`], { improvingRetries: improvedGroups.length, revisions: m.revisions }, ["The system observes changed products, not the student’s reason for changing them."]);
        const metacognitiveResponses = evidence.responses.filter(item => /reflection/i.test(item.fieldId) && /\b(kept|changed|original|now|more precise|evidence|tension)\b/i.test(item.currentText || "") && /\b(because|therefore|however|although)\b/i.test(item.currentText || ""));
        const metaIds = unique(metacognitiveResponses.map(item => item.lessonId));
        const metacognition = metaIds.length < 2 ? insufficient("Metacognition", { reflectiveComparisons: metacognitiveResponses.length }, metaIds, "Changing a view and retaining a view are both neutral unless the reasoning is explained.") : indicator("Metacognition", learningBand(clamp(metacognitiveResponses.length / 5), metacognitiveResponses.length >= 5), confidenceFor(metaIds, 2), metaIds, [`${metacognitiveResponses.length} reflections explained a retained, changed or more precise judgement using reasons or evidence.`], { reflectiveComparisons: metacognitiveResponses.length }, ["The indicator assesses explicit reflection structure, not private thought processes."]);
        const transferIds = unique(evidence.completedActivities.filter(item => /synthesis|systems-map|charter|national-portrait|government-formation/.test(item.activityId)).map(item => item.lessonId));
        const transferScore = clamp((transferIds.length / 4) * 0.6 + (m.capstoneCompleted.length / 3) * 0.4);
        const transfer = transferIds.length < 2 ? insufficient("Transfer of learning", { synthesisActivities: transferIds.length, capstones: m.capstoneCompleted.length }, transferIds, "Without later synthesis evidence, absence of transfer cannot be distinguished from absence of work.") : indicator("Transfer of learning", learningBand(transferScore, m.capstoneCompleted.length >= 2 && transferIds.length >= 3), confidenceFor(transferIds, 3), transferIds, [`Connections across weekly topics were evidenced in ${transferIds.length} synthesis lessons, including ${m.capstoneCompleted.length} completed capstone components.`], { transferScore, capstones: m.capstoneCompleted }, ["Students may make defensible connections different from model examples."]);
        const reasoningIds = unique(evidence.reasoningEvidence.map(item => item.lessonId));
        const reasoningAverage = mean(evidence.reasoningEvidence.map(item => item.analysis.score));
        const criticalReasoning = reasoningIds.length < 2 ? insufficient("Critical reasoning", { majorResponses: evidence.reasoningEvidence.length }, reasoningIds, "Short or absent major responses do not justify a low reasoning band.") : indicator("Critical reasoning", learningBand(reasoningAverage, reasoningAverage >= 0.8 && reasoningIds.length >= 4), confidenceFor(reasoningIds, 3), reasoningIds, [`Major responses averaged ${Math.round(reasoningAverage * 9)} of 9 observable reasoning structures, including reasons, evidence, consequences and qualification.`], { reasoningAverage, responseAnalyses: evidence.reasoningEvidence.map(item => ({ lessonId: item.lessonId, fieldId: item.fieldId, ...item.analysis })) }, ["Structural signals support teacher review but do not establish that every claim is accurate or ideologically preferred."]);
        return { persistence, selfCorrection, transferOfLearning: transfer, metacognition, criticalReasoning, observedVocabularySophistication: buildVocabulary(evidence) };
    }

    function buildStudentFormativeProfile(records, options = {}) {
        const evidence = aggregateStudentEvidence(records, options);
        const model = getConfig().model;
        const skills = model.skillActivities || {};
        const knowledgeIds = unique(evidence.knowledgeAttempts.map(item => item.lessonId));
        const knowledge = evidence.rawMetrics.knowledgeChecksCompleted < (model.minimumKnowledgeChecks || 3)
            ? insufficient("Civic and legal knowledge", { checks: evidence.rawMetrics.knowledgeChecksCompleted }, knowledgeIds, "Too few checks were completed to interpret recall and conceptual distinction.")
            : indicator("Civic and legal knowledge", learningBand(evidence.rawMetrics.knowledgeLatestAverage, false), confidenceFor(knowledgeIds, 2), knowledgeIds, [`Latest results averaged ${Math.round(evidence.rawMetrics.knowledgeLatestAverage * 100)}%; highest results averaged ${Math.round(evidence.rawMetrics.knowledgeHighestAverage * 100)}%.`], { latestAverage: evidence.rawMetrics.knowledgeLatestAverage, highestAverage: evidence.rawMetrics.knowledgeHighestAverage, attempts: evidence.rawMetrics.knowledgeAttemptCount }, ["Selected-response checks sample taught knowledge but do not independently establish application."]);
        const common = { evidence, minimumLessons: 2, minimumEvidence: 2 };
        const skillIndicators = {
            civicAndLegalKnowledge: knowledge,
            applicationOfConcepts: buildSkill("Application of concepts", evidence, { ...common, activityIds: skills.application || [], statement: () => "Scenario and classification tasks required concepts to be applied beyond recall." }),
            evidenceEvaluation: buildSkill("Evidence evaluation", evidence, { ...common, activityIds: skills.evidenceEvaluation || [], statement: () => "Completed files required source scrutiny, uncertainty or correction." }),
            identificationOfFramingOrBias: buildSkill("Identification of framing or bias", evidence, { ...common, activityIds: skills.framingBias || [], statement: () => "Media and claims tasks provided observable framing and source-evaluation evidence." }),
            comparisonOfCompetingPerspectives: buildSkill("Comparison of competing perspectives", evidence, { ...common, activityIds: skills.competingPerspectives || [], responseFilter: item => item.analysis.competingInterests, statement: () => "Hearing, stakeholder and editorial work required comparison without grading ideology." }),
            counterargument: buildSkill("Counterargument", evidence, { ...common, activityIds: skills.justifiedDecision || [], responseFilter: item => item.analysis.counterargument, sophisticated: (ev, responses) => responses.filter(item => item.analysis.responseToCounterargument).length >= 3, statement: (ev, responses) => `${responses.filter(item => item.analysis.counterargument).length} major responses contained an observable opposing argument structure.` }),
            justifiedDecisionMaking: buildSkill("Justified decision-making", evidence, { ...common, activityIds: skills.justifiedDecision || [], responseFilter: item => item.analysis.position && item.analysis.reasons, statement: () => "Positions are assessed for reasons, evidence and qualification rather than preferred conclusions." }),
            writtenCommunication: buildSkill("Written communication", evidence, { ...common, activityIds: [], minimumLessons: 3, minimumEvidence: 3, responseFilter: () => true, baseScore: ev => clamp(ev.rawMetrics.responseLessonCount / 8), statement: ev => `${ev.rawMetrics.meaningfulWrittenResponses} meaningful responses across ${ev.rawMetrics.responseLessonCount} lessons provided the writing sample.` }),
            wholeUnitSynthesis: buildSkill("Whole-unit synthesis", evidence, { ...common, activityIds: skills.synthesis || [], minimumLessons: 2, sophisticated: ev => ev.rawMetrics.capstoneCompleted.includes("whole-unit-systems-map") && ev.rawMetrics.capstoneCompleted.includes("final-belonging-charter"), statement: ev => `${ev.rawMetrics.capstoneCompleted.length} major capstone components and cross-topic synthesis activities were completed.` }),
            independentDigitalTaskCompletion: buildSkill("Independent digital task completion", evidence, { ...common, activityIds: unique(Object.values(skills).flat()), minimumLessons: 3, baseScore: ev => clamp(ev.rawMetrics.completionConsistency * 0.55 + Math.min(1, ev.rawMetrics.activitiesCompleted / Math.max(1, ev.rawMetrics.lessonsStarted * 5)) * 0.30 + Math.min(1, ev.rawMetrics.meaningfulWrittenResponses / Math.max(1, ev.rawMetrics.lessonsStarted)) * 0.15), statement: ev => `${ev.rawMetrics.activitiesCompleted} activities were completed across ${ev.rawMetrics.lessonsStarted} started lessons.`, limitations: ["Website evidence cannot identify all assistance provided during classroom learning."] })
        };
        return {
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            studentUid: evidence.rawMetrics.studentUid,
            rawEvidence: { lessons: evidence.rawLessons, metrics: evidence.rawMetrics },
            indicators: {
                engagement: buildEngagement(evidence),
                comprehension: buildComprehension(evidence),
                skills: skillIndicators,
                ...buildAdditionalIndicators(evidence)
            },
            modelNotice: "Formative indicators for teacher review; not diagnoses, validated psychological measures or final grades."
        };
    }

    function applyTeacherReview(profile, review) {
        return { profile: clone(profile), teacherReview: clone(review || {}) };
    }

    global.DeborahReportingModel = { aggregateStudentEvidence, buildStudentFormativeProfile, analyseReasoning, analyseVocabulary, applyTeacherReview };
})(window);
