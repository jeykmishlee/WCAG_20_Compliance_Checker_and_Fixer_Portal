document.addEventListener('DOMContentLoaded', () => {
    const scanForm = document.getElementById('scanForm');
    const urlInput = document.getElementById('urlInput');
    const scanButton = document.getElementById('scanButton');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const scanSection = document.getElementById('scanSection');
    const resultsSection = document.getElementById('resultsSection');
    const issuesList = document.getElementById('issuesList');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('errorMessage');
    const fixedWebpageSection = document.getElementById('fixedWebpageSection');
    const websiteTitle = document.getElementById('websiteTitle');
    const fixedErrorsList = document.getElementById('fixedErrorsList');
    const remainingErrorsList = document.getElementById('remainingErrorsList');
    const altTextList = document.getElementById('altTextList');
    const testAnotherUrlBtn = document.getElementById('testAnotherUrlBtn');
    // const exportHtmlBtn = document.getElementById('exportHtmlBtn');
    const openFixedWebpageBtn = document.getElementById('openFixedWebpageBtn');
    const fixedWebpageFrame = document.getElementById('fixedWebpageFrame');
    const warningMessage = document.getElementById('warningMessage');
    
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.innerHTML = `
        <div class="progress-bar">
            <div class="progress-fill"></div>
        </div>
        <div class="progress-text">Initializing scan...</div>
    `;
    loadingIndicator.appendChild(progressContainer);

    let scanData = null;
    let websiteName = '';

    function showLoading(show, message = 'Scanning and fixing website for WCAG compliance issues...') {
        loadingIndicator.classList.toggle('hidden', !show);
        scanButton.disabled = show;
        
        // Reset progress bar
        if (show) {
            const progressText = loadingIndicator.querySelector('.progress-text');
            const progressFill = loadingIndicator.querySelector('.progress-fill');
            const loadingMessage = document.getElementById('loadingMessage');
            
            if (loadingMessage) loadingMessage.textContent = message;
            if (progressText) progressText.textContent = message;
            if (progressFill) progressFill.style.width = '5%';
        }
    }
    
    function updateProgress(message) {
        const progressText = loadingIndicator.querySelector('.progress-text');
    
        if (progressText && message) { 
            progressText.textContent = message;
        }
    }

    function showErrors(message) {
        error.classList.remove('hidden');
        errorMessage.textContent = message;
    }

    function hideErrors() {
        error.classList.add('hidden');
    }

    function clearResults() {
        issuesList.innerHTML = '';
        resultsSection.classList.add('hidden');
    }

    function resetInterface() {
        resultsSection.classList.add('hidden');
        fixedWebpageSection.classList.add('hidden');
        hideErrors();
        clearResults();
        
        // Clear fixed webpage content
        fixedErrorsList.innerHTML = '';
        remainingErrorsList.innerHTML = '';
        altTextList.innerHTML = '';
    }

    function getFixCategoryTitle(category) {
        const titles = {
            'contrast': 'Contrast Issues',
            'labels': 'Missing Form Labels',
            'headings': 'Incorrect Heading Orders',
            'language': 'Missing Language Attribute',
            'title': 'Missing Document Title',
            'interactiveElements': 'Empty Interactive Elements',
            'duplicateIds': 'Duplicate IDs',
            'tableHeaders': 'Empty Table Headers',
            'listStructure': 'List Structure Issues',
            'focusIndicators': 'Focus Indicators',
            'ariaElements': 'ARIA Elements',
            'formValidation': 'Form Validation',
            'viewport': 'Viewport Zoom and Scale',
            'frames': 'Frame Accessibility',
            'imageAltTexts': 'Image Alt Text',
            'landmarks': 'Landmarks'
        };

        return titles[category] || category;
    }

    function getFixDescription(category) {
        const descriptions = {
            'contrast': 'Improved color contrast ratios',
            'labels': 'Added missing form labels',
            'headings': 'Fixed heading structures',
            'language': 'Added language attribute',
            'title': 'Added document title',
            'interactiveElements': 'Added content to empty interactive elements',
            'duplicateIds': 'Fixed duplicate IDs',
            'tableHeaders': 'Added proper table headers',
            'listStructure': 'Fixed list structure',
            'focusIndicators': 'Added focus indicators',
            'ariaElements': 'Fixed ARIA attributes',
            'formValidation': 'Improved form validation feedback',
            'viewport': 'Enabled proper zoom/scaling for accessibility',
            'frames': 'Added accessible names to frames and iframes',
            'imageAltTexts': 'Added alt text for images',
            'landmarks': 'Fixed landmarks'
        };

        return descriptions[category] || `Fixed ${category} issues`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;

        return div.innerHTML;
    }

    function prepareFixedWebpage(data) {
        if (!data.fixedHtml) {
            return;
        }
        
        const fixedBlob = new Blob([generateFixedHTML(data.fixedHtml)], { type: 'text/html' });
        fixedWebpageFrame.src = URL.createObjectURL(fixedBlob);
    }

    function generateFixedHTML(fixedHtml) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Fixed Webpage</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    .wcag-fixed-element {
                        position: relative;
                        outline: 2px solid #16a34a !important;
                        outline-offset: 2px !important;
                    }
                </style>
            </head>
            <body>
                ${fixedHtml}
            </body>
            </html>
        `;
    }

    function showFixedWebpageSection(showWarning = false) {
        if (showWarning) {
            warningMessage.textContent = "Warning: There have been some errors with processing the webpage. Fixed webpage and audits may be incomplete.";
            warningMessage.style.display = 'block';
        } else {
            warningMessage.style.display = 'none';
        }
        scanSection.classList.add('hidden');
        fixedWebpageSection.classList.remove('hidden');
        window.scrollTo(0, 0);
    }

    function groupErrorsByCategory(errors, type = 'fixed') {
        const categories = {};
        
        // Process fixes by category
        if (type === 'fixed') {
            const fixes = scanData.fixes || {};
            
            // Process cplor contrast fixes
            if (fixes.contrast && fixes.contrast.length > 0) {
                categories['Contrast Issues'] = {
                    count: fixes.contrast.length,
                    items: fixes.contrast.map((fix) => ({
                        element: fix.element,
                        description: fix.oldContrast ?
                            `Improved contrast from ${fix.oldContrast}:1 to ${fix.newContrast}:1` :
                            'Fixed contrast issue'
                    }))
                };
            }
            
            // Process form label fixes
            if (fixes.labels && fixes.labels.length > 0) {
                categories['Missing Form Labels'] = {
                    count: fixes.labels.length,
                    items: fixes.labels.map((fix) => ({
                        element: fix.element,
                        description: 'Added missing label'
                    }))
                };
            }
            
            // Process empty interactive elements fixes
            if (fixes.interactiveElements && fixes.interactiveElements.length > 0) {
                categories['Empty Interactive Elements'] = {
                    count: fixes.interactiveElements.length,
                    items: fixes.interactiveElements.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }

            // Process heading order fixes
            if (fixes.headings && fixes.headings.length > 0) {
                categories['Heading Structure'] = {
                    count: fixes.headings.length,
                    items: fixes.headings.map((fix) => ({
                        element: fix.original,
                        description: fix.action || `Fixed heading structure`
                    }))
                };
            }

            // Process duplicate ID fixes
            if (fixes.duplicateIds && fixes.duplicateIds.length > 0) {
                categories['Duplicate IDs'] = {
                    count: fixes.duplicateIds.length,
                    items: fixes.duplicateIds.map((fix) => ({
                        element: fix.element,
                        description: `Changed duplicate ID from "${fix.oldId}" to "${fix.newId}"`
                    }))
                };
            }
            
            // Process table header fixes
            if (fixes.tableHeaders && fixes.tableHeaders.length > 0) {
                categories['Table Headers'] = {
                    count: fixes.tableHeaders.length,
                    items: fixes.tableHeaders.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }
            
            // Process list structure fixes
            if (fixes.listStructure && fixes.listStructure.length > 0) {
                categories['List Structure'] = {
                    count: fixes.listStructure.length,
                    items: fixes.listStructure.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }
            
            // Process focus indicator fixes
            if (fixes.focusIndicators && fixes.focusIndicators.length > 0) {
                categories['Focus Indicators'] = {
                    count: fixes.focusIndicators.length,
                    items: fixes.focusIndicators.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }
            
            // Process ARIA element fixes
            if (fixes.ariaElements && fixes.ariaElements.length > 0) {
                categories['ARIA Attributes'] = {
                    count: fixes.ariaElements.length,
                    items: fixes.ariaElements.map((fix) => ({
                        element: fix.element,
                        description: fix.action || 'Fixed ARIA attribute'
                    }))
                };
            }

            // Process frame accessibility fixes
            if (fixes.frames && fixes.frames.length > 0) {
                categories['Frame Accessibility'] = {
                    count: fixes.frames.length,
                    items: fixes.frames.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }

            // Process form validation fixes
            if (fixes.formValidation && fixes.formValidation.length > 0) {
                categories['Form Validation'] = {
                    count: fixes.formValidation.length,
                    items: fixes.formValidation.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }
            
            // Process viewport fixes
            if (fixes.viewport && fixes.viewport.length > 0) {
                categories['Viewport Zoom'] = {
                    count: fixes.viewport.length,
                    items: fixes.viewport.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }

            // Process language attribute fixes
            if (fixes.language && fixes.language.length > 0) {
                categories['Language Attribute'] = {
                    count: fixes.language.length,
                    items: fixes.language.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }
            
            // Process document title fixes
            if (fixes.title && fixes.title.length > 0) {
                categories['Document Title'] = {
                    count: fixes.title.length,
                    items: fixes.title.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }

            // Process landmark fixes
            if (fixes.landmarks && fixes.landmarks.length > 0) {
                categories['Landmarks'] = {
                    count: fixes.landmarks.length,
                    items: fixes.landmarks.map((fix) => ({
                        element: fix.element,
                        description: fix.action
                    }))
                };
            }

            // Process image alt text fixes
            if (fixes.imageAltTexts && fixes.imageAltTexts > 0) {
                categories['Image Alt Text'] = {
                    count: fixes.imageAltTexts,
                    items: [{
                        element: 'Image Alt Text',
                        description: `Added alt text to ${fixes.imageAltTexts} images`
                    }]
                };
            }
        } else {
            // Process remaining issues
            const issues = scanData.issues || [];
            
            for (let issue of issues) {
                const category = issue.help || 'Other Issues';

                if (!categories[category]) {
                    categories[category] = {
                        count: issue.nodes.length,
                        items: []
                    };
                } else {
                    categories[category].count += issue.nodes.length;
                }

                for (let node of issue.nodes) {
                    categories[category].items.push({
                        element: node.target.join(', '),
                        description: issue.description,
                        code: node.html || node.target.join(', ')
                    });
                }
            }
        }
        
        return categories;
    }
    
    function displayErrorCategories(categories, container) {
        container.innerHTML = '';
        
        if (Object.keys(categories).length === 0) {
            container.innerHTML = '<p>None</p>';
            return;
        }
        
        for (const [category, data] of Object.entries(categories)) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'error-category';
            
            const itemsHtml = data.items.map(item => `
                <div class="error-item">
                    <div>${item.description}</div>
                    ${item.code ? `<code class="error-code">${escapeHtml(item.code)}</code>` : ''}
                </div>
            `).join('');
            
            categoryDiv.innerHTML = `
                <div class="error-category-title">
                    ${category} <span class="error-count">${data.count}</span>
                </div>
                <div class="error-items">
                    ${itemsHtml}
                </div>
            `;
            
            container.appendChild(categoryDiv);
        }
    }
    
    function displayAltText() {
        altTextList.innerHTML = '';
        
        const imageAltViolations = scanData.originalIssues?.filter(v => v.id === 'image-alt') || [];
        const nodesWithSuggestions = [];
        
        for (let violation of imageAltViolations) {
            for (let node of violation.nodes) {
                if (node.suggestion) {
                    nodesWithSuggestions.push(node);
                }
            }
        }
        
        if (nodesWithSuggestions.length === 0) {
            altTextList.innerHTML = '<p>No alt text generated</p>';
            return;
        }
        
        for (let node of nodesWithSuggestions) {
            const altTextItem = document.createElement('div');
            altTextItem.className = 'alt-text-item';

            let targetInfo = node.target.join(', ');

            if (node.html) {
                targetInfo = escapeHtml(node.html);
            }

            altTextItem.innerHTML = `
                <div class="alt-text-image">${targetInfo}</div>
                <div class="alt-text-value">"${node.suggestion}"</div>
            `;

            altTextList.appendChild(altTextItem);
        }
    }

    function populateOriginalErrors() {
        const originalErrorsList = document.getElementById('originalErrorsList');
        if (!originalAudit || !originalAudit.issues || originalAudit.issues.length === 0) {
            originalErrorsList.innerHTML = '<p>No original errors found.</p>';
            return;
        }

        const categories = {};

        for (let issue of originalAudit.issues) {
            const category = issue.help || 'Other Issues';
            
            if (!categories[category]) {
                categories[category] = {
                    count: issue.nodes.length,
                    items: [],
                    impact: issue.impact,
                    description: issue.description
                };
            } else {
                categories[category].count += issue.nodes.length;
            }
            
            for (let node of issue.nodes) {
                let targetHtml = '';
                
                if (node.html) {
                    targetHtml = `<code class="error-code">${escapeHtml(node.html)}</code>`;
                } else if (node.target && node.target.length > 0) {
                    const targetElement = node.target[0];
                    targetHtml = `<code class="error-code">${escapeHtml(targetElement)}</code>`;
                    
                    if (node.snippet) {
                        targetHtml += `<code class="error-code">${escapeHtml(node.snippet)}</code>`;
                    }
                }
                
                categories[category].items.push({
                    element: targetHtml,
                    description: issue.description,
                    code: node.html || node.target.join(', ')
                });
            }
        }
        
        originalErrorsList.innerHTML = '';
        
        if (Object.keys(categories).length === 0) {
            originalErrorsList.innerHTML = '<p>No original errors found.</p>';
            return;
        }
        
        for (const [category, data] of Object.entries(categories)) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'error-category';
            
            const itemsHtml = data.items.map(item => `
                <div class="error-item">
                    <div>${item.description}</div>
                    ${item.element ? item.element : ''}
                </div>
            `).join('');
            
            categoryDiv.innerHTML = `
                <div class="error-category-title">
                    ${category} <span class="error-count">${data.count}</span>
                </div>
                <div class="error-items">
                    ${itemsHtml}
                </div>
            `;
            
            originalErrorsList.appendChild(categoryDiv);
        }
    }

    function displayFixedWebpageResults() {
        try {
            const url = new URL(scanData.url);
            websiteName = url.hostname.replace('www.', '');
            websiteTitle.textContent = `Fixed Website for ${websiteName}`;
        } catch (error) {
            websiteName = 'Website';
            websiteTitle.textContent = 'Fixed Website';
        }

        const fixedIssues = {};
        const remainingIssues = {};

        for (let issue of originalAudit.issues) {
            remainingIssues[issue.id] = {
                ...issue,
                nodes: [...issue.nodes]
            }
        }

        if (scanData.fixes) {
            for (let i = 0; i < scanData.fixes.length; i++) {
                const [category, fixes] = scanData.fixes[i];

                if (Array.isArray(fixes)) {
                    for (let j = 0; j < fixes.length; j++) {
                        const fix = fixes[j];
                        const issueId = fix.issueId || category;

                        if (!fixedIssues[issueId]) {
                            fixedIssues[issueId] = {
                                help: getFixCategoryTitle(category),
                                nodes: [],
                                impact: fix.impact || 'moderate',
                                description: getFixDescription(category)
                            };
                        }

                        fixedIssues[issueId].nodes.push(fix);

                        if (remainingIssues[issueId]) {
                            const remaining = remainingIssues[issueId];
                            remaining.nodes = remaining.nodes.filter(node =>
                                !fix.target || !node.target.some(t => fix.target.includes(t))
                            );
                            if (remaining.nodes.length === 0) {
                                delete remainingIssues[issueId];
                            }
                        }
                    }
                }
            }
        }

        populateOriginalErrors();
        
        const fixedCategories = groupErrorsByCategory(Array.from(Object.values(fixedIssues)), 'fixed');
        displayErrorCategories(fixedCategories, fixedErrorsList);
        
        const remainingCategories = groupErrorsByCategory(Array.from(Object.values(remainingIssues)), 'remaining');
        displayErrorCategories(remainingCategories, remainingErrorsList);
        
        displayAltText();
    }

    let originalAudit = null;

    scanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let url = urlInput.value.trim();

        if (url) {
            url = url.trim();
            
            if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//')) {
                if (url.match(/^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)*/)) {
                    url = 'https://' + url;
                }
                else if (url.startsWith('localhost') || url.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)) {
                    url = 'http://' + url;
                }
                else if (url.includes('.') && !url.includes(' ')) {
                    url = 'https://' + url;
                }
                
                urlInput.value = url;
            }
        }

        resetInterface();
        showLoading(true);

        try {
            updateProgress('Currently scanning...');

            const response = await fetch(`/scan?url=${encodeURIComponent(url)}`);
            
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                console.error('Failed to parse scan response:', parseError);
                throw new Error('Invalid scan response');
            }
            
            if (!response.ok || !data) {
                throw new Error(data?.error || 'Invalid scan response');
            }

            scanData = data;
            originalAudit = {
                url: data.url,
                timestamp: Date.now(),
                issues: data.originalIssues || []
            };

            updateProgress('Processing results...');
            
            if (!data.fixes || !data.originalIssues || !data.issues) {
                throw new Error('Invalid scan response');
            }

            prepareFixedWebpage(scanData);
            displayFixedWebpageResults();
            showFixedWebpageSection(data.warning);
        } catch (err) {
            showErrors(err.message);
        } finally {
            showLoading(false);
        }
    });

    testAnotherUrlBtn.addEventListener('click', () => {
        warningMessage.style.display = 'none'; 
        urlInput.value = '';
        resetInterface();
        scanSection.classList.remove('hidden');
        window.scrollTo(0, 0);
        urlInput.focus();
    });

    openFixedWebpageBtn.addEventListener('click', () => {
        if (!scanData || !scanData.fixedHtml) {
            showErrors('No fixed HTML content available to open');
            return;
        }

        const htmlContent = generateFixedHTML(scanData.fixedHtml);
        const blob = new Blob([htmlContent], { type: 'text/html' });

        const fixedBlob = new Blob([htmlContent], { type: 'text/html' });
        const fixedUrl = URL.createObjectURL(fixedBlob);
        window.open(fixedUrl, '_blank');
    });

    // exportHtmlBtn.addEventListener('click', () => {
    //     if (!scanData || !scanData.fixedHtml) {
    //         showErrors('No fixed HTML content available to export');
    //         return;
    //     }
    
    //     const htmlContent = generateFixedHTML(scanData.fixedHtml);
    //     const blob = new Blob([htmlContent], { type: 'text/html' });
    //     const link = document.createElement('a');
    //     link.href = URL.createObjectURL(blob);
    //     link.download = `${websiteName || 'fixed-webpage'}.html`;
    //     link.click();
    // });
});