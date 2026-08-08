# Firebase Authentication setup for Deborah

Deborah now uses Firebase Authentication while keeping account codes as the visible username. Account creation is an administrator task: the public website does not create Authentication users or `users/{uid}` profiles.

## Before you begin

You need owner or appropriately delegated access to the Firebase project **`deborah-year9-civics`**. Never commit passwords, service-account keys, refresh tokens, or screenshots containing credentials.

In Firebase Console, open **Authentication → Sign-in method** and enable **Email/Password**. The website converts an account code to a private alias email. For example, an administrator provisioning the fictional code `SAMPLE123` would use `sample123@accounts.invalid`. Users still type only their account code and password on Deborah.

## Provision the first teacher

1. Choose a unique code beginning with `T`, followed by 5–19 letters or digits. Record it in the organisation’s secure account register.
2. Convert it to lowercase and add `@accounts.invalid`.
3. Open **Authentication → Users → Add user**.
4. Enter the alias email and a strong, independently generated temporary password. The password must not be the account code.
5. Copy the new Authentication UID.
6. Open **Firestore Database → Data** and create `users/{uid}` using that exact UID as the document ID.
7. Add these fields:
   - `accountCode` (string): the uppercase code;
   - `role` (string): `teacher`;
   - `active` (boolean): `true`;
   - `displayName` (string): the name or title that should appear in Deborah.
8. Give the code and temporary password to the teacher through an approved private channel. Do not put the password in this repository.
9. Test the account in a private browser session. Confirm that the dashboard shows class controls and the teacher report link.

## Provision a test student

Repeat the process with a unique code beginning with `S`. In the Firestore profile use `role: student` and `active: true`. Do not add `classId` or `teacherUid` manually for a new unlinked student; the student will use the class join-code workflow.

Test that the student sees lesson navigation and the class-joining form, but no teacher controls. Existing local lesson evidence on that browser remains local and is synchronised after authentication.

## Create and join a class

1. The authenticated teacher enters a class name on the dashboard and selects **Create Class**.
2. Deborah creates `classes/{classId}` and a non-guessable exact lookup at `classJoinCodes/{joinCode}`.
3. The teacher gives the displayed join code privately to the intended students.
4. The authenticated student enters the code and confirms joining.
5. Firestore rules validate the code and add `classId` and `teacherUid` to the student profile.
6. A linked student cannot silently move to another class. Reassignment requires a trusted administrator to review and update the profile, or a future teacher-controlled workflow.

## Disable or repair an account

Set `users/{uid}.active` to `false` to block the profile after its current session is revalidated. Disable the corresponding Authentication user as well. If an alias or account code is wrong, correct both the Authentication email and Firestore `accountCode`; they must match after normalisation.

## Production provisioning

For more than a few accounts, use a reviewed Admin SDK script or an approved identity-management process running in a trusted environment. The Admin SDK credential must never be shipped to the browser or committed. The browser intentionally has no Create Teacher or Create Student function.
