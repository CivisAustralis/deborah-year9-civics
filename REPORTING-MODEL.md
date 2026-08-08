# Deborah formative reporting model — Stage 2

## Status and purpose

This model aggregates the versioned Stage 1 records from all 16 Deborah lessons and produces transparent formative indicators for teacher review. It does not diagnose attention, intelligence, motivation or any psychological trait. It does not generate a final grade. The thresholds are **formative design settings, not validated psychological measures**.

Raw lesson analytics remain separate from calculated indicators. Teacher amendments are stored as separate review records and never replace student evidence.

## Evidence inventory

`aggregateStudentEvidence(records)` retains the raw lesson documents and derives totals for lessons available, started and completed; activity completions; sessions; open, active, idle and hidden time; focus-loss events; returns; knowledge attempts and improvement; responses and revisions; vocabulary; completion consistency; early-versus-late evidence; and capstone completion.

No missing lesson evidence is invented. A missing check, response or capstone remains absent evidence.

## Confidence and insufficient evidence

Every indicator returns a band, descriptor, evidence summary, evidence statements, confidence, supporting lesson IDs, underlying metrics and limitations.

Confidence uses both breadth and evidence-type diversity:

* **Low:** fewer than three supporting lessons, or only one evidence type.
* **Moderate:** at least three supporting lessons and at least two evidence types.
* **High:** at least eight supporting lessons and at least three evidence types.

An indicator returns **Insufficient evidence** when its minimum evidence gate is not met. In particular, engagement normally requires three started lessons and some substantive work; comprehension and civic/legal knowledge require three completed knowledge checks; most skills require evidence in two lessons; and written communication normally requires three lessons. Insufficient evidence is not converted to Emerging.

## Engagement

Parent-facing bands are Sustained, Generally consistent, Variable, Limited evidence of sustained engagement and Insufficient evidence.

The configurable weighted model is:

| Component | Weight |
| --- | ---: |
| Lesson completion consistency | 30% |
| Active learning time, capped at 20 minutes per started lesson | 20% |
| Substantive registered responses | 15% |
| Persistence, improvement and revision signals | 15% |
| Throttled meaningful interactions | 10% |
| Focus continuity | 10% |

Thresholds are 0.80 Sustained, 0.62 Generally consistent and 0.42 Variable. A lower score with sufficient evidence becomes Limited evidence of sustained engagement.

Focus continuity can contribute no more than 10%. The report states the number and combined duration neutrally: “The learning page lost focus…” Focus loss cannot establish why focus changed and is never described as misconduct or being “off task”. Prompt returns, completed work, successful persistence and substantive responses can support a positive engagement profile despite frequent brief interruptions.

## Comprehension

Bands are Emerging, Developing, Secure, Sophisticated and Insufficient evidence. The calculation combines latest normalised knowledge checks (55%), applied activities (20%) and observable major-response reasoning structures (25%). Thresholds are 0.45 Developing, 0.65 Secure and 0.82 Sophisticated.

Sophisticated is gated: strong multiple-choice results are insufficient. It additionally requires substantial applied reasoning and a completed capstone component. The model does not grade the ideology or policy position adopted.

## Skill indicators

The model separately reports:

1. Civic and legal knowledge
2. Application of concepts
3. Evidence evaluation
4. Identification of framing or bias
5. Comparison of competing perspectives
6. Counterargument
7. Justified decision-making
8. Written communication
9. Whole-unit synthesis
10. Independent digital task completion

Each uses activity IDs registered in `reporting-config.js`, relevant major response structures and the same four learning bands plus Insufficient evidence. Each returns supporting lesson IDs and its metrics. Independent digital task completion always carries this limitation: “Website evidence cannot identify all assistance provided during classroom learning.” It is never labelled independent learning ability.

The default skill calculation assigns 55% to completion coverage of the registered relevant activities and 45% to observable major-response reasoning structures. Independent digital task completion instead uses 55% lesson completion consistency, 30% completed-activity density capped at five activities per started lesson and 15% meaningful-response coverage. Civic and legal knowledge uses latest normalised check performance directly and cannot receive Sophisticated from selected-response evidence alone.

## Reasoning and counterargument

Major student-created fields are checked for observable structures: a position or finding; connected reasons; references to evidence; taught civic concepts; competing interests; consequences; counterargument; response to that counterargument; and a qualified conclusion. Several sentences and connected structures are required; length or isolated keywords alone do not determine a band.

This is a review aid. It cannot guarantee factual or semantic correctness, and a defensible conclusion can differ from a teacher’s preferred conclusion.

## Observed vocabulary sophistication

The vocabulary registry is grouped into constitutional systems; Parliament and law-making; courts and justice; participation and elections; media and influence; and identity, diversity and belonging.

Only registered student-created fields are analysed. A term is counted contextually only when found in a sentence of at least five words. The model records distinct terms, topic-group range, lesson range, repeated contextual use, early/late use and reviewable examples.

Secure requires breadth across at least three topic groups and three lessons. Sophisticated requires at least 14 terms, five groups, six lessons and repeated contextual use of at least four terms. A repeated list of terms or a long unusual word is not rewarded. The label is **Observed vocabulary sophistication**, and semantic accuracy remains for teacher review.

The vocabulary score uses 35% distinct-term breadth capped at 16 terms, 30% topic-group breadth capped at six groups, 20% contextual lesson breadth capped at eight lessons and 15% repeated contextual terms capped at six terms.

## Persistence, self-correction, transfer and metacognition

* **Persistence:** returns after interruption, knowledge retries, later completion, improvement and substantial revision. Multiple attempts are not treated automatically as weakness.
* **Self-correction:** observable score improvement or substantial revisions. The system does not infer why the change occurred.
* **Transfer of learning:** synthesis activities connecting weekly topics, with Week 5 systems-map and charter evidence weighted as capstone evidence.
* **Metacognition:** original-versus-revised or reflective responses that explain why a position was changed, retained or made more precise. Changing is not inherently better than retaining.
* **Critical reasoning:** the structural reasoning features described above, independent of ideology.

Persistence scales the combined count of improving retry sequences, substantial revisions and up to three recorded returns against eight signals. Self-correction scales improving sequences plus revisions against six. Metacognition scales qualifying comparative reflections against five. Transfer uses 60% synthesis-lesson breadth capped at four and 40% completion of the three registered capstone activities. These settings are deliberately simple and visible for later recalibration.

## Teacher review and overrides

Teacher reviews are stored separately at:

`teacherReportReviews/{teacherUid}/students/{studentUid}`

The record can retain or replace a generated band, edit an evidence statement, provide a reason, mark an indicator not reported and add classroom context. `applyTeacherReview` returns calculated evidence and review data side by side; it does not mutate raw evidence.

## Class relationship and privacy

Classes use `classes/{classId}` and non-guessable mappings at `classJoinCodes/{joinCode}`. Students link their own protected profile through an exact join-code document. Join-code listing is denied. Teachers can query only profiles whose `teacherUid` equals their authenticated UID, and rules permit access to analytics and review records only for linked students.

The current public code-based login does not establish Firebase Authentication. The class APIs and rules are ready for an authenticated flow, but no insecure unauthenticated class UI is provided in Stage 2.

## Known limitations

* Active and idle time are estimates.
* Focus loss has no observable cause and is not proof of misconduct.
* Website data cannot identify classroom assistance, discussion or offline work.
* Structural writing signals cannot prove factual or semantic accuracy.
* Missing digital work may reflect absence, technical problems or work completed elsewhere.
* Thresholds have not been validated as psychometric measures.

## Recalibration

Before parent-facing use, teachers should review synthetic tests and a consented sample of classroom work. Compare generated descriptors with blinded teacher judgements, examine inconsistent cases, document threshold changes, test for systematic disadvantage and version every configuration change. Recalibration must preserve insufficient-evidence gates and the minor maximum influence of focus continuity.
