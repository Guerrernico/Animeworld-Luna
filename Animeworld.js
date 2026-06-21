///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Main Functions          //////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

async function searchResults(keyword) {
  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const searchUrl = `https://www.animeworld.ac/search?keyword=${encodedKeyword}`;
    const responseText = await soraFetch(searchUrl);
    const text = responseText.text ? await responseText.text() : responseText;

    const transformedResults = [];
    const itemRegex = /<a[^>]+class="[^"]*poster[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(text)) !== null) {
      const itemHtml = itemMatch[0];
      const innerContent = itemMatch[1];

      const hrefMatch = itemHtml.match(/href="([^"]+)"/);
      const srcMatch = innerContent.match(/src="([^"]+)"/);
      const altMatch = innerContent.match(/alt="([^"]+)"/) || innerContent.match(/title="([^"]+)"/);

      if (hrefMatch && srcMatch && altMatch) {
        const title = altMatch[1].trim();
        const image = srcMatch[1].startsWith('http') ? srcMatch[1] : `https://www.animeworld.ac${srcMatch[1]}`;
        const href = hrefMatch[1].startsWith('http') ? hrefMatch[1] : `https://www.animeworld.ac${hrefMatch[1]}`;

        transformedResults.push({ title, image, href });
      }
    }

    return JSON.stringify(transformedResults);
  } catch (error) {
    sendLog("Search error: " + error);
    return JSON.stringify([{ title: "Error", image: "", href: "" }]);
  }
}

async function extractDetails(url) {
  try {
    const responseText = await soraFetch(url);
    const html = responseText.text ? await responseText.text() : responseText;

    let description = "Nessuna descrizione disponibile";
    const descMatch = html.match(/<div\s+class="desc">([\s\S]*?)<\/div>/i);
    if (descMatch) {
      description = descMatch[1].replace(/<[^>]*>/g, "").trim();
    }

    const titleRegex = /window\.animeName\s*=\s*decodeURIComponent\("([^"]+)"\)/;
    const titleMatch = titleRegex.exec(html);
    let title = "Unknown";
    if (titleMatch) {
      title = decodeURIComponent(titleMatch[1]);
    }

    // Struttura piatta ad array richiesta dall'applicazione
    const transformedResults = [{
      description: description,
      aliases: title,
      airdate: "Disponibile"
    }];

    return JSON.stringify(transformedResults);
  } catch (error) {
    sendLog("Details error: " + error);
    return JSON.stringify([{ description: "Errore dettagli", aliases: "Unknown", airdate: "Unknown" }]);
  }
}

async function extractEpisodes(url) {
  try {
    const responseText = await soraFetch(url);
    const html = responseText.text ? await responseText.text() : responseText;

    // Troviamo il numero totale di episodi nella scheda di AnimeWorld
    const totalEpMatch = html.match(/Episodi:\s*<\/span>\s*<span[^>]*>(\d+)/i) || 
                         html.match(/<strong>Episodi:<\/strong>\s*(\d+)/i) ||
                         html.match(/<dd[^>]*>(\d+)<\/dd>/i);

    let totalEpisodes = 1; // Fallback minimo (es. Film o OAV)
    if (totalEpMatch && totalEpMatch[1]) {
      totalEpisodes = parseInt(totalEpMatch[1], 10);
    } else {
      // Secondo tentativo: contiamo quanti elementi episodi effettivi ci sono nell'HTML
      const countMatches = html.match(/data-episode-num="(\d+)"/g);
      if (countMatches) {
        totalEpisodes = countMatches.length;
      }
    }

    const transformedResults = [];
    // Puliamo l'URL di base mantenendo solo la struttura pulita della serie
    let baseUrl = url.split('/episodio-')[0];

    // Genera la lista dinamica che l'app leggerà autonomamente
    for (let i = 1; i <= totalEpisodes; i++) {
      transformedResults.push({
        href: `${baseUrl}/episodio-${i}`,
        number: i
      });
    }

    return JSON.stringify(transformedResults);
  } catch (error) {
    sendLog("ExtractEpisodes error: " + error);
    return JSON.stringify([]);
  }
}

async function extractStreamUrl(url) {
  try {
    sendLog("Inizio estrazione streaming avanzata per: " + url);
    
    // Configuriamo gli headers di base per simulare un browser vero ed evitare i blocchi di AnimeWorld
    const requestOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': url,
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    // Eseguiamo il fetch della pagina dell'episodio passando gli headers
    const response = await soraFetch(url, requestOptions);
    const text = response.text ? await response.text() : response;
    const finishedList = [];

    // Regex per estrarre data-id e data-name dei server video
    const serverRegex = /data-id="(\d+)"[^>]*data-name="([^"]+)"|data-name="([^"]+)"[^>]*data-id="(\d+)"/g;
    let match;

    while ((match = serverRegex.exec(text)) !== null) {
      const serverId = match[1] || match[4];
      const serverName = (match[2] || match[3]).toUpperCase().trim();

      const providerApiUrl = `https://www.animeworld.ac/api/episode/server?id=${serverId}`;
      finishedList.push({
        provider: serverName,
        href: providerApiUrl,
        language: "Italiano"
      });
    }

    // Fallback: se la regex non trova elementi dedicati, cerca un iframe generico nel testo della pagina
    if (finishedList.length === 0) {
      const iframeRegex = /<iframe[^>]+src="([^"]+)"/i;
      const iframeMatch = iframeRegex.exec(text);
      if (iframeMatch) {
        finishedList.push({ provider: "DEFAULT", href: iframeMatch[1], language: "Italiano" });
      }
    }

    let providerArray = {};
    const supportedProviders = ["FILEMOON", "STREAMTAPE", "VOE", "DOODSTREAM"];
    
    for (const video of finishedList) {
      if (supportedProviders.includes(video.provider) || video.provider === "DEFAULT") {
        let realLink = video.href;
        
        // Se il link punta all'API di AnimeWorld, interroghiamola usando gli stessi headers protetti
        if (realLink.includes('/api/episode/server')) {
          try {
            const apiRes = await soraFetch(realLink, requestOptions);
            const apiText = apiRes.text ? await apiRes.text() : apiRes;
            
            // Gestione sicura del parsing JSON (evita crash se il sito risponde con testo/html di errore)
            let apiData;
            try {
              apiData = typeof apiText === 'string' ? JSON.parse(apiText) : apiText;
            } catch(e) {
              continue;
            }

            if (apiData && apiData.link) {
              realLink = apiData.link;
            } else {
              continue;
            }
          } catch (e) {
            sendLog("Errore API Server: " + e);
            continue;
          }
        }
        
        // Mappiamo il link reale associandolo al rispettivo hoster in minuscolo per il multiExtractor
        providerArray[realLink] = video.provider.toLowerCase();
      }
    }

    sendLog("Link inviati al multiExtractor: " + JSON.stringify(providerArray));

    // Passiamo i link reali decodificati al motore dell'applicazione
    let streams = await multiExtractor(providerArray);
    
    // Uniformiamo l'output al formato richiesto dalle ultime versioni delle app di streaming
    // Se l'array interno richiede una struttura specifica (es. streamUrl), la mappiamo
    const formattedStreams = streams.map(stream => {
      return {
        title: stream.title || "Stream",
        streamUrl: stream.streamUrl || stream.url || "",
        headers: { 'Referer': url } // Passiamo il referer anche al player video finale
      };
    }).filter(s => s.streamUrl !== ""); // Rimuove eventuali flussi vuoti

    return JSON.stringify({ streams: formattedStreams });

  } catch (error) {
    sendLog("ExtractStreamUrl error: " + error);
    return JSON.stringify({ streams: [] });
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