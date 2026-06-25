async function searchResults(keyword) {
    const results = [];
    const baseUrl = "https://animeworld.ac";
    
    try {
        const response = await soraFetch(`${baseUrl}/search?keyword=${encodeURIComponent(keyword)}`);
        const html = await response.text();
        
        const filmListRegex = /<div class="film-list">([\s\S]*?)<div class="clearfix"><\/div>\s*<\/div>/;
        const filmListMatch = html.match(filmListRegex);
        
        if (!filmListMatch) {
            return JSON.stringify(results);
        }
        
        const filmListContent = filmListMatch[1];
        const itemRegex = /<div class="item">[\s\S]*?<\/div>[\s]*<\/div>/g;
        const items = filmListContent.match(itemRegex) || [];
        
        items.forEach((itemHtml) => {
            const imgMatch = itemHtml.match(/src="([^"]+)"/);
            let imageUrl = imgMatch ? imgMatch[1] : "";
            
            const titleMatch = itemHtml.match(/class="name">([^<]+)</);
            const title = titleMatch ? titleMatch[1] : "";
            
            const hrefMatch = itemHtml.match(/href="([^"]+)"/);
            let href = hrefMatch ? hrefMatch[1] : "";
            
            if (imageUrl && title && href) {
                if (!imageUrl.startsWith("https")) {
                    if (imageUrl.startsWith("/")) {
                        imageUrl = baseUrl + imageUrl;
                    } else {
                        imageUrl = baseUrl + "/" + href;
                    }
                }
                
                if (!href.startsWith("https")) {
                    if (href.startsWith("/")) {
                        href = baseUrl + href;
                    } else {
                        href = baseUrl + "/" + href;
                    }
                }
                
                // CORREZIONE: Rimosso il blocco che scartava i Film. Ora vengono inclusi!
                results.push({
                    title: title.trim(),
                    image: imageUrl,
                    href: href,
                });
            }
        });
        
        return JSON.stringify(results);
    } catch (error) {
        console.log("Search error:", error);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();
        
        const episodes = [];
        const baseUrl = "https://www.animeworld.ac";
        
        // Verifichiamo se la pagina contiene i link degli episodi standard
        const regex = /<a[^>]+data-episode-num="(\d+)"[^>]+href="([^"]+)"/g;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            const number = parseInt(match[1], 10);
            let href = match[2];
            
            if (!href.startsWith("https")) {
                if (href.startsWith("/")) {
                    href = baseUrl + href;
                } else {
                    href = baseUrl + "/" + href;
                }
            }
            
            episodes.push({
                href: href,
                number: number,
            });
        }
        
        // CORREZIONE PER I FILM: Se la regex sopra non trova episodi, significa che è un Film o OAV singolo.
        // Estraiamo l'ID dell'episodio direttamente dalla variabile del player di AnimeWorld (window.animeId o simili)
        if (episodes.length === 0) {
            // Cerchiamo l'ID dell'episodio unico nell'HTML (es. data-id="..." nei widget del server attivo)
            const idMatch = html.match(/data-id="(\d+)"[^>]*class="[^"]*server[^"]*"/) || 
                            html.match(/data-episode-id="(\d+)"/) ||
                            html.match(/window\.animeId\s*=\s*(\d+)/);
                            
            if (idMatch) {
                // Generiamo l'URL finto o diretto dell'episodio che l'app userà per fare l'estrazione video
                episodes.push({
                    href: `${baseUrl}/play/${idMatch[1]}`, // Passiamo l'ID pulito per la riproduzione diretta
                    number: 1
                });
                sendLog("Rilevato Film. Generato link video con ID: " + idMatch[1]);
            } else {
                // Fallback estremo: usa l'URL della scheda stessa
                episodes.push({
                    href: url,
                    number: 1
                });
            }
        }
        
        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Episodes error:", error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();
        
        const details = [];
        
        const descriptionMatch = html.match(/<div class="desc">([\s\S]*?)<\/div>/);
        let description = descriptionMatch ? descriptionMatch[1] : "";
        
        const aliasesMatch = html.match(/<h2 class="title" data-jtitle="([^"]+)">/);
        let aliases = aliasesMatch ? aliasesMatch[1] : "";
        
        const airdateMatch = html.match(/<dt>Data di Uscita:<\/dt>\s*<dd>([^<]+)<\/dd>/);
        let airdate = airdateMatch ? airdateMatch[1] : "";
        
        if (description && aliases && airdate) {
            details.push({
            description: description,
            aliases: aliases,
            airdate: airdate,
            });
        }
        
        return JSON.stringify(details);
    } catch (error) {
        console.log("Details error:", error);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();
        
        const episodes = [];
        const baseUrl = "https://www.animeworld.ac";
        
        // 1. Verifichiamo se si tratta di un Film (Movie) o di un OAV a episodio singolo
        // AnimeWorld inserisce spesso "Movie" o "Film" nelle informazioni della scheda, oppure controlliamo se mancano del tutto i link degli episodi nell'HTML
        const isMovie = html.includes("<li><label>Tipo:</label> <span>Movie</span>") || 
                        html.includes("<li><label>Tipo:</label> <span>Film</span>") ||
                        !html.includes("data-episode-num=");

        if (isMovie) {
            // Se è un film, l'URL principale è già la pagina del player.
            // Restituiamo un solo "episodio" che rimanda direttamente all'URL di base della scheda
            episodes.push({
                href: url,
                number: 1
            });
            
            sendLog("Rilevato Film/Movie. Generato episodio singolo diretto.");
            return JSON.stringify(episodes);
        }
        
        // 2. Se NON è un film, procediamo con la normale estrazione degli episodi dell'anime/serie
        const regex = /<a[^>]+data-episode-num="(\d+)"[^>]+href="([^"]+)"/g;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            const number = parseInt(match[1], 10);
            let href = match[2];
            
            if (!href.startsWith("https")) {
                if (href.startsWith("/")) {
                    href = baseUrl + href;
                } else {
                    href = baseUrl + "/" + href;
                }
            }
            
            episodes.push({
                href: href,
                number: number
            });
        }
        
        // Ordinamento di sicurezza degli episodi (dal primo all'ultimo)
        episodes.sort((a, b) => a.number - b.number);
        
        // Fallback di sicurezza: se la regex degli episodi fallisce ma non era un film rilevato prima,
        // evitiamo comunque di lasciare la lista vuota rimandando all'URL principale
        if (episodes.length === 0) {
            episodes.push({
                href: url,
                number: 1
            });
        }
        
        return JSON.stringify(episodes);
    } catch (error) {
        sendLog("Episodes error: " + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const pathParts = url.split('/');
        const code = pathParts[pathParts.length - 1];
        
        const apiUrl = `https://www.animeworld.ac/api/episode/info?id=${code}&alt=0`;
        
        const response = await soraFetch(apiUrl);
        const json = JSON.parse(await response.text());
        
        return json.grabber;
    } catch (error) {
        console.log("Stream URL error:", error);
        return "https://files.catbox.moe/avolvc.mp4";
    }
}

async function soraFetch(url, options = { headers: {}, method: "GET", body: null, encoding: "utf-8" }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? "GET", options.body ?? null, true, options.encoding ?? "utf-8");
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
