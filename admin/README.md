# Deborah bulk student provisioner

This directory contains a **local administrator tool**. It does not run on GitHub Pages and is not imported by the student website. It uses the Firebase Admin SDK to create Firebase Authentication users and matching Firestore `users/{uid}` profiles.

The committed CSV is deliberately fake. Never add a real roster or generated credentials to Git.

## 1. Prerequisites

* Node.js 20 or newer (`node --version`).
* Owner or appropriately delegated administrator access to Firebase project `deborah-year9-civics`.
* Firebase Email/Password Authentication already enabled.
* The active teacher profile and the required classes already created in Deborah. The provisioner does not create classes.
* Application Default Credentials with permission to manage Firebase Authentication and Firestore.

## 2. Install the isolated admin dependency

From this directory:

```sh
cd admin
npm install
```

`firebase-admin` is the only runtime dependency. `admin/node_modules/` is ignored and nothing is added to the public website build.

## 3. Configure Firebase Admin credentials safely

Preferred options are Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`:

```sh
gcloud auth application-default login
```

or:

```sh
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/outside/the/repository/service-account.json"
```

Keep the credential file **outside this repository**. Never copy a service-account JSON file into `admin/`, commit it, email it with a roster, or paste its contents into an issue. The root `.gitignore` provides additional protection, but ignore rules are not a substitute for secure storage.

The tool refuses a `--project` value other than `deborah-year9-civics`. Credentials still need access to that project.

## 4. Prepare the private roster

Copy the fake shape, not its example data:

```sh
mkdir -p private
cp students-template.csv private/students-2026.csv
```

The private file must use exactly:

```csv
accountCode,displayName,className,existing
SAMPLE01,Example Student,9A,false
SAMPLE02,Existing Example,9B,true
```

Replace the examples locally with the approved private roster. Valid student codes are case-insensitive input matching `S` plus 5–19 letters or digits. `existing=true` means the Authentication user must already exist and its password must be preserved.

The tool validates the complete CSV before applying filters or accessing Firebase. It rejects malformed rows, duplicate account codes, duplicate display names within a class, invalid codes, and classes other than 9A, 9B, and 9C.

## 5. Run a dry run first

Dry run is the default and performs Firebase reads only:

```sh
node provision-students.mjs --roster private/students-2026.csv
```

Review:

* the resolved active teacher;
* the one-and-only-one active 9A, 9B, and 9C class;
* create, repair, update, and unchanged actions;
* class totals;
* every account code, display name, and destination class;
* all warnings or identity conflicts.

Any missing/duplicate teacher or class, Authentication alias conflict, UID mismatch, or incompatible profile aborts preflight. An apply run performs zero writes when preflight fails.

## 6. Test one student or class

Filters retain dry-run behaviour:

```sh
node provision-students.mjs --roster private/students-2026.csv --account STEST01
node provision-students.mjs --roster private/students-2026.csv --class 9A
```

Even with a filter, the complete CSV is structurally validated and all three required classes are resolved. Test a single new student before a full apply.

## 7. Apply deliberately

Apply requires both `--apply` and a one-command confirmation environment variable:

```sh
DEBORAH_PROVISION_CONFIRM=APPLY node provision-students.mjs \
  --roster private/students-2026.csv \
  --apply
```

The tool creates each new Authentication alias, then writes `users/{firebaseAuthUid}` with canonical uppercase `accountCode`, assigned `displayName`, `role: student`, `active: true`, `classId`, and `teacherUid`. It never writes `classJoinCode` or a password to Firestore.

Generated passwords are unique, cryptographically random, at least 12 characters, and omitted from ordinary console status output.

## 8. Existing users and safe reruns

For any existing alias, the tool preserves the Authentication UID and password. It verifies the Firestore identity, then updates only the expected student profile fields and direct class link. Credential output says `EXISTING ACCOUNT — PASSWORD UNCHANGED` and leaves its password column blank.

A rerun looks up aliases before creating users, so it does not duplicate Authentication accounts. A missing profile for an existing Authentication user is planned as `REPAIR`.

Authentication creation and Firestore writes are not atomic. If Authentication succeeds but the profile write fails, the tool:

* does not delete the Authentication user;
* reports the account code and UID;
* retains the newly generated password in the private credential output for that interrupted run;
* allows the next run to detect the user and repair the missing profile.

Investigate every `ERROR` before rerunning. The tool never deletes users automatically.

## 9. Private credential output

An apply run writes both files under ignored `admin/output/`:

* `student-credentials-<timestamp>.csv`
* `student-credentials-<timestamp>.html`

The HTML groups credentials by class for printing. Files and directory are created with restrictive local permissions where the operating system supports them. Nothing is emailed or uploaded automatically.

Check Git before and after every run:

```sh
git status --short --ignored
```

No roster, service-account file, credential CSV, credential HTML, or password should be staged.

## 10. Confirm in Deborah

1. Sign in as the teacher.
2. Confirm the expected linked-student count for each class.
3. Sign in with one newly issued test credential.
4. Confirm the student dashboard already shows the class as linked and does not request a join code.
5. Complete a small lesson activity and confirm its analytics synchronise.
6. Confirm the linked student is available in the teacher report interface.

## 11. Destroy private data when finished

After securely distributing and testing credentials, delete the generated CSV/HTML and any unnecessary local roster copies according to the school’s records policy:

```sh
rm -f output/student-credentials-*.csv output/student-credentials-*.html
```

Securely remove exported service-account credentials from the workstation when they are no longer required. Disabling or deleting the credential in Google Cloud/Firebase is stronger than deleting only the local file.

## Automated tests

Tests use an in-memory mock adapter and never contact Firebase:

```sh
npm test
```
