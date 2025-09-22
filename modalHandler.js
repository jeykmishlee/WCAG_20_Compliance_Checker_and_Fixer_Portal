async function waitForPageReady(page) {
    try {
        const readyTimeout = 20000; // 20 secs
        const networkTimeout = 2000; // 2 secs
        const bufferTime = 2000; // 2 secs

        // Wait for document to be ready or interactive
        await page.waitForFunction(() => {
            return document.readyState == 'complete' || document.readyState == 'interactive';
        }, { readyTimeout });
    
        // Wait for network idle
        await page.waitForNetworkIdle({
            idleTime: networkTimeout,
            timeout: readyTimeout,
        })

        // Last wait
        await new Promise(resolve => setTimeout(resolve, bufferTime));
        
        return true;
    } catch (error) {
        console.error('Error waiting for page ready:', error.message);
        
        return false;
    }
}

async function dismissModals(page) {
    async function dismissModalsHelper(page) {
        await waitForPageReady(page);
        
        const successfullyDismissed = await page.evaluate(() => {
            let dismissed = [];

            const isVisible = (elem) => {
                if (!elem) {
                    return false;
                }

                const style = window.getComputedStyle(elem);
                const rect = elem.getBoundingClientRect();

                return style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0' &&
                    rect.width > 0 &&
                    rect.height > 0;
            };

            const cookieSelectors = [
                '#cookie-banner', '.cookie-banner', '#cookie-consent', '.cookie-consent',
                '#cookie-notice', '.cookie-notice', '#cookie-policy', '.cookie-policy',
                '#cookieBanner', '.cookieBanner', '#cookieConsent', '.cookieConsent',
                '#cookieNotice', '.cookieNotice', '#gdpr-banner', '.gdpr-banner',
                '#gdpr-consent', '.gdpr-consent', '#gdpr-notice', '.gdpr-notice',
                '[aria-label*="cookie" i]', '[aria-label*="consent" i]',
                'button[id*="accept" i]', 'button[class*="accept" i]',
                'button[id*="agree" i]', 'button[class*="agree" i]',
                'button[id*="consent" i]', 'button[class*="consent" i]',
                'button[id*="cookie" i]', 'button[class*="cookie" i]',
                'a[id*="accept" i]', 'a[class*="accept" i]',
                'a[id*="agree" i]', 'a[class*="agree" i]',
                'a[id*="consent" i]', 'a[class*="consent" i]',
                'a[id*="cookie" i]', 'a[class*="cookie" i]'
            ];

            for (let cs of cookieSelectors) {
                const elems = document.querySelectorAll(cs);

                for (let elem of elems) {
                    if (isVisible(elem)) {
                        const text = elem.textContent.toLowerCase();
                        if (text.includes('accept') ||
                            text.includes('agree') ||
                            text.includes('consent') ||
                            text.includes('allow') ||
                            text.includes('got it') ||
                            text.includes('ok')) {
                                elem.click();

                                dismissed.push({
                                    type: 'cookie',
                                    selector: cs,
                                    text: elem.textContent.trim()
                                });

                                break;
                        }
                    }
                }
            }

            const popupSelectors = [
                '#newsletter-popup', '.newsletter-popup', '#subscribe-popup', '.subscribe-popup',
                '#popup', '.popup', '#modal', '.modal', '#overlay', '.overlay',
                '[aria-label*="newsletter" i]', '[aria-label*="subscribe" i]',
                '[aria-label*="popup" i]', '[aria-label*="modal" i]',
                'button[aria-label*="close" i]', 'button[title*="close" i]',
                'button.close', 'button.dismiss', 'button.cancel',
                'a.close', 'a.dismiss', 'a.cancel',
                'span.close', 'span.dismiss', 'span.cancel',
                'div.close', 'div.dismiss', 'div.cancel',
                'button:has(svg)', 'a:has(svg)', 'span:has(svg)',
                'button:has(img[alt*="close" i])', 'a:has(img[alt*="close" i])'
            ];

            for (let ps of popupSelectors) {
                const elems = document.querySelectorAll(ps);

                for (let elem of elems) {
                    if (isVisible(elem)) {
                        const text = elem.textContent.toLowerCase();
                        const ariaLabel = elem.getAttribute('aria-label')?.toLowerCase() || '';
                        const title = elem.getAttribute('title')?.toLowerCase() || '';

                        if (text.includes('close') || text.includes('dismiss') || 
                            text.includes('cancel') || text.includes('no thanks') ||
                            text.includes('×') || text.includes('✕') ||
                            ariaLabel.includes('close') || title.includes('close')) {
                                elem.click();

                                dismissed.push({
                                    type: 'popup',
                                    selector: ps,
                                    text: elem.textContent.trim() || ariaLabel || title
                                });
                            
                                break;
                        }
                    }
                }
            }

            const welcomeSelectors = [
                '#welcome', '.welcome', '#intro', '.intro',
                '#welcome-screen', '.welcome-screen', '#intro-screen', '.intro-screen',
                '#welcome-overlay', '.welcome-overlay', '#intro-overlay', '.intro-overlay',
                'button[id*="continue" i]', 'button[class*="continue" i]',
                'button[id*="skip" i]', 'button[class*="skip" i]',
                'button[id*="start" i]', 'button[class*="start" i]',
                'button[id*="begin" i]', 'button[class*="begin" i]',
                'a[id*="continue" i]', 'a[class*="continue" i]',
                'a[id*="skip" i]', 'a[class*="skip" i]',
                'a[id*="start" i]', 'a[class*="start" i]',
                'a[id*="begin" i]', 'a[class*="begin" i]'
            ];
            
            for (let ws of welcomeSelectors) {
                const elems = document.querySelectorAll(ws);

                for (let elem of elems) {
                    if (isVisible(elem)) {
                        const text = elem.textContent.toLowerCase();

                        if (text.includes('continue') || text.includes('skip') || 
                            text.includes('start') || text.includes('begin') ||
                            text.includes('got it') || text.includes('next')) {
                                elem.click();

                                dismissed.push({
                                    type: 'welcome',
                                    selector: ws,
                                    text: elem.textContent.trim()
                                });

                                break;
                        }
                    }
                }
            }
            
            const modalSelectors = ['.modal', '.popup', '.overlay', '.dialog', '[role="dialog"]', '[aria-modal="true"]'];

            for (let ms of modalSelectors) {
                const elems = document.querySelectorAll(ms);

                for (let elem of elems) {
                    if (isVisible(elem)) {
                        const closeButtons = elem.querySelectorAll('button, a, span, div, svg, img');
                        
                        for (const button of closeButtons) {
                            if (isVisible(button)) {
                                const text = button.textContent.toLowerCase();
                                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                                const title = button.getAttribute('title')?.toLowerCase() || '';
                                
                                if (text.includes('close') || text.includes('dismiss') || 
                                    text.includes('cancel') || text.includes('×') || 
                                    text.includes('✕') || text.includes('no thanks') ||
                                    ariaLabel.includes('close') || title.includes('close')) {
                                        button.click();
                                        
                                        dismissed.push({
                                            type: 'modal',
                                            selector: ms,
                                            text: button.textContent.trim() || ariaLabel || title
                                        });
                                        
                                        break;
                                }
                            }
                        }
                    }
                }
            }
            
            return dismissed;
        });
        
        return successfullyDismissed;
    }

    let dismissedModals = [];
    const timeout = 20000; // 20 secs

    try {
        dismissedModals = await Promise.race([
            dismissModalsHelper(page),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Modal dismissal timeout')), timeout))
        ]);
        
        if (dismissedModals.length > 0) {
            try {
                // Try again after a successful modal dismissal
                const dismissedModals2 = await Promise.race([
                    dismissModalsHelper(page).catch((error) => {
                    console.error('Error during modal dismissal:', error.message);
                    return [];
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Modal dismissal timeout')), timeout))
                ]);

                dismissedModals.push(... dismissedModals2);
                
                return [dismissedModals, true]
            } catch (error) {
                return [dismissedModals, true]
            }
        } 

        return [dismissedModals, true]
    } catch (error) {
        console.error('Error during modal dismissal:', error.message);
        return [dismissedModals, false];
    }
}

module.exports = {
    dismissModals
};