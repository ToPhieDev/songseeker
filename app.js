import QrScanner from "https://unpkg.com/qr-scanner/qr-scanner.min.js";

let player; // Define player globally
let playbackTimer; // hold the timer reference
let playbackDuration = 30; // Default playback duration
let qrScanner;
let csvCache = {};

const versionNumber = "0.0.4";

document.addEventListener('DOMContentLoaded', function () {

    let lastDecodedText = ""; // Store the last decoded text

    const video = document.getElementById('qr-video');

    qrScanner = new QrScanner(video, async result => {
            console.log('decoded qr code:', result);
            if (result.data !== lastDecodedText) {
                lastDecodedText = result.data; // Update the last decoded text
                await handleScannedLink(result.data)
            }
        }, {
        highlightScanRegion: true,
        highlightCodeOutline: true,
    }
    );
    
    // Function to determine the type of link and act accordingly
    async function handleScannedLink(decodedText) {
        let youtubeURL = "";
        if (isYoutubeLink(decodedText)) {
            youtubeURL = decodedText;
        } else if (isHitsterLink(decodedText)) {
            const hitsterData = parseHitsterUrl(decodedText);
            if (hitsterData) {
                console.log("Hitster data:", hitsterData.id, hitsterData.lang);
                try {
                    const csvContent = await getCachedCsv(`/hitster-${hitsterData.lang}.csv`);
                    const youtubeLink = lookupYoutubeLink(hitsterData.id, csvContent);
                    if (youtubeLink) {
                        // Handle YouTube link obtained from the CSV
                        console.log(`YouTube Link from CSV: ${youtubeLink}`);
                        youtubeURL = youtubeLink;
                        // Example: player.cueVideoById(parseYoutubeLink(youtubeLink).videoId);
                    }
                } catch (error) {
                  console.error("Failed to fetch CSV:", error);
                }
            }
            else {
                console.log("Invalid Hitster URL:", decodedText);
            }
        }

        console.log(`YouTube Video URL: ${youtubeURL}`);

        const youtubeLinkData = parseYoutubeLink(youtubeURL);
        if (youtubeLinkData) {
            qrScanner.stop(); // Stop scanning after a result is found
            document.getElementById('close-scan-modal').click(); // Close the modal
            lastDecodedText = ""; // Reset the last decoded text

            document.getElementById('video-id').textContent = youtubeLinkData.videoId;  

            console.log(youtubeLinkData.videoId);
            player.cueVideoById(youtubeLinkData.videoId, youtubeLinkData.startTime || 0);   
            
        }
        
    }

    function isHitsterLink(url) {
        // Regular expression to match with or without "http://" or "https://"
        const regex = /^(?:http:\/\/|https:\/\/)?(www\.hitstergame|app\.hitsternordics)\.com\/.+/;
        return regex.test(url);
    }

    // Example implementation for isYoutubeLink
    function isYoutubeLink(url) {
        return url.startsWith("https://www.youtube.com") || url.startsWith("https://youtu.be") || url.startsWith("https://music.youtube.com/");
    }

    // Example implementation for parseHitsterUrl
    function parseHitsterUrl(url) {
        const regex = /^(?:http:\/\/|https:\/\/)?www\.hitstergame\.com\/(.+?)\/(\d+)$/;
        const match = url.match(regex);
        if (match) {
            // Hitster URL is in the format: https://www.hitstergame.com/{lang}/{id}
            // lang can be things like "en", "de", "pt", etc., but also "de/aaaa0007"
            const processedLang = match[1].replace(/\//g, "-");
            return { lang: processedLang, id: match[2] };
        }
        const regex_nordics = /^(?:http:\/\/|https:\/\/)?app.hitster(nordics).com\/resources\/songs\/(\d+)$/;
        const match_nordics = url.match(regex_nordics);
        if (match_nordics) {
            // Hitster URL can also be in the format: https://app.hitsternordics.com/resources/songs/{id}
            return { lang: match_nordics[1], id: match_nordics[2] };
        }
        return null;
    }

    // Looks up the YouTube link in the CSV content based on the ID
    function lookupYoutubeLink(id, csvContent) {
        const headers = csvContent[0]; // Get the headers from the CSV content
        const cardIndex = headers.indexOf('Card#');
        const urlIndex = headers.indexOf('URL');

        const targetId = parseInt(id, 10); // Convert the incoming ID to an integer
        const lines = csvContent.slice(1); // Exclude the first row (headers) from the lines

        if (cardIndex === -1 || urlIndex === -1) {
            throw new Error('Card# or URL column not found');
        }

        for (let row of lines) {
            const csvId = parseInt(row[cardIndex], 10);
            if (csvId === targetId) {
                return row[urlIndex].trim(); // Return the YouTube link
            }
        }
        return null; // If no matching ID is found

    }

    // Could also use external library, but for simplicity, we'll define it here
    function parseCSV(text) {
        const lines = text.split('\n');
        return lines.map(line => {
            const result = [];
            let startValueIdx = 0;
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                if (line[i] === '"' && line[i-1] !== '\\') {
                    inQuotes = !inQuotes;
                } else if (line[i] === ',' && !inQuotes) {
                    result.push(line.substring(startValueIdx, i).trim().replace(/^"(.*)"$/, '$1'));
                    startValueIdx = i + 1;
                }
            }
            result.push(line.substring(startValueIdx).trim().replace(/^"(.*)"$/, '$1')); // Push the last value
            return result;
        });
    }

    async function getCachedCsv(url) {
        if (!csvCache[url]) { // Check if the URL is not in the cache
            console.log(`URL not cached, fetching CSV from URL: ${url}`);
            const response = await fetch(url);
            const data = await response.text();
            csvCache[url] = parseCSV(data); // Cache the parsed CSV data using the URL as a key
        }
        return csvCache[url]; // Return the cached data for the URL
    }

    function parseYoutubeLink(url) {
        // First, ensure that the URL is decoded (handles encoded URLs)
        url = decodeURIComponent(url);
    
        const regex = /^https?:\/\/(www\.youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)(.{11}).*/;
        const match = url.match(regex);
        if (match) {
            const queryParams = new URLSearchParams(match[4]); // Correctly capture and parse the query string part of the URL
            const videoId = match[2];
            let startTime = queryParams.get('start') || queryParams.get('t');
            const endTime = queryParams.get('end');
    
            // Normalize and parse 't' and 'start' parameters
            startTime = normalizeTimeParameter(startTime);
            const parsedEndTime = normalizeTimeParameter(endTime);
    
            return { videoId, startTime, endTime: parsedEndTime };
        }
        return null;
    }
    
    function normalizeTimeParameter(timeValue) {
        if (!timeValue) return null; // Return null if timeValue is falsy
    
        // Handle time formats (e.g., 't=1m15s' or '75s')
        let seconds;
        if (timeValue.endsWith('s')) {
            seconds = parseInt(timeValue, 10);
        } else {
            // Additional parsing can be added here for 'm', 'h' formats if needed
            seconds = parseInt(timeValue, 10);
        }
    
        return isNaN(seconds) ? null : seconds;
    }
});

// This function creates an <iframe> (and YouTube player) after the API code downloads.
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0',
        width: '0',
        playerVars: {'autoplay': 0, 'controls': 0},
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
        }
    });
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// Load the YouTube IFrame API script
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// The API will call this function when the video player is ready.
function onPlayerReady(event) {
    // Cue a video using the videoId from the QR code (example videoId used here)
    // player.cueVideoById('dQw4w9WgXcQ');
}

// Display video information when it's cued
function onPlayerStateChange(event) {
    document.getElementById('startstop-video').style.display = "flex";

    if (event.data === YT.PlayerState.CUED) {
        // Display title and duration
        const videoData = player.getVideoData();
        document.getElementById('video-title').textContent = videoData.title;
        const duration = player.getDuration();
        document.getElementById('video-duration').textContent = formatDuration(duration);
        
        // Sync play-button
        document.getElementById('startstop-text').innerHTML = "Play";
        
        // Check for Autoplay
        if (document.getElementById('autoplay').checked === true) {
            document.getElementById('startstop-text').innerHTML = "Stop";
            if (document.getElementById('randomplayback').checked === true) {
                playVideoAtRandomStartTime();
            }
            else {
            player.playVideo();
            }
        }
    }
    else if (event.data === YT.PlayerState.PLAYING) {
        document.getElementById('startstop-video').style.display = "flex";
        document.getElementById('loadingVideo').style.display = "none";
        document.getElementById('startstop-text').innerHTML = "Stop";

    }
    else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        document.getElementById('startstop-video').style.display = "flex";
        document.getElementById('startstop-text').innerHTML = "Play";
    }
    else if (event.data === YT.PlayerState.BUFFERING) {
        document.getElementById('loadingVideo').style.display = "block";
        document.getElementById('startstop-text').innerHTML = "Loading";
    } 
}

// Helper function to format duration from seconds to a more readable format
function formatDuration(duration) {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
}

// Add event listeners to Play and Stop buttons
document.getElementById('startstop-video').addEventListener('click', function() {
    const textElem = document.getElementById("startstop-text")
    if (textElem.innerHTML === "Play") {
        if (document.getElementById('randomplayback').checked) {
            playVideoAtRandomStartTime();
        }
        else {
            player.playVideo();
        }
    }
    else {
        player.pauseVideo();
    }
});

function writeCopyrightYear() {
    const date = new Date();
    document.getElementById('copyrightYear').textContent = date.getFullYear().toString();
}
function writeVersionNumber() {
    document.getElementById('version-number').textContent = versionNumber;
}

window.onload = ()=> {
    writeCopyrightYear();
    writeVersionNumber();
};

function playVideoAtRandomStartTime() {
    const minStartPercentage = 0.10;
    const maxEndPercentage = 0.90;
    let videoDuration = player.getDuration()
    let startTime = player.getCurrentTime(); // If the video is already cued to a specific start time
    playbackDuration = parseInt(document.getElementById('playback-duration').value, 10) || 30;
    let endTime = startTime + playbackDuration;

    // Adjust start and end time based on video duration
    const minStartTime = Math.max(startTime, videoDuration * minStartPercentage);
    const maxEndTime = videoDuration * maxEndPercentage;

    // Ensure the video ends by 90% of its total duration
    if (endTime > maxEndTime) {
        endTime = maxEndTime;
        startTime = Math.max(minStartTime, endTime - playbackDuration);
    }

    // If custom start time is 0 or very close to the beginning, pick a random start time within the range
    if (startTime <= minStartTime) {
        const range = maxEndTime - minStartTime - playbackDuration;
        const randomOffset = Math.random() * range;
        startTime = minStartTime + randomOffset;
        endTime = startTime + playbackDuration;
    }

    // Cue video at calculated start time and play
    console.log("play random", startTime, endTime)
    player.seekTo(startTime, true);
    player.playVideo();

    clearTimeout(playbackTimer); // Clear any existing timer
    // Schedule video stop after the specified duration
    playbackTimer = setTimeout(() => {
        player.pauseVideo();
        document.getElementById('startstop-text').innerHTML = "Play";
    }, (endTime - startTime) * 1000); // Convert to milliseconds
}

document.getElementById('randomplayback').addEventListener('change', function() {
    document.getElementById('duration-input').style.display = this.checked ? 'block' : 'none';
});

// Assuming you have an element with the ID 'qr-reader' for the QR scanner
document.getElementById('qr-reader').style.display = 'none'; // Initially hide the QR Scanner

document.getElementById('startScanButton').addEventListener('click', function() {
    document.getElementById('cancelScanButton').style.display = 'inline-flex';
    document.getElementById('scan-modal').style.display = 'grid'; // Show the modal
    document.getElementById('qr-reader').style.display = 'block'; // Show the scanner
    qrScanner.start().catch(err => {
        console.error('Unable to start QR Scanner', err);
        qrResult.textContent = "QR Scanner failed to start.";
    });

    qrScanner.start().then(() => {
        qrScanner.setInversionMode('both'); // we want to scan also for Hitster QR codes which use inverted colors
    });
});

document.getElementById('songinfo').addEventListener('click', function() {
    const cb = document.getElementById('songinfo');
    const elements = document.querySelectorAll('.songinfo'); // Alle Elemente mit der Klasse "songinfo" auswählen

    elements.forEach(function(element) {
        if (cb.checked === true) {
            element.style.display = 'block';
        } else {
            element.style.display = 'none';
        }
    });
});

document.getElementById('cancelScanButton').addEventListener('click', function() {
    qrScanner.stop(); // Stop scanning after a result is found
    document.getElementById('qr-reader').style.display = 'none'; // Hide the scanner after successful scan
    document.getElementById('cancelScanButton').style.display = 'none'; // Hide the cancel-button
});

document.getElementById('randomplayback').addEventListener('click', function() {
    localStorage.setItem('RandomPlaybackChecked', this.checked);
});

document.getElementById('autoplay').addEventListener('click', function() {
    localStorage.setItem('autoplayChecked', this.checked);
});


function loadSettings() {
    const randomPlaybackChecked = localStorage.getItem('RandomPlaybackChecked') === 'true';
    const autoplayChecked = localStorage.getItem('autoplayChecked') === 'true';
    
    document.getElementById('randomplayback').checked = randomPlaybackChecked;
    document.getElementById('duration-input').style.display = randomPlaybackChecked ? 'block' : 'none';
    document.getElementById('autoplay').checked = autoplayChecked;
}

window.addEventListener("DOMContentLoaded", () => loadSettings());
