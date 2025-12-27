// Dynamic movie and TV show data from vidsrcme.ru API
let movieData = {
    trending: [],
    movies: [],
    tvShows: []
};

// Global variables
let currentSection = '';
let currentPage = 1;
let totalPages = 1;
let totalItems = 0;
let itemsPerPage = 20;

let deferredInstallPrompt = null;

let __vortexTranslateLoaded = false;

const COUNTRY_CACHE_STORAGE_KEY = 'vortexCountryCache';
const COUNTRY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FOOTER_COUNTRIES_MAX_ITEMS = 30;

let selectedCountryCode = null;
let lastSearchTerm = '';

const footerCountryState = {
    indexMovies: [],
    indexTv: [],
    movies: [],
    tvshows: [],
    trending: [],
    search: []
};

function shuffleArray(arr) {
    const a = Array.isArray(arr) ? arr.slice() : [];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

async function hydrateCountryCodesForItems(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    await Promise.all(items.map(async (it) => {
        if (!it || !it.tmdbId) return;
        if (Array.isArray(it.countryCodes) && it.countryCodes.length) return;
        it.countryCodes = await fetchCountryCodesForItem(it);
    }));
}

function applyCountryFilter(items) {
    if (!selectedCountryCode) return Array.isArray(items) ? items : [];
    const code = String(selectedCountryCode).toUpperCase();
    return (Array.isArray(items) ? items : []).filter((it) => Array.isArray(it?.countryCodes) && it.countryCodes.map(String).map(s => s.toUpperCase()).includes(code));
}

function renderGridFromItems(gridEl, items, emptyMessage) {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
        gridEl.innerHTML = `<div class="no-results">${emptyMessage}</div>`;
        return;
    }
    list.forEach((it) => gridEl.appendChild(createContentCard(it)));
}

async function applyCountryFilterToCurrentPage() {
    const currentPageName = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

    // If a search is active on the current page, filter the search dataset.
    const activeSearch = Array.isArray(footerCountryState.search) && footerCountryState.search.length ? footerCountryState.search : null;
    if (selectedCountryCode && activeSearch) {
        const moviesGridEl = document.getElementById('movies-grid');
        const tvGridEl = document.getElementById('tv-shows-grid');
        const trendingGridEl = document.getElementById('trending-grid');
        const all = activeSearch;

        await hydrateCountryCodesForItems(all);
        const filteredAll = applyCountryFilter(all);

        if (currentPageName === 'movies') {
            const moviesOnly = filteredAll.filter(i => i.type === 'movie');
            renderGridFromItems(moviesGridEl, moviesOnly, `No movies found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
            return;
        }

        if (currentPageName === 'tvshows') {
            const showsOnly = filteredAll.filter(i => i.type === 'tv-show');
            renderGridFromItems(tvGridEl, showsOnly, `No TV shows found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
            return;
        }

        if (currentPageName === 'trending') {
            renderGridFromItems(trendingGridEl, filteredAll, `No items found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
            return;
        }

        if (currentPageName === 'index') {
            const moviesOnly = filteredAll.filter(i => i.type === 'movie');
            const showsOnly = filteredAll.filter(i => i.type === 'tv-show');
            renderGridFromItems(moviesGridEl, moviesOnly.slice(0, 24), `No movies found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
            renderGridFromItems(tvGridEl, showsOnly.slice(0, 24), `No TV shows found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
            return;
        }
    }

    if (!selectedCountryCode) {
        // Clear filter => reload default view
        resetContentForCurrentPage();
        return;
    }

    if (currentPageName === 'index') {
        const moviesGridEl = document.getElementById('movies-grid');
        const tvGridEl = document.getElementById('tv-shows-grid');

        const movies = footerCountryState.indexMovies || [];
        const tv = footerCountryState.indexTv || [];

        await hydrateCountryCodesForItems(movies);
        await hydrateCountryCodesForItems(tv);

        renderGridFromItems(moviesGridEl, applyCountryFilter(movies), `No movies found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
        renderGridFromItems(tvGridEl, applyCountryFilter(tv), `No TV shows found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
        return;
    }

    if (currentPageName === 'movies') {
        const grid = document.getElementById('movies-grid');
        const items = footerCountryState.movies || [];
        await hydrateCountryCodesForItems(items);
        renderGridFromItems(grid, applyCountryFilter(items), `No movies found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
        return;
    }

    if (currentPageName === 'tvshows') {
        const grid = document.getElementById('tv-shows-grid');
        const items = footerCountryState.tvshows || [];
        await hydrateCountryCodesForItems(items);
        renderGridFromItems(grid, applyCountryFilter(items), `No TV shows found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
        return;
    }

    if (currentPageName === 'trending') {
        const grid = document.getElementById('trending-grid');
        const items = footerCountryState.trending || [];
        await hydrateCountryCodesForItems(items);
        renderGridFromItems(grid, applyCountryFilter(items), `No trending items found for ${getCountryNameFromCode(selectedCountryCode) || selectedCountryCode}.`);
        return;
    }
}

function readCountryCacheStorage() {
    try {
        const raw = localStorage.getItem(COUNTRY_CACHE_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch {
        return {};
    }
}

function writeCountryCacheStorage(obj) {
    try {
        localStorage.setItem(COUNTRY_CACHE_STORAGE_KEY, JSON.stringify(obj));
    } catch {
        // ignore
    }
}

function getCountryCacheKey(item) {
    const type = item?.type === 'tv-show' ? 'tv' : 'movie';
    const tmdbId = item?.tmdbId;
    if (!tmdbId) return null;
    return `${type}:${tmdbId}`;
}

function getCountryNameFromCode(code) {
    if (!code || typeof code !== 'string') return null;
    const upper = code.toUpperCase();
    try {
        if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
            const dn = new Intl.DisplayNames(['en'], { type: 'region' });
            return dn.of(upper) || upper;
        }
    } catch {
        // ignore
    }
    return upper;
}

async function fetchCountryCodesForItem(item) {
    if (!item?.tmdbId || !TMDB_API_KEY) return [];

    const key = getCountryCacheKey(item);
    if (!key) return [];

    const now = Date.now();
    const cache = readCountryCacheStorage();
    const cached = cache?.[key];
    if (cached?.codes && Array.isArray(cached.codes) && typeof cached.ts === 'number' && now - cached.ts < COUNTRY_CACHE_TTL_MS) {
        return cached.codes;
    }

    const endpointType = item.type === 'tv-show' ? 'tv' : 'movie';
    const url = `${TMDB_API_BASE}/${endpointType}/${item.tmdbId}?api_key=${encodeURIComponent(TMDB_API_KEY)}`;

    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();

        let codes = [];
        if (endpointType === 'movie') {
            const pcs = Array.isArray(data?.production_countries) ? data.production_countries : [];
            codes = pcs.map(c => c?.iso_3166_1).filter(Boolean);
        } else {
            const oc = Array.isArray(data?.origin_country) ? data.origin_country : [];
            codes = oc.filter(Boolean);
        }

        cache[key] = { codes, ts: now };
        writeCountryCacheStorage(cache);
        return codes;
    } catch {
        return [];
    }
}

async function updateFooterCountriesFromItems(items) {
    const container = document.getElementById('footer-countries');
    if (!container) return;

    const list = Array.isArray(items) ? items.slice(0, FOOTER_COUNTRIES_MAX_ITEMS) : [];
    const usable = list.filter(it => it && it.tmdbId && (it.type === 'movie' || it.type === 'tv-show'));

    if (!TMDB_API_KEY || usable.length === 0) {
        container.innerHTML = '<div class="countries-empty">No country data</div>';
        return;
    }

    container.innerHTML = '<div class="countries-loading">Loading...</div>';

    const codesSets = await Promise.all(usable.map(fetchCountryCodesForItem));
    const codes = Array.from(new Set(codesSets.flat().filter(Boolean)));
    if (codes.length === 0) {
        container.innerHTML = '<div class="countries-empty">No country data</div>';
        return;
    }

    const sorted = codes.sort((a, b) => a.localeCompare(b));
    const clearChip = selectedCountryCode
        ? `<button class="country-chip active" type="button" data-country="__clear">Clear</button>`
        : '';

    const chips = sorted.map((code) => {
        const name = getCountryNameFromCode(code) || code;
        const active = selectedCountryCode && String(selectedCountryCode).toUpperCase() === String(code).toUpperCase();
        return `<button class="country-chip${active ? ' active' : ''}" type="button" data-country="${code}">${name}</button>`;
    }).join('');

    container.innerHTML = `<div class="country-chips">${clearChip}${chips}</div>`;

    container.querySelectorAll('.country-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            const code = btn.dataset.country;
            if (code === '__clear') {
                selectedCountryCode = null;
                updateFooterCountriesFromItems(items);
                if (Array.isArray(footerCountryState.search) && footerCountryState.search.length && lastSearchTerm) {
                    displaySearchResults(footerCountryState.search, lastSearchTerm);
                } else {
                    resetContentForCurrentPage();
                }
                return;
            }
            if (selectedCountryCode && String(selectedCountryCode).toUpperCase() === String(code).toUpperCase()) {
                selectedCountryCode = null;
                updateFooterCountriesFromItems(items);
                if (Array.isArray(footerCountryState.search) && footerCountryState.search.length && lastSearchTerm) {
                    displaySearchResults(footerCountryState.search, lastSearchTerm);
                } else {
                    resetContentForCurrentPage();
                }
                return;
            }

            selectedCountryCode = String(code).toUpperCase();
            updateFooterCountriesFromItems(items);
            applyCountryFilterToCurrentPage();
        });
    });
}

function setFooterCountryItems(source, items) {
    footerCountryState[source] = Array.isArray(items) ? items : [];

    const currentPageName = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    if (source === 'search') {
        updateFooterCountriesFromItems(items);
        return;
    }
    if (currentPageName === 'index') {
        updateFooterCountriesFromItems([].concat(footerCountryState.indexMovies).concat(footerCountryState.indexTv));
        return;
    }

    if (currentPageName === 'movies') return updateFooterCountriesFromItems(footerCountryState.movies);
    if (currentPageName === 'tvshows') return updateFooterCountriesFromItems(footerCountryState.tvshows);
    if (currentPageName === 'trending') return updateFooterCountriesFromItems(footerCountryState.trending);

    // fallback
    return updateFooterCountriesFromItems(items);
}

function getCurrentPageName() {
    return window.location.pathname.split('/').pop().replace('.html', '') || 'index';
}

function getSearchQueryFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('q') || '').trim();
}

function redirectToGlobalSearch(searchTerm) {
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/[^/]*$/, 'index.html');
    url.searchParams.set('q', searchTerm);
    window.location.href = url.toString();
}

// API endpoints
const API_BASE = 'https://vidsrc-embed.ru';

const TMDB_API_KEY = 'e531989d5be7060139836d8ac9388411';
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

window.__VORTEX_TMDB__ = {
    apiKey: TMDB_API_KEY,
    apiBase: TMDB_API_BASE,
    imageBase: TMDB_IMAGE_BASE
};

const posterCache = new Map();

 const POSTER_CACHE_STORAGE_KEY = 'vortexPosterCache';
 const POSTER_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
 const POSTER_CACHE_MAX_ITEMS = 500;

 function readPosterCacheStorage() {
     try {
         const raw = localStorage.getItem(POSTER_CACHE_STORAGE_KEY);
         if (!raw) return {};
         const parsed = JSON.parse(raw);
         if (!parsed || typeof parsed !== 'object') return {};
         return parsed;
     } catch {
         return {};
     }
 }

 function writePosterCacheStorage(obj) {
     try {
         localStorage.setItem(POSTER_CACHE_STORAGE_KEY, JSON.stringify(obj));
     } catch {
         // ignore cache write failures
     }
 }

function getPosterCacheKey(type, tmdbId) {
    return `${type}:${tmdbId}`;
}

function getCachedPoster(type, tmdbId) {
    const key = getPosterCacheKey(type, tmdbId);
    if (posterCache.has(key)) return posterCache.get(key);

    try {
        const obj = readPosterCacheStorage();
        const entry = obj?.[key];
        const now = Date.now();

        // Backwards compatibility: previously stored as string URL.
        if (typeof entry === 'string') {
            if (entry.length > 0) {
                obj[key] = { url: entry, ts: now };
                writePosterCacheStorage(obj);
                posterCache.set(key, entry);
                return entry;
            }
            return null;
        }

        const url = entry?.url;
        const ts = entry?.ts;
        if (typeof url === 'string' && url.length > 0) {
            if (typeof ts === 'number' && now - ts > POSTER_CACHE_TTL_MS) {
                delete obj[key];
                writePosterCacheStorage(obj);
                return null;
            }
            posterCache.set(key, url);
            return url;
        }
    } catch {
        return null;
    }

    return null;
}

function setCachedPoster(type, tmdbId, url) {
    const key = getPosterCacheKey(type, tmdbId);
    posterCache.set(key, url);

    try {
        const obj = readPosterCacheStorage();
        const now = Date.now();

        obj[key] = { url, ts: now };

        // Evict expired entries
        for (const [k, v] of Object.entries(obj)) {
            const entry = (typeof v === 'string') ? { url: v, ts: now } : v;
            if (typeof entry?.ts === 'number' && now - entry.ts > POSTER_CACHE_TTL_MS) {
                delete obj[k];
            }
        }

        // Size cap eviction (remove oldest first)
        const entries = Object.entries(obj)
            .map(([k, v]) => {
                if (typeof v === 'string') return [k, { url: v, ts: now }];
                return [k, v];
            })
            .filter(([, v]) => typeof v?.url === 'string' && v.url.length > 0)
            .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));

        const over = entries.length - POSTER_CACHE_MAX_ITEMS;
        for (let i = 0; i < over; i++) {
            delete obj[entries[i][0]];
        }

        writePosterCacheStorage(obj);
    } catch {
        // ignore cache write failures
    }
}

async function performGlobalSearchOnIndex(searchTerm) {
    // Keep the UI responsive: immediately clear grids and show loading
    const moviesGrid = document.getElementById('movies-grid');
    const tvShowsGrid = document.getElementById('tv-shows-grid');
    if (moviesGrid) moviesGrid.innerHTML = '<div class="loading">Searching...</div>';
    if (tvShowsGrid) tvShowsGrid.innerHTML = '<div class="loading">Searching...</div>';

    let allContent = [];
    try {
        allContent = await searchAcrossApi(searchTerm);
    } catch (e) {
        console.warn('Search across API failed, falling back to local data', e);
        allContent = [...movieData.trending, ...movieData.movies, ...movieData.tvShows];
        if (allContent.length === 0) allContent = getFallbackData();
    }

    const searchResults = allContent.filter(item => {
        const title = (item?.title || '').toLowerCase();
        const description = (item?.description || '').toLowerCase();
        const genre = (item?.genre || '').toLowerCase();
        const year = item?.year ? String(item.year) : '';

        return (
            title.includes(searchTerm) ||
            description.includes(searchTerm) ||
            genre.includes(searchTerm) ||
            year.includes(searchTerm)
        );
    });

    // Hydrate posters only for what we will render
    const moviesOnly = searchResults.filter(i => i.type === 'movie').slice(0, 24);
    const showsOnly = searchResults.filter(i => i.type === 'tv-show').slice(0, 24);
    await hydratePosters([...moviesOnly, ...showsOnly]);

    displaySearchResults([...moviesOnly, ...showsOnly], searchTerm);
}

async function fetchTmdbPosterUrl(type, tmdbId) {
    if (!tmdbId) return null;
    const cached = getCachedPoster(type, tmdbId);
    if (cached) return cached;

    if (!TMDB_API_KEY) return null;

    try {
        const endpointType = type === 'tv-show' ? 'tv' : 'movie';
        const url = `${TMDB_API_BASE}/${endpointType}/${tmdbId}?api_key=${encodeURIComponent(TMDB_API_KEY)}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const posterPath = data?.poster_path;
        if (!posterPath) return null;

        const posterUrl = `${TMDB_IMAGE_BASE}${posterPath}`;
        setCachedPoster(type, tmdbId, posterUrl);
        return posterUrl;
    } catch (e) {
        console.warn('TMDB poster fetch failed', e);
        return null;
    }
}

async function hydratePosters(items) {
    if (!Array.isArray(items) || items.length === 0) return;

    await Promise.all(items.map(async (item) => {
        if (!item || item.image) {
            // If image is already set (fallback or previously fetched), still try to replace picsum placeholders.
            if (!item?.tmdbId || !TMDB_API_KEY) return;
            if (typeof item.image === 'string' && !item.image.includes('picsum.photos')) return;
        }

        if (!item?.tmdbId) return;
        const posterUrl = await fetchTmdbPosterUrl(item.type, item.tmdbId);
        if (posterUrl) item.image = posterUrl;
    }));
}

// Fetch movies from vidsrcme.ru API
async function fetchMovies(page = 1, limit = 50) {
    try {
        const response = await fetch(`${API_BASE}/movies/latest/page-${page}.json`);
        const data = await response.json();
        
        const movies = (data.result || []).slice(0, limit).map(movie => ({
            id: movie.imdb_id,
            title: movie.title,
            type: "movie",
            genre: "action", // Default genre, could be enhanced with TMDB API
            rating: 8.5, // Default rating, could be enhanced with TMDB API
            year: extractYear(movie.title),
            description: `${movie.title} - Quality: ${movie.quality}`,
            image: `https://picsum.photos/seed/${movie.imdb_id}/500/750.jpg`,
            imdbId: movie.imdb_id,
            tmdbId: movie.tmdb_id,
            quality: movie.quality,
            embedUrl: movie.embed_url
        }));

        await hydratePosters(movies);
        
        return movies;
    } catch (error) {
        console.error('Error fetching movies:', error);
        return [];
    }
}

// Fetch TV shows from vidsrcme.ru API
async function fetchTVShows(page = 1, limit = 50) {
    try {
        const response = await fetch(`${API_BASE}/tvshows/latest/page-${page}.json`);
        const data = await response.json();
        
        const tvShows = (data.result || []).slice(0, limit).map(show => ({
            id: show.imdb_id,
            title: show.title,
            type: "tv-show",
            genre: "drama", // Default genre, could be enhanced with TMDB API
            rating: 8.5, // Default rating, could be enhanced with TMDB API
            year: extractYear(show.title),
            description: `${show.title} - TV Series`,
            image: `https://picsum.photos/seed/${show.imdb_id}/500/750.jpg`,
            imdbId: show.imdb_id,
            tmdbId: show.tmdb_id,
            embedUrl: show.embed_url
        }));

        await hydratePosters(tvShows);
        
        return tvShows;
    } catch (error) {
        console.error('Error fetching TV shows:', error);
        return [];
    }
}

function getSearchCacheKey(term) {
    return `vortexSearchCache:${term.toLowerCase()}`;
}

function getCachedSearchResults(term) {
    try {
        const raw = sessionStorage.getItem(getSearchCacheKey(term));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const ts = parsed?.ts;
        if (!ts || Date.now() - ts > 10 * 60 * 1000) return null;
        return parsed?.items || null;
    } catch {
        return null;
    }
}

function setCachedSearchResults(term, items) {
    try {
        sessionStorage.setItem(getSearchCacheKey(term), JSON.stringify({ ts: Date.now(), items }));
    } catch {
        // ignore
    }
}

async function fetchMoviesForSearch(page = 1) {
    try {
        const response = await fetch(`${API_BASE}/movies/latest/page-${page}.json`);
        const data = await response.json();
        return (data.result || []).map(movie => ({
            id: movie.imdb_id,
            title: movie.title,
            type: 'movie',
            genre: 'action',
            rating: 8.5,
            year: extractYear(movie.title),
            description: `${movie.title} - Quality: ${movie.quality}`,
            image: `https://picsum.photos/seed/${movie.imdb_id}/500/750.jpg`,
            imdbId: movie.imdb_id,
            tmdbId: movie.tmdb_id,
            quality: movie.quality,
            embedUrl: movie.embed_url
        }));
    } catch (e) {
        console.warn('Error fetching movies for search:', e);
        return [];
    }
}

async function fetchTVShowsForSearch(page = 1) {
    try {
        const response = await fetch(`${API_BASE}/tvshows/latest/page-${page}.json`);
        const data = await response.json();
        return (data.result || []).map(show => ({
            id: show.imdb_id,
            title: show.title,
            type: 'tv-show',
            genre: 'drama',
            rating: 8.5,
            year: extractYear(show.title),
            description: `${show.title} - TV Series`,
            image: `https://picsum.photos/seed/${show.imdb_id}/500/750.jpg`,
            imdbId: show.imdb_id,
            tmdbId: show.tmdb_id,
            embedUrl: show.embed_url
        }));
    } catch (e) {
        console.warn('Error fetching TV shows for search:', e);
        return [];
    }
}

async function searchAcrossApi(term) {
    const cached = getCachedSearchResults(term);
    if (cached) return cached;

    const maxPagesPerType = 5;
    const pages = Array.from({ length: maxPagesPerType }, (_, i) => i + 1);
    const [moviesSets, showsSets] = await Promise.all([
        Promise.all(pages.map(p => fetchMoviesForSearch(p))),
        Promise.all(pages.map(p => fetchTVShowsForSearch(p)))
    ]);

    const items = [...moviesSets.flat(), ...showsSets.flat()];
    setCachedSearchResults(term, items);
    return items;
}

// Extract year from title
function extractYear(title) {
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : 2024;
}

function getSafeImageUrl(item) {
    const raw = item?.image;
    if (typeof raw !== 'string') return '';
    const url = raw.trim();
    if (!url || url === 'undefined' || url === 'null') return '';
    return url;
}

async function updateHomepageHero() {
    const heroTitle = document.getElementById('hero-title');
    const heroDescription = document.getElementById('hero-description');
    const heroPlayBtn = document.getElementById('hero-play-btn');
    const heroMeta = document.getElementById('hero-meta');
    const heroMetaType = document.getElementById('hero-meta-type');
    const heroMetaYear = document.getElementById('hero-meta-year');
    const heroMetaRating = document.getElementById('hero-meta-rating');
    const heroBackground = document.querySelector('.hero-background');
    const heroPosterImg = document.getElementById('hero-poster-img');
    const heroRecsWrap = document.getElementById('hero-recommendations');
    const heroRecsScroll = document.getElementById('hero-recommendations-scroll');

    if (!heroTitle || !heroDescription || !heroPlayBtn) return;

    const heroPool = []
        .concat(Array.isArray(movieData.movies) ? movieData.movies : [])
        .concat(Array.isArray(movieData.tvShows) ? movieData.tvShows : []);
    const fallbackPool = Array.isArray(movieData.trending) ? movieData.trending : [];
    const poolToUse = heroPool.length ? heroPool : fallbackPool;
    if (!poolToUse.length) return;

    const featured = shuffleArray(poolToUse)[0];
    if (!featured) return;

    try {
        await hydratePosters([featured]);
    } catch {
        // ignore
    }

    const imageUrl = getSafeImageUrl(featured) || 'https://images.unsplash.com/photo-1485846234645-a62644f84728?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80';

    try {
        const pre = new Image();
        pre.decoding = 'async';
        pre.src = imageUrl;
    } catch {
        // ignore
    }

    heroTitle.textContent = featured.title || '';
    heroDescription.textContent = featured.description || 'No description available.';
    heroPlayBtn.onclick = () => playVideo(featured);

    if (heroMetaType) {
        heroMetaType.textContent = featured.type === 'tv-show' ? 'TV Show' : 'Movie';
    }
    if (heroMetaYear) {
        const yearValue = featured.year || extractYear(featured.title || '');
        heroMetaYear.textContent = String(yearValue);
    }
    if (heroMetaRating) {
        heroMetaRating.textContent = featured.rating ? String(featured.rating) : 'N/A';
    }
    if (heroMeta) {
        heroMeta.style.display = '';
    }

    if (heroBackground) {
        heroBackground.style.backgroundImage = `url('${imageUrl}')`;
    }
    if (heroPosterImg) {
        heroPosterImg.src = imageUrl;
    }

    // Hero recommendations
    if (heroRecsWrap && heroRecsScroll) {
        heroRecsWrap.style.display = 'none';
        heroRecsScroll.innerHTML = '';

        const tmdbId = featured?.tmdbId;
        if (tmdbId && TMDB_API_KEY) {
            try {
                const endpointType = featured.type === 'tv-show' ? 'tv' : 'movie';
                const recUrl = `${TMDB_API_BASE}/${endpointType}/${encodeURIComponent(tmdbId)}/recommendations?api_key=${encodeURIComponent(TMDB_API_KEY)}`;
                const res = await fetch(recUrl);
                if (res.ok) {
                    const data = await res.json();
                    const results = Array.isArray(data?.results) ? data.results : [];
                    const top = results.slice(0, 6);
                    if (top.length) {
                        const mapped = top.map(r => ({
                            title: r?.title || r?.name || 'Untitled',
                            type: featured.type === 'tv-show' ? 'tv-show' : 'movie',
                            tmdbId: r?.id,
                            year: extractYear((r?.release_date || r?.first_air_date || '').slice(0, 4)),
                            description: r?.overview || '',
                            image: r?.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : ''
                        }));

                        heroRecsScroll.innerHTML = mapped.map(item => `
                            <div class="hero-recommendations-item" onclick="playVideo(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                                <img src="${item.image}" alt="${item.title}" loading="lazy" decoding="async" fetchpriority="low">
                            </div>
                        `).join('');

                        heroRecsWrap.style.display = '';
                    }
                }
            } catch (e) {
                console.warn('Hero recommendations failed', e);
            }
        }
    }
}

// Load initial data from API
async function loadInitialData() {
    // Start with fallback data immediately so users see content
    loadFallbackData();
    
    try {
        // Try to fetch real data in background
        console.log('Attempting to fetch real data from API...');
        
        // Fetch first page of movies and TV shows with more items
        const [movies, tvShows] = await Promise.all([
            fetchMovies(1, 20), // Fetch 20 movies
            fetchTVShows(1, 20) // Fetch 20 TV shows
        ]);
        
        if (movies.length > 0 || tvShows.length > 0) {
            // Update movieData with fetched content
            movieData.movies = movies;
            movieData.tvShows = tvShows;
            movieData.trending = movies; // Use all fetched movies as trending
            
            // Update UI with real data
            loadTrending();
            loadMovies('all');
            loadTVShows('all');

            if (getCurrentPageName() === 'index') {
                await updateHomepageHero();
            }
            
            console.log(`Successfully loaded ${movies.length} movies and ${tvShows.length} TV shows from API`);
        } else {
            console.log('API returned empty data, using fallback');
        }
    } catch (error) {
        console.error('Error loading API data:', error);
        console.log('Using fallback data due to API failure');
    }
}

// Fallback sample data
function loadFallbackData() {
    movieData = {
        trending: [
            {
                id: "tt0111161",
                title: "The Shawshank Redemption",
                type: "movie",
                genre: "drama",
                rating: 9.3,
                year: 1994,
                description: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
                image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0111161"
            },
            {
                id: "tt0468569",
                title: "The Dark Knight",
                type: "movie",
                genre: "action",
                rating: 9.0,
                year: 2008,
                description: "Batman faces the Joker, a criminal mastermind who wants to plunge Gotham into anarchy.",
                image: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0468569"
            },
            {
                id: "tt0050083",
                title: "12 Angry Men",
                type: "movie",
                genre: "drama",
                rating: 9.0,
                year: 1957,
                description: "A jury holdout attempts to prevent a miscarriage of justice by forcing his colleagues to reconsider the evidence.",
                image: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0050083"
            },
            {
                id: "tt0068646",
                title: "The Godfather",
                type: "movie",
                genre: "drama",
                rating: 9.2,
                year: 1972,
                description: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
                image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0068646"
            },
            {
                id: "tt0071562",
                title: "The Godfather: Part II",
                type: "movie",
                genre: "drama",
                rating: 9.0,
                year: 1974,
                description: "The early life and career of Vito Corleone in 1920s New York is portrayed while his son, Michael, expands and tightens his grip on the family crime syndicate.",
                image: "https://images.unsplash.com/photo-1516209650069-8891a1e3e0c6?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0071562"
            },
            {
                id: "tt0411008",
                title: "Lost",
                type: "tv-show",
                genre: "drama",
                rating: 8.3,
                year: 2004,
                description: "The survivors of a plane crash are forced to live with each other on a remote island, a dangerous new world.",
                image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0411008"
            },
            {
                id: "tt0120737",
                title: "The Lord of the Rings: The Fellowship of the Ring",
                type: "movie",
                genre: "action",
                rating: 8.8,
                year: 2001,
                description: "A meek Hobbit from the Shire and eight companions set out on a journey to destroy the powerful One Ring and save Middle-earth.",
                image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0120737"
            },
            {
                id: "tt0167260",
                title: "The Lord of the Rings: The Return of the King",
                type: "movie",
                genre: "action",
                rating: 8.9,
                year: 2003,
                description: "Gandalf and Aragorn lead the World of Men against Sauron's army to draw his gaze from Frodo and Sam as they approach Mount Doom.",
                image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0167260"
            }
        ],
        movies: [
            {
                id: "tt1375666",
                title: "Inception",
                type: "movie",
                genre: "action",
                rating: 8.8,
                year: 2010,
                description: "A thief who steals corporate secrets through dream-sharing technology is given the inverse task.",
                image: "https://images.unsplash.com/photo-1535016120720-40c6a9a0a85c?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt1375666"
            },
            {
                id: "tt1856101",
                title: "Mad Max: Fury Road",
                type: "movie",
                genre: "action",
                rating: 8.1,
                year: 2015,
                description: "In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler in search for her homeland.",
                image: "https://images.unsplash.com/photo-1542362567-b07e54358753?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt1856101"
            },
            {
                id: "tt0120338",
                title: "Titanic",
                type: "movie",
                genre: "drama",
                rating: 7.9,
                year: 1997,
                description: "A seventeen-year-old aristocrat falls in love with a kind but poor artist aboard the luxurious, ill-fated R.M.S. Titanic.",
                image: "https://images.unsplash.com/photo-1550745165-9bc0b252726a?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0120338"
            },
            {
                id: "tt0109830",
                title: "Forrest Gump",
                type: "movie",
                genre: "drama",
                rating: 8.8,
                year: 1994,
                description: "The presidencies of Kennedy and Johnson, the Vietnam War, and the Watergate scandal unfold from the perspective of an Alabama man.",
                image: "https://images.unsplash.com/photo-1471479914195-1f9b5e8e5c65?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0109830"
            },
            {
                id: "tt0137523",
                title: "Fight Club",
                type: "movie",
                genre: "thriller",
                rating: 8.8,
                year: 1999,
                description: "An insomniac office worker and a devil-may-care soapmaker form an underground fight club.",
                image: "https://images.unsplash.com/photo-1516426122078-c23e76319801?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0137523"
            },
            {
                id: "tt0068646",
                title: "The Godfather",
                type: "movie",
                genre: "drama",
                rating: 9.2,
                year: 1972,
                description: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
                image: "https://images.unsplash.com/photo-1550745165-9bc0b252726a?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0068646"
            },
            {
                id: "tt0060196",
                title: "The Good, the Bad and the Ugly",
                type: "movie",
                genre: "western",
                rating: 8.8,
                year: 1966,
                description: "A bounty hunting scam joins two men in an uneasy alliance against a third in a race to find a fortune in gold buried in a remote cemetery.",
                image: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0060196"
            },
            {
                id: "tt0944947",
                title: "Game of Thrones",
                type: "tv-show",
                genre: "drama",
                rating: 9.2,
                year: 2011,
                description: "Nine noble families fight for control over the lands of Westeros, while an ancient enemy returns.",
                image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0944947"
            }
        ],
        tvShows: [
            {
                id: "tt0903747",
                title: "Breaking Bad",
                type: "tv-show",
                genre: "drama",
                rating: 9.5,
                year: 2008,
                description: "A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine.",
                image: "https://images.unsplash.com/photo-1550745165-9bc0b252726a?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0903747"
            },
            {
                id: "tt0182576",
                title: "The Office",
                type: "tv-show",
                genre: "comedy",
                rating: 8.9,
                year: 2005,
                description: "A mockumentary sitcom that depicts the everyday work lives of office employees.",
                image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0182576"
            },
            {
                id: "tt5555380",
                title: "Stranger Things",
                type: "tv-show",
                genre: "thriller",
                rating: 8.7,
                year: 2016,
                description: "When a young boy disappears, his mother, a police chief and his friends must confront terrifying supernatural forces.",
                image: "https://images.unsplash.com/photo-1516426122078-c23e76319801?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt5555380"
            },
            {
                id: "tt2802850",
                title: "The Crown",
                type: "tv-show",
                genre: "drama",
                rating: 8.6,
                year: 2016,
                description: "Follows the political rivalries and romance of Queen Elizabeth II's reign.",
                image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt2802850"
            },
            {
                id: "tt4574334",
                title: "The Boys",
                type: "tv-show",
                genre: "action",
                rating: 8.7,
                year: 2019,
                description: "A group of vigilantes set out to take down corrupt superheroes who abuse their superpowers.",
                image: "https://images.unsplash.com/photo-1471479914195-1f9b5e8e5c65?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt4574334"
            },
            {
                id: "tt7318696",
                title: "The Witcher",
                type: "tv-show",
                genre: "action",
                rating: 8.2,
                year: 2019,
                description: "Geralt of Rivia, a mutated monster-hunter for hire, journeys toward his destiny in a turbulent world.",
                image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt7318696"
            },
            {
                id: "tt0411008",
                title: "Lost",
                type: "tv-show",
                genre: "drama",
                rating: 8.3,
                year: 2004,
                description: "The survivors of a plane crash are forced to live with each other on a remote island, a dangerous new world.",
                image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0411008"
            },
            {
                id: "tt0944947",
                title: "Game of Thrones",
                type: "tv-show",
                genre: "drama",
                rating: 9.2,
                year: 2011,
                description: "Nine noble families fight for control over the lands of Westeros, while an ancient enemy returns.",
                image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
                imdbId: "tt0944947"
            }
        ]
    };
    
    // Load fallback data into UI
    loadTrending();
    loadMovies('all', 1, true); // Homepage mode with 12 items limit
    loadTVShows('all', 1, true); // Homepage mode with 12 items limit
    
    // Hide pagination on homepage
    const paginationControls = document.getElementById('unified-pagination');
    if (paginationControls) {
        paginationControls.style.display = 'none';
    }
}

// User's watchlist
let watchlist = [];

// Unified pagination state - initialize values
currentSection = 'movies'; // 'movies' or 'tvshows'
currentPage = 1;
totalPages = 1749;
totalItems = 88023;

// Section-specific data
const sectionData = {
    movies: {
        totalPages: 1749,
        totalItems: 88023,
        currentPage: 1
    },
    tvshows: {
        totalPages: 394,
        totalItems: 19704,
        currentPage: 1
    },
    trending: {
        totalPages: 1,
        totalItems: 0,
        currentPage: 1
    }
};

let trendingMoviesCatalog = [];
let trendingTvCatalog = [];
let trendingMoviePage = 1;
let trendingTvPage = 1;
let trendingLoading = false;
const TRENDING_MAX_PAGES = 500;

async function fetchTmdbTrending(type, page = 1, timeWindow = 'week') {
    if (!TMDB_API_KEY) return [];
    const safeType = type === 'tv' ? 'tv' : 'movie';
    const safeWindow = timeWindow === 'day' ? 'day' : 'week';

    try {
        const url = `${TMDB_API_BASE}/trending/${safeType}/${safeWindow}?api_key=${encodeURIComponent(TMDB_API_KEY)}&page=${encodeURIComponent(page)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];

        return results.map((r) => {
            const tmdbId = r?.id;
            const title = safeType === 'tv' ? (r?.name || r?.original_name) : (r?.title || r?.original_title);
            const dateStr = safeType === 'tv' ? r?.first_air_date : r?.release_date;
            const year = extractYear((dateStr || '').slice(0, 4));
            const rating = typeof r?.vote_average === 'number' ? Number(r.vote_average.toFixed(1)) : 'N/A';
            const poster = r?.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : '';

            return {
                id: tmdbId ? String(tmdbId) : '',
                tmdbId,
                imdbId: '',
                title: title || 'Untitled',
                type: safeType === 'tv' ? 'tv-show' : 'movie',
                genre: '',
                rating,
                year,
                description: r?.overview || '',
                image: poster
            };
        }).filter((x) => x.tmdbId);
    } catch {
        return [];
    }
}

async function fetchTmdbImdbIdForItem(item) {
    if (!item?.tmdbId || !TMDB_API_KEY) return '';
    const endpointType = item.type === 'tv-show' ? 'tv' : 'movie';
    try {
        const url = `${TMDB_API_BASE}/${endpointType}/${encodeURIComponent(item.tmdbId)}/external_ids?api_key=${encodeURIComponent(TMDB_API_KEY)}`;
        const res = await fetch(url);
        if (!res.ok) return '';
        const data = await res.json();
        return typeof data?.imdb_id === 'string' ? data.imdb_id : '';
    } catch {
        return '';
    }
}

async function hydrateImdbIdsForItems(items, concurrency = 8) {
    const queue = (Array.isArray(items) ? items : []).filter((it) => it && !it.imdbId);
    let idx = 0;
    const workers = new Array(Math.min(concurrency, queue.length)).fill(0).map(async () => {
        while (idx < queue.length) {
            const current = queue[idx++];
            const imdbId = await fetchTmdbImdbIdForItem(current);
            if (imdbId) {
                current.imdbId = imdbId;
                current.id = imdbId;
            }
        }
    });
    await Promise.all(workers);
}

function mergeTrendingCatalog() {
    const seen = new Set();
    const merged = [];
    const add = (arr) => {
        (Array.isArray(arr) ? arr : []).forEach((it) => {
            const key = it?.id || `${it?.type}:${it?.tmdbId}`;
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(it);
        });
    };
    add(trendingMoviesCatalog);
    add(trendingTvCatalog);
    return merged;
}

async function ensureTrendingLoaded(filter, neededCount) {
    if (trendingLoading) return;
    trendingLoading = true;
    try {
        while (true) {
            const merged = mergeTrendingCatalog();
            const moviesCount = trendingMoviesCatalog.length;
            const tvCount = trendingTvCatalog.length;
            const currentCount = filter === 'movie'
                ? moviesCount
                : (filter === 'tv-show' ? tvCount : merged.length);
            if (currentCount >= neededCount) break;

            const canLoadMovies = (filter === 'all' || filter === 'movie') && trendingMoviePage <= TRENDING_MAX_PAGES;
            const canLoadTv = (filter === 'all' || filter === 'tv-show') && trendingTvPage <= TRENDING_MAX_PAGES;
            if (!canLoadMovies && !canLoadTv) break;

            const promises = [];
            if (canLoadMovies) {
                const mp = trendingMoviePage;
                trendingMoviePage += 1;
                promises.push(fetchTmdbTrending('movie', mp, 'day'));
            } else {
                promises.push(Promise.resolve([]));
            }
            if (canLoadTv) {
                const tp = trendingTvPage;
                trendingTvPage += 1;
                promises.push(fetchTmdbTrending('tv', tp, 'day'));
            } else {
                promises.push(Promise.resolve([]));
            }

            const [moreMovies, moreTv] = await Promise.all(promises);
            if (Array.isArray(moreMovies) && moreMovies.length) trendingMoviesCatalog = trendingMoviesCatalog.concat(moreMovies);
            if (Array.isArray(moreTv) && moreTv.length) trendingTvCatalog = trendingTvCatalog.concat(moreTv);

            if ((!moreMovies || moreMovies.length === 0) && (!moreTv || moreTv.length === 0)) break;
        }
    } catch {
        if ((!trendingMoviesCatalog || trendingMoviesCatalog.length === 0) && (!trendingTvCatalog || trendingTvCatalog.length === 0)) {
            const fallback = getFallbackData();
            trendingMoviesCatalog = fallback.filter(i => i.type === 'movie');
            trendingTvCatalog = fallback.filter(i => i.type === 'tv-show');
        }
    } finally {
        trendingLoading = false;
    }
}

async function loadTrendingCatalog(filter = 'all', page = 1) {
    const grid = document.getElementById('trending-grid');
    if (!grid) return;

    const perPage = itemsPerPage;
    const needed = page * perPage;
    await ensureTrendingLoaded(filter, needed);

    const merged = mergeTrendingCatalog();
    let filtered = merged;
    if (filter === 'movie') filtered = trendingMoviesCatalog;
    if (filter === 'tv-show') filtered = trendingTvCatalog;

    const trendingMoviesCountEl = document.getElementById('trending-movies-count');
    const trendingTvCountEl = document.getElementById('trending-tvshows-count');
    const trendingTotalCountEl = document.getElementById('trending-total-count');
    if (trendingMoviesCountEl) trendingMoviesCountEl.textContent = String(trendingMoviesCatalog.length);
    if (trendingTvCountEl) trendingTvCountEl.textContent = String(trendingTvCatalog.length);
    if (trendingTotalCountEl) trendingTotalCountEl.textContent = String(merged.length);

    const totalItemsLocal = filtered.length;
    const totalPagesLocal = Math.max(1, Math.ceil(totalItemsLocal / perPage));
    const safePage = Math.min(Math.max(1, page), totalPagesLocal);

    sectionData.trending.totalItems = totalItemsLocal;
    sectionData.trending.totalPages = totalPagesLocal;
    sectionData.trending.currentPage = safePage;
    currentSection = 'trending';
    currentPage = safePage;
    totalPages = totalPagesLocal;
    totalItems = totalItemsLocal;

    const sectionInfo = document.getElementById('current-section-info');
    const pageInfo = document.getElementById('page-info');
    const totalInfo = document.getElementById('total-info');
    if (sectionInfo) sectionInfo.textContent = 'Trending';
    if (pageInfo) pageInfo.textContent = `Page ${safePage} of ${totalPagesLocal}`;
    if (totalInfo) totalInfo.textContent = `Total: ${totalItemsLocal.toLocaleString()} items`;

    const start = (safePage - 1) * perPage;
    const end = start + perPage;
    let pageItems = filtered.slice(start, end);

    // Hydrate IMDb IDs for items on the current page only (keeps it fast)
    await hydrateImdbIdsForItems(pageItems, 8);

    // For 'IMDb trending' experience, only render items that have an IMDb ID
    pageItems = pageItems.filter((it) => typeof it?.imdbId === 'string' && it.imdbId.startsWith('tt'));

    grid.innerHTML = '';
    if (!pageItems.length) {
        grid.innerHTML = '<div class="no-results">No IMDb IDs found for this page yet. Try another page or refresh.</div>';
        setFooterCountryItems('trending', []);
        generatePageNumbers('page-numbers', safePage, totalPagesLocal);
        updatePagination('trending', safePage);
        return;
    }
    pageItems.forEach((item) => {
        grid.appendChild(createContentCard(item));
    });

    setFooterCountryItems('trending', pageItems);

    generatePageNumbers('page-numbers', safePage, totalPagesLocal);
    updatePagination('trending', safePage);
}

// DOM Elements
const trendingGrid = document.getElementById('trending-grid');
const moviesGrid = document.getElementById('movies-grid');
const tvShowsGrid = document.getElementById('tv-shows-grid');
const videoModal = document.getElementById('video-modal');
const videoPlayer = document.getElementById('video-player');
const videoTitle = document.getElementById('video-title');
const videoDescription = document.getElementById('video-description');
const closeModal = document.querySelector('.close-modal');
const scrollToTopBtn = document.createElement('button');
scrollToTopBtn.className = 'scroll-to-top';
scrollToTopBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
document.body.appendChild(scrollToTopBtn);

// Search elements will be initialized when needed
let searchInput, searchBtn;

// Load trending content with full loaded catalog (movies + tvShows, fallback to trending)
function loadTrending() {
    const trendingGrid = document.getElementById('trending-scroll');
    if (!trendingGrid) return;

    const combinedCatalog = []
        .concat(Array.isArray(movieData.movies) ? movieData.movies : [])
        .concat(Array.isArray(movieData.tvShows) ? movieData.tvShows : []);

    const pool = combinedCatalog.length
        ? combinedCatalog
        : (Array.isArray(movieData.trending) ? movieData.trending : []);

    const itemsToShow = shuffleArray(pool);
    
    trendingGrid.innerHTML = itemsToShow.map((item, index) => `
        <div class="trending-card" onclick="playVideo(${JSON.stringify(item).replace(/"/g, '&quot;')})">
            <div class="trending-rank">${index + 1}</div>
            <img src="${item.image}" alt="${item.title}" loading="lazy" decoding="async" fetchpriority="low">
            <div class="trending-info">
                <h3>${item.title}</h3>
                <div class="trending-card-actions">
                    <button class="trending-card-btn" onclick="event.stopPropagation(); playVideo(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="trending-card-btn" onclick="event.stopPropagation(); toggleWatchlist(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Trending scroll functionality
function initTrendingScroll() {
    const scrollContainer = document.getElementById('trending-scroll');
    const scrollLeft = document.getElementById('trending-scroll-left');
    const scrollRight = document.getElementById('trending-scroll-right');
    
    if (scrollLeft && scrollRight && scrollContainer) {
        const scrollAmount = 320; // Width of card + gap
        
        scrollLeft.addEventListener('click', () => {
            scrollContainer.scrollBy({
                left: -scrollAmount,
                behavior: 'smooth'
            });
        });
        
        scrollRight.addEventListener('click', () => {
            scrollContainer.scrollBy({
                left: scrollAmount,
                behavior: 'smooth'
            });
        });
        
        // Show/hide scroll buttons based on scroll position
        scrollContainer.addEventListener('scroll', () => {
            const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
            
            if (scrollContainer.scrollLeft <= 0) {
                scrollLeft.style.opacity = '0.5';
                scrollLeft.style.cursor = 'not-allowed';
            } else {
                scrollLeft.style.opacity = '1';
                scrollLeft.style.cursor = 'pointer';
            }
            
            if (scrollContainer.scrollLeft >= maxScroll) {
                scrollRight.style.opacity = '0.5';
                scrollRight.style.cursor = 'not-allowed';
            } else {
                scrollRight.style.opacity = '1';
                scrollRight.style.cursor = 'pointer';
            }
        });
        
        // Initial state
        scrollLeft.style.opacity = '0.5';
        scrollLeft.style.cursor = 'not-allowed';
    }
}

function updateTrendingCatalogModeFromHash() {
    if (getCurrentPageName() !== 'index') return;
    const trendingSection = document.getElementById('trending');
    if (!trendingSection) return;

    const isTrendingHash = (window.location.hash || '').toLowerCase() === '#trending';
    trendingSection.classList.toggle('catalog-mode', isTrendingHash);
}

// Unified pagination control function
function updatePagination(section, page) {
    currentSection = section;
    currentPage = page;
    
    const data = sectionData[section];
    totalPages = data.totalPages;
    totalItems = data.totalItems;
    data.currentPage = page;
    
    // Update page info
    const sectionName = section === 'movies' ? 'Movies' : (section === 'tvshows' ? 'TV Shows' : 'Trending');
    const itemName = section === 'movies' ? 'movies' : (section === 'tvshows' ? 'TV shows' : 'items');
    
    document.getElementById('current-section-info').textContent = sectionName;
    document.getElementById('page-info').textContent = `Page ${page} of ${totalPages}`;
    document.getElementById('total-info').textContent = `Total: ${totalItems.toLocaleString()} ${itemName}`;
    
    // Update button states
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    prevBtn.disabled = page === 1;
    nextBtn.disabled = page === totalPages;
    
    // Generate page numbers
    generatePageNumbers('page-numbers', page, totalPages);
}

function generatePageNumbers(containerId, currentPage, totalPages) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    const maxVisiblePages = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust start page if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Add first page and ellipsis if needed
    if (startPage > 1) {
        addPageButton(container, 1);
        if (startPage > 2) {
            addEllipsis(container);
        }
    }
    
    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
        addPageButton(container, i);
    }
    
    // Add ellipsis and last page if needed
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            addEllipsis(container);
        }
        addPageButton(container, totalPages);
    }
}

function addPageButton(container, pageNum) {
    const button = document.createElement('button');
    button.className = 'page-number';
    button.textContent = pageNum;
    
    if (pageNum === currentPage) {
        button.classList.add('active');
    }
    
    button.addEventListener('click', () => {
        const isHomepage = getCurrentPageName() === 'index';
        if (currentSection === 'movies') {
            loadMovies('all', pageNum, isHomepage);
        } else if (currentSection === 'trending') {
            const activeFilter = document.querySelector('#trending .filter-btn.active')?.dataset?.genre || 'all';
            loadTrendingCatalog(activeFilter, pageNum);
        } else {
            loadTVShows('all', pageNum, isHomepage);
        }
    });
    
    container.appendChild(button);
}

function addEllipsis(container) {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'page-number ellipsis';
    ellipsis.textContent = '...';
    container.appendChild(ellipsis);
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    // Detect current page
    const currentPageName = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    
    console.log('Page loaded:', currentPageName);
    
    if (currentPageName === 'index') {
        // Homepage: Load limited content
        loadInitialData();
        initTrendingScroll();
        updateHomepageHero();
        updateTrendingCatalogModeFromHash();

        window.addEventListener('hashchange', () => {
            updateTrendingCatalogModeFromHash();
        });
    } else if (currentPageName === 'movies') {
        // Movies page: Load all movies with pagination
        currentSection = 'movies';
        loadMovies('all', 1, false);
        updatePagination('movies', 1);
    } else if (currentPageName === 'tvshows') {
        // TV Shows page: Load all TV shows with pagination
        currentSection = 'tvshows';
        loadTVShows('all', 1, false);
        updatePagination('tvshows', 1);
    } else if (currentPageName === 'trending') {
        currentSection = 'trending';
        loadTrendingCatalog('all', 1);
        updatePagination('trending', 1);
    }
    updateWatchlistUI();
    initPaginationControls();
    setupEventListeners();

    initPwaInstall();
    initTranslateWidget();

    // Global search: if index.html?q=term, run search and render results
    if (currentPageName === 'index') {
        const q = getSearchQueryFromUrl();
        if (q) {
            const input = document.querySelector('.search-input');
            if (input) input.value = q;
            performSearch(q);
        }
    }
});

function initPwaInstall() {
    // Service workers require secure context (https) except localhost.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js').then((reg) => {
                try {
                    if (reg?.waiting) {
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }

                    reg.addEventListener('updatefound', () => {
                        const nw = reg.installing;
                        if (!nw) return;
                        nw.addEventListener('statechange', () => {
                            if (nw.state === 'installed' && reg.waiting) {
                                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                            }
                        });
                    });

                    // Reload once when the new SW takes control
                    let refreshing = false;
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                        if (refreshing) return;
                        refreshing = true;
                        try {
                            if (!sessionStorage.getItem('vortexSwReloaded')) {
                                sessionStorage.setItem('vortexSwReloaded', '1');
                                window.location.reload();
                            }
                        } catch {
                            window.location.reload();
                        }
                    });
                } catch {
                    // ignore
                }
            }).catch(() => {
                // ignore registration errors
            });
        });
    }

    const installBtn = document.getElementById('install-btn');
    if (!installBtn) return;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        installBtn.style.display = '';
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        try {
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
        } catch {
            // ignore
        } finally {
            deferredInstallPrompt = null;
            installBtn.style.display = 'none';
        }
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        installBtn.style.display = 'none';
    });
}

function initTranslateWidget() {
    const container = document.getElementById('google_translate_element');
    if (!container) return;
    if (__vortexTranslateLoaded) return;
    __vortexTranslateLoaded = true;

    container.innerHTML = '<span style="color: rgba(255,255,255,0.7); font-size: 14px;">Loading languages...</span>';

    window.googleTranslateElementInit = function () {
        try {
            if (!window.google?.translate?.TranslateElement) return;
            new window.google.translate.TranslateElement(
                {
                    pageLanguage: 'en',
                    autoDisplay: false
                },
                'google_translate_element'
            );
        } catch {
            // ignore
        }
    };

    const s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true;
    s.onerror = () => {
        container.innerHTML = '<span style="color: rgba(255,255,255,0.7); font-size: 14px;">Translator unavailable.</span>';
    };
    document.head.appendChild(s);
}

function initPaginationControls() {
    // Unified pagination controls
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    if (!prevBtn || !nextBtn) return;

    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            const isHomepage = getCurrentPageName() === 'index';
            if (currentSection === 'movies') {
                loadMovies('all', currentPage - 1, isHomepage);
            } else if (currentSection === 'trending') {
                const activeFilter = document.querySelector('#trending .filter-btn.active')?.dataset?.genre || 'all';
                loadTrendingCatalog(activeFilter, currentPage - 1);
            } else {
                loadTVShows('all', currentPage - 1, isHomepage);
            }
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            const isHomepage = getCurrentPageName() === 'index';
            if (currentSection === 'movies') {
                loadMovies('all', currentPage + 1, isHomepage);
            } else if (currentSection === 'trending') {
                const activeFilter = document.querySelector('#trending .filter-btn.active')?.dataset?.genre || 'all';
                loadTrendingCatalog(activeFilter, currentPage + 1);
            } else {
                loadTVShows('all', currentPage + 1, isHomepage);
            }
        }
    });
}

// Load content into grids
function loadContent() {
    loadMovies();
    loadTVShows();
}

async function loadMovies(genre = 'all', page = 1, isHomepage) {
    if (typeof isHomepage === 'undefined') {
        isHomepage = getCurrentPageName() === 'index';
    }
    if (moviesGrid) {
        moviesGrid.innerHTML = '<div class="loading">Loading movies...</div>';
    }
    
    try {
        // If using API, fetch from API with pagination
        if (page > 1 || movieData.movies.length === 0) {
            const movies = await fetchMovies(page, isHomepage ? 12 : itemsPerPage);
            movieData.movies = movies;
        }
        
        // Use fallback data if no movies loaded
        if (movieData.movies.length === 0) {
            console.log('Using fallback movies data');
            movieData.movies = getFallbackData().filter(item => item.type === 'movie');
        }
        
        console.log('Total movies loaded:', movieData.movies.length);
        console.log('Filtering by genre:', genre);
        
        if (moviesGrid) {
            moviesGrid.innerHTML = '';
            const filteredMovies = genre === 'all' 
                ? movieData.movies 
                : movieData.movies.filter(movie => movie.genre && movie.genre.toLowerCase().includes(genre.toLowerCase()));
            
            console.log('Filtered movies count:', filteredMovies.length);
            
            // Limit to 12 items on homepage
            const moviesToShow = isHomepage ? shuffleArray(filteredMovies).slice(0, 12) : filteredMovies;
            
            moviesToShow.forEach(item => {
                moviesGrid.appendChild(createContentCard(item));
            });

            setFooterCountryItems(isHomepage ? 'indexMovies' : 'movies', moviesToShow);
            
            // Show message if no results
            if (filteredMovies.length === 0 && genre !== 'all') {
                moviesGrid.innerHTML = `<div class="no-results">No ${genre} movies found. Showing all movies instead.</div>`;
                // Show all movies as fallback
                movieData.movies.forEach(item => {
                    moviesGrid.appendChild(createContentCard(item));
                });

                setFooterCountryItems(isHomepage ? 'indexMovies' : 'movies', movieData.movies);
            }
        }
        
        // Only show pagination on non-homepage
        if (!isHomepage) {
            updatePagination('movies', page);
        }
    } catch (error) {
        console.error('Error loading movies:', error);
        if (moviesGrid) {
            moviesGrid.innerHTML = '<div class="error">Failed to load movies. Please try again.</div>';
        }
    }
}

async function loadTVShows(genre = 'all', page = 1, isHomepage) {
    if (typeof isHomepage === 'undefined') {
        isHomepage = getCurrentPageName() === 'index';
    }
    if (tvShowsGrid) {
        tvShowsGrid.innerHTML = '<div class="loading">Loading TV shows...</div>';
    }
    
    try {
        // If using API, fetch from API with pagination
        if (page > 1 || movieData.tvShows.length === 0) {
            const tvShows = await fetchTVShows(page, isHomepage ? 12 : itemsPerPage);
            movieData.tvShows = tvShows;
        }
        
        // Use fallback data if no TV shows loaded
        if (movieData.tvShows.length === 0) {
            console.log('Using fallback TV shows data');
            movieData.tvShows = getFallbackData().filter(item => item.type === 'tv-show');
        }
        
        console.log('Total TV shows loaded:', movieData.tvShows.length);
        console.log('Filtering by genre:', genre);
        
        if (tvShowsGrid) {
            tvShowsGrid.innerHTML = '';
            const filteredShows = genre === 'all' 
                ? movieData.tvShows 
                : movieData.tvShows.filter(show => show.genre && show.genre.toLowerCase().includes(genre.toLowerCase()));
            
            console.log('Filtered TV shows count:', filteredShows.length);
            
            // Limit to 12 items on homepage
            const showsToShow = isHomepage ? shuffleArray(filteredShows).slice(0, 12) : filteredShows;
            
            showsToShow.forEach(item => {
                tvShowsGrid.appendChild(createContentCard(item));
            });

            setFooterCountryItems(isHomepage ? 'indexTv' : 'tvshows', showsToShow);
            
            // Show message if no results
            if (filteredShows.length === 0 && genre !== 'all') {
                tvShowsGrid.innerHTML = `<div class="no-results">No ${genre} TV shows found. Showing all TV shows instead.</div>`;
                // Show all TV shows as fallback
                movieData.tvShows.forEach(item => {
                    tvShowsGrid.appendChild(createContentCard(item));
                });

                setFooterCountryItems(isHomepage ? 'indexTv' : 'tvshows', movieData.tvShows);
            }
        }
        
        // Only show pagination on non-homepage
        if (!isHomepage) {
            updatePagination('tvshows', page);
        }
    } catch (error) {
        console.error('Error loading TV shows:', error);
        if (tvShowsGrid) {
            tvShowsGrid.innerHTML = '<div class="error">Failed to load TV shows. Please try again.</div>';
        }
    }
}

// Create content card element
function createContentCard(item) {
    const card = document.createElement('div');
    card.className = 'content-card';
    card.innerHTML = `
        <img src="${item.image}" alt="${item.title}" loading="lazy">
        <div class="content-rating">
            <i class="fas fa-star"></i> ${item.rating}
        </div>
        <div class="content-card-overlay">
            <div class="content-card-info">
                <h3>${item.title}</h3>
                <p>${item.year} • ${item.genre}</p>
                <div class="content-card-actions">
                    <button class="content-card-btn watch-btn" data-id="${item.id}">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="content-card-btn add-btn" data-id="${item.id}">
                        <i class="fas fa-plus"></i>
                    </button>
                    <button class="content-card-btn info-btn" data-id="${item.id}">
                        <i class="fas fa-info"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners to buttons
    const watchBtn = card.querySelector('.watch-btn');
    const addBtn = card.querySelector('.add-btn');
    const infoBtn = card.querySelector('.info-btn');
    
    watchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playVideo(item);
    });
    
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWatchlist(item);
    });
    
    infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showVideoInfo(item);
    });
    
    // Click on card to play video
    card.addEventListener('click', () => {
        playVideo(item);
    });
    
    return card;
}

// Play video using vidsrc-embed.ru API
function playVideo(item) {
    // Store movie data in sessionStorage for the detail page
    sessionStorage.setItem('selectedMovie', JSON.stringify(item));
    
    // Navigate to movie detail page
    window.location.href = `movie-detail.html?id=${item.id}&type=${item.type}`;
}

// Show video info without playing
function showVideoInfo(item) {
    // Store movie data in sessionStorage for the detail page
    sessionStorage.setItem('selectedMovie', JSON.stringify(item));
    
    // Navigate to movie detail page
    window.location.href = `movie-detail.html?id=${item.id}&type=${item.type}`;
}

// Toggle watchlist
function toggleWatchlist(item) {
    // Get current watchlist from localStorage
    let watchlist = JSON.parse(localStorage.getItem('vortexWatchlist') || '[]');
    
    const index = watchlist.findIndex(watchItem => watchItem.id === item.id);
    if (index > -1) {
        watchlist.splice(index, 1);
        showNotification(`${item.title} removed from your list`);
    } else {
        // Add date added for sorting
        item.addedDate = Date.now();
        watchlist.push(item);
        showNotification(`${item.title} added to your list`);
    }
    
    // Save to localStorage
    localStorage.setItem('vortexWatchlist', JSON.stringify(watchlist));
    updateWatchlistUI();
}

// Update watchlist UI
function updateWatchlistUI() {
    const myListSection = document.getElementById('my-list');
    if (myListSection) {
        // Update my list section if it exists
        const myListGrid = myListSection.querySelector('.content-grid');
        if (myListGrid) {
            const watchlist = JSON.parse(localStorage.getItem('vortexWatchlist') || '[]');
            myListGrid.innerHTML = '';
            watchlist.forEach(item => {
                myListGrid.appendChild(createContentCard(item));
            });
        }
    }
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: #ff6b6b;
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Setup event listeners
function setupEventListeners() {
    // Initialize search elements
    searchInput = document.querySelector('.search-input');
    searchBtn = document.querySelector('.search-btn');
    
    console.log('Search elements found:', !!searchInput, !!searchBtn);
    
    // Navigation smooth scrolling
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href');
            if (!targetId || !targetId.startsWith('#')) {
                return;
            }

            e.preventDefault();
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth' });
            }
            
            // Update active nav link
            document.querySelectorAll('.nav-link').forEach(navLink => {
                navLink.classList.remove('active');
            });
            link.classList.add('active');
        });
    });
    
    // Search functionality - make sure elements exist
    if (searchBtn && searchInput) {
        console.log('Adding search event listeners');
        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
        
        // Also add real-time search on input
        searchInput.addEventListener('input', () => {
            if (searchInput.value.trim() === '') {
                resetContentForCurrentPage();
            } else {
                performSearch();
            }
        });
    } else {
        console.log('Search elements not found on this page');
        console.log('Available search inputs:', document.querySelectorAll('.search-input'));
        console.log('Available search buttons:', document.querySelectorAll('.search-btn'));
    }
    
    // Filter buttons for movies, TV shows, and trending page
    document.querySelectorAll('.filter-btn[data-genre]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const pageName = getCurrentPageName();
            const genre = btn.getAttribute('data-genre') || 'all';

            // Remove active class within this button group
            const filterGroup = btn.closest('.filter-buttons') || document;
            filterGroup.querySelectorAll('.filter-btn[data-genre]').forEach((filterBtn) => {
                filterBtn.classList.remove('active');
            });
            btn.classList.add('active');

            if (pageName === 'movies') {
                loadMovies(genre, 1, false);
                return;
            }

            if (pageName === 'tvshows') {
                loadTVShows(genre, 1, false);
                return;
            }

            if (pageName === 'trending') {
                loadTrendingCatalog(genre, 1);
                return;
            }

            // Homepage: only apply to the section the filter belongs to
            if (pageName === 'index') {
                if (btn.closest('#movies')) {
                    loadMovies(genre, 1, true);
                } else if (btn.closest('#tv-shows')) {
                    loadTVShows(genre, 1, true);
                } else {
                    loadTrending();
                }
            }
        });
    });

    // Modal close
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            videoModal.style.display = 'none';
            // Clear iframe to stop video
            const videoContainer = document.querySelector('.video-container');
            if (videoContainer) {
                videoContainer.innerHTML = '';
            }
        });
    }
    
    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === videoModal) {
            videoModal.style.display = 'none';
            // Clear iframe to stop video
            const videoContainer = document.querySelector('.video-container');
            if (videoContainer) {
                videoContainer.innerHTML = '';
            }
        }
    });
    
    // Scroll to top
    if (scrollToTopBtn) {
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
    
    // Mobile menu toggle
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (mobileMenuToggle && navMenu) {
        const closeMobileMenu = () => {
            navMenu.classList.remove('is-open');
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
        };

        const toggleMobileMenu = () => {
            const willOpen = !navMenu.classList.contains('is-open');
            navMenu.classList.toggle('is-open', willOpen);
            mobileMenuToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        };

        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileMenu();
        });

        // Close menu when a link is clicked
        navMenu.querySelectorAll('a').forEach((a) => {
            a.addEventListener('click', () => {
                closeMobileMenu();
            });
        });

        // Close menu on outside click
        document.addEventListener('click', (e) => {
            if (!navMenu.classList.contains('is-open')) return;
            if (navMenu.contains(e.target) || mobileMenuToggle.contains(e.target)) return;
            closeMobileMenu();
        });
    }
    
    // View all buttons
    document.querySelectorAll('.view-all-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showNotification('Full catalog coming soon!');
        });
    });
}

// Setup scroll effects
function setupScrollEffects() {
    let lastScrollTop = 0;
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Hide/show navbar on scroll
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            navbar.style.transform = 'translateY(-100%)';
        } else {
            navbar.style.transform = 'translateY(0)';
        }
        
        lastScrollTop = scrollTop;
        
        // Show/hide scroll to top button
        if (scrollTop > 500) {
            scrollToTopBtn.classList.add('visible');
        } else {
            scrollToTopBtn.classList.remove('visible');
        }
        
        // Update active nav link based on scroll position
        updateActiveNavLink();
    });
}

// Update active navigation link based on scroll position
function updateActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const scrollPosition = window.pageYOffset + 100;
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionId = section.getAttribute('id');
        
        if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${sectionId}`) {
                    link.classList.add('active');
                }
            });
        }
    });
}

// Search functionality
function performSearch(forcedTerm) {
    // Initialize search elements
    searchInput = document.querySelector('.search-input');
    searchBtn = document.querySelector('.search-btn');
    
    if (!searchInput) {
        console.error('Search input not found on this page');
        return;
    }
    
    const rawTerm = (typeof forcedTerm === 'string' ? forcedTerm : searchInput.value).trim();
    const searchTerm = rawTerm.toLowerCase();
    
    console.log('Search initiated with term:', searchTerm);
    
    if (!searchTerm) {
        console.log('Search term is empty, resetting content');
        // Reset content based on current page
        resetContentForCurrentPage();
        return;
    }
    
    const pageName = getCurrentPageName();
    if (pageName !== 'index') {
        redirectToGlobalSearch(rawTerm);
        return;
    }

    performGlobalSearchOnIndex(searchTerm);
}

// Fallback data for search
function getFallbackData() {
    return [
        {
            id: 'tt5433140',
            title: 'Fast X',
            type: 'movie',
            genre: 'action',
            rating: 8.5,
            year: 2024,
            description: 'Fast action movie',
            image: 'https://image.tmdb.org/t/p/w500/x1qw0TXh4FbD2wz2n2pLEyNDNpZ.jpg'
        },
        {
            id: 'tt1234567',
            title: 'The Matrix',
            type: 'movie',
            genre: 'sci-fi',
            rating: 9.0,
            year: 1999,
            description: 'Sci-fi action movie',
            image: 'https://image.tmdb.org/t/p/w500/fiU9dsZnsazqCqLhr1Fjx5m9QdI.jpg'
        },
        {
            id: 'tt7654321',
            title: 'Breaking Bad',
            type: 'tv-show',
            genre: 'drama',
            rating: 9.5,
            year: 2008,
            description: 'Crime drama TV series',
            image: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg'
        },
        {
            id: 'tt9876543',
            title: 'Stranger Things',
            type: 'tv-show',
            genre: 'horror',
            rating: 8.7,
            year: 2016,
            description: 'Sci-fi horror series',
            image: 'https://image.tmdb.org/t/p/w500/x2LSRK2Cpe7vQe4uLy9l2dImBj9.jpg'
        },
        {
            id: 'tt1111111',
            title: 'Avatar',
            type: 'movie',
            genre: 'sci-fi',
            rating: 8.8,
            year: 2009,
            description: 'Epic sci-fi adventure',
            image: 'https://image.tmdb.org/t/p/w500/jRXYjXNq0Cs2TcJjLkki24MLPa7.jpg'
        },
        {
            id: 'tt0468569',
            title: 'The Dark Knight',
            type: 'movie',
            genre: 'action',
            rating: 9.0,
            year: 2008,
            description: 'Batman action movie',
            image: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMYuyKdhLsvDCqqMo8WcI.jpg'
        },
        {
            id: 'tt0944947',
            title: 'Game of Thrones',
            type: 'tv-show',
            genre: 'drama',
            rating: 9.3,
            year: 2011,
            description: 'Fantasy drama series',
            image: 'https://image.tmdb.org/t/p/w500/uDgy6hyPdRkEzEEdUWqTQcY1hhX.jpg'
        },
        {
            id: 'tt1375666',
            title: 'Inception',
            type: 'movie',
            genre: 'sci-fi',
            rating: 8.8,
            year: 2010,
            description: 'Mind-bending sci-fi thriller',
            image: 'https://image.tmdb.org/t/p/w500/edw5FtCcihzp23nlD1ZyA7Y6Nqo.jpg'
        },
        {
            id: 'tt1856101',
            title: 'Stranger Things',
            type: 'tv-show',
            genre: 'horror',
            rating: 8.7,
            year: 2016,
            description: 'Sci-fi horror series',
            image: 'https://image.tmdb.org/t/p/w500/x2LSRK2Cpe7vQe4uLy9l2dImBj9.jpg'
        },
        {
            id: 'tt0111161',
            title: 'The Shawshank Redemption',
            type: 'movie',
            genre: 'drama',
            rating: 9.3,
            year: 1994,
            description: 'Classic drama film',
            image: 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGRsvpQXpeMhn7lyABJ.jpg'
        }
    ];
}

function displaySearchResults(searchResults, searchTerm) {
    lastSearchTerm = searchTerm || '';
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    
    if (currentPage === 'mylist') {
        // My List page search
        const myListGrid = document.getElementById('mylist-grid');
        const emptyState = document.getElementById('empty-state');
        
        if (searchResults.length > 0) {
            emptyState.style.display = 'none';
            myListGrid.style.display = 'grid';
            myListGrid.innerHTML = '';
            searchResults.forEach(item => {
                const card = createListItemCard(item);
                myListGrid.appendChild(card);
            });
            showNotification(`Found ${searchResults.length} results for "${searchTerm}"`);
        } else {
            emptyState.style.display = 'block';
            myListGrid.style.display = 'none';
            emptyState.innerHTML = `
                <div class="empty-icon">
                    <i class="fas fa-search"></i>
                </div>
                <h2>No results found</h2>
                <p>No items found for "${searchTerm}" in your list</p>
            `;
        }
    } else {
        // Other pages search
        const trendingScroll = document.getElementById('trending-scroll');
        const moviesGrid = document.getElementById('movies-grid');
        const tvShowsGrid = document.getElementById('tv-shows-grid');
        
        if (searchResults.length > 0) {
            if (currentPage === 'movies' && moviesGrid) {
                const moviesOnly = searchResults.filter(i => i.type === 'movie');
                moviesGrid.innerHTML = '';
                if (moviesOnly.length === 0) {
                    moviesGrid.innerHTML = `<div class="no-results">No results found for "${searchTerm}".</div>`;
                } else {
                    moviesOnly.forEach(item => moviesGrid.appendChild(createContentCard(item)));
                }
            } else if (currentPage === 'tvshows' && tvShowsGrid) {
                const showsOnly = searchResults.filter(i => i.type === 'tv-show');
                tvShowsGrid.innerHTML = '';
                if (showsOnly.length === 0) {
                    tvShowsGrid.innerHTML = `<div class="no-results">No results found for "${searchTerm}".</div>`;
                } else {
                    showsOnly.forEach(item => tvShowsGrid.appendChild(createContentCard(item)));
                }
            } else if (currentPage === 'index') {
                // Homepage: show search results across movies + TV shows
                const moviesSection = document.getElementById('movies');
                const tvShowsSection = document.getElementById('tv-shows');
                if (moviesSection) moviesSection.style.display = 'block';
                if (tvShowsSection) tvShowsSection.style.display = 'block';

                const moviesOnly = searchResults.filter(i => i.type === 'movie');
                const showsOnly = searchResults.filter(i => i.type === 'tv-show');

                if (moviesGrid) {
                    moviesGrid.innerHTML = '';
                    moviesOnly.slice(0, 24).forEach(item => moviesGrid.appendChild(createContentCard(item)));
                    if (moviesOnly.length === 0) {
                        moviesGrid.innerHTML = `<div class="no-results">No movies found for "${searchTerm}".</div>`;
                    }
                }

                if (tvShowsGrid) {
                    tvShowsGrid.innerHTML = '';
                    showsOnly.slice(0, 24).forEach(item => tvShowsGrid.appendChild(createContentCard(item)));
                    if (showsOnly.length === 0) {
                        tvShowsGrid.innerHTML = `<div class="no-results">No TV shows found for "${searchTerm}".</div>`;
                    }
                }

                // Optional: clear trending scroll so it doesn't distract
                if (trendingScroll) {
                    trendingScroll.innerHTML = '';
                }

                const moviesTop = moviesSection || document.getElementById('trending');
                if (moviesTop) {
                    moviesTop.scrollIntoView({ behavior: 'smooth' });
                }
            }

            setFooterCountryItems('search', searchResults);
            
            showNotification(`Found ${searchResults.length} results for "${searchTerm}"`);
        } else {
            showNotification(`No results found for "${searchTerm}"`);
            // Reset content if no results
            resetContentForCurrentPage();
            setFooterCountryItems('search', []);
        }
    }
}

function resetContentForCurrentPage() {
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    
    if (currentPage === 'mylist') {
        // Reload my list
        if (typeof loadMyList === 'function') {
            loadMyList();
        }
    } else if (currentPage === 'movies') {
        // Reload movies
        const activeFilter = document.querySelector('.filter-btn[data-genre].active');
        const genre = activeFilter ? activeFilter.getAttribute('data-genre') : 'all';
        loadMovies(genre, 1, false);
    } else if (currentPage === 'tvshows') {
        // Reload TV shows
        const activeFilter = document.querySelector('.filter-btn[data-genre].active');
        const genre = activeFilter ? activeFilter.getAttribute('data-genre') : 'all';
        loadTVShows(genre, 1, false);
    } else {
        // Homepage - load all content
        loadContent();
        // Show hidden sections
        const moviesSection = document.getElementById('movies');
        const tvShowsSection = document.getElementById('tv-shows');
        if (moviesSection) moviesSection.style.display = 'block';
        if (tvShowsSection) tvShowsSection.style.display = 'block';
    }
}

// Create list item card for My List page
function createListItemCard(item) {
    const card = document.createElement('div');
    card.className = 'content-card';
    card.innerHTML = `
        <img src="${item.image}" alt="${item.title}" loading="lazy">
        <div class="content-rating">
            <i class="fas fa-star"></i> ${item.rating}
        </div>
        <div class="content-type-badge">
            <i class="fas fa-${item.type === 'movie' ? 'film' : 'tv'}"></i>
            ${item.type === 'movie' ? 'Movie' : 'TV Show'}
        </div>
        <div class="content-card-overlay">
            <div class="content-card-info">
                <h3>${item.title}</h3>
                <p>${item.year} • ${item.genre}</p>
                <div class="content-card-actions">
                    <button class="content-card-btn watch-btn" onclick="watchFromList('${item.id}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="content-card-btn remove-btn" onclick="removeFromList('${item.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    card.addEventListener('click', () => {
        watchFromList(item.id);
    });
    
    return card;
}

function watchFromList(itemId) {
    const watchlist = JSON.parse(localStorage.getItem('vortexWatchlist') || '[]');
    const item = watchlist.find(i => i.id === itemId);
    if (item) {
        sessionStorage.setItem('selectedMovie', JSON.stringify(item));
        window.location.href = `movie-detail.html?id=${item.id}&type=${item.type}`;
    }
}

function removeFromList(itemId) {
    let watchlist = JSON.parse(localStorage.getItem('vortexWatchlist') || '[]');
    const index = watchlist.findIndex(item => item.id === itemId);
    if (index > -1) {
        const item = watchlist[index];
        watchlist.splice(index, 1);
        localStorage.setItem('vortexWatchlist', JSON.stringify(watchlist));
        
        // Reload the list
        if (typeof loadMyList === 'function') {
            loadMyList();
        } else {
            // Fallback: reload page
            location.reload();
        }
        
        showNotification(`${item.title} removed from your list`);
    }
}

// Initialize search elements after DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    searchInput = document.querySelector('.search-input');
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (searchInput.value === '') {
                resetContentForCurrentPage();
            }
        });
    }
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .notification {
        animation: slideIn 0.3s ease;
    }
    
    .notification.hiding {
        animation: slideOut 0.3s ease;
    }
`;
document.head.appendChild(style);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Escape key to close modal
    if (e.key === 'Escape' && videoModal.style.display === 'block') {
        videoModal.style.display = 'none';
        // Clear iframe to stop video
        const videoContainer = document.querySelector('.video-container');
        videoContainer.innerHTML = '';
    }
    
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
    }
});

// Lazy loading for images
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.src; // Trigger load
                observer.unobserve(img);
            }
        });
    });
    
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Performance optimization: Debounce scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply debounce to scroll handlers
window.addEventListener('scroll', debounce(() => {
    // Scroll-related operations
}, 100));
