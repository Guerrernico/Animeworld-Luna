// Configurazione
var BASE_URL = 'https://www.animeworld.ac';
var DEBUG = true;

function log(message, data) {
    if (DEBUG) {
        console.log('[AnimeWorldScraper] ' + message);
        if (data) {
            console.log(data);
        }
    }
}

function fetchPage(url) {
    log('Fetching URL: ' + url);
    
    try {
        var response = syncFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        if (!response) {
            throw 'Failed to fetch ' + url;
        }

        return response;
    } catch (error) {
        log('Fetch error for ' + url + ': ' + error);
        throw error;
    }
}

function searchAnime(keyword) {
    log('Searching for: ' + keyword);
    
    try {
        var searchUrl = BASE_URL + '/search?keyword=' + encodeURIComponent(keyword);
        var html = fetchPage(searchUrl);
        var results = [];
        
        // Estrai titoli
        var titleRegex = /<h3>\s*<a[^>]*class="name"[^>]*>([^<]+)<\/a>\s*<\/h3>/gi;
        var imageRegex = /<a[^>]*class="poster"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*>/gi;
        var linkRegex = /<a[^>]*class="poster"[^>]*href="([^"]+)"[^>]*>/gi;
        
        var titles = [];
        var images = [];
        var links = [];
        var match;
        
        // Estrai titoli
        while ((match = titleRegex.exec(html)) !== null) {
            titles.push(match[1].trim());
        }
        
        // Estrai immagini
        while ((match = imageRegex.exec(html)) !== null) {
            images.push(match[1]);
        }
        
        // Estrai links
        while ((match = linkRegex.exec(html)) !== null) {
            links.push(match[1]);
        }
        
        // Combina i risultati
        var minLength = Math.min(titles.length, images.length, links.length);
        for (var i = 0; i < minLength; i++) {
            results.push({
                title: titles[i],
                image: images[i],
                href: BASE_URL + links[i]
            });
        }
        
        return results;
    } catch (error) {
        log('Search error: ' + error);
        return [];
    }
}

function getAnimeDetails(url) {
    log('Getting details for: ' + url);
    
    try {
        var html = fetchPage(url);
        
        var descRegex = /<div[^>]*class="desc[^"]*"[^>]*>.*?<div[^>]*class="long[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
        var altTitleRegex = /<h2[^>]*class="title"[^>]*data-jtitle="([^"]*)"[^>]*>/i;
        var yearRegex = /<dt[^>]*>Data di Uscita:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i;
        
        var description = '';
        var alternativeTitle = '';
        var releaseYear = '';
        
        var match;
        
        if ((match = descRegex.exec(html)) !== null) {
            description = match[1].trim().replace(/<[^>]*>/g, '');
        }
        
        if ((match = altTitleRegex.exec(html)) !== null) {
            alternativeTitle = match[1].trim();
        }
        
        if ((match = yearRegex.exec(html)) !== null) {
            releaseYear = match[1].trim();
        }
        
        return {
            description: description,
            alternativeTitle: alternativeTitle,
            releaseYear: releaseYear
        };
    } catch (error) {
        log('Details error: ' + error);
        return null;
    }
}

function getEpisodesList(url) {
    log('Getting episodes list for: ' + url);
    
    try {
        var html = fetchPage(url);
        var episodes = [];
        var episodeRegex = /<li[^>]*class="episode"[^>]*>.*?<a[^>]*data-episode-num="(\d+)"[^>]*href="([^"]+)"[^>]*>/g;
        var match;
        
        while ((match = episodeRegex.exec(html)) !== null) {
            episodes.push({
                number: parseInt(match[1]),
                href: BASE_URL + match[2]
            });
        }
        
        return episodes;
    } catch (error) {
        log('Episodes error: ' + error);
        return [];
    }
}

function getStreamUrl(episodeUrl) {
    log('Getting stream URL for: ' + episodeUrl);
    
    try {
        var html = fetchPage(episodeUrl);
        var iframeRegex = /<iframe[^>]*id="player-iframe"[^>]*src="([^"]+)"[^>]*>/i;
        var iframeMatch = iframeRegex.exec(html);
        
        if (!iframeMatch) {
            throw 'Iframe not found';
        }
        
        var iframeUrl = BASE_URL + iframeMatch[1];
        var iframeHtml = fetchPage(iframeUrl);
        
        var streamRegex = /file:\s*['"](https:\/\/[^'"]+\.mp4)['"]/i;
        var streamMatch = streamRegex.exec(iframeHtml);
        
        if (!streamMatch) {
            throw 'Stream URL not found';
        }
        
        return streamMatch[1];
    } catch (error) {
        log('Stream URL error: ' + error);
        return null;
    }
}

// Funzioni esportate
function searchResults(keyword) {
    console.log('[General] Searching for: ' + keyword);
    try {
        var results = searchAnime(keyword);
        return JSON.stringify(results || []);
    } catch (error) {
        console.error('[Error] ' + error);
        return '[]';
    }
}

function extractDetails(url) {
    console.log('[General] Extracting details from: ' + url);
    try {
        var details = getAnimeDetails(url);
        return JSON.stringify([details || {}]);
    } catch (error) {
        console.error('[Error] ' + error);
        return '[{}]';
    }
}

function extractEpisodes(url) {
    console.log('[General] Extracting episodes from: ' + url);
    try {
        var episodes = getEpisodesList(url);
        return JSON.stringify(episodes || []);
    } catch (error) {
        console.error('[Error] ' + error);
        return '[]';
    }
}

function extractStreamUrl(url) {
    console.log('[General] Extracting stream URL from: ' + url);
    try {
        return getStreamUrl(url);
    } catch (error) {
        console.error('[Error] ' + error);
        return null;
    }
}
