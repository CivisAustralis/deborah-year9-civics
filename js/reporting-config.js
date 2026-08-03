(function (global) {
    "use strict";

    const shared = ["reflection", "exitTicket"];
    const fields = {
        week1lesson1: [],
        week1lesson2: ["cause-reflection", "decision-reflection", "exit-answer"],
        week1lesson3: ["student-reflection"],
        week1lesson4: ["final-response"],
        week2lesson1: ["priorityReason", ...shared],
        week2lesson2: ["briefingReason", ...shared],
        week2lesson3: ["amendmentReason", ...shared],
        week2lesson4: ["publicSubmission", "synthesisReason", ...shared],
        week3lesson1: shared,
        week3lesson2: shared,
        week3lesson3: shared,
        week3lesson4: ["policyRecommendation", ...shared],
        week4lesson1: ["countAnalysis", "hearingSynthesis", "governmentReason", "electionBrief", ...shared],
        week4lesson2: ["strategyCombination", "mediaSynthesis", "powerSynthesis", "hearingSequence", "influenceBrief", ...shared],
        week5lesson1: ["counterHeadline", "counterOpening", "boardRationale", "nationalPortraitBrief", ...shared],
        week5lesson2: ["stressPlan", "belongingCharter", "systemsSynthesis", ...shared]
    };

    const vocabularyGroups = {
        constitutionalSystems: ["Constitution", "federalism", "separation of powers", "responsible government", "executive government", "accountability"],
        parliamentAndLawMaking: ["Parliament", "Cabinet", "law-making", "scrutiny", "representation", "Bill", "Act"],
        courtsAndJustice: ["court", "justice", "jurisdiction", "appeal", "precedent", "criminal law", "civil law", "rule of law"],
        participationAndElections: ["election", "preferential voting", "participation", "interest group", "advocacy", "majority rule", "minority rights"],
        mediaAndInfluence: ["media", "framing", "stereotype", "transparency", "evidence", "accountability"],
        identityDiversityAndBelonging: ["civic identity", "cultural identity", "pluralism", "social cohesion", "assimilation", "uniformity", "equity", "substantive equality", "non-discrimination", "freedom of conscience"]
    };

    global.DEBORAH_REPORTING_CONFIG = Object.freeze({
        schemaVersion: 1,
        heartbeatMs: 5000,
        idleThresholdMs: 90000,
        interactionThrottleMs: 1500,
        scrollThrottleMs: 10000,
        minimumMeaningfulCharacters: 20,
        substantialRevisionCharacters: 20,
        reportFields: fields,
        vocabularyGroups,
        vocabulary: Array.from(new Set(Object.values(vocabularyGroups).flat().concat([
            "citizenship", "cohesion", "compromise", "deliberation", "democracy", "discrimination",
            "rights and responsibilities"
        ]))),
        formativeModel: {
            minimumStartedLessons: 3,
            minimumKnowledgeChecks: 3,
            minimumWrittenResponses: 3,
            confidence: { moderateLessons: 3, highLessons: 8 },
            engagementWeights: {
                completionConsistency: 0.30,
                activeLearningTime: 0.20,
                substantiveResponses: 0.15,
                persistenceAndRevision: 0.15,
                meaningfulInteractions: 0.10,
                focusContinuity: 0.10
            },
            engagementBands: { sustained: 0.80, generallyConsistent: 0.62, variable: 0.42 },
            learningBands: { sophisticated: 0.82, secure: 0.65, developing: 0.45 },
            majorReasoningFields: ["policyRecommendation", "electionBrief", "influenceBrief", "nationalPortraitBrief", "belongingCharter", "systemsSynthesis", "reflection"],
            capstoneActivities: ["national-portrait-brief", "final-belonging-charter", "whole-unit-systems-map"],
            metacognitionActivities: ["justice-principles-reflection", "representation-reflection", "influence-reflection", "identity-reflection", "belonging-reflection"],
            skillActivities: {
                application: ["who-should-act", "representation-lens", "route-the-case", "criminal-civil-or-both", "banksia-preference-count", "civic-dilemma-tribunal"],
                evidenceEvaluation: ["committee-evidence-list", "complete-evidence-brief", "campaign-claims-monitor", "stakeholder-dossiers", "social-media-verification", "representation-audit", "social-cohesion-stress-test"],
                framingBias: ["media-evidence-desk", "campaign-claims-monitor", "media-framing-desk", "social-media-verification", "representation-audit", "counterframe-workshop"],
                competingPerspectives: ["representation-hearing", "stakeholder-dossiers", "public-consultation-hearing", "national-editorial-board", "community-voice-archive", "dialogue-laboratory"],
                justifiedDecision: ["second-look-briefing", "justice-policy-recommendation", "electoral-integrity-finding", "final-influence-brief", "national-portrait-brief", "final-belonging-charter"],
                synthesis: ["week-two-synthesis", "government-formation-brief", "consultation-deliberation-board", "national-editorial-board", "whole-unit-systems-map"]
            }
        }
    });
})(window);
