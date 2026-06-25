async function searchResults(keyword) {
    const results = [];
    const baseUrl = "https://animeworld.ac";
    
    try {
        const response = await soraFetch(`${baseUrl}/search?keyword=${encodeURIComponent(keyword)}`);
        const html = await response.text();
        
        // 1. Isoliaramo l'area CONTENITORE dei risultati di ricerca (escludendo le sidebar laterali)
        // Solitamente su AnimeWorld l'area di ricerca principale è dentro un div con id o classe specifica, 
        // o racchiusa tra il main-content. Usiamo un filtro più mirato:
        const mainContentRegex = /<div class="col-xs-12 col-sm-12 col-md-8 col-lg-9 col-xl-9(?: left-sidebar)?">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="col-xs-12 col-sm-12 col-md-4 col-lg-3 col-xl-3/;
        let searchArea = html;
        
        const mainMatch = html.match(mainContentRegex);
        if (mainMatch) {
            searchArea = mainMatch[1]; // Prendiamo solo la colonna di sinistra (risultati)
        } else {
            // Alternativa se la struttura cambia: prendiamo solo i blocchi dei risultati effettivi
            // Evitando di leggere tutta la pagina a vuoto
            const alternativeRegex = /<div class="film-list">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/;
            const altMatch = html.match(alternativeRegex);
            if (altMatch) searchArea = altMatch[0];
        }
        
        // 2. Ora estraiamo gli item SOLO dall'area protetta dei risultati reali
        const itemRegex = /<div class="item">[\s\S]*?<\/div>\s*<\/div>/g;
        const items = searchArea.match(itemRegex) || [];
        
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
                
                const isDuplicate = results.some(r => r.href === href);
                if (!isDuplicate) {
                    results.push({
                        title: title.trim(),
                        image: imageUrl,
                        href: href,
                    });
                }
            }
        });
        
        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.log("Search error:", error);
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
        
        console.log(JSON.stringify(details));
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
        const baseUrl = "https://animeworld.ac";
        
        const serverActiveRegex = /<div class="server active"[^>]*>([\s\S]*?)<\/ul>\s*<\/div>/;
        const serverActiveMatch = html.match(serverActiveRegex);
        
        if (!serverActiveMatch) {
            return JSON.stringify(episodes);
        }
        
        const serverActiveContent = serverActiveMatch[1];
        const episodeRegex = /<li class="episode">\s*<a[^>]*?href="([^"]+)"[^>]*?>([^<]+)<\/a>/g;
        let match;
        
        while ((match = episodeRegex.exec(serverActiveContent)) !== null) {
            let href = match[1];
            const number = parseInt(match[2], 10);
            
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
        
        console.log(JSON.stringify(episodes));
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Episodes error:", error);
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