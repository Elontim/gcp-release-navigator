// Dashboard Application Logic
document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let releasesData = [];
    let isLiveMode = false;
    let isLoading = false;
    let searchDebounceTimeout = null;

    // --- DOM Elements ---
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const serviceFilter = document.getElementById('service-filter');
    const typeFilter = document.getElementById('type-filter');
    const refreshBtn = document.getElementById('refresh-btn');
    const spinnerIcon = document.getElementById('spinner-icon');
    const cardsContainer = document.getElementById('cards-container');
    const statusBadge = document.getElementById('status-badge');
    const statusText = document.getElementById('status-text');
    const resultsCount = document.getElementById('results-count');
    const modeIndicator = document.getElementById('mode-indicator');
    
    // Modal elements
    const setupModal = document.getElementById('setup-modal');
    const modalClose = document.getElementById('modal-close');
    const modalOkBtn = document.getElementById('modal-ok-btn');
    
    // Theme toggle elements
    const themeToggle = document.getElementById('theme-toggle');
    const bodyEl = document.body;

    // --- Core API Calling ---
    async function fetchReleases(isRefresh = false) {
        if (isLoading) return;
        
        isLoading = true;
        setLoadingState(true);
        renderSkeletons();

        const service = serviceFilter.value;
        const type = typeFilter.value;
        const search = searchInput.value.trim();
        
        // Build API URL query string
        let url = `/api/releases?limit=60`;
        if (service) url += `&service=${encodeURIComponent(service)}`;
        if (type) url += `&type=${encodeURIComponent(type)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (isRefresh) url += `&refresh=true`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const payload = await response.json();
            
            if (payload.status === 'success') {
                releasesData = payload.data;
                isLiveMode = (payload.mode === 'live');
                
                updateStatusBadge(payload.mode, payload.error);
                renderReleases(releasesData);
                
                if (isRefresh) {
                    showToast('Feed updated successfully!', 'success');
                }
            } else {
                throw new Error(payload.error || 'Unknown backend error');
            }
        } catch (error) {
            console.error('Failed fetching release notes:', error);
            showToast(`Error: ${error.message}. Loaded cached demo data.`, 'error');
            // If API fails completely, build empty state or default structure
            updateStatusBadge('mock', error.message);
            renderReleases([]);
        } finally {
            isLoading = false;
            setLoadingState(false);
        }
    }

    // --- Loading UI Animations ---
    function setLoadingState(loading) {
        if (loading) {
            refreshBtn.disabled = true;
            spinnerIcon.classList.add('spinning');
        } else {
            // Add a small delay for smooth transition feel
            setTimeout(() => {
                refreshBtn.disabled = false;
                spinnerIcon.classList.remove('spinning');
            }, 500);
        }
    }

    function renderSkeletons() {
        cardsContainer.innerHTML = '';
        // Render 6 skeleton cards
        for (let i = 0; i < 6; i++) {
            cardsContainer.appendChild(createSkeletonCard());
        }
    }

    function createSkeletonCard() {
        const div = document.createElement('div');
        div.className = 'skeleton-card';
        div.innerHTML = `
            <div class="card-header">
                <div class="skeleton-text skeleton-title skeleton-shimmer"></div>
                <div class="skeleton-text skeleton-badge skeleton-shimmer"></div>
            </div>
            <div class="card-body">
                <div class="skeleton-text skeleton-shimmer" style="width: 30%; height: 10px;"></div>
                <div class="skeleton-text skeleton-desc-line skeleton-shimmer"></div>
                <div class="skeleton-text skeleton-desc-line skeleton-shimmer"></div>
                <div class="skeleton-text skeleton-desc-line skeleton-shimmer"></div>
                <div class="skeleton-text skeleton-desc-line short skeleton-shimmer"></div>
            </div>
            <div class="card-actions" style="border-top: none; padding-top: 0;">
                <div class="skeleton-text skeleton-shimmer" style="width: 20%; height: 14px;"></div>
                <div class="skeleton-text skeleton-shimmer" style="width: 10%; height: 14px;"></div>
            </div>
        `;
        return div;
    }

    // --- Rendering Logic ---
    function renderReleases(releases) {
        cardsContainer.innerHTML = '';
        resultsCount.textContent = `Showing ${releases.length} release${releases.length !== 1 ? 's' : ''}`;
        
        if (releases.length === 0) {
            renderEmptyState();
            return;
        }

        releases.forEach(release => {
            const card = createReleaseCard(release);
            cardsContainer.appendChild(card);
        });
    }

    function createReleaseCard(release) {
        const card = document.createElement('article');
        card.className = 'card';
        
        const typeClass = `type-${release.type.toLowerCase().replace(/\s+/g, '-')}`;
        const typeBadge = `<span class="type-badge ${typeClass}">${release.type}</span>`;
        const formattedDate = formatDate(release.release_date);
        
        card.innerHTML = `
            <div class="card-header">
                <h3 class="service-name">
                    <span class="service-icon-bullet"></span>
                    ${escapeHtml(release.product_name)}
                </h3>
                <div class="card-meta-badges">
                    ${typeBadge}
                </div>
            </div>
            <div class="card-body">
                <div class="release-date">
                    <i class="fa-regular fa-calendar"></i>
                    <span>${formattedDate}</span>
                </div>
                <div class="release-desc">${release.description}</div>
            </div>
            <div class="card-actions">
                <button class="btn-readmore">
                    <span>Read More</span>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
                <a href="${release.url}" target="_blank" rel="noopener noreferrer" class="btn-link" title="Open Official Release Note">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
            </div>
        `;

        // Expand/Collapse Description Logic
        const descEl = card.querySelector('.release-desc');
        const readMoreBtn = card.querySelector('.btn-readmore');
        
        // Wait till render to check if description overflows
        setTimeout(() => {
            if (descEl.scrollHeight > descEl.clientHeight) {
                readMoreBtn.style.display = 'inline-flex';
            } else {
                readMoreBtn.style.display = 'none';
            }
        }, 50);

        readMoreBtn.addEventListener('click', () => {
            const isExpanded = descEl.classList.toggle('expanded');
            if (isExpanded) {
                readMoreBtn.querySelector('span').textContent = 'Show Less';
                readMoreBtn.querySelector('i').className = 'fa-solid fa-chevron-up';
            } else {
                readMoreBtn.querySelector('span').textContent = 'Read More';
                readMoreBtn.querySelector('i').className = 'fa-solid fa-chevron-down';
            }
        });

        return card;
    }

    function renderEmptyState() {
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.innerHTML = `
            <div class="empty-icon">
                <i class="fa-solid fa-folder-open"></i>
            </div>
            <h3>No Releases Found</h3>
            <p>We couldn't find any release notes matching your search or filters. Try adjusting your selections.</p>
            <button class="btn btn-secondary margin-top-md" id="reset-filters-btn">Clear Filters</button>
        `;
        cardsContainer.appendChild(div);

        document.getElementById('reset-filters-btn').addEventListener('click', () => {
            searchInput.value = '';
            searchClear.style.display = 'none';
            serviceFilter.value = '';
            typeFilter.value = '';
            fetchReleases();
        });
    }

    // --- Badge and Indicators ---
    function updateStatusBadge(mode, errorMsg) {
        statusBadge.className = 'badge'; // reset
        
        if (mode === 'live') {
            statusBadge.classList.add('live-badge');
            statusText.textContent = 'Live BigQuery';
            modeIndicator.textContent = 'Google Cloud Live Stream';
            statusBadge.title = "Connected directly to live GCP BigQuery. Click to see details.";
        } else {
            statusBadge.classList.add('mock-badge');
            statusText.textContent = 'Demo Mode';
            modeIndicator.textContent = 'Simulated Local Feed';
            
            let hoverTitle = "Running on mock data. Click to configure GCP credentials.";
            if (errorMsg) {
                hoverTitle += `\nError: ${errorMsg}`;
            }
            statusBadge.title = hoverTitle;
        }
    }

    // --- Modal Logic ---
    function openModal() {
        setupModal.classList.add('open');
        setupModal.style.display = 'flex';
    }

    function closeModal() {
        setupModal.classList.remove('open');
        setTimeout(() => {
            setupModal.style.display = 'none';
        }, 300);
    }

    // --- Theme Control ---
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            bodyEl.classList.remove('dark-mode');
            bodyEl.classList.add('light-mode');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            bodyEl.classList.remove('light-mode');
            bodyEl.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
    }

    function toggleTheme() {
        if (bodyEl.classList.contains('dark-mode')) {
            bodyEl.classList.remove('dark-mode');
            bodyEl.classList.add('light-mode');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
            localStorage.setItem('theme', 'light');
            showToast('Switched to Light Theme', 'info');
        } else {
            bodyEl.classList.remove('light-mode');
            bodyEl.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            localStorage.setItem('theme', 'dark');
            showToast('Switched to Dark Theme', 'info');
        }
    }

    // --- Modal Auth Method Tabs ---
    const tabOpts = document.querySelectorAll('.tab-opt');
    tabOpts.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            tabOpts.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            
            // Activate selected
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).style.display = 'block';
        });
    });

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        // Search bar interaction
        searchInput.addEventListener('input', () => {
            if (searchInput.value.length > 0) {
                searchClear.style.display = 'flex';
            } else {
                searchClear.style.display = 'none';
            }
            
            // Debounce search input to avoid hitting backend on every keystroke
            clearTimeout(searchDebounceTimeout);
            searchDebounceTimeout = setTimeout(() => {
                fetchReleases();
            }, 350);
        });

        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.style.display = 'none';
            fetchReleases();
        });

        // Filter triggers
        serviceFilter.addEventListener('change', () => fetchReleases());
        typeFilter.addEventListener('change', () => fetchReleases());

        // Button actions
        refreshBtn.addEventListener('click', () => fetchReleases(true));
        themeToggle.addEventListener('click', toggleTheme);

        // Modal triggers
        statusBadge.addEventListener('click', openModal);
        modalClose.addEventListener('click', closeModal);
        modalOkBtn.addEventListener('click', closeModal);
        
        // Close modal on background click
        setupModal.addEventListener('click', (e) => {
            if (e.target === setupModal) {
                closeModal();
            }
        });
        
        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && setupModal.classList.contains('open')) {
                closeModal();
            }
        });
    }

    // --- Utility Helper Functions ---
    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconClass = 'fa-circle-info';
        if (type === 'success') iconClass = 'fa-circle-check';
        if (type === 'error') iconClass = 'fa-circle-exclamation';

        toast.innerHTML = `
            <i class="fa-solid ${iconClass} toast-icon"></i>
            <span class="toast-message">${escapeHtml(message)}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        // Slide out and remove toast after 4s
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    }

    function formatDate(dateString) {
        if (!dateString) return 'Unknown Date';
        try {
            // dateString expected format: YYYY-MM-DD
            const parts = dateString.split('-');
            if (parts.length !== 3) return dateString;
            
            const date = new Date(
                parseInt(parts[0], 10), 
                parseInt(parts[1], 10) - 1, 
                parseInt(parts[2], 10)
            );
            
            if (isNaN(date.getTime())) return dateString;

            return date.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });
        } catch (e) {
            return dateString;
        }
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- Init Call ---
    initTheme();
    setupEventListeners();
    fetchReleases();
});
