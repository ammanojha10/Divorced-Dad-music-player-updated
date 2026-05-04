/* ================================================================
   DIVORCED DAD MUSIC — script.js
   Vanilla JS music player using the Web Audio API.

   CONTENTS:
   1.  Song loading      — songs.json manifest (hostable anywhere)
   2.  Utility helpers   — getsongname, formattime, showToast
   3.  Song metadata     — artist / album lookup table
   4.  Playlist data     — built-in + custom (localStorage)
   5.  Audio engine      — gain → compressor → 5-band EQ → analyser
   6.  Ear visualiser    — requestAnimationFrame + frequency data
   7.  Canvas visualiser — frequency bars behind playlist grid
   8.  Load song helper  — single source of truth for song changes
   9.  Nav history       — browser-style back / forward stack
   10. Draggable panels  — fixed position-jump bug
   11. EQ preset system  — lerp animation
   12. Main              — all event wiring
       a. Playback events
       b. Seekbar
       c. Play / Pause
       d. Prev / Next / Shuffle / Repeat
       e. Library sidebar
       f. Volume (localStorage persistence + mute toggle)
       g. Playlist navigation + Back button in playlist view
       h. Custom playlist modal (validates empty selection)
       i. Hamburger
       j. Keyboard shortcuts
       k. EQ panel
       l. Login / Sign up modal
       m. Marquee for long song titles
       n. Search
================================================================ */


/* ================================================================
   1. SONG LOADING
   Reads songs.json instead of scraping a directory listing.
   Makes the project hostable on Netlify, GitHub Pages, Vercel etc.
   Falls back to old directory scraping if songs.json is missing.
================================================================ */
async function getsongs() {
    try {
        const res   = await fetch("./songs.json");
        const names = await res.json();
        return names.map(name => `./song/${encodeURIComponent(name)}`);
    } catch {
        // Fallback: try old directory scraping
        try {
            const res  = await fetch("./song/");
            const text = await res.text();
            const div  = document.createElement("div");
            div.innerHTML = text;
            return [...div.getElementsByTagName("a")]
                .filter(a => a.href.endsWith(".mp3"))
                .map(a => a.href);
        } catch (err) {
            console.error("Could not load songs:", err);
            return [];
        }
    }
}


/* ================================================================
   2. UTILITY HELPERS
================================================================ */

const filenameDisplayOverrides = {
    "What's My Age Again_": "What's My Age Again?",
    "Would_ (2022 Remaster)": "Would? (2022 Remaster)"
};

/** Extracts a display name from a song URL. */
function getsongname(url) {
    const parts    = url.split("/");
    const filename = parts[parts.length - 1];
    const basename = decodeURIComponent(filename.replace(".mp3", ""));
    return filenameDisplayOverrides[basename] || basename;
}

/** Converts seconds to "M:SS". Returns "0:00" for NaN. */
function formattime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Shows a brief toast notification (styled via CSS .toast class). */
function showToast(message) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    const toast       = document.createElement("div");
    toast.className   = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("toast-show")));

    setTimeout(() => {
        toast.classList.remove("toast-show");
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

let uiAudioCtx = null;

/** Plays a short mechanical click/beep sound. */
function playUISound(type = "click") {
    if (!uiAudioCtx) {
        uiAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (uiAudioCtx.state === "suspended") uiAudioCtx.resume();

    const osc  = uiAudioCtx.createOscillator();
    const gain = uiAudioCtx.createGain();

    osc.connect(gain);
    gain.connect(uiAudioCtx.destination);

    const now = uiAudioCtx.currentTime;

    if (type === "click") {
        osc.type = "square";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === "beep") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === "toggle") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    }
}


/* ================================================================
   3. SONG METADATA — artist + album by display name
================================================================ */
const songMetadata = {
    "Absolutely (Story of a Girl) - Radio Mix": { artist: "Nine Days",              album: "The Madding Crowd" },
    "Ain't No Rest for the Wicked":             { artist: "Cage the Elephant",      album: "Cage the Elephant" },
    "All I Want":                               { artist: "Kodaline",               album: "In a Perfect World" },
    "All The Small Things":                     { artist: "Blink-182",              album: "Enema of the State" },
    "American Idiot":                           { artist: "Green Day",              album: "American Idiot" },
    "Are You Gonna Be My Girl":                 { artist: "Jet",                    album: "Get Born" },
    "Around the Fur":                           { artist: "Deftones",               album: "Around the Fur" },
    "Bad Day":                                  { artist: "Daniel Powter",          album: "Daniel Powter" },
    "Basket Case":                              { artist: "Green Day",              album: "Dookie" },
    "Between Angels And Insects":               { artist: "Papa Roach",             album: "Infest" },
    "Beverly Hills":                            { artist: "Weezer",                 album: "Make Believe" },
    "Black Hole Sun":                           { artist: "Soundgarden",            album: "Superunknown" },
    "Brain Stew":                               { artist: "Green Day",              album: "Insomniac" },
    "Breaking the Habit":                       { artist: "Linkin Park",            album: "Meteora" },
    "Breed":                                    { artist: "Nirvana",                album: "Nevermind" },
    "Bullet With Butterfly Wings - Remastered 2012": { artist: "Smashing Pumpkins", album: "Mellon Collie and the Infinite Sadness" },
    "By Myself":                                { artist: "Linkin Park",            album: "Hybrid Theory" },
    "Chic 'N' Stu":                             { artist: "System of a Down",       album: "Toxicity" },
    "Closing Time":                             { artist: "Semisonic",              album: "Feeling Strangely Fine" },
    "Cowboys from Hell":                        { artist: "Pantera",                album: "Cowboys from Hell" },
    "Crawling":                                 { artist: "Linkin Park",            album: "Hybrid Theory" },
    "Dance, Dance":                             { artist: "Fall Out Boy",           album: "From Under the Cork Tree" },
    "Diamond Eyes":                             { artist: "Deftones",               album: "Diamond Eyes" },
    "Dirty Little Secret":                      { artist: "The All-American Rejects", album: "Move Along" },
    "Don't Stay":                               { artist: "Linkin Park",            album: "Meteora" },
    "Drive":                                    { artist: "Incubus",                album: "Make Yourself" },
    "Duality":                                  { artist: "Slipknot",               album: "Vol. 3: The Subliminal Verses" },
    "Even Flow":                                { artist: "Pearl Jam",              album: "Ten" },
    "Everlong":                                 { artist: "Foo Fighters",           album: "The Colour and the Shape" },
    "Faint":                                    { artist: "Linkin Park",            album: "Meteora" },
    "Figure.09":                                { artist: "Linkin Park",            album: "Meteora" },
    "Fine Again":                               { artist: "Seether",                album: "Disclaimer" },
    "Friday I'm in Love":                       { artist: "The Cure",               album: "Wish" },
    "Gives You Hell":                           { artist: "The All-American Rejects", album: "When the World Comes Down" },
    "Heart-Shaped Box":                         { artist: "Nirvana",                album: "In Utero" },
    "Here Without You":                         { artist: "3 Doors Down",           album: "Away from the Sun" },
    "Higher":                                   { artist: "Creed",                  album: "Human Clay" },
    "Holy Wars...The Punishment Due - 2004 Remix": { artist: "Megadeth",            album: "Rust in Peace" },
    "I Miss You":                               { artist: "Blink-182",              album: "Blink-182" },
    "In Bloom":                                 { artist: "Nirvana",                album: "Nevermind" },
    "In Too Deep":                              { artist: "Sum 41",                 album: "All Killer No Filler" },
    "Iron Man - 2009 Remaster":                 { artist: "Black Sabbath",          album: "Paranoid" },
    "It's Been Awhile":                         { artist: "Staind",                 album: "Break the Cycle" },
    "It's The End Of The World As We Know It (And I Feel Fine)": { artist: "R.E.M.", album: "Document" },
    "Living Dead Girl":                         { artist: "Rob Zombie",             album: "American Made Music to Strip By" },
    "Lose Yourself - From _8 Mile_ Soundtrack": { artist: "Eminem",                album: "8 Mile Soundtrack" },
    "Loser":                                    { artist: "Beck",                   album: "Mellow Gold" },
    "Lost In Hollywood":                        { artist: "System of a Down",       album: "Mezmerize" },
    "Lying from You":                           { artist: "Linkin Park",            album: "Meteora" },
    "Man in the Box":                           { artist: "Alice in Chains",        album: "Facelift" },
    "Mascara":                                  { artist: "Killing Heidi",          album: "Reflector" },
    "Master Of Puppets":                        { artist: "Metallica",              album: "Master of Puppets" },
    "Move Along":                               { artist: "The All-American Rejects", album: "Move Along" },
    "Mr. Brightside":                           { artist: "The Killers",            album: "Hot Fuss" },
    "My Curse":                                 { artist: "Killswitch Engage",      album: "As Daylight Dies" },
    "My Hero":                                  { artist: "Foo Fighters",           album: "The Colour and the Shape" },
    "My Iron Lung":                             { artist: "Radiohead",              album: "The Bends" },
    "My Own Summer (Shove It)":                 { artist: "Deftones",               album: "Around the Fur" },
    "My Own Worst Enemy":                       { artist: "Lit",                    album: "A Place in the Sun" },
    "Nutshell":                                 { artist: "Alice in Chains",        album: "Jar of Flies" },
    "Paralyzer":                                { artist: "Finger Eleven",          album: "Them vs. You vs. Me" },
    "Passenger":                                { artist: "Iggy Pop",               album: "Lust for Life" },
    "Points of Authority":                      { artist: "Linkin Park",            album: "Hybrid Theory" },
    "Psycho":                                   { artist: "System of a Down",       album: "Mezmerize" },
    "Rape Me":                                  { artist: "Nirvana",                album: "In Utero" },
    "Revenga":                                  { artist: "System of a Down",       album: "Mezmerize" },
    "Sad Statue":                               { artist: "System of a Down",       album: "Mezmerize" },
    "Scotty Doesn't Know":                      { artist: "Lustra",                 album: "Eurotrip Soundtrack" },
    "Semi-Charmed Life":                        { artist: "Third Eye Blind",        album: "Third Eye Blind" },
    "Seven Nation Army":                        { artist: "The White Stripes",      album: "Elephant" },
    "She Hates Me":                             { artist: "Puddle of Mudd",         album: "Come Clean" },
    "Somebody Told Me":                         { artist: "The Killers",            album: "Hot Fuss" },
    "Somewhere I Belong":                       { artist: "Linkin Park",            album: "Meteora" },
    "Stacy's Mom":                              { artist: "Fountains of Wayne",     album: "Welcome Interstate Managers" },
    "Sugar, We're Goin Down":                   { artist: "Fall Out Boy",           album: "From Under the Cork Tree" },
    "Suite-Pee":                                { artist: "System of a Down",       album: "System of a Down" },
    "Sweetness":                                { artist: "Jimmy Eat World",        album: "Bleed American" },
    "Take Me Out":                              { artist: "Franz Ferdinand",        album: "Franz Ferdinand" },
    "The Anthem":                               { artist: "Good Charlotte",         album: "The Young & the Hopeless" },
    "The Blister Exists":                       { artist: "Slipknot",               album: "Vol. 3: The Subliminal Verses" },
    "The Diary of Jane - Single Version":       { artist: "Breaking Benjamin",      album: "Phobia" },
    "The Great Escape":                         { artist: "Boys Like Girls",        album: "Boys Like Girls" },
    "The Pretender":                            { artist: "Foo Fighters",           album: "Echoes, Silence, Patience & Grace" },
    "The Rock Show":                            { artist: "Blink-182",              album: "Take Off Your Pants and Jacket" },
    "Thnks fr th Mmrs":                         { artist: "Fall Out Boy",           album: "Infinity on High" },
    "Tornado Of Souls - 2004 Remix":            { artist: "Megadeth",               album: "Rust in Peace" },
    "Want You Bad":                             { artist: "The Offspring",          album: "Conspiracy of One" },
    "Welcome to Paradise":                      { artist: "Green Day",              album: "Dookie" },
    "What's My Age Again?":                     { artist: "Blink-182",              album: "Enema of the State" },
    "When I Come Around":                       { artist: "Green Day",              album: "Dookie" },
    "Wonderwall (Remastered)":                  { artist: "Oasis",                  album: "(What's the Story) Morning Glory?" },
    "Would? (2022 Remaster)":                   { artist: "Alice in Chains",        album: "Dirt" },
    "You Know You're Right":                    { artist: "Nirvana",                album: "Nirvana" },
};

function updateMetadata(songname) {
    const meta = songMetadata[songname];
    document.querySelector(".songartist").textContent = meta ? meta.artist : "Unknown Artist";
    document.querySelector(".songalbum").textContent  = meta ? meta.album  : "Unknown Album";
}


/* ================================================================
   4. PLAYLIST DATA
================================================================ */
const playlistData = {
    "One Last Cigg": {
        desc: "One last smoke before the drive back.",
        songs: ["Nutshell","Everlong","Drive","Here Without You","Fine Again","It's Been Awhile","Closing Time","Wonderwall (Remastered)","Black Hole Sun","My Iron Lung","Passenger","All I Want","She Hates Me","My Own Worst Enemy"]
    },
    "Truck & Tears": {
        desc: "Windows down, volume up, nobody watching.",
        songs: ["Mr. Brightside","Semi-Charmed Life","Friday I'm in Love","Sugar, We're Goin Down","Absolutely (Story of a Girl) - Radio Mix","The Great Escape","Gives You Hell","Move Along","Bad Day","Sweetness","Take Me Out","Dirty Little Secret","Somebody Told Me","She Hates Me"]
    },
    "Every Other Weekend": {
        desc: "48 hours, two kids, and a lot of frozen pizza.",
        songs: ["All The Small Things","What's My Age Again?","The Rock Show","I Miss You","Stacy's Mom","Scotty Doesn't Know","American Idiot","In Too Deep","The Anthem","Dance, Dance","Thnks fr th Mmrs","The Diary of Jane - Single Version","Ain't No Rest for the Wicked","Beverly Hills","Brain Stew","Basket Case","When I Come Around","Welcome to Paradise","Want You Bad","My Own Worst Enemy"]
    },
    "Parking Lot Prayers": {
        desc: "Sitting outside the house you used to live in.",
        songs: ["Heart-Shaped Box","Breed","In Bloom","You Know You're Right","Bullet With Butterfly Wings - Remastered 2012","Man in the Box","Would? (2022 Remaster)","Even Flow","Loser","Rape Me","It's The End Of The World As We Know It (And I Feel Fine)","Mascara","Sad Statue","Living Dead Girl","Paralyzer"]
    },
    "Grill & Chill": {
        desc: "Just a man, some coals, and questionable life choices.",
        songs: ["Master Of Puppets","Iron Man - 2009 Remaster","Holy Wars...The Punishment Due - 2004 Remix","Tornado Of Souls - 2004 Remix","Cowboys from Hell","Duality","The Blister Exists","Around the Fur","Seven Nation Army","Are You Gonna Be My Girl","The Pretender","My Hero","Somewhere I Belong","Crawling","Breaking the Habit","Higher","Psycho","My Own Summer (Shove It)","Diamond Eyes","Lose Yourself - From _8 Mile_ Soundtrack","Faint","By Myself","Don't Stay","Figure.09","Points of Authority","Lying from You","Revenga","Suite-Pee","Chic 'N' Stu","Between Angels And Insects","My Curse","Lost In Hollywood"]
    }
};


/* ================================================================
   5. AUDIO ENGINE — globals
================================================================ */
let audioCtx       = null;
let analyser       = null;
let ampGainNode    = null;
let compressorNode = null;
let eqFilters      = [];
let isShuffle      = false;
let isRepeat       = false;
let isMuted        = false;
let lastVolume     = 1;
let currentAudio    = null;

function setupAnalyser(audio) {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audio);

    ampGainNode = audioCtx.createGain();
    ampGainNode.gain.value = Math.pow(10,
        parseFloat(document.getElementById("ind-amp-gain").value) / 20
    );

    compressorNode = audioCtx.createDynamicsCompressor();
    compressorNode.threshold.setValueAtTime(
        -parseFloat(document.getElementById("ind-amp-comp").value) * 100,
        audioCtx.currentTime
    );

    const frequencies = [60, 250, 1000, 4000, 12000];
    let lastNode = compressorNode;
    eqFilters = frequencies.map(freq => {
        const f = audioCtx.createBiquadFilter();
        f.type = "peaking";
        f.frequency.value = freq;
        f.Q.value = 1;
        f.gain.value = parseFloat(document.getElementById(`ind-eq-${freq}`).value);
        lastNode.connect(f);
        lastNode = f;
        return f;
    });

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;

    source.connect(ampGainNode);
    ampGainNode.connect(compressorNode);
    lastNode.connect(analyser);
    analyser.connect(audioCtx.destination);
}

function resumeCtx() {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}


/* ================================================================
   6. EAR VISUALISER
================================================================ */
function animateEars() {
    requestAnimationFrame(animateEars);
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    const bass   = (data[0] + data[1] + data[2]) / 3 / 255;
    const mid    = (data[3] + data[4] + data[5]) / 3 / 255;
    const treble = (data[6] + data[7] + data[8]) / 3 / 255;

    document.querySelectorAll(".ear").forEach(ear => {
        ear.style.transform   = `scaleY(${1 + bass * 0.08})`;
        ear.style.borderColor = `rgba(${85 + bass * 170}, 0, 0, 1)`;
        ear.style.boxShadow   = `inset 0 0 10px rgba(0,0,0,0.8), 0 0 ${10 + bass * 30}px rgba(255,0,0,${0.15 + bass * 0.6}), 0 0 ${20 + bass * 50}px rgba(255,0,0,${bass * 0.3})`;
    });

    const bands = [bass, mid, treble];
    document.querySelectorAll(".speaker-cone").forEach((cone, i) => {
        const b = bands[i % 3];
        cone.style.transform  = `scale(${1 + b * 0.25})`;
        cone.style.background = `radial-gradient(circle, #111, rgb(${Math.floor(51 + b * 150)},0,0) 40%, #111 80%, #000)`;
        cone.style.boxShadow  = `0 2px 5px rgba(0,0,0,0.9), inset 0 0 5px #000, 0 0 ${b * 40}px rgba(255,0,0,${b * 0.8})`;
    });
}


/* ================================================================
   7. CANVAS VISUALISER — frequency bars behind playlist grid
================================================================ */
function initPlaylistVisualiser() {
    const canvas         = document.createElement("canvas");
    canvas.id            = "playlist-visualiser";
    canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.3;";

    const panel = document.querySelector(".tracks-playlist");
    panel.insertBefore(canvas, panel.firstChild);
    const ctx = canvas.getContext("2d");
    let lastWidth = 0;
    let lastHeight = 0;

    function syncCanvasSize() {
        const width  = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        canvas.width = width;
        canvas.height = height;
    }

    function draw() {
        requestAnimationFrame(draw);
        syncCanvasSize();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!analyser) return;

        const data     = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const barCount = 64;
        const barWidth = canvas.width / barCount;
        const step     = Math.floor(data.length / barCount);

        for (let i = 0; i < barCount; i++) {
            const value = data[i * step] / 255;
            const barH  = value * canvas.height;
            const grad  = ctx.createLinearGradient(0, canvas.height - barH, 0, canvas.height);
            grad.addColorStop(0,   `rgba(255,0,0,${0.6 + value * 0.4})`);
            grad.addColorStop(0.5, `rgba(180,0,0,0.4)`);
            grad.addColorStop(1,   `rgba(80,0,0,0.1)`);
            ctx.fillStyle = grad;
            ctx.fillRect(i * barWidth + 1, canvas.height - barH, barWidth - 2, barH);
            if (value > 0.05) {
                ctx.fillStyle = `rgba(255,60,60,${value})`;
                ctx.fillRect(i * barWidth + 1, canvas.height - barH - 2, barWidth - 2, 2);
            }
        }
    }
    draw();
}


/* ================================================================
   8. LOAD SONG HELPER
================================================================ */
function startMarquee(name) {
        const el = document.querySelector(".songinfo");
        el.classList.remove("marquee");
        el.textContent = name;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (el.scrollWidth > el.clientWidth + 4) {
                el.style.setProperty("--marquee-dist", `-${el.scrollWidth + 30}px`);
                el.classList.add("marquee");
            }
        }));
    }
function loadSong(index, audio, songs, playBtn) {
    audio.src = songs[index];
    audio.play().catch(e => console.warn("Autoplay blocked:", e));
    resumeCtx();
    const led = document.querySelector(".winamp-power-led");
    if (led) led.classList.add("active");

    const name = getsongname(songs[index]);
    updateMetadata(name);
    startMarquee(name);

    document.querySelectorAll(".librarysongs ul li").forEach(li => {
        li.classList.toggle("active", parseInt(li.getAttribute("data-index")) === index);
    });
    document.querySelectorAll("#playlist-song-list li").forEach(li => {
        li.classList.toggle("active", parseInt(li.getAttribute("data-index")) === index);
    });
}


/* ================================================================
   9. NAV HISTORY
================================================================ */
let navHistory = [{ view: "home" }];
let navIndex   = 0;

function updateNavButtons() {
    document.getElementById("btn-back").disabled    = (navIndex === 0);
    document.getElementById("btn-forward").disabled = (navIndex === navHistory.length - 1);
}


/* ================================================================
   10. DRAGGABLE PANELS
================================================================ */
function makeDraggable(panel, handle, storageKey) {
    let dragging = false, ox, oy;

    function convertToAbsolute() {
        if (panel.style.top && panel.style.top !== "auto") return;
        const r = panel.getBoundingClientRect();
        panel.style.position = "fixed"; panel.style.transform = "none";
        panel.style.bottom = "auto";    panel.style.right     = "auto";
        panel.style.left   = r.left + "px"; panel.style.top   = r.top + "px";
    }

    handle.addEventListener("mousedown", e => {
        if (e.target.tagName === "BUTTON") return;
        e.preventDefault(); convertToAbsolute(); dragging = true;
        const r = panel.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        handle.style.cursor = "grabbing";
    });
    document.addEventListener("mousemove", e => {
        if (!dragging) return; e.preventDefault();
        panel.style.left = Math.min(Math.max(0, e.clientX - ox), window.innerWidth  - panel.offsetWidth)  + "px";
        panel.style.top  = Math.min(Math.max(0, e.clientY - oy), window.innerHeight - panel.offsetHeight) + "px";
        updateWiring();
    });
    document.addEventListener("mouseup", () => {
        if (!dragging) return; dragging = false; handle.style.cursor = "grab";
        localStorage.setItem(storageKey + "-x", panel.style.left);
        localStorage.setItem(storageKey + "-y", panel.style.top);
        playUISound("click");
    });

    const sx = localStorage.getItem(storageKey + "-x");
    const sy = localStorage.getItem(storageKey + "-y");
    if (sx && sy) {
        panel.style.position = "fixed"; panel.style.transform = "none";
        panel.style.bottom = "auto";    panel.style.right     = "auto";
        panel.style.left   = sx;        panel.style.top       = sy;
    }
}

/** Dynamic SVG cable between Winamp and EQ panel */
function updateWiring() {
    const layer = document.getElementById("wiring-layer");
    if (!layer) return;
    const player = document.getElementById("winamp-alien");
    const eq     = document.getElementById("industrial-eq-panel");
    if (!player || !eq || eq.style.display === "none") {
        layer.innerHTML = ""; return;
    }

    const r1 = player.getBoundingClientRect();
    const r2 = eq.getBoundingClientRect();

    // Start from bottom-center of winamp, end at top-center of EQ
    const x1 = r1.left + r1.width / 2;
    const y1 = r1.top + r1.height - 20;
    const x2 = r2.left + r2.width / 2;
    const y2 = r2.top + 20;

    // Bezier control points for a saggy cable look
    const cp1x = x1;
    const cp1y = y1 + (y2 - y1) * 0.5 + 50;
    const cp2x = x2;
    const cp2y = y1 + (y2 - y1) * 0.5 + 50;

    layer.innerHTML = `
        <path d="M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}"
              stroke="rgba(0,0,0,0.9)" stroke-width="8" fill="none" />
        <path d="M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}"
              stroke="#222" stroke-width="6" fill="none" />
        <path d="M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}"
              stroke="rgba(255,0,0,0.2)" stroke-width="2" fill="none" />
    `;
}

function makeWinampDraggable(panel, storageKey) {
    let dragging = false, ox, oy;

    function convertToAbsolute() {
        if (panel.style.top && panel.style.top !== "auto") return;
        const r = panel.getBoundingClientRect();
        panel.style.position = "fixed"; panel.style.transform = "none";
        panel.style.bottom = "auto";    panel.style.right     = "auto";
        panel.style.left   = r.left + "px"; panel.style.top   = r.top + "px";
    }

    panel.addEventListener("mousedown", e => {
        if (e.target.tagName === "INPUT"  || e.target.tagName === "IMG"    ||
            e.target.tagName === "BUTTON" || e.target.closest(".seekbar")  ||
            e.target.closest(".winamp-top-controls") || e.target.closest(".volume") ||
            e.target.closest(".eq-toggle-container")) return;
        e.preventDefault(); convertToAbsolute(); dragging = true;
        const r = panel.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        panel.style.cursor = "grabbing";
    });
    document.addEventListener("mousemove", e => {
        if (!dragging) return; e.preventDefault();
        panel.style.left = Math.min(Math.max(0, e.clientX - ox), window.innerWidth  - panel.offsetWidth)  + "px";
        panel.style.top  = Math.min(Math.max(0, e.clientY - oy), window.innerHeight - panel.offsetHeight) + "px";
        updateWiring();
    });
    document.addEventListener("mouseup", () => {
        if (!dragging) return; dragging = false; panel.style.cursor = "grab";
        localStorage.setItem(storageKey + "-x", panel.style.left);
        localStorage.setItem(storageKey + "-y", panel.style.top);
        playUISound("click");
    });

    const sx = localStorage.getItem(storageKey + "-x");
    const sy = localStorage.getItem(storageKey + "-y");
    if (sx && sy) {
        panel.style.position = "fixed"; panel.style.transform = "none";
        panel.style.bottom = "auto";    panel.style.right     = "auto";
        panel.style.left   = sx;        panel.style.top       = sy;
    }
}


/* ================================================================
   11. EQ PRESET SYSTEM
================================================================ */
const presetData = {
    flat:  [0,  0,  0,   0,   0],
    bass:  [8,  6,  0,  -2,  -3],
    vocal: [-3,-2,  5,   4,   2],
    rock:  [5,  3, -1,   3,   4],
    dark:  [6,  4,  2,  -4,  -6],
};
let lerpId = null;

function animateToPreset(targets) {
    if (lerpId) cancelAnimationFrame(lerpId);
    const freqs = [60, 250, 1000, 4000, 12000];
    function step() {
        let done = true;
        freqs.forEach((f, i) => {
            const s = document.getElementById(`ind-eq-${f}`);
            if (!s) return;
            const diff = targets[i] - parseFloat(s.value);
            if (Math.abs(diff) > 0.05) { s.value = parseFloat(s.value) + diff * 0.15; done = false; }
            else s.value = targets[i];
        });
        updateEqReadouts(); syncAudioNodes();
        if (!done) lerpId = requestAnimationFrame(step);
    }
    lerpId = requestAnimationFrame(step);
}

function syncAudioNodes() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    ampGainNode.gain.setTargetAtTime(Math.pow(10, parseFloat(document.getElementById("ind-amp-gain").value) / 20), t, 0.01);
    compressorNode.threshold.setTargetAtTime(-parseFloat(document.getElementById("ind-amp-comp").value) * 100, t, 0.01);
    [60, 250, 1000, 4000, 12000].forEach((f, i) => {
        const s = document.getElementById(`ind-eq-${f}`);
        if (s && eqFilters[i]) eqFilters[i].gain.setTargetAtTime(parseFloat(s.value), t, 0.01);
    });
}

function updateEqReadouts() {
    document.getElementById("gain-readout").textContent = parseFloat(document.getElementById("ind-amp-gain").value).toFixed(1);
    document.getElementById("comp-readout").textContent = parseFloat(document.getElementById("ind-amp-comp").value).toFixed(2);
    [60, 250, 1000, 4000, 12000].forEach(f => {
        const r = document.getElementById(`eq-${f}-readout`);
        const s = document.getElementById(`ind-eq-${f}`);
        if (r && s) r.textContent = parseFloat(s.value).toFixed(1);
    });
}


/* ================================================================
   12. MAIN
================================================================ */
async function main() {

    const songs = await getsongs();
    console.log(`Loaded ${songs.length} songs.`);

    const ul        = document.querySelector(".librarysongs ul");
    const seekbar   = document.querySelector(".seekbar");
    const circle    = document.querySelector(".circle");
    const songtime  = document.querySelector(".songtime");
    const playBtn   = document.querySelector(".songbutton img:nth-child(3)");
    const shuffleBtn = document.getElementById("shuffle");
    const repeatBtn  = document.getElementById("repeat");
    const hovertime  = document.querySelector(".hovertime");
    const volSlider  = document.querySelector(".volumeslider");

    ul.innerHTML = "";
    songs.forEach((song, i) => {
        const li = document.createElement("li");
        li.textContent = getsongname(song);
        li.setAttribute("data-index", i);
        ul.appendChild(li);
    });

    if (!songs.length) {
        console.warn("No songs. Add .mp3 files to ./song/ and list them in songs.json");
        document.querySelector(".songinfo").textContent = "NO SONGS FOUND";
        return;
    }

    let currentIndex = 0;
    const audio      = new Audio(songs[currentIndex]);
    currentAudio     = audio;

    // Restore saved volume
    const savedVol  = localStorage.getItem("ddm-volume");
    audio.volume    = savedVol !== null ? parseFloat(savedVol) : 1;
    volSlider.value = audio.volume;
    lastVolume      = audio.volume;

    // Initial screen state
    startMarquee(getsongname(songs[0]));
    updateMetadata(getsongname(songs[0]));

    animateEars();
    initPlaylistVisualiser();


    /* 12a. PLAYBACK EVENTS */
    audio.addEventListener("loadedmetadata", () => {
        songtime.textContent = `${formattime(audio.currentTime)} / ${formattime(audio.duration)}`;
    });

    audio.addEventListener("timeupdate", () => {
        songtime.textContent = `${formattime(audio.currentTime)} / ${audio.duration ? formattime(audio.duration) : "0:00"}`;
        circle.style.left = `calc(${(audio.currentTime / audio.duration) * 100}% - 9px)`;
    });

    audio.addEventListener("ended", () => {
        if (isRepeat) { audio.currentTime = 0; audio.play().catch(() => {}); }
        else {
            currentIndex = isShuffle && songs.length > 1 ? pickRandom(currentIndex) : (currentIndex + 1) % songs.length;
            loadSong(currentIndex, audio, songs, playBtn);
        }
        // LED handled by loadSong
    });

    audio.addEventListener("error", () => {
        console.warn(`Error loading ${songs[currentIndex]} — skipping.`);
        currentIndex = (currentIndex + 1) % songs.length;
        loadSong(currentIndex, audio, songs, playBtn);
    });


    /* 12b. SEEKBAR */
    function seekToPointer(e) {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const r = seekbar.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
        audio.currentTime = (x / r.width) * audio.duration;
        circle.style.left = `calc(${(x / r.width) * 100}% - 9px)`;
    }

    seekbar.addEventListener("pointerdown", e => {
        e.preventDefault();
        e.stopPropagation();
        seekToPointer(e);
    });

    seekbar.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
    });

    seekbar.addEventListener("mousemove", e => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const r = seekbar.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
        hovertime.style.left  = `${(x / r.width) * 100}%`;
        hovertime.textContent = formattime((x / r.width) * audio.duration);
    });


    /* 12c. PLAY / PAUSE */
    playBtn.addEventListener("click", () => {
        const led = document.querySelector(".winamp-power-led");
        playUISound("toggle");
        if (audio.paused) {
            setupAnalyser(audio); resumeCtx();
            audio.play().catch(() => {});
            playBtn.src = "pause-button.svg";
            if (led) led.classList.add("active");
        } else {
            audio.pause();
            playBtn.src = "play-button-.svg";
            if (led) led.classList.remove("active");
        }
    });


    /* 12d. PREV / NEXT / SHUFFLE / REPEAT */
    function pickRandom(exclude) {
        let n; do { n = Math.floor(Math.random() * songs.length); } while (n === exclude); return n;
    }

    document.getElementById("prev").addEventListener("click", () => {
        playUISound("click");
        currentIndex = isShuffle && songs.length > 1 ? pickRandom(currentIndex) : (currentIndex - 1 + songs.length) % songs.length;
        setupAnalyser(audio); loadSong(currentIndex, audio, songs, playBtn);
    });
    document.getElementById("next").addEventListener("click", () => {
        playUISound("click");
        currentIndex = isShuffle && songs.length > 1 ? pickRandom(currentIndex) : (currentIndex + 1) % songs.length;
        setupAnalyser(audio); loadSong(currentIndex, audio, songs, playBtn);
    });
    shuffleBtn.addEventListener("click", () => {
        isShuffle = !isShuffle; shuffleBtn.classList.toggle("active", isShuffle);
        showToast(isShuffle ? "Shuffle ON" : "Shuffle OFF");
    });
    repeatBtn.addEventListener("click", () => {
        isRepeat = !isRepeat; repeatBtn.classList.toggle("active", isRepeat);
        showToast(isRepeat ? "Repeat ON" : "Repeat OFF");
    });


    /* 12e. LIBRARY SIDEBAR */
    ul.addEventListener("click", e => {
        const li = e.target.closest("li"); if (!li) return;
        currentIndex = parseInt(li.getAttribute("data-index"));
        setupAnalyser(audio); loadSong(currentIndex, audio, songs, playBtn);
    });


    /* 12f. VOLUME — localStorage + mute toggle */
    volSlider.addEventListener("input", e => {
        audio.volume = parseFloat(e.target.value);
        isMuted = audio.volume === 0;
        if (audio.volume > 0) lastVolume = audio.volume;
        localStorage.setItem("ddm-volume", audio.volume);
    });

    document.querySelector(".volumeicon").addEventListener("click", () => {
        if (isMuted) {
            audio.volume = lastVolume; volSlider.value = lastVolume; isMuted = false;
            showToast(`Volume ${Math.round(lastVolume * 100)}%`);
        } else {
            lastVolume = audio.volume || lastVolume; audio.volume = 0; volSlider.value = 0; isMuted = true;
            showToast("Muted");
        }
        localStorage.setItem("ddm-volume", audio.volume);
    });


    /* 12g. PLAYLIST NAVIGATION + BACK BUTTON IN PLAYLIST VIEW */

    function populatePlaylistView(name) {
        const data = playlistData[name]; if (!data) return;
        document.getElementById("playlist-view-title").textContent = name;
        document.getElementById("playlist-view-desc").textContent  = data.desc;

        const list = document.getElementById("playlist-song-list");
        list.innerHTML = "";
        data.songs.forEach(songname => {
            const idx = songs.findIndex(s => getsongname(s) === songname); if (idx === -1) return;
            const li = document.createElement("li");
            li.setAttribute("data-index", idx);
            if (idx === currentIndex) li.classList.add("active");

            const title = document.createElement("span");
            title.className = "pl-song-title";
            title.textContent = songname;

            const artist = document.createElement("span");
            artist.className = "pl-song-artist";
            artist.textContent = songMetadata[songname]?.artist ?? "";

            li.append(title, artist);
            li.addEventListener("click", () => { currentIndex = idx; setupAnalyser(audio); loadSong(currentIndex, audio, songs, playBtn); });
            list.appendChild(li);
        });
    }

    function renderView(state) {
        const grid    = document.querySelector(".yourplaylists");
        const detail  = document.querySelector(".playlist-view");
        const backBtn = document.getElementById("playlist-back-btn");
        const isHome  = state.view === "home";
        grid.style.display   = isHome ? "" : "none";
        detail.style.display = isHome ? "none" : "flex";
        if (backBtn) backBtn.style.display = isHome ? "none" : "flex";
        if (!isHome) populatePlaylistView(state.name);
        updateNavButtons();
    }

    function navigateTo(state) {
        navHistory = navHistory.slice(0, navIndex + 1);
        navHistory.push(state); navIndex++;
        renderView(state);
    }

    // FIX — inject Back button at top of playlist view
    const playlistView  = document.querySelector(".playlist-view");
    const backBtn       = document.createElement("button");
    backBtn.id          = "playlist-back-btn";
    backBtn.className   = "btn-right";
    backBtn.textContent = "← Back";
    backBtn.style.cssText = "display:none; align-self:flex-start; margin-bottom:14px;";
    playlistView.insertBefore(backBtn, playlistView.firstChild);
    backBtn.addEventListener("click", () => navigateTo({ view: "home" }));

    document.querySelectorAll(".playlistcard").forEach(card => {
        card.addEventListener("click", () => {
            const name = card.getAttribute("data-playlist");
            if (!playlistData[name]) return;
            navigateTo({ view: "playlist", name });
        });
    });

    document.getElementById("btn-back").addEventListener("click", () => {
        if (navIndex > 0) { navIndex--; renderView(navHistory[navIndex]); }
    });
    document.getElementById("btn-forward").addEventListener("click", () => {
        if (navIndex < navHistory.length - 1) { navIndex++; renderView(navHistory[navIndex]); }
    });
    updateNavButtons();


    /* 12h. CUSTOM PLAYLIST MODAL */
    const modal         = document.getElementById("create-playlist-modal");
    const modalSongList = document.getElementById("modal-song-list");
    const modalCount    = document.getElementById("modal-count");
    let   selectedSongs = new Set();

    function populateModalSongs(filter) {
        modalSongList.innerHTML = "";
        songs.forEach(url => {
            const name = getsongname(url);
            if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return;
            const sel  = selectedSongs.has(name);
            const item = document.createElement("div");
            item.className = "modal-song-item" + (sel ? " selected" : "");

            const check = document.createElement("div");
            check.className = "msong-check";
            check.textContent = sel ? "✓" : "";

            const info = document.createElement("div");
            info.className = "msong-info";

            const songTitle = document.createElement("span");
            songTitle.className = "msong-name";
            songTitle.textContent = name;

            const songArtist = document.createElement("span");
            songArtist.className = "msong-artist";
            songArtist.textContent = songMetadata[name]?.artist ?? "";

            info.append(songTitle, songArtist);
            item.append(check, info);
            item.addEventListener("click", () => {
                if (selectedSongs.has(name)) { selectedSongs.delete(name); item.classList.remove("selected"); item.querySelector(".msong-check").textContent = ""; }
                else { selectedSongs.add(name); item.classList.add("selected"); item.querySelector(".msong-check").textContent = "✓"; }
                modalCount.textContent = selectedSongs.size;
            });
            modalSongList.appendChild(item);
        });
        modalCount.textContent = selectedSongs.size;
    }

    function addPlaylistCard(name, desc) {
        const card = document.createElement("div");
        card.className = "playlistcard"; card.setAttribute("data-playlist", name);

        const title = document.createElement("h2");
        title.textContent = name;

        const body = document.createElement("p");
        body.textContent = desc;

        card.append(title, body);
        card.addEventListener("click", () => { if (!playlistData[name]) return; navigateTo({ view: "playlist", name }); });
        document.querySelector(".yourplaylists").insertBefore(card, document.getElementById("create-playlist-btn"));
    }

    JSON.parse(localStorage.getItem("custom-playlists") || "[]").forEach(pl => {
        playlistData[pl.name] = { desc: pl.desc, songs: pl.songs };
        addPlaylistCard(pl.name, pl.desc);
    });

    const openModal  = () => {
        selectedSongs = new Set();
        ["pl-name-input","pl-desc-input","pl-song-search"].forEach(id => {
            document.getElementById(id).value = "";
        });
        document.getElementById("pl-name-input").style.borderColor = "";
        populateModalSongs(""); modal.style.display = "flex";
    };
    const closeModal = () => { modal.style.display = "none"; };

    /* 12i. SYSTEM TICKER LOGIC */
    const tickerContent = document.querySelector(".ticker-content");
    const messages = [
        "SYSTEM: INITIALIZING...",
        "HAZARDOUS ENVIRONMENT SUIT: ACTIVATED",
        "RESONANCE CASCADE: 0.0004% STABILITY",
        "WARNING: UNFORESEEN CONSEQUENCES DETECTED",
        "DEPARTURE DELAYED: SECTOR C - TEST LABS",
        "VOX: MAJOR FRACTURE DETECTED. MORPHINE ADMINISTERED.",
        "BLACK MESA: RESEARCH FACILITY // SEC. 7",
        "STATUS: DIVORCED. TRUCK: SECURED.",
        "THERAPY SESSION: OVERDUE",
        "CIGARETTE COUNT: LOW",
        "G-MAN: WATCHING...",
        "LAMBDA CORE: ONLINE",
        "PRESSURE REGULATOR: STABLE",
        "RADIATION LEVEL: NOMINAL",
    ];

    function updateTicker() {
        const msg = messages[Math.floor(Math.random() * messages.length)];
        const time = new Date().toLocaleTimeString([], { hour12: false });
        tickerContent.textContent = `[${time}] ${msg} | ${tickerContent.textContent}`;
        // Keep only last 5 messages to avoid infinite string growth
        const parts = tickerContent.textContent.split(" | ");
        if (parts.length > 5) tickerContent.textContent = parts.slice(0, 5).join(" | ");
    }
    setInterval(updateTicker, 15000);
    updateTicker(); // initial call

    document.getElementById("create-playlist-btn").addEventListener("click", openModal);
    document.getElementById("cancel-playlist-btn").addEventListener("click", closeModal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    document.getElementById("pl-song-search").addEventListener("input", e => populateModalSongs(e.target.value));

    document.getElementById("save-playlist-btn").addEventListener("click", () => {
        const nameIn = document.getElementById("pl-name-input");
        const name   = nameIn.value.trim();
        const desc   = document.getElementById("pl-desc-input").value.trim() || "Custom playlist.";
        if (!name)               { nameIn.style.borderColor = "#ff0000"; nameIn.focus(); return; }
        if (playlistData[name])  { nameIn.style.borderColor = "#ff0000"; nameIn.focus(); return; }
        if (!selectedSongs.size) { showToast("Select at least one song first."); return; } // FIX
        const songList = [...selectedSongs];
        playlistData[name] = { desc, songs: songList };
        const saved = JSON.parse(localStorage.getItem("custom-playlists") || "[]");
        saved.push({ name, desc, songs: songList });
        localStorage.setItem("custom-playlists", JSON.stringify(saved));
        addPlaylistCard(name, desc); closeModal();
        showToast(`"${name}" created`);
    });


    /* 12i. HAMBURGER */
    const leftSidebar = document.querySelector(".left");
    document.querySelector(".btn-hamburger").addEventListener("click", () => {
        leftSidebar.classList.toggle("open");
    });


    /* 12j. KEYBOARD SHORTCUTS */
    document.addEventListener("keydown", e => {
        if (["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
        switch (e.code) {
            case "Space": case "KeyK":
                e.preventDefault(); playBtn.click(); break;
            case "ArrowRight":
                e.preventDefault();
                if (audio.duration) { audio.currentTime = Math.min(audio.currentTime + 5, audio.duration); showToast("+5s"); } break;
            case "ArrowLeft":
                e.preventDefault(); audio.currentTime = Math.max(audio.currentTime - 5, 0); showToast("−5s"); break;
            case "ArrowUp":
                e.preventDefault(); audio.volume = Math.min(1, audio.volume + 0.05); volSlider.value = audio.volume;
                lastVolume = audio.volume; localStorage.setItem("ddm-volume", audio.volume);
                showToast(`Volume ${Math.round(audio.volume * 100)}%`); break;
            case "ArrowDown":
                e.preventDefault(); audio.volume = Math.max(0, audio.volume - 0.05); volSlider.value = audio.volume;
                localStorage.setItem("ddm-volume", audio.volume); showToast(`Volume ${Math.round(audio.volume * 100)}%`); break;
            case "KeyN": document.getElementById("next").click(); break;
            case "KeyP": document.getElementById("prev").click(); break;
            case "KeyM": document.querySelector(".volumeicon").click(); break;
            case "KeyS": shuffleBtn.click(); break;
            case "KeyR": repeatBtn.click(); break;
        }
    });


    /* 12k. EQ PANEL */
    const eqPanel    = document.getElementById("industrial-eq-panel");
    const toggleBtn  = document.getElementById("toggle-eq-btn");
    const closeEqBtn = document.getElementById("close-eq-btn");
    const eqHandle   = document.getElementById("eq-drag-handle");
    const presetBtns = document.querySelectorAll(".preset-btn-hl");
    const allSliders = document.querySelectorAll(".hl-slider-h, .hl-fader-v");

    toggleBtn.addEventListener("click", () => {
        const hidden = eqPanel.style.display === "none";
        eqPanel.style.display = hidden ? "block" : "none";
        toggleBtn.classList.toggle("on", hidden);
        playUISound("toggle");
        updateWiring();
    });
    closeEqBtn.addEventListener("click", () => {
        eqPanel.style.display = "none";
        toggleBtn.classList.remove("on");
        playUISound("click");
        updateWiring();
    });

    presetBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const presetName = btn.dataset.preset;
            const preset = presetData[presetName];
            if (!preset) return;

            presetBtns.forEach(b => b.classList.toggle("active", b === btn));
            playUISound("beep");
            animateToPreset(preset);
        });
    });

    allSliders.forEach(slider => {
        slider.addEventListener("input", () => {
            presetBtns.forEach(btn => btn.classList.remove("active"));
            updateEqReadouts();
            syncAudioNodes();
        });
    });

    window.addEventListener("resize", updateWiring);
    updateEqReadouts();

    makeWinampDraggable(document.querySelector(".winamp-alien"), "winamp");
    makeDraggable(eqPanel, eqHandle, "industrial-eq");


    /* 12l. LOGIN / SIGN UP MODAL */
    document.body.insertAdjacentHTML("beforeend", `
    <div class="auth-modal-overlay" id="auth-modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="auth-modal">
            <button class="auth-modal-close" id="auth-close">✕</button>
            <div class="auth-modal-rivet tl"></div>
            <div class="auth-modal-rivet tr"></div>
            <div class="auth-led-strip">
                <span>ACCESS TERMINAL</span>
                <span id="auth-mode-readout">LOGIN</span>
            </div>
            <h2 class="auth-modal-title" id="auth-title">Login</h2>
            <p class="auth-modal-copy" id="auth-copy">Enter your station credentials.</p>
            <div class="auth-modal-body">
                <label class="auth-field">
                    <span>CALLSIGN</span>
                    <input type="text" class="modal-input" id="auth-user" placeholder="USERNAME" autocomplete="username">
                </label>
                <label class="auth-field">
                    <span>PASSCODE</span>
                    <input type="password" class="modal-input" id="auth-pass" placeholder="PASSWORD" autocomplete="current-password">
                </label>
                <p class="auth-error" id="auth-error"></p>
                <button class="btn-right auth-submit" id="auth-submit">ENTER</button>
                <p class="auth-switch-row">
                    <span id="auth-switch-label">Don't have an account?</span>
                    <a href="#" id="auth-switch">Sign up</a>
                </p>
            </div>
        </div>
    </div>`);

    const users = JSON.parse(localStorage.getItem("ddm-users") || "{}");
    let isLoggedIn = localStorage.getItem("ddm-current-user") !== null, isSignup = false;
    const authOverlay   = document.getElementById("auth-modal-overlay");
    const loginBtn      = document.getElementById("login-btn");
    const signupBtn     = document.getElementById("signup-btn");
    const authTitle     = document.getElementById("auth-title");
    const authCopy      = document.getElementById("auth-copy");
    const authSubmit    = document.getElementById("auth-submit");
    const authError     = document.getElementById("auth-error");
    const authSwitch    = document.getElementById("auth-switch");
    const authSwitchLbl = document.getElementById("auth-switch-label");
    const authModeReadout = document.getElementById("auth-mode-readout");
    const authUser      = document.getElementById("auth-user");
    const authPass      = document.getElementById("auth-pass");

    function persistUsers() {
        localStorage.setItem("ddm-users", JSON.stringify(users));
    }

    async function hashPassword(pass) {
        const data = new TextEncoder().encode(pass);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    function setLoggedInUser(user) {
        isLoggedIn = true;
        localStorage.setItem("ddm-current-user", user);
        loginBtn.textContent = user.toUpperCase();
        loginBtn.classList.add("logged-in");
        signupBtn.style.display = "none";
    }

    function setLoggedOut() {
        isLoggedIn = false;
        localStorage.removeItem("ddm-current-user");
        loginBtn.textContent = "Login";
        loginBtn.classList.remove("logged-in");
        signupBtn.style.display = "";
    }

    function openAuthModal(signup = false) {
        isSignup = signup;
        authTitle.textContent     = signup ? "Sign Up"         : "Login";
        authCopy.textContent      = signup ? "Create a local listener profile." : "Enter your station credentials.";
        authSubmit.textContent    = signup ? "CREATE ACCOUNT"  : "ENTER";
        authSwitchLbl.textContent = signup ? "Already have an account?" : "Don't have an account?";
        authSwitch.textContent    = signup ? "Login"           : "Sign up";
        authModeReadout.textContent = signup ? "NEW USER" : "LOGIN";
        authError.textContent     = "";
        authUser.value = "";
        authPass.value = "";
        authOverlay.style.display = "flex";
        requestAnimationFrame(() => authUser.focus());
    }

    const savedUser = localStorage.getItem("ddm-current-user");
    if (savedUser && users[savedUser]) setLoggedInUser(savedUser);
    else setLoggedOut();

    loginBtn.addEventListener("click", () => {
        if (isLoggedIn) {
            setLoggedOut();
            showToast("Logged out");
        } else { openAuthModal(false); }
    });
    signupBtn.addEventListener("click", () => openAuthModal(true));
    document.getElementById("auth-close").addEventListener("click", () => { authOverlay.style.display = "none"; });
    authOverlay.addEventListener("click", e => { if (e.target === authOverlay) authOverlay.style.display = "none"; });
    authSwitch.addEventListener("click", e => { e.preventDefault(); openAuthModal(!isSignup); });

    authOverlay.addEventListener("keydown", e => {
        if (e.key === "Escape") authOverlay.style.display = "none";
        if (e.key === "Enter") authSubmit.click();
    });

    authSubmit.addEventListener("click", async () => {
        const user = authUser.value.trim();
        const pass = authPass.value.trim();
        if (!user || !pass) { authError.textContent = "Both fields are required."; return; }
        const passHash = await hashPassword(pass);
        if (isSignup) {
            if (users[user]) { authError.textContent = "Username taken."; return; }
            users[user] = { passwordHash: passHash };
            persistUsers();
            setLoggedInUser(user);
            showToast(`Account created: ${user}`);
            authOverlay.style.display = "none";
        } else {
            const savedPass = typeof users[user] === "string" ? users[user] : users[user]?.passwordHash;
            if (!savedPass || (savedPass !== pass && savedPass !== passHash)) { authError.textContent = "Wrong username or password."; return; }
            if (typeof users[user] === "string") {
                users[user] = { passwordHash: passHash };
                persistUsers();
            }
            setLoggedInUser(user);
            authOverlay.style.display = "none";
            showToast(`Welcome back, ${user}`);
        }
    });


    /* 12m. MARQUEE FOR LONG SONG TITLES */
    


    /* 12n. SEARCH */
    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("keyup", e => {
        const f = e.target.value.toLowerCase();
        ul.querySelectorAll("li").forEach(li => { li.style.display = li.textContent.toLowerCase().includes(f) ? "" : "none"; });
    });
    document.getElementById("home-btn").addEventListener("click", () => {
        searchInput.value = "";
        ul.querySelectorAll("li").forEach(li => (li.style.display = ""));
        navigateTo({ view: "home" });
        leftSidebar.classList.remove("open");
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

} // end main()

main();
