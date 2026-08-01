/* ==========================================================
   DEBORAH CIVICS COURSE - SITE CONFIGURATION
   ========================================================== */

const SITE_CONFIG = {

    /* Course identity */
    courseName:     "Year 9 Civics & Citizenship",
    courseId:       "deborah-year9-civics",
    version:        "2.0.0",

    /* Core pages */
    dashboard:      "dashboard.html",
    teacherReport:  "teacher-report.html",
    login:          "index.html",

    /* Image paths */
    images: {
        favicon:        "images/bee-favicon-192.png",
        deborah:        "images/bee_static_alpha_512.png",
        sausage:        "images/sausage_suit_pants_alpha_512.png",
        prawn:          "images/prawn_static_alpha.png"
    },

    /* Theme colours (blue/Arial standard lesson theme) */
    theme: {
        primary:        "#A2D2FF",
        accent:         "#1976D2",
        accentHover:    "#125AA3",
        background:     "#E5F0FA",
        card:           "#BDE0FE",
        text:           "#222222"
    },

    /* Lesson defaults */
    defaults: {
        progressStart:          5,
        progressPerActivity:    20,
        maxProgress:            100,
        autoSaveIntervalMs:     30000
    }

};
