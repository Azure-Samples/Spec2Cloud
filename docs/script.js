// Global state
let allTemplates = [];
let featuredTemplateIds = [];
let filteredTemplates = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initializeTheme();
    renderFeaturedTemplates();
    buildFilterOptions();
    renderGallery();
    attachEventListeners();
    checkTemplateQueryParameter();
});

// Load templates.json and featured-templates.json
async function loadData() {
    try {
        const [templatesResponse, featuredResponse] = await Promise.all([
            fetch('./templates.json'),
            fetch('./featured-templates.json')
        ]);

        const templatesData = await templatesResponse.json();
        featuredTemplateIds = await featuredResponse.json();

        // Convert templates object to array
        allTemplates = Object.entries(templatesData).map(([key, value]) => ({
            id: key,
            ...value
        }));

        filteredTemplates = [...allTemplates];
        
        // Sort by newest first by default
        sortTemplates('date-desc');
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Theme management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Render featured templates
function renderFeaturedTemplates() {
    const featuredSection = document.querySelector('.featured-section');
    const featuredGrid = document.getElementById('featured-grid');
    const featuredTemplates = allTemplates.filter(t => featuredTemplateIds.includes(t.id));

    if (featuredTemplates.length === 0) {
        // Hide the entire featured section if no featured templates
        featuredSection.style.display = 'none';
    } else {
        // Show the section and render templates
        featuredSection.style.display = 'block';
        featuredGrid.innerHTML = featuredTemplates.map(template => createTemplateCard(template, true)).join('');
    }
}

// Build filter options dynamically
function buildFilterOptions() {
    const categories = new Set();
    const industries = new Set();
    const languages = new Set();
    const services = new Set();
    const frameworks = new Set();

    allTemplates.forEach(template => {
        if (template.category) categories.add(template.category);
        if (template.industry) industries.add(template.industry);
        if (template.languages) template.languages.forEach(lang => languages.add(lang));
        if (template.services) template.services.forEach(svc => services.add(svc));
        if (template.frameworks) template.frameworks.forEach(fw => frameworks.add(fw));
    });

    populateSelect('category-filter', Array.from(categories).sort());
    populateSelect('industry-filter', Array.from(industries).sort());
    populateCheckboxes('language-filters', Array.from(languages).sort(), 'languages');
    populateCheckboxes('service-filters', Array.from(services).sort(), 'services');
    populateCheckboxes('framework-filters', Array.from(frameworks).sort(), 'frameworks');
}

function populateSelect(id, options) {
    const select = document.getElementById(id);
    options.forEach(option => {
        const optElement = document.createElement('option');
        optElement.value = option;
        optElement.textContent = option;
        select.appendChild(optElement);
    });
}

function populateCheckboxes(id, options, type) {
    const container = document.getElementById(id);
    container.innerHTML = options.map(option => {
        let iconName = option.toLowerCase().replace(/\s+/g, '-');
        
        // Special case: .NET should use dotnet.svg
        if (option === '.NET') {
            iconName = 'dotnet';
        }
        
        const iconPath = `media/${type}/${iconName}.svg`;
        return `
        <label>
            <input type="checkbox" value="${option}" onchange="applyFilters()">
            <img src="${iconPath}" alt="${option}" class="filter-icon ${type}" onerror="this.style.display='none'">
            <span>${option}</span>
        </label>`;
    }).join('');
}

// Create template card HTML
function createTemplateCard(template, isFeatured = false) {
    const title = truncateText(template.title, 60);
    const description = truncateText(template.description, 200);
    
    // Determine thumbnail URL
    let thumbnailUrl;
    if (template.thumbnail) {
        // Check if thumbnail is already a URL
        if (template.thumbnail.startsWith('http://') || template.thumbnail.startsWith('https://')) {
            thumbnailUrl = template.thumbnail;
        } else {
            // Build raw GitHub URL
            thumbnailUrl = `https://raw.githubusercontent.com/${getRepoPath(template.repo)}/main/${template.thumbnail}`;
        }
    } else {
        // Use category-specific default thumbnails
        const categoryDefaults = {
            'AI Apps & Agents': 'media/default-aiapps-thumbnail.png',
            'App Modernization': 'media/default-appmod-thumbnail.png',
            'Data Centric Apps': 'media/default-data-thumbnail.png',
            'Agentic DevOps': 'media/default-devops-thumbnail.png'            
        };
        thumbnailUrl = categoryDefaults[template.category] || 'https://via.placeholder.com/640x360?text=No+Image';
    }
    
    // Determine video URL
    const hasVideo = template.video && template.video !== '';
    let videoUrl = '';
    let isYouTube = false;
    if (hasVideo) {
        // Check if video is already a URL
        if (template.video.startsWith('http://') || template.video.startsWith('https://')) {
            videoUrl = template.video;
            // Check if it's a YouTube URL
            isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
        } else {
            // Build raw GitHub URL
            videoUrl = `https://raw.githubusercontent.com/${getRepoPath(template.repo)}/main/${template.video}`;
        }
    }
    const vscodeUrl = `vscode://AlexVieira.spec2cloud-toolkit?template=${template.id}`;
    
    // Format last commit date
    const lastCommitDate = template['last-commit-date'] ? formatDate(template['last-commit-date']) : '';
    const version = template.version || '';
    
    // Count total badges (services, languages, frameworks, tags)
    const serviceCount = template.services ? template.services.length : 0;
    const languageCount = template.languages ? template.languages.length : 0;
    const frameworkCount = template.frameworks ? template.frameworks.length : 0;
    const tagsCount = template.tags ? template.tags.length : 0;
    const totalBadges = serviceCount + languageCount + frameworkCount + tagsCount;
    
    // Determine if we need overflow badge (limit to ~8 visible badges)
    const maxVisibleBadges = 8;
    const hasOverflow = totalBadges > maxVisibleBadges;

    return `
        <div class="template-card ${isFeatured ? 'featured' : ''}" data-template='${JSON.stringify(template)}'>
            <div class="template-thumbnail">
                <img src="${thumbnailUrl}" alt="${title}" loading="lazy">
                ${hasVideo ? `
                    <button class="video-play-button" onclick="openVideoModal('${videoUrl}', ${isYouTube})">
                        <svg viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
            <div class="template-content">
                <h3 class="template-title" onclick='openTemplateModal(${JSON.stringify(template).replace(/'/g, "&#39;")})'>${title}</h3>
                <p class="template-description">${description}</p>
                ${template.authors && template.authors.length > 0 ? `
                <div class="template-authors">
                    <span class="authors-label">Authors:</span>
                    ${template.authors.map(author => `<a href="https://github.com/${author}" target="_blank" rel="noopener noreferrer" class="author-link">@${author}</a>`).join(', ')}
                </div>
                ` : ''}
                <div class="template-metadata">
                    ${version ? `<span class="badge version-badge">v${version}</span>` : ''}
                    ${lastCommitDate ? `<span class="template-last-commit">Last updated: ${lastCommitDate}</span>` : ''}
                </div>
                <div class="template-badges">
                    ${template.category ? `<span class="badge category">${template.category}</span>` : ''}
                    ${template.industry ? `<span class="badge industry">${template.industry}</span>` : ''}
                </div>
                <div class="icon-badges" data-template-id="${template.id}">
                    ${renderIconBadges(template.services, 'services', hasOverflow ? maxVisibleBadges : null, 0)}
                    ${renderIconBadges(template.languages, 'languages', hasOverflow ? maxVisibleBadges : null, serviceCount)}
                    ${renderIconBadges(template.frameworks, 'frameworks', hasOverflow ? maxVisibleBadges : null, serviceCount + languageCount)}
                    ${renderIconBadges(template.tags, 'tags', hasOverflow ? maxVisibleBadges : null, serviceCount + languageCount + frameworkCount)}
                    ${hasOverflow ? `<span class="icon-badge overflow-badge" onclick='openTemplateModal(${JSON.stringify(template).replace(/'/g, "&#39;")})' title="View all">...</span>` : ''}
                </div>
                <div class="template-actions">
                    <div class="github-actions">
                        <a href="${template.repo}" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           class="btn-secondary btn-with-icon">
                            <img src="media/services/github.svg" alt="GitHub" class="btn-icon-img">
                            View on GitHub
                        </a>
                        <a href="${template.repo}/stargazers" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           class="btn-icon-only"
                           title="Star this repository">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
                            </svg>
                        </a>
                        <button class="btn-icon-only"
                           onclick="shareTemplate('${template.id}')"
                           title="Share Spec Template">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M13.5 1a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM11 2.5a2.5 2.5 0 11.603 1.628l-6.718 3.12a2.499 2.499 0 010 1.504l6.718 3.12a2.5 2.5 0 11-.488.876l-6.718-3.12a2.5 2.5 0 110-3.256l6.718-3.12A2.5 2.5 0 0111 2.5zm-8.5 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm11 5.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="use-in-dropdown">
                        <button class="btn-primary dropdown-toggle" onclick="toggleDropdown(event, '${template.id}')">
                            Use in
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="margin-left: 4px;">
                                <path d="M2 8l4-4 4 4z"/>
                            </svg>
                        </button>
                        <div class="dropdown-menu" id="dropdown-${template.id}">
                            <div class="dropdown-category">
                                <div class="dropdown-category-title">Desktop</div>
                                <a href="${vscodeUrl}" class="dropdown-item">
                                    <div class="dropdown-item-title">Open in VS Code</div>
                                    <div class="dropdown-item-description">Download the Spec Template to your local Workspace</div>
                                </a>
                                <div class="dropdown-item clone-item">
                                    <div>
                                        <div class="dropdown-item-title">Clone the Spec Template</div>
                                        <div class="dropdown-item-description">Run the following command in a terminal:</div>
                                        <div class="clone-command">
                                            <code>git clone ${template.repo}</code>
                                            <button class="copy-button" onclick="copyCloneCommand('${template.repo}'); event.stopPropagation();" title="Copy to clipboard">
                                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                                    <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2z"/>
                                                    <path d="M2 6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2H6a3 3 0 0 1-3-3V6H2z"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="dropdown-category">
                                <div class="dropdown-category-title">Browser</div>
                                <a href="https://github.com/codespaces/new?repo=${getRepoPath(template.repo)}" target="_blank" rel="noopener noreferrer" class="dropdown-item">
                                    <div class="dropdown-item-title">Open in GitHub Codespaces</div>
                                    <div class="dropdown-item-description">Create a Codespace based on the Spec Template</div>
                                </a>
                                <a href="https://vscode.dev/github/${getRepoPath(template.repo)}" target="_blank" rel="noopener noreferrer" class="dropdown-item">
                                    <div class="dropdown-item-title">Open in VS Code for the Web</div>
                                    <div class="dropdown-item-description">Open the Spec Template repository</div>
                                </a>
                                <a href="https://insiders.vscode.dev/azure?azdTemplateUrl=${encodeURIComponent(template.repo)}" target="_blank" rel="noopener noreferrer" class="dropdown-item">
                                    <div class="dropdown-item-title">Open in VS Code for Web with Azure</div>
                                    <div class="dropdown-item-description">Create a new AZD environment in the Azure Cloud Shell</div>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderIconBadges(items, type, maxTotal = null, offset = 0) {
    if (!items || items.length === 0) return '';
    
    // Calculate how many badges to show for this type
    let itemsToShow = items;
    if (maxTotal !== null) {
        const remaining = maxTotal - offset;
        if (remaining <= 0) return '';
        itemsToShow = items.slice(0, Math.max(0, remaining));
    }
    
    return itemsToShow.map(item => {
        let iconName = item.toLowerCase().replace(/\s+/g, '-');
        
        // Special case: .NET should use dotnet.svg
        if (item === '.NET') {
            iconName = 'dotnet';
        }
        
        const iconPath = `media/${type}/${iconName}.svg`;
        return `<span class="icon-badge ${type}" title="${item}">
            <img src="${iconPath}" alt="${item}" onerror="this.style.display='none'">
            ${item}
        </span>`;
    }).join('');
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        // Parse date string format: "YYYY-MM-DD HH:MM:SS +ZZZZ"
        const date = new Date(dateString);
        // Return user-friendly format like "Nov 11, 2025"
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    } catch (e) {
        console.error('Error formatting date:', dateString, e);
        return '';
    }
}

// Render gallery
function renderGallery() {
    const galleryGrid = document.getElementById('gallery-grid');
    const noResults = document.getElementById('no-results');
    const resultsCount = document.getElementById('results-count');

    if (filteredTemplates.length === 0) {
        galleryGrid.innerHTML = '';
        noResults.style.display = 'block';
        resultsCount.textContent = `Showing 0 of ${allTemplates.length} templates`;
    } else {
        noResults.style.display = 'none';
        galleryGrid.innerHTML = filteredTemplates.map(template => createTemplateCard(template)).join('');
        resultsCount.textContent = `Showing ${filteredTemplates.length} of ${allTemplates.length} templates`;
    }
}

// Apply filters
function applyFilters() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const sortBy = document.getElementById('sort-filter').value;
    const categoryFilter = document.getElementById('category-filter').value;
    const industryFilter = document.getElementById('industry-filter').value;
    
    const selectedLanguages = getCheckedValues('language-filters');
    const selectedServices = getCheckedValues('service-filters');
    const selectedFrameworks = getCheckedValues('framework-filters');

    // Filter templates
    filteredTemplates = allTemplates.filter(template => {
        // Search filter
        const matchesSearch = !searchTerm || 
            template.title.toLowerCase().includes(searchTerm) ||
            template.description.toLowerCase().includes(searchTerm) ||
            (template.category && template.category.toLowerCase().includes(searchTerm)) ||
            (template.industry && template.industry.toLowerCase().includes(searchTerm)) ||
            (template.languages && template.languages.some(l => l.toLowerCase().includes(searchTerm))) ||
            (template.services && template.services.some(s => s.toLowerCase().includes(searchTerm))) ||
            (template.frameworks && template.frameworks.some(f => f.toLowerCase().includes(searchTerm))) ||
            (template.tags && template.tags.some(t => t.toLowerCase().includes(searchTerm)));

        // Category filter
        const matchesCategory = !categoryFilter || template.category === categoryFilter;

        // Industry filter
        const matchesIndustry = !industryFilter || template.industry === industryFilter;

        // Language filter
        const matchesLanguages = selectedLanguages.length === 0 || 
            (template.languages && selectedLanguages.some(lang => template.languages.includes(lang)));

        // Service filter
        const matchesServices = selectedServices.length === 0 || 
            (template.services && selectedServices.some(svc => template.services.includes(svc)));

        // Framework filter
        const matchesFrameworks = selectedFrameworks.length === 0 || 
            (template.frameworks && selectedFrameworks.some(fw => template.frameworks.includes(fw)));

        return matchesSearch && matchesCategory && matchesIndustry && 
               matchesLanguages && matchesServices && matchesFrameworks;
    });

    // Sort templates
    sortTemplates(sortBy);

    renderGallery();
}

function getCheckedValues(containerId) {
    const container = document.getElementById(containerId);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function sortTemplates(sortBy) {
    switch (sortBy) {
        case 'alpha-asc':
            filteredTemplates.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'alpha-desc':
            filteredTemplates.sort((a, b) => b.title.localeCompare(a.title));
            break;
        case 'date-asc':
            filteredTemplates.sort((a, b) => {
                const dateA = a['last-commit-date'] ? new Date(a['last-commit-date']) : new Date(0);
                const dateB = b['last-commit-date'] ? new Date(b['last-commit-date']) : new Date(0);
                return dateA - dateB;
            });
            break;
        case 'date-desc':
            filteredTemplates.sort((a, b) => {
                const dateA = a['last-commit-date'] ? new Date(a['last-commit-date']) : new Date(0);
                const dateB = b['last-commit-date'] ? new Date(b['last-commit-date']) : new Date(0);
                return dateB - dateA;
            });
            break;
    }
}

// Video modal
function openVideoModal(videoUrl, isYouTube = false) {
    const modal = document.getElementById('video-modal');
    const videoPlayer = document.getElementById('video-player');
    
    if (isYouTube) {
        // Convert YouTube URL to embed format
        const embedUrl = getYouTubeEmbedUrl(videoUrl);
        videoPlayer.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else {
        videoPlayer.innerHTML = `<video controls autoplay><source src="${videoUrl}" type="video/mp4"></video>`;
    }
    
    modal.style.display = 'flex';
}

function getYouTubeEmbedUrl(url) {
    // Extract video ID from various YouTube URL formats
    let videoId = '';
    
    if (url.includes('youtube.com/watch')) {
        // Format: https://www.youtube.com/watch?v=VIDEO_ID
        const urlParams = new URLSearchParams(new URL(url).search);
        videoId = urlParams.get('v');
    } else if (url.includes('youtu.be/')) {
        // Format: https://youtu.be/VIDEO_ID
        videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('youtube.com/embed/')) {
        // Already in embed format
        return url;
    }
    
    return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
}

function closeVideoModal() {
    const modal = document.getElementById('video-modal');
    const videoPlayer = document.getElementById('video-player');
    
    videoPlayer.innerHTML = '';
    modal.style.display = 'none';
}

function openTemplateModal(template) {
    const modal = document.getElementById('template-modal');
    const modalContent = document.getElementById('template-modal-content');
    
    // Determine thumbnail URL with category-specific defaults
    let thumbnailUrl;
    if (template.thumbnail) {
        if (template.thumbnail.startsWith('http://') || template.thumbnail.startsWith('https://')) {
            thumbnailUrl = template.thumbnail;
        } else {
            thumbnailUrl = `https://raw.githubusercontent.com/${getRepoPath(template.repo)}/main/${template.thumbnail}`;
        }
    } else {
        // Use category-specific default thumbnails
        const categoryDefaults = {
            'AI Apps & Agents': 'media/default-aiapps-thumbnail.png',
            'App Modernization': 'media/default-appmod-thumbnail.png',
            'Data Centric Apps': 'media/default-data-thumbnail.png'
        };
        thumbnailUrl = categoryDefaults[template.category] || 'https://via.placeholder.com/640x360?text=No+Image';
    }
    
    const lastCommitDate = template['last-commit-date'] ? formatDate(template['last-commit-date']) : '';
    const version = template.version || '';
    
    const vscodeUrl = `vscode://AlexVieira.spec2cloud-toolkit?template=${template.id}`;
    
    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>${template.title}</h2>
            <button class="modal-close" onclick="closeTemplateModal()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="modal-thumbnail">
                <img src="${thumbnailUrl}" alt="${template.title}">
            </div>
            <div class="modal-info">
                <div class="modal-metadata">
                    ${version ? `<span class="badge version-badge">v${version}</span>` : ''}
                    ${lastCommitDate ? `<span class="template-last-commit">Last updated: ${lastCommitDate}</span>` : ''}
                </div>
                ${template.category || template.industry ? `
                <div class="modal-categories">
                    ${template.category ? `<span class="badge category">${template.category}</span>` : ''}
                    ${template.industry ? `<span class="badge industry">${template.industry}</span>` : ''}
                </div>
                ` : ''}
                <div class="modal-description">
                    <h3>Description</h3>
                    <p>${template.description}</p>
                </div>
                ${template.authors && template.authors.length > 0 ? `
                <div class="modal-section">
                    <h3>Authors</h3>
                    <div class="modal-authors">
                        ${template.authors.map(author => `<a href="https://github.com/${author}" target="_blank" rel="noopener noreferrer" class="author-link">@${author}</a>`).join(' ')}
                    </div>
                </div>
                ` : ''}
                ${template.services && template.services.length > 0 ? `
                <div class="modal-section">
                    <h3>Services</h3>
                    <div class="modal-badges">
                        ${renderIconBadges(template.services, 'services')}
                    </div>
                </div>
                ` : ''}
                ${template.languages && template.languages.length > 0 ? `
                <div class="modal-section">
                    <h3>Languages</h3>
                    <div class="modal-badges">
                        ${renderIconBadges(template.languages, 'languages')}
                    </div>
                </div>
                ` : ''}
                ${template.frameworks && template.frameworks.length > 0 ? `
                <div class="modal-section">
                    <h3>Frameworks</h3>
                    <div class="modal-badges">
                        ${renderIconBadges(template.frameworks, 'frameworks')}
                    </div>
                </div>
                ` : ''}
                ${template.tags && template.tags.length > 0 ? `
                <div class="modal-section">
                    <h3>Tags</h3>
                    <div class="modal-badges">
                        ${renderIconBadges(template.tags, 'tags')}
                    </div>
                </div>
                ` : ''}
                <div class="modal-actions">
                    <div class="github-actions">
                        <a href="${template.repo}" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           class="btn-secondary btn-with-icon">
                            <img src="media/services/github.svg" alt="GitHub" class="btn-icon-img">
                            View on GitHub
                        </a>
                        <a href="${template.repo}/stargazers" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           class="btn-icon-only"
                           title="Star this repository">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
                            </svg>
                        </a>
                        <button class="btn-icon-only"
                           onclick="shareTemplate('${template.id}')"
                           title="Share Spec Template">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M13.5 1a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM11 2.5a2.5 2.5 0 11.603 1.628l-6.718 3.12a2.499 2.499 0 010 1.504l6.718 3.12a2.5 2.5 0 11-.488.876l-6.718-3.12a2.5 2.5 0 110-3.256l6.718-3.12A2.5 2.5 0 0111 2.5zm-8.5 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm11 5.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="use-in-dropdown">
                        <button class="btn-primary dropdown-toggle" onclick="toggleDropdown(event, 'modal-${template.id}')">
                            Use in
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="margin-left: 4px;">
                                <path d="M2 8l4-4 4 4z"/>
                            </svg>
                        </button>
                        <div class="dropdown-menu" id="dropdown-modal-${template.id}">
                            <div class="dropdown-category">
                                <div class="dropdown-category-title">Desktop</div>
                                <a href="${vscodeUrl}" class="dropdown-item">
                                    <div class="dropdown-item-title">Open in VS Code</div>
                                    <div class="dropdown-item-description">Download the Spec Template to your local Workspace</div>
                                </a>
                                <div class="dropdown-item clone-item">
                                    <div>
                                        <div class="dropdown-item-title">Clone the Spec Template</div>
                                        <div class="dropdown-item-description">Run the following command in a terminal:</div>
                                        <div class="clone-command">
                                            <code>git clone ${template.repo}</code>
                                            <button class="copy-button" onclick="copyCloneCommand('${template.repo}'); event.stopPropagation();" title="Copy to clipboard">
                                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                                    <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2z"/>
                                                    <path d="M2 6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2H6a3 3 0 0 1-3-3V6H2z"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="dropdown-category">
                                <div class="dropdown-category-title">Browser</div>
                                <a href="https://github.com/codespaces/new?repo=${getRepoPath(template.repo)}" target="_blank" rel="noopener noreferrer" class="dropdown-item">
                                    <div class="dropdown-item-title">Open in GitHub Codespaces</div>
                                    <div class="dropdown-item-description">Create a Codespace based on the Spec Template</div>
                                </a>
                                <a href="https://vscode.dev/github/${getRepoPath(template.repo)}" target="_blank" rel="noopener noreferrer" class="dropdown-item">
                                    <div class="dropdown-item-title">Open in VS Code for the Web</div>
                                    <div class="dropdown-item-description">Open the Spec Template repository</div>
                                </a>
                                <a href="https://insiders.vscode.dev/azure?azdTemplateUrl=${encodeURIComponent(template.repo)}" target="_blank" rel="noopener noreferrer" class="dropdown-item">
                                    <div class="dropdown-item-title">Open in VS Code for Web with Azure</div>
                                    <div class="dropdown-item-description">Create a new AZD environment in the Azure Cloud Shell</div>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function closeTemplateModal() {
    const modal = document.getElementById('template-modal');
    modal.style.display = 'none';
}

// Close modal when clicking outside the video
document.addEventListener('DOMContentLoaded', function() {
    const videoModal = document.getElementById('video-modal');
    if (videoModal) {
        videoModal.addEventListener('click', function(e) {
            if (e.target === videoModal) {
                closeVideoModal();
            }
        });
    }
    
    const templateModal = document.getElementById('template-modal');
    if (templateModal) {
        templateModal.addEventListener('click', function(e) {
            if (e.target === templateModal) {
                closeTemplateModal();
            }
        });
    }
    
    // Close modals on ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const videoModal = document.getElementById('video-modal');
            const templateModal = document.getElementById('template-modal');
            
            if (videoModal && videoModal.style.display === 'flex') {
                closeVideoModal();
            }
            if (templateModal && templateModal.style.display === 'flex') {
                closeTemplateModal();
            }
        }
    });
});

// Attach event listeners
function attachEventListeners() {
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('sort-filter').addEventListener('change', applyFilters);
    document.getElementById('category-filter').addEventListener('change', applyFilters);
    document.getElementById('industry-filter').addEventListener('change', applyFilters);
    
    // Close modal on click outside
    document.getElementById('video-modal').addEventListener('click', (e) => {
        if (e.target.id === 'video-modal') {
            closeVideoModal();
        }
    });
}

// Dropdown functionality
function toggleDropdown(event, templateId) {
    event.stopPropagation();
    const dropdownId = `dropdown-${templateId}`;
    const dropdown = document.getElementById(dropdownId);
    
    // Close all other dropdowns
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
        if (menu.id !== dropdownId) {
            menu.classList.remove('show');
        }
    });
    
    // Toggle current dropdown
    dropdown.classList.toggle('show');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.use-in-dropdown')) {
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
    }
});

// Helper function to extract repo path from URL
function getRepoPath(repoUrl) {
    try {
        const url = new URL(repoUrl);
        // Remove leading slash and return org/repo
        return url.pathname.substring(1);
    } catch (e) {
        console.error('Invalid repo URL:', repoUrl);
        return '';
    }
}

// Copy clone command to clipboard
function copyCloneCommand(repoUrl) {
    const command = `git clone ${repoUrl}`;
    navigator.clipboard.writeText(command).then(() => {
        // Show a temporary notification
        showNotification('Clone command copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy command', 'error');
    });
}

// Show notification
function showNotification(message, type = 'success') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Hide and remove notification after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Share template function
function shareTemplate(templateId) {
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `https://aka.ms/spec2cloud?template=${templateId}`;
    
    // Try to use native share API if available
    if (navigator.share) {
        const template = allTemplates.find(t => t.id === templateId);
        navigator.share({
            title: template ? template.title : 'Spec2Cloud Template',
            text: template ? template.description : 'Check out this Spec Template',
            url: shareUrl
        }).catch(err => {
            console.log('Share cancelled or failed:', err);
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareUrl).then(() => {
            showNotification('Template link copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showNotification('Failed to copy link', 'error');
        });
    }
}

// Check for template query parameter on page load
function checkTemplateQueryParameter() {
    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get('template');
    
    if (templateId) {
        // Find the template
        const template = allTemplates.find(t => t.id === templateId);
        if (template) {
            // Wait a bit for the page to fully render, then open the modal
            setTimeout(() => {
                openTemplateModal(template);
                // Scroll to the template gallery section
                document.querySelector('.gallery-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 500);
        }
    }
}
