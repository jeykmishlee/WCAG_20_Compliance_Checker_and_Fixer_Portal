const fs = require('fs');
const path = require('path');
const tinycolor = require('tinycolor2');

async function fixColorContrast(page) {
    const tcPath = fs.readFileSync(path.join(__dirname, 'node_modules', 'tinycolor2', 'dist', 'tinycolor-min.js'), 'utf8');

    await page.addScriptTag({ content: tcPath });
    await page.waitForFunction(() => typeof window.tinycolor === 'function');

    return await page.evaluate(() => {
        const elementsFixed = [];

        const defaultColors = {
                lightText: '#ffffff',
                darkText: '#000000',
                lightLink: '4dabf7',
                darkLink: '0056b3'
        };

        const isVisible = (elem) => {            
            const style = window.getComputedStyle(elem) ? window.getComputedStyle(elem) : null;

            return style.display !== 'none' && 
            style.visibility !== 'hidden' && 
            style.opacity !== '0' &&
            elem.offsetWidth > 0 &&
            elem.offsetHeight > 0;
        };

        const isLargeText = (elem) => {
            const fontSize = parseFloat(elem.fontSize);
            const isBold = parseInt(elem.fontWeight) >= 700;
            
            return (fontSize >= 18) || (fontSize >= 14 && isBold);
        };
        
        const getBackgroundColor = (elem) => {
            let curr = elem;

            while (curr) {
                const style = window.getComputedStyle(curr) ? window.getComputedStyle(curr) : null;
                let bgColor = style.backgroundColor;
                let bgImage = style.backgroundImage;

                if (bgImage !== 'none') {
                    const textColor = window.tinycolor(style.color);
                    return textColor.getBrightness() > 200 ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                }

                if (bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                    return bgColor;
                }

                curr = curr.parentElement;
            }

            return 'rgb(255, 255, 255)';
        };

        const getContrast = (color1, color2) => {
            const c1 = window.tinycolor(color1);
            const c2 = window.tinycolor(color2);
            return window.tinycolor.readability(c1, c2);
        };

        const getRequiredRatio = (elem, style) => {
            if (elem.matches('a, [role="link"]')) {
                return 4.5;
            } else if (elem.matches('button, input, select, textarea, [role="button"]')) {
                return 3.0;
            } else if (isLargeText(style)) {
                return 4.5;
            } else {
                return 3.0;
            }
        };

        const fixElementContrast = (elem) => {
            if (!isVisible(elem)) {
                return null;
            }

            let fixResult = {};
            
            const style = window.getComputedStyle(elem) ? window.getComputedStyle(elem) : null;
            const textColor = style.color;
            const bgColor = getBackgroundColor(elem);
            const currentRatio = getContrast(textColor, bgColor);
            const requiredRatio = getRequiredRatio(elem, style);
            const bgIsDark = window.tinycolor(bgColor).isDark();
            
            if (currentRatio >= requiredRatio) {
                return null;
            }

            // Special handling for links
            if (elem.matches('a, [role="link"]')) {
                return fixLinkContrast(elem, textColor, bgColor, currentRatio, requiredRatio, bgIsDark);
            }

            // Try adjusting text color 
            const baseTextColor = bgIsDark ? defaultColors.lightText : defaultColors.darkText;
            for (let i = 0; i < 5; i++) {
                let newTextColor = bgIsDark ? 
                    window.tinycolor(baseTextColor).lighten(i * 20).toString() : window.tinycolor(baseTextColor).darken(i * 20).toString();
                let newRatio = getContrast(bgColor, newTextColor);

                if (newRatio >= requiredRatio) {
                    elem.style.color = newTextColor;

                    fixResult.element = elem.tagName;
                    fixResult.text = elem.textContent.substring(0, 50) + (elem.textContent.length > 50 ? '...' : '');
                    fixResult.oldContrast = currentRatio.toFixed(2);
                    fixResult.newContrast = newRatio.toFixed(2);
                    fixResult.action = 'Text color changed for improved contrast';

                    return fixResult;
                }
            }

            // If text color doesn't work, try adjusting background color
            for (let i = 0; i < 5; i++) {
                let newBgColor = bgIsDark ? 
                    window.tinycolor(bgColor).lighten(i * 20).toString() : window.tinycolor(bgColor).darken(i * 20).toString();
                let newRatio = getContrast(textColor, newBgColor);

                if (newRatio >= requiredRatio) {
                    elem.style.backgroundColor = newBgColor;

                    fixResult.element = elem.tagName;
                    fixResult.text = elem.textContent.substring(0, 50) + (elem.textContent.length > 50 ? '...' : '');
                    fixResult.oldContrast = currentRatio.toFixed(2);
                    fixResult.newContrast = newRatio.toFixed(2);
                    fixResult.action = 'Background color changed for improved contrast';
                    
                    return fixResult;
                }
            }

            // Default to black/white if no other fix works
            elem.style.color = defaultColors.lightText;
            elem.style.backgroundColor = defaultColors.darkText;

            fixResult.element = elem.tagName;
            fixResult.text = elem.textContent.substring(0, 50) + (elem.textContent.length > 50 ? '...' : '');
            fixResult.oldContrast = currentRatio.toFixed(2);
            fixResult.newContrast = getContrast(defaultColors.lightText, defaultColors.darkText).toFixed(2);
            fixResult.action = 'Black/white applied for contrast';

            return fixResult;
        };

        const fixLinkContrast = (link, textColor, bgColor, currentRatio, requiredRatio, bgIsDark) => {
            let fixResult = {};
            const baseLinkColor = bgIsDark ? defaultColors.lightLink : defaultColors.darkLink;

            // Try adjusting link color first
            for (let i = 0; i < 5; i++) {
                let newLinkColor = bgIsDark ? 
                    window.tinycolor(baseLinkColor).lighten(i * 20).toString() : window.tinycolor(baseLinkColor).darken(i * 20).toString();
                let newRatio = getContrast(bgColor, newLinkColor);

                if (newRatio >= requiredRatio) {
                    link.style.setProperty('color', newLinkColor, 'important');
                    link.style.setProperty('text-decoration', 'underline', 'important');
                    link.addEventListener('focus', function () {
                        this.style.setProperty('outline', '2px solid #2563eb', 'important');
                    });

                    fixResult.element = link.tagName;
                    fixResult.text = link.textContent.substring(0, 50) + (link.textContent.length > 50 ? '...' : '');
                    fixResult.oldContrast = currentRatio.toFixed(2);
                    fixResult.newContrast = newRatio.toFixed(2);
                    fixResult.action = 'Link color changed for improved contrast';

                    return fixResult;
                }
            }

            // Try adjusting background color next
            for (let i = 0; i < 5; i++) {
                let newBgColor = bgIsDark ? 
                    window.tinycolor(bgColor).lighten(i * 20).toString() : window.tinycolor(bgColor).darken(i * 20).toString();
                let newRatio = getContrast(textColor, newBgColor);

                if (newRatio >= requiredRatio) {
                    link.style.backgroundColor = newBgColor;
                    link.style.setProperty('text-decoration', 'underline', 'important');

                    fixResult.element = link.tagName;
                    fixResult.text = link.textContent.substring(0, 50) + (link.textContent.length > 50 ? '...' : '');
                    fixResult.oldContrast = currentRatio.toFixed(2);
                    fixResult.newContrast = newRatio.toFixed(2);
                    fixResult.action = 'Background color changed for improved contrast';

                    return fixResult;
                }
            }

            // Default to black/white if neither works
            link.style.setProperty('color', defaultColors.lightText, 'important');
            link.style.setProperty('background-color', defaultColors.darkText, 'important');
            link.style.setProperty('text-decoration', 'underline', 'important');
            link.style.setProperty('padding', '0 0.25em', 'important');

            fixResult.element = link.tagName;
            fixResult.text = link.textContent.substring(0, 50) + (link.textContent.length > 50 ? '...' : '');
            fixResult.oldContrast = currentRatio.toFixed(2);
            fixResult.newContrast = getContrast(defaultColors.lightText, defaultColors.darkText).toFixed(2);
            fixResult.action = 'Black/white applied for contrast';
            return fixResult;
        };

        const processTextNodes = (node) => {
            if (node.nodeType == Node.ELEMENT_NODE) {
                if (node.getAttribute('role') === 'presentation' || node.getAttribute('aria-hidden') === 'true') {
                    return;
                }
            }

            const style = window.getComputedStyle(node);
            if (style.color !== 'inherit' || style.backgroundColor !== 'transparent') {
                const result = fixElementContrast(node);

                if (result) {
                    elementsFixed.push(result);
                }
            }

            for (let child of Array.from(node.childNodes)) {
                if (child.nodeType === Node.TEXT_NODE) {
                    if (child.textContent.trim() && isVisible(node)) {
                        const result = fixElementContrast(node);

                        if (result) {
                            elementsFixed.push(result);
                        }
                    }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    processTextNodes(child);
                }
            }
        };

        const processElementsBySelector = (selector) => {
            for (let elem of document.querySelectorAll(selector)) {
                if (isVisible(elem)) {
                    const result = fixElementContrast(elem);

                    if (result) {
                        elementsFixed.push(result);
                    }
                }
            }
        };

        processTextNodes(document.body);
        processElementsBySelector('a, button, input, select, textarea, [role="button"], [role="link"]');
        processElementsBySelector('h1, h2, h3, h4, h5, h6');

        return elementsFixed;
    });
}

async function fixFormLabels(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];

        const hasAccessibleName = (elem) => {  
            if (elem.getAttribute('aria-label')?.trim() || // Check for aria-label
            elem.closest('label')?.textContent.trim() || // Check for label text
            elem.getAttribute('title')?.trim() || // Check for title attribute
            elem.getAttribute('placeholder')?.trim()) // Check for placeholder attribute
            {
                return true;
            }

            // Check for aria-labelledby
            if (elem.getAttribute('aria-labelledby')?.trim()) {
                const id = elem.getAttribute('aria-labelledby');
                if (document.getElementById(id)?.textContent.trim()) {
                    return true;
                }
            }

            // Check for associated label
            if (elem.id) {
                if (document.querySelector(`label[for="${elem.id}"]`)?.textContent.trim()) {
                    return true;
                }
            }

            return false;
        };

        let inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea, [role="textbox"], [role="combobox"], [role="listbox"], [role="slider"], [role="spinbutton"], [role="searchbox"]');

        function createVisualLabel(input) {
            if (!input.id) {
                input.id = `input-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            }

            let labelText = '';

            const prevElem = input.previousElementSibling;
            if (prevElem &&
                (['SPAN', 'DIV', 'P', 'STRONG', 'B'].includes(prevElem.tagName)) &&
                prevElem.textContent.trim()) 
            {
                labelText = prevElem.textContent.trim();
            } else {
                labelText = input.placeholder || input.name || '';

                if (!labelText && input.parentElement) {
                    let parentText = []

                    for (const node of input.parentElement.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                            parentText.push(node.textContent.trim());
                        }
                    }
                    
                    if (parentText.length > 0) {
                        labelText = parentText.join(' ');
                    }
                }

                if (!labelText) {
                    if (input.type === 'email') { labelText = 'Email Address'; }
                    else if (input.type === 'password') { labelText = 'Password'; }
                    else if (input.type === 'tel') { labelText = 'Phone Number'; }
                    else if (input.type === 'url') { labelText = 'Website URL'; }
                    else if (input.type === 'text') { labelText = 'Text Input'; }
                    else if (input.type === 'number') { labelText = 'Number Input'; }
                    else if (input.type === 'search') { labelText = 'Search'; }
                    else if (input.type === 'date') { labelText = 'Date'; }
                    else if (input.type === 'time') { labelText = 'Time'; }
                    else if (input.type === 'color') { labelText = 'Color Picker'; }
                    else if (input.type === 'range') { labelText = 'Range Slider'; }
                    else if (input.type === 'file') { labelText = 'File Upload'; }
                    else if (input.type === 'checkbox') { labelText = 'Checkbox'; }
                    else if (input.type === 'radio') { labelText = 'Radio Button'; }
                    else if (input.type === 'submit') { labelText = 'Submit Button'; }
                    else if (input.type === 'reset') { labelText = 'Reset Button'; }
                    else if (input.tagName === 'SELECT') { labelText = 'Select Option'; }
                    else if (input.tagName === 'TEXTAREA') { labelText = 'Text Area'; }
                    else { labelText = 'Input'; }
                }
            }

            const canInsertLabel = !input.hasAttribute('role') && ['INPUT', 'SELECT', 'TEXTAREA'].includes(input.tagName);
            if (canInsertLabel) {
                const newLabel = document.createElement('label');
                newLabel.setAttribute('for', input.id);
                newLabel.textContent = labelText;

                input.parentNode.insertBefore(newLabel, input);

                // Add styling so it's not too plain
                newLabel.style.display = 'block';
                newLabel.style.marginBottom = '5px';
                newLabel.style.fontWeight = 'bold';

                elementsFixed.push({
                    element: 'Label: ' + input.outerHTML,
                    label: newLabel.outerHTML,
                    action: 'Added visible label'
                })
            } else {
                input.setAttribute('aria-label', labelText);

                elementsFixed.push({
                    element: 'Label: ' + input.outerHTML,
                    action: 'Added aria-label for accessibility'
                });
            }
        }

        for (let input of inputs) {
            if (!input.id) {
                input.id = `input-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            }

            if (hasAccessibleName(input)) {
                if (!(input.id && document.querySelector(`label[for="${input.id}"]`))) {
                    createVisualLabel(input);
                }

                continue;
            }

            createVisualLabel(input);
        }

        return elementsFixed;
    });
}

async function fixInteractiveElements(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];

        const getAccessibleName = (elem) => {
            let text = elem.textContent.trim();
            if (text) {
                return text;
            }

            let ariaLabel = elem.getAttribute('aria-label')?.trim();
            if (ariaLabel) {
                return ariaLabel;
            }

            let ariaLabelledBy = elem.getAttribute('aria-labelledby');
            if (ariaLabelledBy) {
                let labels = ariaLabelledBy.split(' ');
                labels.map((id) => {
                    let labelElem = document.getElementById(id);
                    if (labelElem) {
                        return labelElem.textContent.trim();
                    } else {
                        return '';
                    }
                })
                
                if (labels.length > 0) {
                    return labels.join(' ');
                }
            }

            let title = elem.getAttribute('title')?.trim();
            if (title) {
                return title;
            }

            let img = elem.querySelector('img[alt]')?.alt.trim();
            if (img) {
                return img;
            }

            let svg = elem.querySelector('svg[aria-label]')?.textContent.trim();
            if (svg) {
                return svg;
            }
        };

        const generateLabel = (elem) => {
            for (const selector of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'label']) {
                let sibling = elem.previousElementSibling;

                while (sibling) {
                    if (sibling.matches(selector) && sibling.textContent.trim()) {
                        return sibling.textContent.trim();
                    }

                    sibling = sibling.previousElementSibling;
                }
            }

            return '';
        };

        // Fix links without discernible text
        const links = Array.from(document.querySelectorAll('a'));
        for (let link of links) {
            if (!getAccessibleName(link)) {
                let label = '';

                if (link.href) {
                    try {
                        const url = new URL(link.href);
                        if (url.pathname && url.pathname !== '/') {
                            let pathParts = url.pathname.split('/').filter(Boolean);

                            if (pathParts.length > 0) {
                                let lastPart = pathParts[pathParts.length - 1];
                                label = lastPart.replace(/[-_]/g, ' ')
                                        .replace(/\.[^/.]+$/, '') // remove file extension
                                        .split(/(?=[A-Z])/) // split on camelCase
                                        .join(' ')
                                        .toLowerCase()
                                        .split(' ')
                                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                        .join(' ');
                            } else if (url.hostname) {
                                label = url.hostname.replace('www.', '')
                            }
                        }
                    } catch (e) {
                        // Not working
                    }
                }

                if (!label) {
                    label = generateLabel(link);
                }

                if (!label) {
                    label = 'Link ' + (links.indexOf(link) + 1); // Fallback label
                }

                link.setAttribute('aria-label', label);

                if (link.querySelector('i, .icon, img') && !link.textContent.trim()) {
                    let span = document.createElement('span');
                    span.className = 'visually-hidden';
                    span.textContent = label;
                    link.appendChild(span);
                }

                elementsFixed.push({
                    element: 'Link: ' + link.tagName,
                    action: 'Added accessible name to link',
                    label: label,
                });
            } 
        }

        // Fix buttons without discernible text
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (let button of buttons) {
            if (!getAccessibleName(button)) {
                let label = '';

                const type = button.getAttribute('type');
                const form = button.closest('form');

                if (form) {
                    if (type === 'submit') {
                        const formLabel = form.querySelector('legend, h1, h2, h3, h4, h5, h6')?.textContent.trim();
                        label = formLabel? `Submit ${formLabel}` : 'Submit';
                    } else if (type === 'reset') {
                        label = 'Reset';
                    }
                }

                if (!label) {
                    const classList = Array.from(button.classList);
                    const buttonContent = button.innerHTML.toLowerCase();

                    const commonIcons = {
                        close: ['close', 'dismiss', 'times', '×', '✕'],
                        search: ['search', 'find', 'lookup'],
                        menu: ['menu', 'navbar', 'hamburger', '☰'],
                        previous: ['prev', 'previous', 'back', '←', '◄'],
                        next: ['next', 'forward', '→', '►'],
                        play: ['play', '►'],
                        pause: ['pause', '❚❚'],
                        edit: ['edit', 'modify', 'pencil', '✎'],
                        delete: ['delete', 'remove', 'trash'],
                        add: ['add', 'plus', '+', 'new'],
                        share: ['share', 'social'],
                        settings: ['settings', 'config', 'gear', '⚙'],
                    };

                    for (const [action, patterns] of Object.entries(commonIcons)) {
                        if (patterns.some((p) => 
                            classList.some((c) => c.toLowerCase().includes(p)) ||
                            buttonContent.includes(p))) 
                        {
                            label = action.charAt(0).toUpperCase() + action.slice(1);
                            break;
                        }
                    }
                }

                if (!label) {
                    label = generateLabel(button);
                }

                if (!label) {
                    label = 'Button ' + (buttons.indexOf(button) + 1); // Fallback label
                }

                button.setAttribute('aria-label', label);

                if (button.querySelector('i, .icon, img') && !button.textContent.trim()) {
                    let span = document.createElement('span');
                    span.className = 'visually-hidden';
                    span.textContent = label;
                    button.appendChild(span);
                }

                elementsFixed.push({
                    element: 'Button: ' + button.tagName,
                    action: 'Added accessible name to button',
                    label: label,
                });
            }
        }

        return elementsFixed;
    });
}

async function fixHeadings(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];

        // Fix for level-one heading error
        const h1Elements = document.querySelectorAll('h1');
        if (h1Elements.length === 0) {
            let h1Content = '';

            if (document.querySelector('title')?.textContent.trim()) {
                h1Content = document.querySelector('title').textContent.trim();
            }

            if (!h1Content) {
                const metaTitle = document.querySelector('meta[name="title"], meta[property="og:title"]');
                
                if (metaTitle?.content) {
                    h1Content = metaTitle.content;
                }
            }

            if (!h1Content) {
                try {
                    const url = new URL(document.location.href);
                    h1Content = url.hostname.replace('www.', '');
                    h1Content = h1Content.charAt(0).toUpperCase() + h1Content.slice(1);
                } catch (e) {
                    h1Content = 'Page Title';
                }
            }

            let newH1 = document.createElement('h1');
            newH1.textContent = h1Content;
            newH1.style.cssText = 'position: relative; margin: 0.67em 0; color: #000; background: none;';

            // Put new H1 somewhere
            let main = document.querySelector('main, [role="main"]');
            if (main) {
                // In main (if there is one)
                main.insertBefore(newH1, main.firstChild);
            } else {
                // If none, just put it at the top of the body
                document.body.insertBefore(newH1, document.body.firstChild);
            }
        }

        // Fix empty headings
        let headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        let emptyHeadingsRemoved = 0;

        for (let heading of headings) {
            let content = heading.textContent.trim();
            let hasContent = content.length > 0 && !/^(&nbsp;|\s)*$/.test(content);
            let hasImages = heading.querySelector('img, svg, canvas');

            if (!hasContent && !hasImages) {
                elementsFixed.push({
                    element: 'Heading: ' + heading.tagName,
                    action: 'Removed empty heading'
                });

                heading.parentNode.removeChild(heading);
                emptyHeadingsRemoved++;
            }
        }

        headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        
        if (headings.length === 0) {   
            return elementsFixed;
        }

        // Fix multiple H1s
        let multipleH1s = headings.filter(h => h.tagName === 'H1');
        if (multipleH1s.length > 1) {
            for (let i = 1; i < multipleH1s.length; i++) {
                let h1 = multipleH1s[i];
                let newH2 = document.createElement('h2');
                newH2.innerHTML = h1.innerHTML;
                newH2.className = h1.className;

                for (let attr of h1.attributes) {
                    if (attr.name !== 'id') {
                        newH2.setAttribute(attr.name, attr.value);
                    }
                }

                h1.parentNode.replaceChild(newH2, h1);

                elementsFixed.push({
                    element: 'Heading: ' + h1.tagName,
                    original: 'H1',
                    new: 'H2',
                    content: newH2.textContent.substring(0, 50) + (newH2.textContent.length > 50 ? '...' : ''),
                    action: 'Fixed duplicate level-one headings'
                });
            }
        }

        // If no h1, create one
        if (multipleH1s.length === 0 && headings.length > 0) {
            const firstHeading = headings[0];
            const originalTag = firstHeading.tagName;

            const newH1 = document.createElement('h1');
            newH1.innerHTML = firstHeading.innerHTML;
            newH1.className = firstHeading.className;

            for (let attribute of firstHeading.attributes) {
                if (attribute.name !== 'id') {
                    newH1.setAttribute(attribute.name, attribute.value);
                }
            }

            firstHeading.parentNode.replaceChild(newH1, firstHeading);

            elementsFixed.push({
                element: 'Heading: ' + firstHeading.tagName,
                original: originalTag,
                new: 'H1',
                action: 'Added level-one heading',
                content: newH1.textContent.substring(0, 50) + (newH1.textContent.length > 50 ? '...' : '')
            });
        }

        // Fix any skipped heading levels
        headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        let level = 1;
        let fixedHeadingSkips = 0;

        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            const currentLevel = parseInt(heading.tagName.charAt(1));

            if (currentLevel > level + 1) {
                const originalTag = heading.tagName;
                const newTag = `H${level + 1}`;

                const newHeading = document.createElement(newTag);
                newHeading.innerHTML = heading.innerHTML;
                newHeading.className = heading.className;

                for (let attribute of heading.attributes) {
                    if (attribute.name !== 'id') {
                        newHeading.setAttribute(attribute.name, attribute.value);
                    }
                }

                heading.parentNode.replaceChild(newHeading, heading);

                elementsFixed.push({
                    element: 'Heading: ' + heading.tagName,
                    original: originalTag,
                    new: newTag,
                    action: `Fixed skipped heading level from H${currentLevel} to ${newTag}`,
                    content: newHeading.textContent.substring(0, 50) + (newHeading.textContent.length > 50 ? '...' : '')
                });

                level++;
                fixedHeadingSkips++;
            } else {
                level = currentLevel;
            }
        }

        if (emptyHeadingsRemoved > 0) {
            elementsFixed.push({
                element: 'Headings',
                action: `Removed ${emptyHeadingsRemoved} empty headings`
            });
        }

        if (fixedHeadingSkips > 0) {
            elementsFixed.push({
                element: 'Headings',
                action: `Fixed ${fixedHeadingSkips} skipped heading levels`
            });
        }

        return elementsFixed;
    });
}

async function fixDuplicateIds(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];
        let ids = {};

        let elementsWithId = document.querySelectorAll('[id]');
        for (let elem of elementsWithId) {
            const id = elem.getAttribute('id');

            if (!ids[id]) {
                ids[id] = [];
            }

            ids[id].push(elem);
        }

        for (const [id, elems] of Object.entries(ids)) {
            if (elems.length < 1) {
                continue;
            }

            for (let i = 1; i < elems.length; i++) {
                const el = elems[i];
                const oldId = el.id;
                const newId = `${oldId}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 4)}`;
                el.id = newId;

                for (let label of document.querySelectorAll(`label[for="${oldId}"]`)) {
                    if (label.htmlFor === oldId) {
                        label.htmlFor = newId;
                    }
                }

                for (let label of document.querySelectorAll(`[aria-labelledby="${oldId}"]`)) {
                    const labelledBy = label.getAttribute('aria-labelledby').split(' ');
                    const idx = labelledBy.indexOf(oldId);
                    
                    if (idx > -1) {
                        labelledBy[idx] = newId;
                        label.setAttribute('aria-labelledby', labelledBy.join(' '));
                    }
                }

                elementsFixed.push({
                    element: 'Element with ID: ' + el.tagName,
                    oldId,
                    newId,
                    action: 'Fixed duplicate ID'
                });
            }
        }

        return elementsFixed;
    });
}

async function fixTableHeaders(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];
        const tables = document.querySelectorAll('table');

        function findNearHeading(elem) {
            let curr = elem.previousElementSibling
            while (curr) {
                if (/^H[1-6]$/.test(curr.tagName)) {
                    return curr;
                }

                curr = curr.previousElementSibling;
            }

            const parent = elem.parentElement;
            if (parent && parent !== document.body) {
                curr = parent.previousElementSibling;
                while (curr) {
                    if (/^H[1-6]$/.test(curr.tagName)) {
                        return curr;
                    }
                 
                    curr = curr.previousElementSibling;
                }
            }

            return null;
        }

        for (let idx = 0; idx < tables.length; idx++) {
            const table = tables[idx];

            if (table.getAttribute('role') === 'presentation') {
                continue; // Skip presentational tables
            }

            if (!document.querySelector('main')) {
                const potentialMain = document.querySelector('[role="main"], article, .content, #content, #main');

                if (potentialMain) {
                    const mainElem = document.createElement('main');
                    mainElem.setAttribute('role', 'main');
                    potentialMain.parentNode.insertBefore(mainElem, potentialMain);
                    mainElem.appendChild(potentialMain);

                    elementsFixed.push({
                        element: 'Main Element',
                        action: 'Added <main> element around content'
                    });
                }
            }

            if (!table.querySelector('th[scope]')) {
                const firstRow = table.querySelector('tr');

                if (firstRow) {
                    const cells = firstRow.querySelectorAll('td');

                    for (let cell of cells) {
                        const th = document.createElement('th');
                        th.innerHTML = cell.innerHTML;
                        th.setAttribute('scope', 'col');

                        for (let attr of Array.from(cell.attributes)) {
                            if (attr.name !== 'scope') {
                                th.setAttribute(attr.name, attr.value);
                            }
                        }

                        cell.parentNode.replaceChild(th, cell);
                    }

                    elementsFixed.push({
                        element: 'Table Header',
                        action: 'Converted first row cells to table headers',
                        tableIndex: idx + 1
                    });
                }
            } else {
                let scopesAdded = 0;
                const headers = table.querySelectorAll('th');

                for (let th of headers) {
                    if (!th.hasAttribute('scope')) {
                        if (th.parentElement.parentElement.tagName === 'THEAD' ||
                            Array.from(th.parentElement.children).every((cell) => cell.tagName === 'TH')) 
                        {
                            th.setAttribute('scope', 'col');
                        } else {
                            th.setAttribute('scope', 'row');
                        }

                        scopesAdded++;
                    }
                }

                if (scopesAdded > 0) {
                    elementsFixed.push({
                        element: 'Table Header',
                        action: `Added scope attribute to ${scopesAdded} table headers`,
                        tableIndex: idx + 1
                    });
                }
            }

            if (!table.querySelector('caption')) {
                const caption = document.createElement('caption');
                caption.textContent = `Table ${idx + 1}`;

                const nearHeading = findNearHeading(table);
                if (nearHeading) {
                    caption.textContent = nearHeading.textContent.trim();
                }

                table.prepend(caption);

                elementsFixed.push({
                    element: 'Table Caption',
                    action: `Added missing caption to table`,
                    caption: caption.textContent,
                    tableIndex: idx + 1
                });
            }
        }

        return elementsFixed;
    });
}

async function fixListStructures(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];
        const lists = document.querySelectorAll('ul, ol');
        
        for (let list of lists) {
            const faultyItems = Array.from(list.children).filter((child) => child.tagName !== 'LI');

            if (faultyItems.length > 0) {
                for (let faulty of faultyItems) {
                    const li = document.createElement('li');
                    li.appendChild(faulty.cloneNode(true));
                    list.replaceChild(li, faulty);
                }

                elementsFixed.push({
                    element: `List: ${list.tagName}`,
                    action: `Fixed ${faultyItems.length} non-list items`,
                    listId: list.id || ''
                });
            }
        }

        let potentialLists = [];
        const parags = document.querySelectorAll('p, div');
        let currentGroup = null;

        for (let par of parags) {
            const text = par.textContent.trim();
            const bulletMatch = text.match(/^[•\-\*]\s+/);
            const numberMatch = text.match(/^\d+[.)\]]\s+/);

            if (bulletMatch || numberMatch) {
                const marker = bulletMatch ? bulletMatch[0] : numberMatch[0];

                if (currentGroup && (marker.charAt(0) === currentGroup.marker.charAt(0))) {
                    currentGroup.items.push(par);
                } else {
                    if (currentGroup && currentGroup.items.length >= 2) {
                        potentialLists.push(currentGroup);
                    }

                    currentGroup = {
                        marker: marker,
                        elements: [par],
                    }
                }
            } else if (currentGroup) {
                if (currentGroup.items.length >= 2) {
                    potentialLists.push(currentGroup);
                }

                currentGroup = null;
            }

            if (currentGroup && currentGroup.items.length >= 2) {
                potentialLists.push(currentGroup);
            }
        }

        for (let potli of potentialLists) {
            const listType = potli.marker.match(/^\d/) ? 'ol' : 'ul';
            const list = document.createElement(listType);

            for (let elem of potli.elements) {
                const li = document.createElement('li');
                const text = elem.textContent.replace(potli.marker, '').trim();
                li.textContent = text;
                list.appendChild(li);
            }

            potli.elements[0].parentNode.replaceChild(list, potli.elements[0]);
            for (let i = 1; i < potli.elements.length; i++) {
                if (potli.elements[i].parentNode) {
                    potli.elements[i].parentNode.removeChild(potli.elements[i]);
                }
            }

            elementsFixed.push({
                element: `List: ${listType.toUpperCase()}`,
                action: `Converted elements to proper list`,
                marker: potli.marker
            });
        }

        return elementsFixed;
    });
}

async function fixFocusIndicators(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];

        const style = document.createElement('style');
        style.textContent = 'a:focus, button:focus, input:focus, select:focus, textarea:focus, [tabindex]:focus { outline: 3px solid #2563eb !important; outline-offset: 2px !important; }';
        document.head.appendChild(style);

        elementsFixed.push({
            element: 'Focus Indicators',
            action: 'Added focus styles for keyboard navigation'
        });

        const tabindexElems = document.querySelectorAll('a[tabindex="-1"], button[tabindex="-1"]');
        let tabindexFixed = 0;
        for (let elem of tabindexElems) {
            if (elem.getAttribute('tabindex') === '-1') {
                elem.removeAttribute('tabindex');
                tabindexFixed++;
            }
        }

        if (tabindexFixed > 0) {
            elementsFixed.push({
                element: 'Tabindex Elements',
                action: `Removed tabindex="-1" from ${tabindexFixed} elements`
            });
        }

        return elementsFixed;
    });
}

async function fixAriaElements(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];

        const ariaRoles = [
            'alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell', 'checkbox',
            'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'dialog',
            'directory', 'document', 'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading',
            'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu',
            'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note',
            'option', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup',
            'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton',
            'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'timer',
            'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem'
        ];

        const allowedElementsMatrix = {
            'a': ['button', 'checkbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
                  'option', 'radio', 'switch', 'tab', 'treeitem'],
            'article': ['application', 'document', 'feed', 'main', 'region'],
            'aside': ['note', 'complementary', 'search', 'region'],
            'button': ['checkbox', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
                       'option', 'radio', 'switch', 'tab'],
            'div': ariaRoles, 
            'footer': ['contentinfo', 'region'],
            'form': ['search', 'region'],
            'h1': ['tab', 'none', 'presentation'],
            'h2': ['tab', 'none', 'presentation'],
            'h3': ['tab', 'none', 'presentation'],
            'h4': ['tab', 'none', 'presentation'],
            'h5': ['tab', 'none', 'presentation'],
            'h6': ['tab', 'none', 'presentation'],
            'header': ['banner', 'region'],
            'img': ['button', 'checkbox', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
                    'option', 'radio', 'scrollbar', 'separator', 'slider', 'switch', 'tab', 'treeitem',
                    'none', 'presentation'],
            'input': {
                'button': ['link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'radio', 'switch', 'tab'],
                'checkbox': ['button', 'menuitemcheckbox', 'option', 'switch'],
                'image': ['link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'radio', 'switch'],
                'radio': ['menuitemradio'],
                'text': ['combobox', 'searchbox', 'spinbutton'],
                'default': [] 
            },
            'li': ['menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'none', 'presentation',
                   'radio', 'separator', 'tab', 'treeitem'],
            'main': ['none', 'presentation'],
            'menu': ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'toolbar', 'tree'],
            'nav': ['navigation', 'region'],
            'ol': ['directory', 'group', 'listbox', 'menu', 'menubar', 'radiogroup', 'tablist',
                   'toolbar', 'tree', 'presentation', 'none'],
            'section': ['alert', 'alertdialog', 'application', 'banner', 'complementary', 'contentinfo',
                        'dialog', 'document', 'feed', 'log', 'main', 'marquee', 'navigation', 'region',
                        'search', 'status', 'tabpanel'],
            'select': ['menu'],
            'span': ariaRoles,
            'table': ['grid', 'none', 'presentation'],
            'tbody': ['rowgroup', 'none', 'presentation'],
            'td': ['cell', 'gridcell', 'columnheader', 'rowheader', 'none', 'presentation'],
            'th': ['columnheader', 'rowheader', 'none', 'presentation'],
            'tr': ['row', 'none', 'presentation'],
            'ul': ['directory', 'group', 'listbox', 'menu', 'menubar', 'radiogroup', 'tablist',
                   'toolbar', 'tree', 'presentation', 'none']
        };

        const childrenRoles = {
            'listitem': ['list'],
            'option': ['listbox'],
            'menuitem': ['menu', 'menubar'],
            'menuitemcheckbox': ['menu', 'menubar'],
            'menuitemradio': ['menu', 'menubar'],
            'tab': ['tablist'],
            'treeitem': ['tree'],
            'row': ['grid', 'rowgroup', 'table', 'treegrid'],
            'gridcell': ['row'],
            'columnheader': ['row'],
            'rowheader': ['row']
        };

        const parentRoles = {
            'list': ['listitem'],
            'listbox': ['option'],
            'menu': ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
            'menubar': ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
            'tablist': ['tab'],
            'tree': ['treeitem'],
            'grid': ['row'],
            'table': ['row'],
            'treegrid': ['row'],
            'rowgroup': ['row']
        };

        const requiredAttributes = {
            'combobox': ['aria-expanded', 'aria-controls'],
            'slider': ['aria-valuemin', 'aria-valuemax', 'aria-valuenow'],
            'progressbar': ['aria-valuemin', 'aria-valuemax', 'aria-valuenow'],
            'scrollbar': ['aria-controls', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow'],
            'spinbutton': ['aria-valuemin', 'aria-valuemax', 'aria-valuenow'],
            'checkbox': ['aria-checked'],
            'radio': ['aria-checked'],
            'switch': ['aria-checked'],
            'textbox': ['aria-multiline'],
            'listbox': ['aria-multiselectable'],
            'grid': ['aria-multiselectable', 'aria-readonly'],
            'tablist': ['aria-multiselectable']
        };

        const landmarkRoles = [
            'banner', 'complementary', 'contentinfo', 'form', 'main',
            'navigation', 'region', 'search'
        ];

        const interactiveRoles = [
            'button', 'link', 'menuitem', 'tab', 'radio', 'checkbox',
            'menuitemcheckbox', 'combobox', 'textbox', 'searchbox',
            'spinbutton', 'slider', 'switch'
        ];

        function getNearText(elem) {
            let sibling = elem.previousElementSibling;
            while (sibling) {
                let sibText = sibling.textContent?.trim();

                if (sibText && sibText.length > 1 && sibText.length < 50) {
                    return sibText;
                }

                sibling = sibling.previousElementSibling;
            }

            let parent = elem.parentElement;
            if (parent) {
                sibling = parent.previousElementSibling;
                while (sibling) {
                    let sibText2 = sibling.textContent?.trim();
                    
                    if (sibText2 && sibText2.length > 1 && sibText2.length < 50) {
                        return sibText2;
                    }

                    sibling = sibling.previousElementSibling;
                }

                const labels = parent.querySelectorAll('label, h1, h2, h3, h4, h5, h6, p');

                for (let label of labels) {
                    if (!elem.contains(label)) {
                        const labelText = label.textContent?.trim();

                        if (labelText && labelText.length > 1 && labelText.length < 50) {
                            return labelText;
                        }
                    }
                }
            }

            return '';
        }

        // Fix invalid roles
        let elementsWithRole = document.querySelectorAll('[role]');
        let invalidRolesFixed = 0;
        for (let elem of elementsWithRole) {
            const role = elem.getAttribute('role');
            const tagName = elem.tagName.toLowerCase();
            if (!ariaRoles.includes(role)) {
                elem.removeAttribute('role');
                invalidRolesFixed++;

                elementsFixed.push({
                    element: elem.tagName,
                    invalidRole: role,
                    action: 'Removed invalid ARIA role',
                });
                continue; 
            }

            // Fix disallowed ARIA roles
            let allowed = false;
            if (allowedElementsMatrix[tagName]) {
                if (tagName === 'input') {
                    const inputType = elem.type || 'text';

                    if (allowedElementsMatrix.input[inputType]) {
                        allowed = allowedElementsMatrix.input[inputType].includes(role);
                    } else {
                        allowed = allowedElementsMatrix.input.default.includes(role);
                    }
                } else {
                    allowed = allowedElementsMatrix[tagName].includes(role);
                }
            }

            if (!allowed && tagName !== 'div' && tagName !== 'span') {
                elem.removeAttribute('role');
                invalidRolesFixed++;

                elementsFixed.push({
                    element: elem.tagName,
                    invalidRole: role,
                    action: 'Removed inappropriate ARIA role',
                });
                
                continue;
            }

            // Check ARIA roles that require parents
            if (childrenRoles[role]) {
                const neededParents = childrenRoles[role];
                const hasValidParent = neededParents.some((parent) => {
                    let closest = elem.closest(`[role="${parent}"]`);
                    let list = (parent === 'list' || elem.closest('ul, ol'));
                    let table = (parent === 'table' || elem.closest('table'));
                    let row = (parent === 'rowgroup' || elem.closest('tbody, thead, tfoot'));

                    return closest || list || table || row;
                });

                if (!hasValidParent) {
                    let container = elem.parentElement;

                    if (!container || container === document.body) {
                        elem.removeAttribute('role');

                        elementsFixed.push({
                            element: elem.tagName,
                            role: role,
                            action: `Removed role (${role}) that requires parent role`
                        });
                    } else {
                        container.setAttribute('role', neededParents[0]);

                        elementsFixed.push({
                            element: container.tagName,
                            role: neededParents[0],
                            action: `Added necessary parent role (${neededParents[0]}) for ${role}`
                        });
                    }
                }
            }

            // Check ARIA roles that require children
            if (parentRoles[role]) {
                let neededChildren = parentRoles[role];
                const children = Array.from(elem.children);
                const hasValidChildren = children.some((child) => {
                    const childRole = child.getAttribute('role');
                    return childRole && neededChildren.includes(childRole);
                });

                if (!hasValidChildren && children.length > 0) {
                    const firstChild = children[0];
                    firstChild.setAttribute('role', neededChildren[0]);

                    elementsFixed.push({
                        element: firstChild.tagName,
                        role: neededChildren[0],
                        action: `Added necessary child role (${neededChildren[0]}) for ${role}`
                    });
                }
            }

            // Check dialog and alertdialog roles
            if (role === 'dialog' || role === 'alertdialog') {
                if (!elem.hasAttribute('aria-modal') && 
                    !elem.hasAttribute('aria-labelledby')) {
                        const heading = elem.querySelector('h1, h2, h3, h4, h5, h6');

                        if (heading) {
                            if (!heading.id) {
                                heading.id = `dialog-title-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                            }

                            elem.setAttribute('aria-labelledby', heading.id);

                            elementsFixed.push({
                                element: elem.tagName,
                                role: role,
                                action: `Added aria-labelledby to role ${role}`
                            });
                        } else {
                            let label = '';

                            const firstText = elem.querySelector('p, div');
                            if (firstText?.textContent?.trim()) {
                                label = firstText.textContent.trim().substring(0, 50);
                                if (label.length > 50) {
                                    label += '...';
                                }
                            } else {
                                label = getNearText(elem) || (role === 'dialog' ? 'Dialog' : 'Alert Dialog');
                            }

                            elem.setAttribute('aria-label', label);

                            elementsFixed.push({
                                element: elem.tagName,
                                role: role,
                                action: `Added aria-label to role ${role}: ${label}`
                            });
                        }
                }
            }
        }

        // Fix empty ARIA buttons
        const buttons = document.querySelectorAll('button[role="button"], a[role="button"]');
        for (let button of buttons) {
            if (!button.textContent?.trim() && 
                !button.getAttribute('aria-label') && 
                !button.getAttribute('aria-labelledby')) 
            {
                const hasIcon = button.querySelector('svg, img, i, span.icon');
                if (hasIcon) {
                    let label = '';
                    const classList = Array.from(button.classList);

                    if (classList.some((x) => x.includes('close') || x.includes('dismiss'))) {
                        label = 'Close';
                    } else if (classList.some((x) => x.includes('submit') || x.includes('send'))) {
                        label = 'Submit';
                    } else if (classList.some((x) => x.includes('cancel'))) {
                        label = 'Cancel';
                    } else if (classList.some((x) => x.includes('menu'))) {
                        label = 'Menu';
                    } else if (classList.some((x) => x.includes('search'))) {
                        label = 'Search';
                    } else {
                        label = getNearText(button) || 'Button';
                    }

                    button.setAttribute('aria-label', label);

                    elementsFixed.push({
                        element: button.tagName,
                        label: label,
                        action: `Added aria-label to empty button (${label})`
                    });
                }
            }
        }

        // Fix ARIA roles with required attributes
        for (const [role, required] of Object.entries(requiredAttributes)) {
            const elems = document.querySelectorAll(`[role="${role}"]`);
            for (let elem of elems) {
                const missing = required.filter(attr => !elem.hasAttribute(attr));

                if(missing.length > 0) {
                    for (const attr of missing) {
                        if (attr === 'aria-expanded') {
                            elem.setAttribute(attr, 'false');
                        } else if (attr === 'aria-checked') {
                            elem.setAttribute(attr, 'false');
                        } else if (attr === 'aria-controls') {
                            const next = elem.nextElementSibling;
                            if (next) {
                                if (!next.id) {
                                    next.id = `${role}-content-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                                }
                                elem.setAttribute(attr, next.id);
                            } else {
                                elem.setAttribute(attr, `${role}-content-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
                            }
                        } else if (attr === 'aria-valuemin') {
                            elem.setAttribute(attr, '0');
                        } else if (attr === 'aria-valuemax') {
                            elem.setAttribute(attr, '100');
                        } else if (attr === 'aria-valuenow') {
                            elem.setAttribute(attr, '50');
                        } else if (attr === 'aria-multiline') {
                            elem.setAttribute(attr, 
                                elem.tagName.toLowerCase() === 'textarea' ? 'true' : 'false');
                        } else {
                            elem.setAttribute(attr, 'false');
                        }
                    }

                    elementsFixed.push({
                        element: elem.tagName,
                        role: role,
                        missingAttributes: missing,
                        action: `Added missing required ARIA attributes for role ${role}: ${missing.join(', ')}`
                    });
                }
            }
        }

        // Fix non-unique landmarks
        const landmarks = {};
        for (let role of landmarkRoles) {
            let selector = `[role="${role}"]`;
            if (role === 'banner') {
                selector = `${selector},header:not([role])`;
            } else if (role === 'contentinfo') {
                selector = `${selector},footer:not([role])`;
            } else if (role === 'navigation') {
                selector = `${selector},nav:not([role])`;
            } else if (role === 'main') {
                selector = `${selector},main:not([role])`;
            } else if (role === 'complementary') {
                selector = `${selector},aside:not([role])`;
            }

            const elems = Array.from(document.querySelectorAll(selector));
            landmarks[role] = elems.filter((el) => {
                const inProperContext = !el.closest(`[role="${role}"]:not(${el.tagName})`);
                const notInInvalidContext = !el.closest('article, section');
                return inProperContext && notInInvalidContext;
            });
        }

        // Fix duplicate landmarks without labels
        for (const [role, elems] of Object.entries(landmarks)) {
            if (elems.length > 1) {
                const unlabeled = elems.filter((el) => 
                    !el.hasAttribute('aria-label') &&
                    !el.hasAttribute('aria-labelledby') && 
                    !el.hasAttribute('title')
                );

                if (unlabeled.length > 1) {
                    for (let i = 0; i < unlabeled.slice(1).length; i++) {
                        const el = unlabeled.slice(1)[i + 1];
                        const label = `${role.charAt(0).toUpperCase() + role.slice(1)} ${idx + 2}`;
                        el.setAttribute('aria-label', label);

                        elementsFixed.push({
                            element: el.tagName,
                            role: role,
                            label: label,
                            action: `Added aria-label to duplicate landmark (${role})`
                        });
                    }
                }
            }
        }

        // Fix error "presentational elements must be consistently ignored"
        const hiddenElements = document.querySelectorAll('[aria-hidden="true"], [role="presentation"], [role="none"]');
        let presentationalFixed = 0;

        for (let elem of hiddenElements) {
            const focusable = elem.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="combobox"], [role="textbox"], [role="switch"]');

            if (focusable.length > 0) {
                for (let el of focusable) {
                    if (el.hasAttribute('tabindex') &&
                        el.getAttribute('tabindex') !== '-1' &&
                        el.hasAttribute('aria-hidden') &&
                        el.getAttribute('aria-hidden') === 'true')
                    {
                        continue;
                    }

                    const clone = el.cloneNode(true);
                    clone.setAttribute('tabindex', '-1');
                    clone.setAttribute('aria-hidden', 'true');
                    clone.removeAttribute('onclick');
                    clone.removeAttribute('onfocus');
                    clone.removeAttribute('onkeydown');
                    clone.removeAttribute('onkeyup');
                    clone.removeAttribute('onkeypress');
                    clone.removeAttribute('contenteditable');
                    
                    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
                        if (clone.type !== 'hidden') {
                            clone.setAttribute('readonly', 'readonly');
                            clone.setAttribute('disabled', 'disabled');
                        }
                    }

                    if (clone.hasAttribute('role') && interactiveRoles.includes(clone.getAttribute('role'))) {
                        clone.removeAttribute('role');
                    }

                    el.parentNode.replaceChild(clone, el);
                }

                presentationalFixed++;
                elementsFixed.push({
                    element: elem.tagName,
                    count: focusable.length,
                    action: `Fixed ${focusable.length} focusable elements inside presentational element`
                });
            }

            elem.setAttribute('tabindex', '-1');
            elem.style.pointerEvents = 'none';
        }

        return elementsFixed;
    });
}

async function fixInaccessibleFrames(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];
        const frames = document.querySelectorAll('iframe:not([title]), frame:not([title])');
        
        function findNearHeading(elem) {
            let sibling = elem.previousElementSibling;
            while (sibling) {
                if (/^H[1-6]$/.test(sibling.tagName)) {
                    return sibling;
                }    
                
                sibling = sibling.previousElementSibling;
            }

            let parent = elem.parentElement;
            if (parent && parent !== document.body) {
                sibling = parent.previousElementSibling;
                while (sibling) {
                    if (/^H[1-6]$/.test(sibling.tagName)) {
                        return sibling;
                    }
                    
                    sibling = sibling.previousElementSibling;
                }
            }

            return null;
        }

        for (let i = 0; i < frames.length; i++) {
            let frame = frames[i];
            let title = '';

            if (frame.hasAttribute('src')) {
                try {
                    const url = new URL(frame.getAttribute('src'));
                    title = url.hostname.replace('www.', '');

                    if (url.pathname !== '/' && url.pathname !== '') {
                        const pathParts = url.pathname.split('/').filter(Boolean);

                        if (pathParts.length > 0) {
                            const lastPathPart = pathParts[pathParts.length - 1]
                                .replace(/[-_]/g, ' ')
                                .replace(/\.[^/.]+$/, ''); 
                            
                            title = `${title} - ${lastPathPart}`;
                        }
                    }

                    title = title.split(' ')
                    title = title.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
                    title = `${title} content`;
                } catch (e) {
                    title = `Embedded content for frame ${i + 1} without title`;
                }
            } else {
                if (frame.hasAttribute('id')) {
                    title = `Content: ${frame.setAttribute(id)}`;
                } else if (frame.hasAttribute('name')) {
                    title = `Content: ${frame.getAttribute('name')}`;
                } else {
                    const nearHeading = findNearHeading(frame);
                    if (nearHeading) {
                        title = `Embedded content for frame ${i + 1}`;
                    } else {
                        title = `Embedded content for frame ${i + 1} without title`;
                    }
                }
            }

            frame.setAttribute('title', title);

            if (!frame.hasAttribute('aria-label')) {
                frame.setAttribute('aria-label', title);
            }

            elementsFixed.push({
                element: frame.tagName,
                title: title,
                action: `Added accessible name to previously-inaccesible frame ${i + 1}`
            });
        }

        return elementsFixed;
    })
}

async function fixFormValidation(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];
        const forms = document.querySelectorAll('form');

        for (let i; i < forms.length; i++) {
            const form = forms[i];
            const required = document.querySelectorAll('input[required], select[required], textarea[required]');
            let fixed = 0;

            for (let req of required) {
                if (!req.hasAttribute('aria-required')) {
                    req.setAttribute('aria-required', 'true');
                    fixed++;
                }

                if (!req.hasAttribute('aria-errormessage') && !req.hasAttribute('aria-describedby')) {
                    const randomId = req.id || `input-${i}-${Math.floor(Math.random() * 1000)}`;
                    const errorId = `error-${randomId}`;
                    const errorMessage = document.createElement('div');

                    errorMessage.id = errorId;
                    errorMessage.className = 'error-message';
                    errorMessage.setAttribute('aria-live', 'assertive');
                    errorMessage.style.display = 'none';
                    errorMessage.style.color = 'red';
                    errorMessage.style.fontSize = '0.9em';
                    errorMessage.stylemarginTop = '0.25em';

                    if (req.type === 'email') {
                        errorMessage.textContent = 'Please enter a valid email address.';
                    } else if (req.type === 'url') {
                        errorMessage.textContent = 'Please enter a valid URL.';
                    } else if (req.type === 'number') {
                        errorMessage.textContent = 'Please enter a valid number.';
                    } else {
                        errorTerrorMessage.textContentext = 'This field is required.';
                    }

                    req.parentNode.insertBefore(errorMessage, req.nextSibling);
                    req.setAttribute('aria-errormessage', errorId);
                    req.addEventListener('invalid', () => {
                        errorMessage.style.display = 'block';
                        req.setAttribute('aria-invalid', 'true');
                    });
                    req.addEventListener('input', () => {
                        errorMessage.style.display = 'none';
                        req.removeAttribute('aria-invalid');
                    });

                    fixed++;
                }
            }

            if (fixed > 0) {
                elementsFixed.push({
                    element: form.tagName,
                    action: `Fixed ${fixed} form validation issues`,
                    fixedFields: fixed
                });
            }
        }
        
        return elementsFixed;
    })
}

async function fixZoomAndScale(page) {
    return await page.evaluate(() => {
        const meta = document.querySelector('meta[name="viewport"]');

        if (meta) {
            const content = meta.getAttribute('content') || '';
            const hasUserScalable = content.includes('user-scalable=');
            const hasMaximumScale = content.includes('maximum-scale=');
            const hasMinimumScale = content.includes('minimum-scale=');

            let newContent = content;
            let fixed = false;

            if (hasUserScalable && content.match(/user-scalable\s*=\s*no/i)) {
                newContent = newContent.replace(/user-scalable\s*=\s*no/i, 'user-scalable=yes');
                fixed = true;
            } else if (!hasUserScalable) {
                newContent += ', user-scalable=yes';
                fixed = true;
            }

            if (hasMaximumScale) {
                const maxScaleMatch = content.match(/maximum-scale\s*=\s*([0-9.]+)/i);
                if (maxScaleMatch && parseFloat(maxScaleMatch[1]) < 2) {
                    newContent = newContent.replace(/maximum-scale\s*=\s*([0-9.]+)/i, 'maximum-scale=5.0');
                    fixed = true;
                }
            }

            if (hasMinimumScale) {
                const minScaleMatch = content.match(/minimum-scale\s*=\s*([0-9.]+)/i);
                if (minScaleMatch && parseFloat(minScaleMatch[1]) > 1) {
                    newContent = newContent.replace(/minimum-scale\s*=\s*([0-9.]+)/i, 'minimum-scale=1.0');
                    fixed = true;
                }
            }

            if (fixed) {
                meta.setAttribute('content', newContent);

                return [{
                    element: 'Viewport',
                    oldContent: content,
                    newContent: newContent,
                    action: 'Enabled zooming and scaling in viewport meta tag'
                }];
            }
        }

        return [];
    });
}

async function fixLanguageAttribute(page) {
    return await page.evaluate(() => {
        const html = document.documentElement;

        if (!html.hasAttribute('lang')) {
            // Try to find language attribute from tags or default to 'en'
            const lang = document.querySelector('meta[http-equiv="Content-Language"], meta[name="language"], meta[charset]')?.getAttribute('content') || 'en';
            html.setAttribute('lang', lang);
            
            return [{
                element: 'HTML',
                language: lang,
                action: `Added language attribute: ${lang}`
            }];
        }

        return [];
    });
}

async function fixDocumentTitle(page, url) {
    return await page.evaluate((url) => {
        const title = document.querySelector('title');

        if (!title || !title.textContent.trim()) {
            let newTitle;

            if (!title) {
                newTitle = document.createElement('title');
                document.head.appendChild(newTitle);
            } else {
                newTitle = title;
            }

            let h1 = document.querySelector('h1');
            if (h1 && h1.textContent.trim()) {
                newTitle.textContent = h1.textContent.trim();
            } else {
                try {
                    const domain = new URL(url).hostname.replace('www.', '');
                    newTitle.textContent = domain.charAt(0).toUpperCase() + domain.slice(1);
                } catch (e) {
                    newTitle.textContent = 'Web Page'; // Deafult
                }
            }

            return [{
                element: 'Title',
                action: `Set document title to: ${newTitle.textContent}`
            }];
        }

        return [];
    }, url);
}

async function fixLandmarks(page) {
    return await page.evaluate(() => {
        const elementsFixed = [];
        const landmarkSelectors = 'header, footer, nav, aside, main, [role="banner"], [role="contentinfo"], [role="navigation"], [role="complementary"], [role="main"]';
        const landmarkRoles = ['banner', 'contentinfo', 'navigation', 'complementary', 'main'];
        
        const h1s = document.querySelectorAll('h1');
        if (h1s && h1s.length === 0) {
            // Fix missing level-one heading
            const potentialH1 = document.querySelector('title, meta[property="og:title"], meta[name="title"]');
            const pageTitle = potentialH1?.content || potentialH1?.textContent || 'Web Page';
            const mainContent = document.querySelector('main, [role="main"], article, .content, #content');
            const h1 = document.createElement('h1');
            h1.textContent = pageTitle;
            h1.style.cssText = 'position: relative; margin: 0.67em 0;';
            if (mainContent) {
                mainContent.insertBefore(h1, mainContent.firstChild);
            } else {
                document.body.insertBefore(h1, document.body.firstChild);
            }
            elementsFixed.push({
                element: 'H1',
                action: `Added missing level-one heading`,
                content: pageTitle
            });
        }
        
        const mains = document.querySelectorAll('main, [role="main"]');
        if (mains && mains.length === 0) {
            // Fix missing main landmark
            const potentialMain = document.querySelector('article, .content, #content, #main, .main');
            if (potentialMain) {
                const main = document.createElement('main');
                main.setAttribute('role', 'main');
                potentialMain.parentNode.insertBefore(main, potentialMain);
                main.appendChild(potentialMain);
                elementsFixed.push({
                    element: 'Main',
                    action: 'Added missing main landmark',
                    content: potentialMain.textContent.trim().substring(0, 50)
                });
            } else {
                let blocks = Array.from(document.querySelectorAll('div, section'));
                blocks = blocks.filter((el) => {
                    if (el.hasAttribute('role') ||
                        el.matches('header, footer, nav, aside') ||
                        el.closest('main, [role="main"], header, footer, nav, aside, [role="banner"], [role="contentinfo"], [role="navigation"], [role="complementary"]'))
                    {
                        return false;
                    }
                    return el.textContent?.trim().length > 100 ||
                        el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, table').length >= 2;
                });
               
                if (blocks && blocks.length > 0) {
                    blocks = blocks.sort((a, b) => b.textContent.length - a.textContent.length);
                   
                    const mainContent = blocks[0];
                    const main = document.createElement('main');
                    main.setAttribute('role', 'main');
                    mainContent.parentNode.insertBefore(main, mainContent);
                    main.appendChild(mainContent);
                   
                    elementsFixed.push({
                        element: 'Main',
                        action: 'Added main landmark to largest content block',
                    });
                } else {
                    const main = document.createElement('main');
                    const body = document.body;
                    const header = document.querySelector('header, [role="banner"]');
                    main.setAttribute('role', 'main');
                    if (header && header.nextElementSibling) {
                        body.insertBefore(main, header.nextElementSibling);
                    } else {
                        body.insertBefore(main, body.firstChild);
                    }
                    const topContent = Array.from(body.children).filter((el) =>
                        !el.matches('header, footer, nav, aside, main') &&
                        !el.hasAttribute('role') &&
                        el !== main 
                    );
                    for (let el of topContent) {
                        main.appendChild(el);
                    }
                    elementsFixed.push({
                        element: 'Main',
                        action: 'Created main landmark albeit with no content',
                    });
                }
            }
        } else if (mains && mains.length > 1) {
            // Fix multiple main landmarks problem
            let ultimateMain = mains[0];
           
            for (let m of mains) {
                if (m.matches('main')) {
                    ultimateMain = m;
                    break;
                }
                if ((m.textContent) &&
                    (ultimateMain.textContent) &&
                    m.textContent.length > ultimateMain.textContent.length) {
                    ultimateMain = m;
                }
            }
            for (let m of mains) {
                if (m !== ultimateMain) {
                    m.removeAttribute('role');
                    elementsFixed.push({
                        element: m.tagName, 
                        action: 'Removed duplicate main landmark'
                    });
                }
            }
        }
        
        // Fix aside elements issue
        const asides = document.querySelectorAll('aside, [role="complementary"]');
        for (let aside of asides) {
            const parent = aside.closest('main, [role="main"], article, section[role], nav, [role="navigation"]');
            if (parent && parent !== document.body) {
                const body = document.body;
                const main = document.querySelector('main, [role="main"]');
                if (main) {
                    body.insertBefore(aside, main.nextElementSibling);
                } else {
                    const footer = document.querySelector('footer, [role="contentinfo"]');
                    if (footer) {
                        body.insertBefore(aside, footer);
                    } else {
                        body.appendChild(aside);
                    }
                }
                if (!aside.matches('aside')) {
                    aside.setAttribute('role', 'complementary');
                }
                elementsFixed.push({
                    element: aside.tagName,
                    action: 'Moved complementary landmark to appropriate location'
                });
            } else if (!aside.matches('aside') && !aside.hasAttribute('role')) {
                aside.setAttribute('role', 'complementary');
                elementsFixed.push({
                    element: aside.tagName,
                    action: 'Added role complementary to aside element'
                });
            }
        }
        
        const landmarks = new Set([
            ...Array.from(document.querySelectorAll(landmarkSelectors)),
            ...Array.from(document.querySelectorAll(`[role="${landmarkRoles.join('"], [role="')}"]`))
        ]);
        
        // Add banner landmark if none
        if (!document.querySelector('header, [role="banner"]')) {
            const potentialHeader = document.querySelector('.header, #header, .site-header');
            if (potentialHeader) {
                potentialHeader.setAttribute('role', 'banner');
                elementsFixed.push({
                    element: potentialHeader.tagName,
                    action: 'Added banner role to header element'
                });
            }
        }
        
        // Add contentinfo landmark if none
        if (!document.querySelector('footer, [role="contentinfo"]')) {
            const potentialFooter = document.querySelector('.footer, #footer, .site-footer');
            if (potentialFooter) {
                potentialFooter.setAttribute('role', 'contentinfo');
                elementsFixed.push({
                    element: potentialFooter.tagName,
                    action: 'Added contentinfo role to footer element'
                });
            }
        }
        
        // Add navigation landmark if none
        if (!document.querySelector('nav, [role="navigation"]')) {
            const potentialNav = document.querySelector('.nav, #nav, .menu, #menu, .navigation, #navigation'); 
            if (potentialNav) {
                potentialNav.setAttribute('role', 'navigation');
                elementsFixed.push({
                    element: potentialNav.tagName,
                    action: 'Added navigation role to nav element'
                });
            }
        }
        
        return elementsFixed;
    });
}

module.exports = {
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
}