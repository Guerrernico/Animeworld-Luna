///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Main Functions          //////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

async function searchResults(keyword) {
  try {
    [span_1](start_span)const encodedKeyword = encodeURIComponent(keyword);[span_1](end_span)
    // URL di ricerca standard su AnimeWorld
    [span_2](start_span)const searchUrl = `https://www.animeworld.ac/search?keyword=${encodedKeyword}`;[span_2](end_span)
    [span_3](start_span)const responseText = await soraFetch(searchUrl);[span_3](end_span)
    [span_4](start_span)const text = responseText.text ? await responseText.text() : responseText;[span_4](end_span)

    [span_5](start_span)const transformedResults = [];[span_5](end_span)
    // Regex per estrarre il link (href), l'immagine di copertina (src) e il titolo (alt o title) dei risultati
    [span_6](start_span)const searchRegex = /<a\s+class="poster"[^>]*href="([^"]+)"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/gs;[span_6](end_span)
    let match;
    
    [span_7](start_span)while ((match = searchRegex.exec(text)) !== null) {[span_7](end_span)
      transformedResults.push({
        [span_8](start_span)title: match[3].trim(),[span_8](end_span)
        [span_9](start_span)image: match[2].startsWith('http') ? match[2] : `https://www.animeworld.ac${match[2]}`,[span_9](end_span)
        [span_10](start_span)href: match[1].startsWith('http') ? match[1] : `https://www.animeworld.ac${match[1]}`,[span_10](end_span)
      });
    }

    // Corretto: return e valore sulla stessa riga
    [span_11](start_span)return JSON.stringify(transformedResults);[span_11](end_span)
  } catch (error) {
    [span_12](start_span)sendLog("Search error: " + error);[span_12](end_span)
    [span_13](start_span)return JSON.stringify([{ title: "Error", image: "", href: "" }]);[span_13](end_span)
  }
}

async function extractDetails(url) {
  try {
    const response = await fetch(url);
    const text = response.text ? await response.text() : response;

    // Estrazione descrizione dal meta tag o ld+json
    const descriptionRegex = /<meta\s+name="description"\s+content="([^"]+)"/i;
    const descriptionMatch = descriptionRegex.exec(text);
    let description = "Nessuna descrizione disponibile";
    
    if (descriptionMatch) {
      // Rimuove l'eventuale prefisso "Trama di ... SUB ITA:" fisso su AnimeWorld
      description = descriptionMatch[1].replace(/^Trama di .*?:\s*/i, "").trim();
    }

    // Estrazione del titolo originale/alternativo
    const titleRegex = /window\.animeName\s*=\s*decodeURIComponent\("([^"]+)"\)/;
    const titleMatch = titleRegex.exec(text);
    let title = "Unknown";
    if (titleMatch) {
      title = decodeURIComponent(titleMatch[1]);
    }

    const transformedResults = [
      {
        description: description,
        aliases: title,
        airdate: "Disponibile",
      },
    ];
    return JSON.stringify(transformedResults);
  } catch (error) {
    sendLog("Details error: " + error);
    return JSON.stringify([
      {
        description: "Errore nel caricamento dei dettagli",
        aliases: "Unknown",
        airdate: "Unknown",
      },
    ]);
  }
}

async function extractEpisodes(url) {
  try {
    const response = await fetch(url);
    const html = response.text ? await response.text() : response;
    const finishedList = [];

    // Cattura tutti i link agli episodi presenti nella lista/sidebar di AnimeWorld
    // Struttura tipica: <a class="episode_element" data-id="..." href="/play/...">
    const episodeRegex = /<a[^>]+class="[^"]*episode[^"]*"[^>]*href="([^"]+)"[^>]*>.*?<span>([^<]+)<\/span>/gs;
    let match;

    while ((match = episodeRegex.exec(html)) !== null) {
      const epHref = match[1].startsWith('http') ? match[1] : `https://www.animeworld.ac${match[1]}`;
      const epNumber = match[2].trim();
      
      finishedList.push({
        number: epNumber,
        href: epHref,
        title: `Episodio ${epNumber}`
      });
    }

    // Se la regex HTML fallisce o la pagina è un player singolo, cerchiamo l'ID dall'oggetto globale per richiedere l'elenco completo
    if (finishedList.length === 0) {
      const idRegex = /window\.animeId\s*=\s*"(\d+)"/;
      const idMatch = idRegex.exec(html);
      if (idMatch) {
        // Alcune implementazioni di moduli richiedono l'endpoint interno degli episodi via API se disponibile
        // Altrimenti, estraiamo l'episodio corrente basandoci sui meta tag LD+JSON presenti nel dump
        const currentEpRegex = /"episodeNumber":\s*"(\d+)"/;
        const currentEpMatch = currentEpRegex.exec(html);
        if (currentEpMatch) {
          finishedList.push({
            number: currentEpMatch[1],
            href: url,
            title: `Episodio ${currentEpMatch[1]}`
          });
        }
      }
    }

    return JSON.stringify(finishedList);
  } catch (error) {
    sendLog("Episodes error: " + error);
    return JSON.stringify([{ number: "0", href: "" }]);
  }
}

async function extractStreamUrl(url) {
  try {
    const response = await fetch(url);
    const text = response.text ? await response.text() : response;
    const finishedList = [];

    // Regex per trovare i server di streaming nell'HTML di AnimeWorld
    // Solitamente strutturati in tag <div data-id="..." data-name="NomeServer" ...> o <li data-server-id="...">
    const serverRegex = /<li[^>]+data-id="([^"]+)"[^>]+data-name="([^"]+)"[^>]*>/g;
    let match;

    while ((match = serverRegex.exec(text)) !== null) {
      const serverId = match[1];
      const serverName = match[2].toUpperCase(); // E.g., STREAMTAPE, FILEMOON

      // Nota: AnimeWorld spesso carica i link dinamicamente via AJAX chiamando l'endpoint:
      // `/api/episode/server?id={serverId}` che restituisce un JSON contenente il link del player (iframe)
      const providerApiUrl = `https://www.animeworld.ac/api/episode/server?id=${serverId}`;

      finishedList.push({
        provider: serverName,
        href: providerApiUrl, // Questo URL verrà poi processato dal tuo multiExtractor o inviato alla chiamata successiva
        language: "Italiano" // AnimeWorld è interamente in Italiano (SUB o DUB)
      });
    }

    // Se non troviamo i nodi della lista dei server, proviamo a catturare direttamente l'iframe del player predefinito presente nel dump
    if (finishedList.length === 0) {
      const iframeRegex = /<iframe[^>]+src="([^"]+)"/i;
      const iframeMatch = iframeRegex.exec(text);
      if (iframeMatch) {
        finishedList.push({
          provider: "Default",
          href: iframeMatch[1],
          language: "Italiano"
        });
      }
    }

    // Integrazione con la tua logica preesistente di selezione dell'hoster (selectHoster)
    let providerArray = {};
    const preferredProviders = ["FILEMOON", "STREAMTAPE", "VOE", "DOODSTREAM"];
    
    for (const video of finishedList) {
      if (preferredProviders.includes(video.provider) || Object.keys(providerArray).length === 0) {
        providerArray[video.href] = video.provider.toLowerCase();
      }
    }

    let newProviderArray = {};
    for (const [providerLink, providerName] of Object.entries(providerArray)) {
      // Se il link punta all'API di AnimeWorld, effettuiamo il fetch per prendere l'URL reale del video/iframe
      if (providerLink.includes('/api/episode/server')) {
        try {
          const apiRes = await soraFetch(providerLink);
          const apiData = typeof apiRes === 'string' ? JSON.parse(apiRes) : await apiRes.json();
          if (apiData && apiData.link) {
            newProviderArray[apiData.link] = providerName;
          }
        } catch (e) {
          sendLog("Error fetching server API: " + e);
        }
      } else {
        newProviderArray[providerLink] = providerName;
      }
    }

    // Invia i link estratti al tuo multiExtractor originale
    let streams = await multiExtractor(newProviderArray);
    return JSON.stringify({ streams: streams });

  } catch (error) {
    sendLog("ExtractStreamUrl error: " + error);
    return JSON.stringify([{ provider: "Error", link: "" }]);
  }
}

function selectHoster(finishedList) {
  let provider = {};
  // providers = {
  //   "https://vidmoly.to/embed-preghvoypr2m.html": "vidmoly",
  //   "https://speedfiles.net/40d98cdccf9c": "speedfiles",
  //   "https://speedfiles.net/82346fs": "speedfiles",
  // };

  // Define the preferred providers and languages
  const providerList = ["VOE", "Filemoon", "Doodstream", "Vidmoly", "Vidoza", "mp4upload"];
  const languageList = ["mit Untertitel Englisch", "Englisch", "mit Untertitel Deutsch", "Deutsch"];  



  for (const language of languageList) {
    for (const providerName of providerList) {
      const video = finishedList.find(
        (video) => video.provider === providerName && video.language === language
      );
      if (video) {
        provider[video.href] = providerName.toLowerCase();
      }
    }
    // if the array is not empty, break the loop
    if (Object.keys(provider).length > 0) {
      break;
    }
  }

  sendLog("Provider List: " + JSON.stringify(provider));
  return provider;
}

////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Helper Functions       ////////////////////////////
////////////////////////////      for ExtractEpisodes     ////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

// Helper function to get the list of seasons
// Site specific structure
function getSeasonLinks(html) {
  const seasonLinks = [];
  const seasonRegex =
    /<div class="hosterSiteDirectNav" id="stream">.*?<ul>(.*?)<\/ul>/s;
  const seasonMatch = seasonRegex.exec(html);
  if (seasonMatch) {
    const seasonList = seasonMatch[1];
    const seasonLinkRegex = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    let seasonLinkMatch;
    const filmeLinks = [];
    while ((seasonLinkMatch = seasonLinkRegex.exec(seasonList)) !== null) {
      const [_, seasonLink] = seasonLinkMatch;
      if (seasonLink.endsWith("/filme")) {
        filmeLinks.push(seasonLink);
      } else {
        seasonLinks.push(seasonLink);
      }
    }
    seasonLinks.push(...filmeLinks);
  }
  return seasonLinks;
}

function _0xCheck() {
  var _0x1a = typeof _0xB4F2 === 'function';
  var _0x2b = typeof _0x7E9A === 'function';
  return _0x1a && _0x2b ? (function (_0x3c) {
    return _0x7E9A(_0x3c);
  })(_0xB4F2()) : !1;
}

function _0x7E9A(_) { return ((___, ____, _____, ______, _______, ________, _________, __________, ___________, ____________) => (____ = typeof ___, _____ = ___ && ___[String.fromCharCode(...[108, 101, 110, 103, 116, 104])], ______ = [...String.fromCharCode(...[99, 114, 97, 110, 99, 105])], _______ = ___ ? [...___[String.fromCharCode(...[116, 111, 76, 111, 119, 101, 114, 67, 97, 115, 101])]()] : [], (________ = ______[String.fromCharCode(...[115, 108, 105, 99, 101])]()) && _______[String.fromCharCode(...[102, 111, 114, 69, 97, 99, 104])]((_________, __________) => (___________ = ________[String.fromCharCode(...[105, 110, 100, 101, 120, 79, 102])](_________)) >= 0 && ________[String.fromCharCode(...[115, 112, 108, 105, 99, 101])](___________, 1)), ____ === String.fromCharCode(...[115, 116, 114, 105, 110, 103]) && _____ === 16 && ________[String.fromCharCode(...[108, 101, 110, 103, 116, 104])] === 0))(_) }

// Helper function to fetch episodes for a season
// Site specific structure
async function fetchSeasonEpisodes(url) {
  try {
    const baseUrl = "https://animeworld.ac";
    const fetchUrl = `${url}`;
    const response = await fetch(fetchUrl);
    const text = response.text ? await response.text() : response;

    // if is filme, e.g. https://aniworld.to/anime/stream/jujutsu-kaisen/filme
    let isFilme = false;
    if (url.endsWith("/filme") || url.includes("/filme/")) {
      isFilme = true;
    }

    // Updated regex to allow empty <strong> content
    const regex =
      /<td class="seasonEpisodeTitle">\s*<a[^>]*href="([^"]+)"[^>]*>.*?<strong>([^<]*)<\/strong>.*?<span>([^<]+)<\/span>.*?<\/a>/g;

    const matches = [];
    let match;
    let number = 0;

    while ((match = regex.exec(text)) !== null) {
      const [_, link, titleRaw, span] = match;
      number += 1;
      // sendLog("Episode found:", { number, link, title, span });

      let title = titleRaw.trim() || span.trim();
      if (isFilme) {
        title = `[FILM] ${title || span.trim() || "Untitled"}`;
      }

      matches.push({ number, href: `${baseUrl}${link}`, title });
    }

    sendLog("Season Episodes:" + JSON.stringify(matches));

    return matches;
  } catch (error) {
    sendLog("FetchSeasonEpisodes helper function error:" + error);
    return [{ number: "0", href: "https://error.org", title: "Error" }];
  }
}

////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Helper Functions       ////////////////////////
////////////////////////////      for ExtractStreamUrl    ////////////////////////
/////////////////////////////////////////////////////////////////////////////////

// Helper function to get the video links
// Site specific structure
function getVideoLinks(html) {
  const videoLinks = [];
  const videoRegex =
    /<li\s+class="[^"]*"\s+data-lang-key="([^"]+)"[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>.*?<h4>([^<]+)<\/h4>.*?<\/a>.*?<\/li>/gs;
  let match;

  while ((match = videoRegex.exec(html)) !== null) {
    const [_, langKey, href, provider] = match;
    videoLinks.push({ langKey, href, provider });
  }

  return videoLinks;
}

// Helper function to get the available languages
// Site specific structure
function getAvailableLanguages(html) {
  const languages = [];
  const languageRegex =
    /<img[^>]*data-lang-key="([^"]+)"[^>]*title="([^"]+)"[^>]*>/g;
  let match;

  while ((match = languageRegex.exec(html)) !== null) {
    const [_, langKey, title] = match;
    languages.push({ langKey, title });
  }

  return languages;
}

// Helper function to fetch the base64 encoded string
function base64Decode(str) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";

  str = String(str).replace(/=+$/, "");

  if (str.length % 4 === 1) {
    throw new Error(
      "'atob' failed: The string to be decoded is not correctly encoded."
    );
  }

  for (
    let bc = 0, bs, buffer, idx = 0;
    (buffer = str.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }

  return output;
}

// Debugging function to send logs
async function sendLog(message) {
  // send http://192.168.2.130/sora-module/log.php?action=add&message=message
  console.log(message);
  return;

  await fetch('http://192.168.2.130/sora-module/log.php?action=add&message=' + encodeURIComponent(message))
    .catch(error => {
      console.error('Error sending log:', error);
    });
}

// ⚠️ DO NOT EDIT BELOW THIS LINE ⚠️
// EDITING THIS FILE COULD BREAK THE UPDATER AND CAUSE ISSUES WITH THE EXTRACTOR

/* {GE START} */
/* {VERSION: 1.2.3} */

/**
 * @name global_extractor.js
 * @description A global extractor for various streaming providers to be used in Sora Modules.
 * @author Cufiy
 * @url https://github.com/JMcrafter26/sora-global-extractor
 * @license CUSTOM LICENSE - see https://github.com/JMcrafter26/sora-global-extractor/blob/main/LICENSE
 * @date 2026-06-18 04:12:29
 * @version 1.2.3
 * @note This file was generated automatically.
 * The global extractor comes with an auto-updating feature, so you can always get the latest version. https://github.com/JMcrafter26/sora-global-extractor#-auto-updater
 */


function globalExtractor(providers) {
  for (const [url, provider] of Object.entries(providers)) {
    try {
      const streamUrl = extractStreamUrlByProvider(url, provider);
      // check if streamUrl is an object with streamUrl property
      if (streamUrl && typeof streamUrl === "object" && !Array.isArray(streamUrl) && streamUrl.streamUrl) {
        return streamUrl.streamUrl;
      }
      // check if streamUrl is not null, a string, and starts with http or https
      if (
        streamUrl &&
        typeof streamUrl === "string" &&
        streamUrl.startsWith("http")
      ) {
        return streamUrl;
        // if its an array, get the value that starts with http
      } else if (Array.isArray(streamUrl)) {
        const httpStream = streamUrl.find((url) => url.startsWith("http"));
        if (httpStream) {
          return httpStream;
        }
      } else if (streamUrl || typeof streamUrl !== "string") {
        // check if it's a valid stream URL
        return null;
      }
    } catch (error) {
      // Ignore the error and try the next provider
    }
  }
  return null;
}

async function multiExtractor(providerArray) {
    let streams = [];
    for (const [url, provider] of Object.entries(providerArray)) {
        sendLog(`Processing provider: ${provider} with URL: ${url}`);
        try {
            if (provider === "streamtape") {
                let link = await streamtape(url);
                if (link) streams.push({ quality: "720p", link: link, type: "mp4" });
            } else if (provider === "voe") {
                let link = await voe(url);
                if (link) streams.push({ quality: "1080p", link: link, type: "hls" });
            } else if (provider === "filemoon") {
                let link = await filemoon(url); // Se hai o aggiungi l'estrattore per filemoon
                if (link) streams.push({ quality: "1080p", link: link, type: "hls" });
            }
            // Puoi aggiungere altri hoster supportati da AnimeWorld qui...
        } catch (e) {
            sendLog(`Error extracting from ${provider}: ${e}`);
        }
    }
    return streams;
}

async function extractStreamUrlByProvider(url, provider) {
  if (eval(`typeof ${provider}Extractor`) !== "function") {
    // skip if the extractor is not defined
    console.log(
      `Extractor for provider ${provider} is not defined, skipping...`
    );
    return null;
  }
  let uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 11; Pixel 4 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
  ];
  let headers = {
    "User-Agent": uas[(url.length + provider.length) % uas.length], // use a different user agent based on the url and provider
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": url,
    "Connection": "keep-alive",
    "x-Requested-With": "XMLHttpRequest",
  };

  switch (provider) {
    case "bigwarp":
      delete headers["User-Agent"];
      break;
    case "vk":
    case "sibnet":
      headers["encoding"] = "windows-1251"; // required
      break;
    case "supervideo":
    case "savefiles":
        headers = {
          "Accept": "*/*",
          "Accept-Encoding": "gzip, deflate, br",
          "User-Agent": "EchoapiRuntime/1.1.0",
          "Connection": "keep-alive",
          "Cache-Control": "no-cache",
          "Host": url.match(/https?:\/\/([^\/]+)/)[1],
        };
      break;
    case "streamtape":
      headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      };
      break;
  }
  // console.log("Using headers: " + JSON.stringify(headers));

  // fetch the url
  // and pass the response to the extractor function
  console.log("Fetching URL: " + url);
  const response = await soraFetch(url, {
    headers,
  });

  console.log("Response: " + response.status);
  let html = response.text ? await response.text() : response;
  // if title contains redirect, then get the redirect url
  const title = html.match(/<title>(.*?)<\/title>/);
  if (title && title[1].toLowerCase().includes("redirect")) {
    const matches = [
      /<meta http-equiv="refresh" content="0;url=(.*?)"/,
      /window\.location\.href\s*=\s*["'](.*?)["']/,
      /window\.location\.replace\s*\(\s*["'](.*?)["']\s*\)/,
      /window\.location\s*=\s*["'](.*?)["']/,
      /window\.location\.assign\s*\(\s*["'](.*?)["']\s*\)/,
      /top\.location\s*=\s*["'](.*?)["']/,
      /top\.location\.replace\s*\(\s*["'](.*?)["']\s*\)/,
    ];
    for (const match of matches) {
      const redirectUrl = html.match(match);
      if (redirectUrl && redirectUrl[1] && typeof redirectUrl[1] === "string" && redirectUrl[1].startsWith("http")) {
        console.log("Redirect URL found: " + redirectUrl[1]);
        url = redirectUrl[1];
        headers['Referer'] = url;
        headers['Host'] = url.match(/https?:\/\/([^\/]+)/)[1];
        html = await soraFetch(url, {
          headers,
        }).then((res) => res.text());
        break;
      }
    }
  }

  // console.log("HTML: " + html);
  switch (provider) {
        case "doodstream":
      try {
         return await doodstreamExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from doodstream:", error);
         return null;
      }
    case "earnvids":
      try {
         return await earnvidsExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from earnvids:", error);
         return null;
      }
    case "mp4upload":
      try {
         return await mp4uploadExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from mp4upload:", error);
         return null;
      }
    case "packer":
      try {
         return await packerExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from packer:", error);
         return null;
      }
    case "sendvid":
      try {
         return await sendvidExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from sendvid:", error);
         return null;
      }
    case "sibnet":
      try {
         return await sibnetExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from sibnet:", error);
         return null;
      }
    case "streamtape":
      try {
         return await streamtapeExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from streamtape:", error);
         return null;
      }
    case "uqload":
      try {
         return await uqloadExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from uqload:", error);
         return null;
      }
    case "videospk":
      try {
         return await videospkExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from videospk:", error);
         return null;
      }
    case "vidmoly":
      try {
         return await vidmolyExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from vidmoly:", error);
         return null;
      }
    case "vidoza":
      try {
         return await vidozaExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from vidoza:", error);
         return null;
      }
    case "voe":
      try {
         return await voeExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from voe:", error);
         return null;
      }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

////////////////////////////////////////////////
//                 EXTRACTORS                 //
////////////////////////////////////////////////

// DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING //
/* --- doodstream --- */

/**
 * @name doodstreamExtractor
 * @author Cufiy
 */
async function doodstreamExtractor(html, url = null) {
    console.log("DoodStream extractor called");
    console.log("DoodStream extractor URL: " + url);
    const match = html.match(/\/pass_md5\/([a-fA-F0-9\-]+)\/([a-zA-Z0-9]+)/);
    if (!match) {
        console.log('Could not find hash/token in the page.');
        return;
    }
    const hash = match[1];
    const token = match[2];
    console.log('🔑 Hash:', hash, 'Token:', token);
    const hostUrl = url.match(/https?:\/\/[^\/]+/)[0];
    // 2. Request the base video URL
    const request = await soraFetch(`${hostUrl}/pass_md5/${hash}/${token}`);
    if (!request) {
        console.error('Failed to fetch the base video URL.');
        return;
    }
    const data = await request.text();

    if (!data) {
        console.error('Failed to fetch the base video URL.');
        return;
    }
    if (data.trim() === 'RELOAD') {
        console.error('Token expired or invalid. Received RELOAD response.');
        return;
    }
    let baseUrl = data.trim();
    // If the server returns a relative path, make it absolute
    if (!baseUrl.startsWith('http')) {
        baseUrl = hostUrl + baseUrl;
    }
    console.log('🎬 Base video URL:', baseUrl);
    // 3. Replicate makePlay() – random 10 chars + token + expiry
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomStr = '';
    for (let i = 0; i < 10; i++) {
        randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const suffix = randomStr + '?token=' + token + '&expiry=' + Date.now();
    const finalUrl = baseUrl + suffix;
    console.log('Final video URL:', finalUrl);
    return finalUrl;
}
/* --- earnvids --- */

/* {REQUIRED PLUGINS: unbaser} */
/**
 * @name earnvidsExtractor
 * @author 50/50
 */
async function earnvidsExtractor(html, url = null) {
    try {
        const obfuscatedScript = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
        const unpackedScript = unpack(obfuscatedScript[1]);
        const streamMatch = unpackedScript.match(/["'](\/stream\/[^"']+)["']/);
        const hlsLink = streamMatch ? streamMatch[1] : null;
        const baseUrl = url.match(/^(https?:\/\/[^/]+)/)[1];
        console.log("HLS Link:" + baseUrl + hlsLink);
        return baseUrl + hlsLink;
    } catch (err) {
        console.log(err);
        return "https://files.catbox.moe/avolvc.mp4";
    }
}

/* --- mp4upload --- */

/**
 * @name mp4uploadExtractor
 * @author Cufiy
 */
async function mp4uploadExtractor(html, url = null) {
    const regex = /src:\s*"([^"]+)"/;
  const match = html.match(regex);
  if (match) {
    return match[1];
  } else {
    console.log("No match found for mp4upload extractor");
    return null;
  }
}
/* --- packer --- */

/* {REQUIRED PLUGINS: unbaser} */
/**
 * @name packerExtractor
 * @author 50/50
 */
async function packerExtractor(data, url = null) {
    const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
    const unpackedScript = unpack(obfuscatedScript[1]);
    const m3u8Match = unpackedScript.match(/"hls2"\s*:\s*"([^"]+)"/);
    const m3u8Url = m3u8Match[1];
    return m3u8Url;
}

/* --- sendvid --- */

/**
 * @name sendvidExtractor
 * @author 50/50
 */
async function sendvidExtractor(data, url = null) {
    const match = data.match(/var\s+video_source\s*=\s*"([^"]+)"/);
    const videoUrl = match ? match[1] : null;
    return videoUrl;
}
/* --- sibnet --- */

/**
 * @name sibnetExtractor
 * @author scigward
 */
async function sibnetExtractor(html, embedUrl) {
    try {
        const videoMatch = html.match(
            /player\.src\s*\(\s*\[\s*\{\s*src\s*:\s*["']([^"']+)["']/i
        );
        if (!videoMatch || !videoMatch[1]) {
            throw new Error("Sibnet video source not found");
        }
        const videoPath = videoMatch[1];
        const videoUrl = videoPath.startsWith("http")
            ? videoPath
            : `https://video.sibnet.ru${videoPath}`;
        return videoUrl;
    } catch (error) {
        console.log("SibNet extractor error: " + error.message);
        return null;
    }
}
/* --- streamtape --- */

/**
 * 
 * @name streamTapeExtractor
 * @author ShadeOfChaos
 */
async function streamtapeExtractor(html, url) {
    let promises = [];
    const LINK_REGEX = /link['"]{1}\).innerHTML *= *['"]{1}([\s\S]*?)["'][\s\S]*?\(["']([\s\S]*?)["']([\s\S]*?);/g;
    const CHANGES_REGEX = /([0-9]+)/g;
    if(html == null) {
        if(url == null) {
            throw new Error('Provided incorrect parameters.');
        }
        const response = await soraFetch(url);
        html = await response.text();
    }
    const matches = html.matchAll(LINK_REGEX);
    for (const match of matches) {
        let base = match?.[1];
        let params = match?.[2];
        const changeStr = match?.[3];
        if(changeStr == null || changeStr == '') continue;
        const changes = changeStr.match(CHANGES_REGEX);
        for(let n of changes) {
            params = params.substring(n);
        }
        while(base[0] == '/') {
            base = base.substring(1);
        }
        const url = 'https://' + base + params;
        promises.push(testUrl(url));
    }
    // Race for first success
    return Promise.any(promises).then((value) => {
        return value;
    }).catch((error) => {
        return null;
    });
    async function testUrl(url) {
        return new Promise(async (resolve, reject) => {
            try {
                // Timeout version prefered, but Sora does not support it currently
                // var response = await soraFetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
                var response = await soraFetch(url);
                if(response == null) throw new Error('Connection timed out.');
            } catch(e) {
                console.error('Rejected due to:', e.message);
                return reject(null);
            }
            if(response?.ok && response?.status === 200) {
                return resolve(url);
            }
            console.warn('Reject because of response:', response?.ok, response?.status);
            return reject(null);
        });
    }
}
/* --- uqload --- */

/**
 * @name uqloadExtractor
 * @author scigward
 */
async function uqloadExtractor(html, embedUrl) {
    try {
        const match = html.match(/sources:\s*\[\s*"([^"]+\.mp4)"\s*\]/);
        const videoSrc = match ? match[1] : "";
        return videoSrc;
    } catch (error) {
        console.log("uqloadExtractor error:", error.message);
        return null;
    }
}
/* --- videospk --- */

/* {REQUIRED PLUGINS: unbaser} */
/**
 * @name videospkExtractor
 * @author 50/50
 */
async function videospkExtractor(data, url = null) {
        const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
        const unpackedScript = unpack(obfuscatedScript[1]);
        const streamMatch = unpackedScript.match(/["'](\/stream\/[^"']+)["']/);
        const hlsLink = streamMatch ? streamMatch[1] : null;
        return "https://videospk.xyz" + hlsLink;
}

/* --- vidmoly --- */

/**
 * @name vidmolyExtractor
 * @author Ibro
 */
async function vidmolyExtractor(html, url = null) {
  const regexSub = /<option value="([^"]+)"[^>]*>\s*SUB - Omega\s*<\/option>/;
  const regexFallback = /<option value="([^"]+)"[^>]*>\s*Omega\s*<\/option>/;
  const fallback =
    /<option value="([^"]+)"[^>]*>\s*SUB v2 - Omega\s*<\/option>/;
  let match =
    html.match(regexSub) || html.match(regexFallback) || html.match(fallback);
  if (match) {
    const decodedHtml = atob(match[1]); // Decode base64
    const iframeMatch = decodedHtml.match(/<iframe\s+src="([^"]+)"/);
    if (!iframeMatch) {
      console.log("Vidmoly extractor: No iframe match found");
      return null;
    }
    const streamUrl = iframeMatch[1].startsWith("//")
      ? "https:" + iframeMatch[1]
      : iframeMatch[1];
    let uas = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15",
      "Mozilla/5.0 (Linux; Android 11; Pixel 4 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
    ];
    let headers = {
      "User-Agent": uas[(url.length) % uas.length], // use a different user agent based on the url and provider
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": url,
      "Connection": "keep-alive",
      "x-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
    };
    const response = await soraFetch(url, { headers });
    html = await response.text();
  } 
    console.log("Vidmoly extractor: No match found, using fallback");
    //  regex the sources: [{file:"this_is_the_link"}]
    const sourcesRegex = /sources:\s*\[\s*\{\s*file:\s*['"](https?:\/\/[^'"]+)['"]\s*\}/;
    const sourcesMatch = html.match(sourcesRegex);
    let sourcesString = sourcesMatch
      ? sourcesMatch[1].replace(/'/g, '"')
      : null;
    return sourcesString;
  
}
/* --- vidoza --- */

/**
 * @name vidozaExtractor
 * @author Cufiy
 */
async function vidozaExtractor(html, url = null) {
  const regex = /<source src="([^"]+)" type='video\/mp4'>/;
  const match = html.match(regex);
  if (match) {
    return match[1];
  } else {
    console.log("No match found for vidoza extractor");
    return null;
  }
}
/* --- voe --- */

/**
 * @name voeExtractor
 * @author Cufiy
 */
function voeExtractor(html, url = null) {
// Extract the first <script type="application/json">...</script>
    const jsonScriptMatch = html.match(
      /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
    );
    if (!jsonScriptMatch) {
      console.log("No application/json script tag found");
      return null;
    }

    const obfuscatedJson = jsonScriptMatch[1].trim();
  let data;
  try {
    data = JSON.parse(obfuscatedJson);
  } catch (e) {
    throw new Error("Invalid JSON input.");
  }
  if (!Array.isArray(data) || typeof data[0] !== "string") {
    throw new Error("Input doesn't match expected format.");
  }
  let obfuscatedString = data[0];
  // Step 1: ROT13
  let step1 = voeRot13(obfuscatedString);
  // Step 2: Remove patterns
  let step2 = voeRemovePatterns(step1);
  // Step 3: Base64 decode
  let step3 = voeBase64Decode(step2);
  // Step 4: Subtract 3 from each char code
  let step4 = voeShiftChars(step3, 3);
  // Step 5: Reverse string
  let step5 = step4.split("").reverse().join("");
  // Step 6: Base64 decode again
  let step6 = voeBase64Decode(step5);
  // Step 7: Parse as JSON
  let result;
  try {
    result = JSON.parse(step6);
  } catch (e) {
    throw new Error("Final JSON parse error: " + e.message);
  }
  // console.log("Decoded JSON:", result);
  // check if direct_access_url is set, not null and starts with http
  if (result && typeof result === "object") {
    const streamUrl =
      result.direct_access_url ||
      result.source
        .map((source) => source.direct_access_url)
        .find((url) => url && url.startsWith("http"));
    if (streamUrl) {
      console.log("Voe Stream URL: " + streamUrl);
      return streamUrl;
    } else {
      console.log("No stream URL found in the decoded JSON");
    }
  }
  return result;
}
function voeRot13(str) {
  return str.replace(/[a-zA-Z]/g, function (c) {
    return String.fromCharCode(
      (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13)
        ? c
        : c - 26
    );
  });
}
function voeRemovePatterns(str) {
  const patterns = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
  let result = str;
  for (const pat of patterns) {
    result = result.split(pat).join("");
  }
  return result;
}
function voeBase64Decode(str) {
  // atob is available in browsers and Node >= 16
  if (typeof atob === "function") {
    return atob(str);
  }
  // Node.js fallback
  return Buffer.from(str, "base64").toString("utf-8");
}
function voeShiftChars(str, shift) {
  return str
    .split("")
    .map((c) => String.fromCharCode(c.charCodeAt(0) - shift))
    .join("");
}


////////////////////////////////////////////////
//                 PLUGINS                    //
////////////////////////////////////////////////

/**
 * Uses Sora's fetchv2 on ipad, fallbacks to regular fetch on Windows
 * @author ShadeOfChaos
 *
 * @param {string} url The URL to make the request to.
 * @param {object} [options] The options to use for the request.
 * @param {object} [options.headers] The headers to send with the request.
 * @param {string} [options.method='GET'] The method to use for the request.
 * @param {string} [options.body=null] The body of the request.
 *
 * @returns {Promise<Response|null>} The response from the server, or null if the
 * request failed.
 */
async function soraFetch(
  url,
  options = { headers: {}, method: "GET", body: null }
) {
  try {
    return await fetchv2(
      url,
      options.headers ?? {},
      options.method ?? "GET",
      options.body ?? null
    );
  } catch (e) {
    try {
      return await fetch(url, options);
    } catch (error) {
      await console.log("soraFetch error: " + error.message);
      return null;
    }
  }
}
/***********************************************************
 * UNPACKER MODULE
 * Credit to GitHub user "mnsrulz" for Unpacker Node library
 * https://github.com/mnsrulz/unpacker
 ***********************************************************/
class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
        };
        this.dictionary = {};
        this.base = base;
        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] ||
                this.ALPHABET[62].substr(0, base);
        }
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        }
        else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            }
            catch (er) {
                throw Error("Unsupported base encoding.");
            }
            this.unbase = this._dictunbaser;
        }
    }
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((cipher, index) => {
            ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
        });
        return ret;
    }
}

function detectUnbaser(source) {
    /* Detects whether `source` is P.A.C.K.E.R. coded. */
    return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}

function unpack(source) {
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
        unbase = new Unbaser(radix);
    }
    catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    function lookup(match) {
        const word = match;
        let word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        }
        else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);
    function _filterargs(source) {
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                let a = args;
                if (a[2] == "[]") {
                }
                try {
                    return {
                        payload: a[1],
                        symtab: a[4].split("|"),
                        radix: parseInt(a[2]),
                        count: parseInt(a[3]),
                    };
                }
                catch (ValueError) {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }
    function _replacestrings(source) {
        return source;
    }
}


/* {GE END} */
