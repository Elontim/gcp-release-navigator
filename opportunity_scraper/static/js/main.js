// Opportunities Dashboard Controller
document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let opportunitiesList = [];
    let activeCategory = ''; // Empty means 'All'
    let showSavedOnly = false;
    let isLoading = false;
    let searchTimeout = null;
    let currentSortColumn = 'title';
    let currentSortDirection = 'asc';

    // --- DOM Elements ---
    const searchBar = document.getElementById('search-bar');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const categoryTabs = document.querySelectorAll('.tab-item');
    const scrapeBtn = document.getElementById('scrape-trigger-btn');
    const btnSpinner = document.getElementById('btn-spinner');
    const tableBody = document.getElementById('table-body');
    const sortHeaders = document.querySelectorAll('th.sortable');
    
    // Stats elements
    const countFellowships = document.getElementById('count-fellowships');
    const countGrants = document.getElementById('count-grants');
    const countConferences = document.getElementById('count-conferences');
    const countSaved = document.getElementById('count-saved');
    
    const resultsMetaText = document.getElementById('results-meta-text');
    const scrapedDateText = document.getElementById('scraped-date-text');
    
    // Modal elements
    const detailsModal = document.getElementById('details-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalCategoryBadge = document.getElementById('modal-category-badge');
    const modalSource = document.getElementById('modal-source');
    const modalDate = document.getElementById('modal-date');
    const modalBodyContent = document.getElementById('modal-body-content');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    const modalLinkBtn = document.getElementById('modal-link-btn');

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');

    // --- Core Data Fetching ---
    async function fetchStats() {
        try {
            const response = await fetch('/api/stats');
            if (!response.ok) throw new Error('Failed to fetch stats');
            const stats = await response.json();
            
            countFellowships.textContent = stats.Fellowship || 0;
            countGrants.textContent = stats["Travel Grant"] || 0;
            countConferences.textContent = stats["Fully Funded Conference"] || 0;
            countSaved.textContent = stats.Saved || 0;
        } catch (error) {
            console.error('Error fetching statistics:', error);
        }
    }

    async function fetchOpportunities() {
        if (isLoading) return;
        isLoading = true;
        setLoadingState(true);
        renderSkeletons();

        const search = searchBar.value.trim();
        
        let url = `/api/opportunities?saved_only=${showSavedOnly}`;
        if (activeCategory && !showSavedOnly) {
            url += `&category=${encodeURIComponent(activeCategory)}`;
        }
        if (search) {
            url += `&search=${encodeURIComponent(search)}`;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch opportunities');
            opportunitiesList = await response.json();
            
            renderOpportunities(opportunitiesList);
            
            // Extract latest update timestamp if there are results
            if (opportunitiesList.length > 0) {
                const latestScraped = opportunitiesList.reduce((latest, op) => {
                    return op.scraped_at > latest ? op.scraped_at : latest;
                }, '');
                if (latestScraped) {
                    scrapedDateText.textContent = `Last updated: ${formatDateTime(latestScraped)}`;
                }
            }
        } catch (error) {
            console.error('Error fetching opportunities:', error);
            showToast('Failed to load opportunities from database.', 'error');
            renderOpportunities([]);
        } finally {
            isLoading = false;
            setLoadingState(false);
        }
    }

    // --- Scraper Activation ---
    async function triggerScraper() {
        if (isLoading) return;
        isLoading = true;
        scrapeBtn.disabled = true;
        btnSpinner.classList.add('spinning');
        showToast('Running background scraper... parsing target websites.', 'info');

        try {
            const response = await fetch('/api/scrape', { method: 'POST' });
            if (!response.ok) throw new Error('Scraper request failed');
            const data = await response.json();
            
            if (data.status === 'success') {
                showToast(`Scrape complete! Found ${data.new_count} new entries.`, 'success');
                await fetchStats();
                await fetchOpportunities();
            } else {
                throw new Error(data.message || 'Scraper failed');
            }
        } catch (error) {
            console.error('Scraper error:', error);
            showToast(`Scraping failed: ${error.message}`, 'error');
        } finally {
            isLoading = false;
            scrapeBtn.disabled = false;
            btnSpinner.classList.remove('spinning');
        }
    }

    // --- Bookmarking (Save) ---
    async function toggleSave(opId, btnElement) {
        try {
            const response = await fetch(`/api/opportunities/${opId}/save`, { method: 'POST' });
            if (!response.ok) throw new Error('Save toggle failed');
            const data = await response.json();
            
            if (data.error) throw new Error(data.error);

            // Update local state item
            const opItem = opportunitiesList.find(op => op.id === opId);
            if (opItem) opItem.saved = data.saved;
            
            // Update UI element icon
            if (data.saved) {
                btnElement.classList.add('saved');
                btnElement.innerHTML = '<i class="fa-solid fa-bookmark"></i>';
                showToast('Opportunity bookmarked!', 'success');
            } else {
                btnElement.classList.remove('saved');
                btnElement.innerHTML = '<i class="fa-regular fa-bookmark"></i>';
                showToast('Removed from bookmarks.', 'info');
            }
            
            // Toggle row styling
            const row = btnElement.closest('.op-row');
            if (row) {
                if (data.saved) {
                    row.classList.add('row-saved');
                } else {
                    row.classList.remove('row-saved');
                    if (showSavedOnly) {
                        row.style.opacity = '0';
                        setTimeout(() => fetchOpportunities(), 300);
                    }
                }
            }

            fetchStats();
        } catch (error) {
            console.error('Error saving opportunity:', error);
            showToast('Failed to update bookmark status.', 'error');
        }
    }

    // --- Loading UI Animations ---
    function setLoadingState(loading) {
        if (!loading) {
            setTimeout(() => {
                btnSpinner.classList.remove('spinning');
            }, 300);
        }
    }

    function renderSkeletons() {
        tableBody.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="6">
                    <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 0;">
                        <div class="skeleton-text skeleton-shimmer" style="width: 45%; height: 16px;"></div>
                        <div class="skeleton-text skeleton-shimmer" style="width: 25%; height: 10px;"></div>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        }
    }

    // --- Rendering Table Rows ---
    function renderOpportunities(opportunities) {
        tableBody.innerHTML = '';
        resultsMetaText.textContent = `Found ${opportunities.length} opportunity${opportunities.length !== 1 ? 'ies' : ''}`;
        
        if (opportunities.length === 0) {
            renderEmptyState();
            return;
        }

        // Apply client side sorting
        sortOpportunitiesData(opportunities);

        opportunities.forEach(op => {
            const row = createOpportunityRow(op);
            tableBody.appendChild(row);
        });
    }

    function sortOpportunitiesData(opportunities) {
        opportunities.sort((a, b) => {
            let valA = a[currentSortColumn] || '';
            let valB = b[currentSortColumn] || '';
            
            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }
            
            if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    function createOpportunityRow(op) {
        const tr = document.createElement('tr');
        
        let catClass = 'cat-default';
        if (op.category === 'Fellowship') catClass = 'cat-fellowship';
        if (op.category === 'Travel Grant') catClass = 'cat-grant';
        if (op.category === 'Fully Funded Conference') catClass = 'cat-conference';
        
        tr.className = `op-row ${op.saved ? 'row-saved' : ''}`;
        
        const formattedDate = formatDate(op.pub_date);
        const savedIcon = op.saved ? 'fa-solid fa-bookmark saved' : 'fa-regular fa-bookmark';
        
        tr.innerHTML = `
            <td>
                <div class="op-title-cell" style="cursor: pointer; font-weight: 700;">
                    <span class="service-bullet ${catClass}"></span>
                    <span class="table-op-title">${escapeHtml(op.title)}</span>
                </div>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-left: 14px; margin-top: 2px;">
                    Source: ${escapeHtml(op.source)} | Published: ${formattedDate}
                </div>
            </td>
            <td><span class="type-badge ${catClass}">${op.category}</span></td>
            <td><span class="region-text"><i class="fa-solid fa-map-location-dot" style="font-size: 0.75rem; margin-right: 4px; color: var(--text-muted);"></i>${escapeHtml(op.target_region || 'Global')}</span></td>
            <td><span class="deadline-text"><i class="fa-solid fa-hourglass-end" style="font-size: 0.75rem; margin-right: 4px; color: var(--text-muted);"></i>${escapeHtml(op.deadline || 'See details')}</span></td>
            <td><div class="benefits-summary-cell" title="${escapeHtml(op.benefits)}">${escapeHtml(op.benefits || 'Funding available')}</div></td>
            <td style="text-align: center;">
                <div style="display: flex; justify-content: center; gap: 0.5rem; align-items: center;">
                    <button class="btn-save-op table-action-btn ${op.saved ? 'saved' : ''}" title="Bookmark opportunity">
                        <i class="${savedIcon}"></i>
                    </button>
                    <a href="${op.link}" target="_blank" rel="noopener noreferrer" class="btn-link table-action-link" title="Open source details">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                </div>
            </td>
        `;

        // Event: Click title to open modal
        tr.querySelector('.op-title-cell').addEventListener('click', () => {
            openDetailsModal(op);
        });

        // Event: Save button click
        const saveBtn = tr.querySelector('.btn-save-op');
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSave(op.id, saveBtn);
        });

        return tr;
    }

    function renderEmptyState() {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="6">
                <div class="empty-state" style="border: none; background: none; padding: 3rem 0;">
                    <div class="empty-icon">
                        <i class="fa-solid fa-earth-africa"></i>
                    </div>
                    <h3>No Opportunities Available</h3>
                    <p>We couldn't find any opportunities matching your filters.</p>
                    ${!showSavedOnly ? '<button class="btn btn-secondary" id="empty-reset-btn" style="margin-top: 1rem;">Reset Filters</button>' : ''}
                </div>
            </td>
        `;
        tableBody.appendChild(tr);

        if (!showSavedOnly) {
            tr.querySelector('#empty-reset-btn').addEventListener('click', () => {
                searchBar.value = '';
                clearSearchBtn.style.display = 'none';
                activeCategory = '';
                
                categoryTabs.forEach(t => t.classList.remove('active'));
                categoryTabs[0].classList.add('active');
                
                fetchOpportunities();
            });
        }
    }

    // --- Modal Handler ---
    function openDetailsModal(op) {
        modalTitle.textContent = op.title;
        modalCategoryBadge.textContent = op.category;
        
        // Remove old dynamic classes
        modalCategoryBadge.className = 'type-badge';
        let catClass = 'cat-default';
        if (op.category === 'Fellowship') catClass = 'cat-fellowship';
        if (op.category === 'Travel Grant') catClass = 'cat-grant';
        if (op.category === 'Fully Funded Conference') catClass = 'cat-conference';
        modalCategoryBadge.classList.add(catClass);
        
        modalSource.innerHTML = `<i class="fa-solid fa-globe"></i> ${escapeHtml(op.source)}`;
        modalDate.innerHTML = `<i class="fa-regular fa-calendar"></i> Published: ${formatDate(op.pub_date)}`;
        
        // Inject region, deadline, benefits
        document.getElementById('modal-region').textContent = op.target_region || 'Global / Worldwide';
        document.getElementById('modal-deadline').textContent = op.deadline || 'See details';
        document.getElementById('modal-benefits').textContent = op.benefits || 'Funding available';

        // Inject rich description HTML
        modalBodyContent.innerHTML = op.description || '<p>No description provided.</p>';
        
        // Configure external link
        modalLinkBtn.href = op.link;
        
        // Configure modal bookmark button
        updateModalSaveBtnState(op.saved);
        
        // Click listener for modal save button (clean up old listeners first)
        const oldSaveBtn = modalSaveBtn;
        const newSaveBtn = oldSaveBtn.cloneNode(true);
        oldSaveBtn.parentNode.replaceChild(newSaveBtn, oldSaveBtn);
        
        newSaveBtn.addEventListener('click', async () => {
            await toggleSave(op.id, newSaveBtn);
            // Sync with local state
            const syncOp = opportunitiesList.find(o => o.id === op.id);
            if (syncOp) {
                updateModalSaveBtnState(syncOp.saved, newSaveBtn);
                // Also update the dashboard table row
                fetchOpportunities();
            }
        });

        detailsModal.classList.add('open');
        detailsModal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Lock background scroll
    }

    function updateModalSaveBtnState(saved, btnEl = modalSaveBtn) {
        if (saved) {
            btnEl.classList.add('saved');
            btnEl.innerHTML = '<i class="fa-solid fa-bookmark margin-right-xs"></i> <span>Bookmarked</span>';
        } else {
            btnEl.classList.remove('saved');
            btnEl.innerHTML = '<i class="fa-regular fa-bookmark margin-right-xs"></i> <span>Bookmark Opportunity</span>';
        }
    }

    function closeDetailsModal() {
        detailsModal.classList.remove('open');
        setTimeout(() => {
            detailsModal.style.display = 'none';
            document.body.style.overflow = '';
        }, 300);
    }

    // --- Theme Controller ---
    function initTheme() {
        const savedTheme = localStorage.getItem('op-theme');
        if (savedTheme === 'light') {
            document.body.classList.remove('dark-mode');
            document.body.classList.add('light-mode');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            document.body.classList.remove('light-mode');
            document.body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
    }

    // Toggle light/dark themes
    function toggleTheme() {
        if (document.body.classList.contains('dark-mode')) {
            document.body.classList.remove('dark-mode');
            document.body.classList.add('light-mode');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
            localStorage.setItem('op-theme', 'light');
            showToast('Switched to Light Theme', 'info');
        } else {
            document.body.classList.remove('light-mode');
            document.body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            localStorage.setItem('op-theme', 'dark');
            showToast('Switched to Dark Theme', 'info');
        }
    }

    // --- Event Setup ---
    function setupEventListeners() {
        // Search bar inputs
        searchBar.addEventListener('input', () => {
            if (searchBar.value.length > 0) {
                clearSearchBtn.style.display = 'flex';
            } else {
                clearSearchBtn.style.display = 'none';
            }
            
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                fetchOpportunities();
            }, 400);
        });

        clearSearchBtn.addEventListener('click', () => {
            searchBar.value = '';
            clearSearchBtn.style.display = 'none';
            fetchOpportunities();
        });

        // Tabs category switching
        categoryTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                categoryTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const cat = tab.getAttribute('data-category');
                
                if (cat === 'saved') {
                    showSavedOnly = true;
                    activeCategory = '';
                } else {
                    showSavedOnly = false;
                    activeCategory = cat;
                }
                
                fetchOpportunities();
            });
        });

        // Sortable headers click listeners
        sortHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const column = header.getAttribute('data-sort');
                
                // Remove active classes from all headers
                sortHeaders.forEach(h => {
                    h.classList.remove('active-sort');
                    const icon = h.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-sort';
                });
                
                if (currentSortColumn === column) {
                    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSortColumn = column;
                    currentSortDirection = 'asc';
                }
                
                header.classList.add('active-sort');
                const icon = header.querySelector('i');
                if (icon) {
                    icon.className = currentSortDirection === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
                }
                
                renderOpportunities(opportunitiesList);
            });
        });

        // Trigger scraper button
        scrapeBtn.addEventListener('click', triggerScraper);

        // Modal triggers
        modalCloseBtn.addEventListener('click', closeDetailsModal);
        
        detailsModal.addEventListener('click', (e) => {
            if (e.target === detailsModal) {
                closeDetailsModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && detailsModal.classList.contains('open')) {
                closeDetailsModal();
            }
        });

        themeToggle.addEventListener('click', toggleTheme);
    }

    // --- Helper Functions ---
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
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    }

    function formatDate(dateString) {
        if (!dateString) return 'Recent';
        try {
            // expected format: YYYY-MM-DD HH:MM:SS
            const parts = dateString.split(' ')[0].split('-');
            if (parts.length !== 3) return dateString;
            
            const date = new Date(
                parseInt(parts[0], 10), 
                parseInt(parts[1], 10) - 1, 
                parseInt(parts[2], 10)
            );
            
            if (isNaN(date.getTime())) return dateString;

            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        } catch (e) {
            return dateString;
        }
    }

    // Format datetime string
    function formatDateTime(dateTimeString) {
        if (!dateTimeString) return 'Unknown';
        try {
            const tParts = dateTimeString.split(' ');
            const dateStr = tParts[0];
            const timeStr = tParts[1] || '';
            
            const dParts = dateStr.split('-');
            const hParts = timeStr.split(':');
            
            const date = new Date(
                parseInt(dParts[0], 10),
                parseInt(dParts[1], 10) - 1,
                parseInt(dParts[2], 10),
                parseInt(hParts[0] || 0, 10),
                parseInt(hParts[1] || 0, 10),
                parseInt(hParts[2] || 0, 10)
            );
            
            if (isNaN(date.getTime())) return dateTimeString;
            
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateTimeString;
        }
    }

    function cleanHtmlText(rawHtml) {
        if (!rawHtml) return '';
        // Replaces paragraphs, headers, breaks with spaces
        let txt = rawHtml.replace(/<\/p>|<br\s*\/?>|<\/h\d>/gi, ' ');
        // Removes all other tags
        txt = txt.replace(/<[^>]*>/g, '');
        // Decodes HTML entities
        const doc = new DOMParser().parseFromString(txt, 'text/html');
        return doc.documentElement.textContent || txt;
    }

    // Escape HTML for safety
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- Init ---
    initTheme();
    setupEventListeners();
    fetchStats();
    fetchOpportunities();
});
