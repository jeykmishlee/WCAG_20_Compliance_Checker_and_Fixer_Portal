const express = require("express");
const puppeteer = require("puppeteer");
const AxePuppeteer = require("@axe-core/puppeteer").default;
const cors = require("cors");
const path = require("path");
const URL = require('url').URL;
const fs = require('fs');

const {
    fixColorContrast,
    fixFormLabels,
    fixInteractiveElements,
    fixHeadings,
    fixDuplicateIds,
    fixTableHeaders,
    fixListStructures,
    fixFocusIndicators,
    fixAriaElements,
    fixInaccessibleFrames,
    fixFormValidation,
    fixZoomAndScale,
    fixLanguageAttribute,
    fixDocumentTitle,
    fixLandmarks
} = require('./fixes');
const { generateAltText, getFallbackAltText } = require('./altTextGenerator');
const { dismissModals } = require('./modalHandler');

const CACHE_DIRECTORY = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIRECTORY)) {
    fs.mkdirSync(CACHE_DIRECTORY);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const altTextCache = {};
const scanResultsCache = {};

function getCacheKey(url) {
    return url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function getCachedResult(url) {
    const cacheKey = getCacheKey(url);
    const cachedData = scanResultsCache[cacheKey];
    
    if (cachedData) {
        // Check if cache is less than 24 hours old (Ensures updated results)
        if ((Date.now() - cachedData.timestamp) < 86400000) { 
            return cachedData.data;
        } else {
            delete scanResultsCache[cacheKey];
        }
    }
    return null;
}

function cacheResult(url, data) {
    const cacheKey = getCacheKey(url);
    scanResultsCache[cacheKey] = {
        timestamp: Date.now(),
        data: data
    };
    
    try {
        const cachePath = path.join(CACHE_DIRECTORY, cacheKey + '.json');
        fs.writeFileSync(cachePath, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));
    } catch (error) {
        console.error('Error saving cache to disk:', error);
    }
}

async function performScan(url) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1280,720'
        ]
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        // Replicate a common browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'sec-ch-ua': '"Google Chrome";v="121", " Not;A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        });
        
        try {
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                try {
                    const resourceType = request.resourceType();
                    // Block ads and other unnecessary resources
                    if (
                        resourceType === 'image' && !request.url().match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) ||
                        resourceType === 'media' ||
                        resourceType === 'font' ||
                        resourceType === 'other' ||
                        request.url().includes('analytics') ||
                        request.url().includes('tracking') ||
                        request.url().includes('advertisement') ||
                        request.url().includes('googlesyndication') ||
                        request.url().includes('doubleclick') ||
                        request.url().includes('facebook.net') ||
                        request.url().includes('google-analytics')
                    ) {
                        request.abort();
                    } else {
                        request.continue();
                    }
                } catch (error) {
                    console.error('Request interception error:', error.message);
                    try {
                        request.continue();
                    } catch (e) {
                        // Ignore
                    }
                }
            });
        } catch (error) {
            console.error('Failed to set request interception:', error.message);
        }
        
        let navigationSuccessful = false;
        
        // Load page using different strategies
        try {
            // First: Wait until DOM is loaded
            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: 30000
            });

            navigationSuccessful = true;
        } catch (error) {
            console.log('First navigation attempt failed:', error.message);
            
            // Second: Try to wait for load
            try {
                await page.goto(url, {
                    waitUntil: "load",
                    timeout: 45000
                });

                navigationSuccessful = true;
            } catch (retryError) {
                console.log('Second navigation attempt also failed:', retryError.message);
                // Last resort: Try network idle
                try {
                    await page.goto(url, {
                        waitUntil: "networkidle0",
                        timeout: 60000
                    });
                    
                    navigationSuccessful = true;
                } catch (finalError) {
                    console.log('Final navigation attempt failed:', finalError.message);
                    throw new Error(`Failed to load page: ${finalError.message}`);
                }
            }
        }

        let dismissedModals = [];

        // Try to dismiss modals if any
        [dismissedModals, navigationSuccessful] = await dismissModals(page);
        
        // Run axe analysis with retries
        let axeResults;
        let axeRetries = 0;
        const maxAxeRetries = 5;
        
        while (axeRetries < maxAxeRetries) {
            try {
                axeResults = await new AxePuppeteer(page)
                    .options({
                        runOnly: {
                            type: 'tag',
                            values: ['wcag2a', 'wcag2aa', 'best-practice']
                        },
                        timeout: 30000,
                        selectors: true,
                        elementRef: false
                    })
                    .analyze();
                break; 
            } catch (error) {
                axeRetries++;
                console.log(`Axe analysis attempt ${axeRetries} failed: ${error.message}`);
                
                if (axeRetries === maxAxeRetries) {
                    console.log('All axe analysis attempts failed, using empty results');
                    
                    // Return empty results if all attempts fail
                    axeResults = {
                        violations: [],
                        passes: [],
                        incomplete: [],
                        inapplicable: []
                    };

                    navigationSuccessful = false;
                } else {
                    await new Promise(resolve => setTimeout(resolve, 1000 * axeRetries));
                    
                    try {
                        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
                    } catch (reloadError) {
                        console.log('Page reload failed:', reloadError.message);
                    }
                }
            }
        }
        
        const executeWithFallback = async (fixFn, fixName = '') => {
            try {
                return await fixFn();
            } catch (error) {
                console.log(`Error executing fixes to ${fixName}: ${error.message}`);
                return [];
            }
        };
        
        // Separate the automated fixes into batches
        // First: Language attribute, document title, duplicate IDs (Essential stuff)
        let languageFixes = [];
        let titleFixes = [];
        let duplicateIdFixes = [];
        
        languageFixes = await executeWithFallback(() => fixLanguageAttribute(page), 'language attribute');
        titleFixes = await executeWithFallback(() => fixDocumentTitle(page, url), 'document title');
        duplicateIdFixes = await executeWithFallback(() => fixDuplicateIds(page), 'duplicate IDs');

        // Second: Heading orders, landmarks, list structures, table headers (Structure-related stuff)
        let headingFixes = [];
        let landmarkFixes = [];
        let listStructureFixes = [];
        let tableHeaderFixes = [];
        
        [
            headingFixes,
            landmarkFixes,
            listStructureFixes,
            tableHeaderFixes
        ] = await Promise.all([
            executeWithFallback(() => fixHeadings(page), 'heading orders'),
            executeWithFallback(() => fixLandmarks(page), 'landmarks'),
            executeWithFallback(() => fixListStructures(page), 'list structures'),
            executeWithFallback(() => fixTableHeaders(page), 'table headers')
        ]);

        // Third: Form labels, interactive elements, ARIA elements, form validation (Interactive + Navigation stuff)
        let formLabelFixes = [];
        let interactiveElementFixes = [];
        let focusIndicatorFixes = [];
        let ariaFixes = [];
        let formValidationFixes = [];
        
        [
            formLabelFixes,
            interactiveElementFixes,
            focusIndicatorFixes,
            ariaFixes,
            formValidationFixes
        ] = await Promise.all([
            executeWithFallback(() => fixFormLabels(page), 'missing labels'),
            executeWithFallback(() => fixInteractiveElements(page), 'empty interactive elements'),
            executeWithFallback(() => fixFocusIndicators(page), 'focus indicators'),
            executeWithFallback(() => fixAriaElements(page), 'ARIA elements'),
            executeWithFallback(() => fixFormValidation(page), 'form validation')
        ]);

        // Fourth: Color contrast, zooming & scaling, frame accessibility (Visual stuff)
        let contrastFixes = [];
        let viewportFixes = [];
        let inaccessibleFrameFixes = [];
        
        [
            contrastFixes,
            viewportFixes,
            inaccessibleFrameFixes
        ] = await Promise.all([
            executeWithFallback(() => fixColorContrast(page), 'contrast issues'),
            executeWithFallback(() => fixZoomAndScale(page), 'viewport zooming'),
            executeWithFallback(() => fixInaccessibleFrames(page), 'frame accessibility')
        ]);

        // Last: Handle image alt text issues
        let fixedAltTexts = 0;
        const altTextViolations = axeResults.violations.filter(v => v.id === 'image-alt');
        
        if (altTextViolations.length > 0) {
            const imageNodes = [];
            
            // Extract image elements and URLs
            for (const violation of altTextViolations) {
                for (const node of violation.nodes) {
                    try {
                        const imgElement = await page.$(node.target[0]);
                        if (!imgElement) continue;

                        const imageUrl = await imgElement.evaluate(el => {
                            // Get the best available image URL
                            const sources = [
                                el.getAttribute('data-src'),
                                el.getAttribute('data-original'),
                                el.getAttribute('data-lazy-src'),
                                el.src
                            ].filter(Boolean);
                            
                            return sources.find(url => 
                                !url.startsWith('data:image') && 
                                (url.startsWith('http') || url.startsWith('/'))
                            );
                        });

                        if (!imageUrl) {
                            continue;
                        }

                        const fullImageUrl = new URL(imageUrl, url).href;
                        imageNodes.push({ node, imgElement, imageUrl: fullImageUrl });
                        
                    } catch (error) {
                        console.log('Error extracting image:', error.message);
                    }
                }
            }
            
            // Process alt text generation in batches
            const batchSize = 5;
            for (let i = 0; i < imageNodes.length; i += batchSize) {
                const batch = imageNodes.slice(i, i + batchSize);
                
                await Promise.all(batch.map(async ({ node, imgElement, imageUrl }) => {
                    try {
                        // Check cache first
                        let altText = altTextCache[imageUrl];
                        
                        if (!altText) {
                            altText = await generateAltText(imageUrl);
                            altTextCache[imageUrl] = altText;
                        }

                        node.suggestion = altText;
                        
                        await imgElement.evaluate((el, text) => {
                            el.setAttribute('alt', text);
                        }, altText);
                        
                        fixedAltTexts++;
                        
                    } catch (error) {
                        console.log('Error processing image:', error.message);
                        node.suggestion = getFallbackAltText(imageUrl);
                    }
                }));
            }
        }
        
        const fixedHtml = await page.content();
        
        let finalResults;
        try {
            finalResults = await new AxePuppeteer(page)
                .options({
                    runOnly: {
                        type: 'tag',
                        values: ['wcag2a', 'wcag2aa', 'best-practice']
                    },
                    timeout: 30000,
                    selectors: true,
                    elementRef: false
                })
                .analyze();
        } catch (error) {
            console.log('Final analysis failed:', error.message);
            finalResults = {
                violations: [],
                passes: [],
                incomplete: [],
                inapplicable: []
            };
        }
        
        const auditLog = {
            timestamp: new Date().toISOString(),
            url,
            totalIssuesDetected: axeResults.violations.length,
            fixesByCategory: {
                contrast: contrastFixes.length,
                labels: formLabelFixes.length,
                interactiveElements: interactiveElementFixes.length,
                headings: headingFixes.length,
                duplicateIds: duplicateIdFixes.length,
                tableHeaders: tableHeaderFixes.length,
                listStructure: listStructureFixes.length,
                focusIndicators: focusIndicatorFixes.length,
                ariaElements: ariaFixes.length,
                frames: inaccessibleFrameFixes.length,
                formValidation: formValidationFixes.length,
                viewport: viewportFixes.length,
                language: languageFixes.length,
                title: titleFixes.length,
                landmarks: landmarkFixes.length,
                imageAltTexts: fixedAltTexts.length
            }
        };

        const result = {
            url,
            originalIssues: axeResults.violations,
            issues: finalResults.violations,
            fixes: {
                contrast: contrastFixes,
                labels: formLabelFixes,
                interactiveElements: interactiveElementFixes,
                headings: headingFixes,
                duplicateIds: duplicateIdFixes,
                tableHeaders: tableHeaderFixes,
                listStructure: listStructureFixes,
                focusIndicators: focusIndicatorFixes,
                ariaElements: ariaFixes,
                frames: inaccessibleFrameFixes,
                formValidation: formValidationFixes,
                viewport: viewportFixes,
                language: languageFixes,
                title: titleFixes,
                landmarks: landmarkFixes,
                imageAltTexts: fixedAltTexts
            },
            auditLog: {
                ...auditLog,
            },
            fixedHtml,
            warning: !navigationSuccessful
        };
        
        return result;
    } finally {
        await browser.close();
    }
}

app.get("/scan", async (req, res) => {
    const { url, forceRefresh } = req.query;
    if (!url) return res.status(400).json({ error: "URL parameter required" });

    try {
        if (!forceRefresh) {
            const cachedResult = getCachedResult(url);
            if (cachedResult) {
                console.log('Using cached result for ' + url);
                return res.json(cachedResult);
            }
        }

        let retries = 0;
        const maxRetries = 3; // Try to scan 3 times max
        let lastError = null;

        while (retries < maxRetries) {
            try {
                const result = await performScan(url);
                cacheResult(url, result);
                
                return res.json(result);
            } catch (error) {
                lastError = error;
                console.log(`Scan attempt ${retries + 1} failed:`, error.message);
                retries++;
                
                if (retries < maxRetries) {
                    const delay = 1000 * retries;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw new Error(`Scan failed after ${maxRetries} attempts: ${lastError.message}`);
    } catch (error) {
        res.status(500).json({
            error: "Scan failed",
            details: error.message
        });
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(3000, () => console.log('FixAble running on http://localhost:3000'));