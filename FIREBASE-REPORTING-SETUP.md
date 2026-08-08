# Deborah analytics: Firebase setup

Stage 1 stores evidence locally first and attempts to synchronise authenticated student records to:

`studentProgress/{studentUid}/lessons/{lessonId}`

## Security rules

`firestore.rules` contains a minimal deny-by-default policy for analytics. It permits an authenticated student to read and write only the lesson documents beneath their own UID. An authenticated teacher may read analytics only for active students whose profile is linked to that teacher and a class.

These rules have not been deployed by this repository change. Before deployment, compare them with the currently deployed project rules so existing account-provisioning workflows are not accidentally removed. Deploy through the Firebase project’s controlled administration process only after review.

## Teacher and class relationship

Stage 2 defines authenticated class records at `classes/{classId}` and exact, non-guessable mappings at `classJoinCodes/{joinCode}`. A linked student profile contains `classId`, `teacherUid` and the join code used for the rules-validated update. Join-code listing is denied. A teacher can query only student profiles linked to that teacher and can read only those students’ analytics. Teacher reviews are separate at `teacherReportReviews/{teacherUid}/students/{studentUid}`.

`firestore.indexes.json` defines the teacher-roster query index for `teacherUid`, `classId`, `role` and `active`, plus the teacher-owned active-class query index. Like the rules, this index has not been deployed by this change.

The public login now converts the supplied account code with `accountCodeToAlias()`, establishes browser-session Firebase Authentication using `signInWithEmailAndPassword()`, and validates the matching active `users/{uid}` profile before opening `dashboard.html`. Neither the account code nor password is placed in the URL or browser storage. See `FIREBASE-AUTH-SETUP.md` for trusted manual provisioning.

## Offline behaviour

The browser immediately writes analytics to `deborah.analytics.v1.<lessonId>`. Failed or unauthenticated remote writes leave `remoteSync.pending` set to `true`. Heartbeats, activity completions, focus returns, knowledge checks and later page loads retry synchronisation without blocking lesson work.

## Data limitations

The stored record explicitly notes that focus loss has no known cause, active time is estimated, hidden time is not evidence of misconduct, interactions cannot identify assistance and later automated indicators require teacher review.

## Stage 3 teacher report workflow

`teacher-report.html` calls `waitForAuthenticatedProfile("teacher")`. It loads only teacher-owned `classes` records, linked student profiles, and those students’ nested analytics records. Draft reviews remain separate from raw evidence at `teacherReportReviews/{teacherUid}/students/{studentUid}`. The dashboard reveals the report control only after an authenticated teacher profile is confirmed.

Parent PDFs are generated entirely in the browser by the repository-owned text PDF writer in `js/pdf-report.js`. It creates selectable text without sending report content to a conversion service. The print stylesheet provides a browser Print / Save as PDF fallback. No report is emailed, uploaded, or sent automatically.

The updated rules and both composite indexes still require controlled deployment. Review them alongside the production rules before deployment: the repository rules deliberately deny browser creation of user profiles, because provisioning belongs in Firebase Console or a trusted Admin SDK process.

Select the Firebase project `deborah-year9-civics` and authenticate the Firebase CLI with the project owner’s or delegated administrator’s credentials. From this repository run:

```sh
firebase use deborah-year9-civics
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Alternatively, paste the reviewed `firestore.rules` into **Firebase Console → Firestore Database → Rules**, publish it, then create the composite indexes described by `firestore.indexes.json` under **Firestore Database → Indexes**. Deployment was not performed by this repository change and requires authorised project credentials.
