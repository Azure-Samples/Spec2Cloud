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
    const featuredGrid = document.getElementById('featured-grid');
    const featuredTemplates = allTemplates.filter(t => featuredTemplateIds.includes(t.id));

    featuredGrid.innerHTML = featuredTemplates.map(template => createTemplateCard(template, true)).join('');
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
    
    // Determine thumbnail URL with category-specific defaults
    let thumbnailUrl;
    if (template.thumbnail) {
        thumbnailUrl = `https://raw.githubusercontent.com/vieiraae/spec2cloud-templates/main/templates/${template.id}/${template.thumbnail}`;
    } else {
        // Use category-specific default thumbnails
        const categoryDefaults = {
            'AI Apps & Agents': 'media/default-aiapps-thumbnail.png',
            'App Modernization': 'media/default-appmod-thumbnail.png',
            'Data Centric Apps': 'media/default-data-thumbnail.png'
        };
        thumbnailUrl = categoryDefaults[template.category] || 'https://via.placeholder.com/640x360?text=No+Image';
    }
    
    const hasVideo = template.video && template.video !== '';
    const videoUrl = hasVideo ? `https://raw.githubusercontent.com/vieiraae/spec2cloud-templates/main/templates/${template.id}/${template.video}` : '';
    const vscodeUrl = `vscode://yourpublisher.spec2cloud/command/spec2cloud.createProject?${encodeURIComponent(JSON.stringify({ template: template.id }))}`;
    
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
                    <button class="video-play-button" onclick="openVideoModal('${videoUrl}')">
                        <svg viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
            <div class="template-content">
                <h3 class="template-title" onclick='openTemplateModal(${JSON.stringify(template).replace(/'/g, "&#39;")})'>${title}</h3>
                <p class="template-description">${description}</p>
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
                    <a href="https://github.com/vieiraae/spec2cloud-templates/tree/main/templates/${template.id}" 
                       target="_blank" 
                       class="btn-secondary">
                        View on GitHub
                    </a>
                    <a href="${vscodeUrl}" class="btn-primary">
                        Download to VS Code
                    </a>
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
function openVideoModal(videoUrl) {
    const modal = document.getElementById('video-modal');
    const videoPlayer = document.getElementById('video-player');
    
    videoPlayer.src = videoUrl;
    modal.style.display = 'flex';
    // Auto-play the video
    videoPlayer.play();
}

function closeVideoModal() {
    const modal = document.getElementById('video-modal');
    const videoPlayer = document.getElementById('video-player');
    
    videoPlayer.pause();
    videoPlayer.src = '';
    modal.style.display = 'none';
}

function openTemplateModal(template) {
    const modal = document.getElementById('template-modal');
    const modalContent = document.getElementById('template-modal-content');
    
    // Determine thumbnail URL with category-specific defaults
    let thumbnailUrl;
    if (template.thumbnail) {
        thumbnailUrl = `https://raw.githubusercontent.com/vieiraae/spec2cloud-templates/main/templates/${template.id}/${template.thumbnail}`;
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
    
    const vscodeUrl = `vscode://yourpublisher.spec2cloud/command/spec2cloud.createProject?${encodeURIComponent(JSON.stringify({ template: template.id }))}`;
    
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
                    <a href="https://github.com/vieiraae/spec2cloud-templates/tree/main/templates/${template.id}" 
                       target="_blank" 
                       class="btn-secondary">
                        View on GitHub
                    </a>
                    <a href="${vscodeUrl}" class="btn-primary">
                        Download to VS Code
                    </a>
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
