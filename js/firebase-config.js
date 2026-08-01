import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC2OBXOYWQpvDqGvkVHSHM13Q8hlD7BFb0",
    authDomain: "deborah-year9-civics.firebaseapp.com",
    projectId: "deborah-year9-civics",
    storageBucket: "deborah-year9-civics.firebasestorage.app",
    messagingSenderId: "781102480070",
    appId: "1:781102480070:web:2b3d01373d0381c973f5c7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
