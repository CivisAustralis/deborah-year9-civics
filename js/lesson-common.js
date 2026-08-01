/* ==========================================================
   DEBORAH YEAR 9 CIVICS
   COMMON LESSON ENGINE
========================================================== */

let lessonConfig = {};
let lessonProgress = 0;
let completedActivities = new Set();
let lessonStart = Date.now();
let tabSwitches = 0;
let hiddenStart = null;

/* ==========================================================
   SETUP
========================================================== */

function setupLesson(config){

    lessonConfig = config;

    loadLesson();

    buildNavigation();

    updateProgress();

}

/* ==========================================================
   NAVIGATION
========================================================== */

function buildNavigation(){

    const footer = document.querySelector("footer");

    if(!footer) return;

    footer.innerHTML = `

        <button onclick="goPrevious()">
            ⬅ Previous Lesson
        </button>

        <button onclick="goDashboard()">
            🏠 Dashboard
        </button>

        <button onclick="goNext()">
            Next Lesson ➜
        </button>

    `;

}

function goPrevious(){

    if(lessonConfig.previous){

        saveLesson();

        window.location.href = lessonConfig.previous;

    }

}

function goDashboard(){

    saveLesson();

    window.location.href = "dashboard.html";

}

function goNext(){

    if(lessonConfig.next){

        saveLesson();

        window.location.href = lessonConfig.next;

    }

}

/* ==========================================================
   PROGRESS
========================================================== */

function completeActivity(activityName){

    if(completedActivities.has(activityName)){

        return;

    }

    completedActivities.add(activityName);

    lessonProgress += 20;

    if(lessonProgress > 100){

        lessonProgress = 100;

    }

    updateProgress();

    saveLesson();

}

function updateProgress(){

    const bar = document.getElementById("progressBar");

    if(bar){

        bar.style.width = lessonProgress + "%";

        bar.innerHTML = lessonProgress + "%";

    }

}

/* ==========================================================
   STORAGE
========================================================== */

function saveLesson(){

    const data = {

        progress:lessonProgress,

        completed:true,

        activities:Array.from(completedActivities),

        reflection:
            document.getElementById("reflection") ?
            document.getElementById("reflection").value :
            "",

        exitTicket:
            document.getElementById("exitTicket") ?
            document.getElementById("exitTicket").value :
            "",

        started:lessonStart,

        finished:new Date().toLocaleString(),

        tabSwitches:tabSwitches,

        seconds:
            Math.round(
                (Date.now()-lessonStart)/1000
            )

    };

    localStorage.setItem(

        lessonConfig.lessonId,

        JSON.stringify(data)

    );

}

function loadLesson(){

    const saved =

    localStorage.getItem(

        lessonConfig.lessonId

    );

    if(saved){

        const data = JSON.parse(saved);

        lessonProgress = data.progress || 0;

        completedActivities =

        new Set(data.activities || []);

    }

}

/* ==========================================================
   ACHIEVEMENTS
========================================================== */

function achievement(title,text){

    let popup =

    document.getElementById("achievementPopup");

    if(!popup){

        popup = document.createElement("div");

        popup.id="achievementPopup";

        popup.className="popup";

        document.body.appendChild(popup);

    }

    popup.innerHTML =

    "<h3>🏆 "+title+"</h3><p>"+text+"</p>";

    popup.style.display="block";

    setTimeout(()=>{

        popup.style.display="none";

    },3000);

}

/* ==========================================================
   TAB TRACKING
========================================================== */

document.addEventListener(

"visibilitychange",

()=>{

    if(document.hidden){

        tabSwitches++;

        hiddenStart = Date.now();

    }

    else{

        hiddenStart = null;

    }

});

/* ==========================================================
   LEAVE WARNING
========================================================== */

window.addEventListener(

"beforeunload",

function(){

    saveLesson();

});
