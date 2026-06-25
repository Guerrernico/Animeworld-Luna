async function searchResults(keyword) {
    const results = [];
    const baseUrl = "https://animeworld.ac";
    
    try {
        // Usiamo /filter invece di /search. Questo endpoint costringe il server
        // a restituire la struttura standard ad elenco (film-list) in modo pulito.
        const response = await soraFetch(`${baseUrl}/filter?keyword=${encodeURIComponent(keyword)}`);
        const html = await response.text();
        
        // Regex ultra-flessibile: intercetta l'elemento a prescindere da quanti spazi 
        // o attributi extra (come data-id, data-jtitle) i programmatori del sito abbiano inserito.
        const regex = /<div[^>]*class="item"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<a[^>]*class="name"[^>]*>([\s\S]*?)<\/a>/g;
        
        let match;
        const lowerKeyword = keyword.toLowerCase().trim();

        while ((match = regex.exec(html)) !== null) {
            let href = match[1].trim();
            let imageUrl = match[2].trim();
            // Puliamo il titolo da eventuali tag interni o spazi strani
            const title = match[3].replace(/<[^>]*>/g, "").trim(); 
            const lowerTitle = title.toLowerCase();

            // Controllo di corrispondenza: la parola deve essere presente nel titolo italiano o nell'URL
            if (!lowerTitle.includes(lowerKeyword) && !href.toLowerCase().includes(lowerKeyword)) {
                continue; 
            }
            
            // Correzione dei link relativi
            if (!imageUrl.startsWith("https")) {
                imageUrl = imageUrl.startsWith("/") ? baseUrl + imageUrl : baseUrl + "/" + imageUrl;
            }
            if (!href.startsWith("https")) {
                href = href.startsWith("/") ? baseUrl + href : baseUrl + "/" + href;
            }
            
            results.push({
                title: title,
                image: imageUrl,
                href: href
            });
        }
        
        // Se la ricerca con filtro non ha prodotto nulla, facciamo un fallback sulla ricerca classica
        if (results.length === 0) {
            console.log("Nessun risultato con /filter, provo fallback su /search...");
            return await backupSearch(keyword, baseUrl);
        }

        console.log("Risultati trovati:", JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.log("Search error:", error);
        return JSON.stringify([]);
    }
}

// Funzione di riserva (nel caso in cui il filtro fallisca o il sito richieda /search)
async function backupSearch(keyword, baseUrl) {
    const results = [];
    try {
        const response = await soraFetch(`${baseUrl}/search?keyword=${encodeURIComponent(keyword)}`);
        const html = await response.text();
        const regex = /<div[^>]*class="item"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<a[^>]*class="name"[^>]*>([\s\S]*?)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            let href = match[1].trim();
            let imageUrl = match[2].trim();
            const title = match[3].replace(/<[^>]*>/g, "").trim();

            if (!imageUrl.startsWith("https")) imageUrl = imageUrl.startsWith("/") ? baseUrl + imageUrl : baseUrl + "/" + imageUrl;
            if (!href.startsWith("https")) href = href.startsWith("/") ? baseUrl + href : baseUrl + "/" + href;

            results.push({ title, image: imageUrl, href });
        }
        return JSON.stringify(results);
    } catch (e) {
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