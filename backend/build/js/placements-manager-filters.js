/**
 * Filter functions for Placements Manager
 */

/**
 * Load projects and sites for filter dropdowns
 * Restores saved project selection from localStorage
 */
async function loadFilterDropdowns() {
    try {
        // Load projects
        const projectsResponse = await fetch('/api/projects', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (projectsResponse.ok) {
            const projectsResult = await projectsResponse.json();

            // API returns array directly OR {data: array}
            projects = Array.isArray(projectsResult) ? projectsResult : (projectsResult.data || []);

            const projectFilter = document.getElementById('projectFilter');
            projectFilter.innerHTML = '<option value="">Все проекты</option>';

            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                projectFilter.appendChild(option);
            });

            // Restore saved project from localStorage (if not already set by URL param)
            if (!activeFilters.projectId) {
                const savedProjectId = localStorage.getItem('selectedProjectId');
                if (savedProjectId && projects.some(p => p.id == savedProjectId)) {
                    projectFilter.value = savedProjectId;
                    activeFilters.projectId = savedProjectId;
                }
            }
        }

    } catch (error) {
        console.error('Failed to load filter dropdowns:', error);
    }
}

/**
 * Apply filters to placements array
 */
function applyPlacementFilters(placements) {
    let filtered = [...placements];

    // Filter by project
    if (activeFilters.projectId) {
        filtered = filtered.filter(p => p.project_id == activeFilters.projectId);
    }

    // Filter by type
    if (activeFilters.type) {
        filtered = filtered.filter(p => p.type === activeFilters.type);
    }

    // Filter by date range
    if (activeFilters.dateFrom) {
        const fromDate = new Date(activeFilters.dateFrom);
        filtered = filtered.filter(p => {
            const placementDate = new Date(p.purchase_date || p.created_at);
            return placementDate >= fromDate;
        });
    }

    if (activeFilters.dateTo) {
        const toDate = new Date(activeFilters.dateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        filtered = filtered.filter(p => {
            const placementDate = new Date(p.purchase_date || p.created_at);
            return placementDate <= toDate;
        });
    }

    // Update filter status display
    updateFilterStatus(filtered.length, placements.length);

    return filtered;
}

/**
 * Apply filters from UI
 * Saves selected project to localStorage and reloads data from server
 */
function applyFilters() {
    // Read filter values
    const newProjectId = document.getElementById('projectFilter').value;
    activeFilters.type = document.getElementById('typeFilter').value;
    activeFilters.dateFrom = document.getElementById('dateFrom').value;
    activeFilters.dateTo = document.getElementById('dateTo').value;

    // Check if project changed - need to reload from server
    const projectChanged = activeFilters.projectId !== newProjectId;
    activeFilters.projectId = newProjectId;

    // Save selected project to localStorage
    if (activeFilters.projectId) {
        localStorage.setItem('selectedProjectId', activeFilters.projectId);
    } else {
        localStorage.removeItem('selectedProjectId');
    }

    // Re-render current tab with filters
    const activePane = document.querySelector('.tab-pane.active');
    const activeTab = activePane ? '#' + activePane.id : '#active';

    if (activeTab === '#active') {
        if (projectChanged) {
            // Project changed - reload from server with new project_id
            loadActivePlacements();
        } else {
            // Only other filters changed - apply locally
            const filtered = applyPlacementFilters(allActivePlacements);
            renderActivePlacements(filtered);
        }
    } else if (activeTab === '#scheduled') {
        if (projectChanged) {
            // Project changed - reload from server with new project_id
            loadScheduledPlacements();
        } else {
            // Only other filters changed - apply locally
            const filtered = applyPlacementFilters(allScheduledPlacements);
            renderScheduledPlacements(filtered);
        }
    } else if (activeTab === '#history') {
        loadHistoryPlacements(); // History has its own filters
    }

    // Update tab counts when project changes
    if (projectChanged) {
        updateTabCounts();
    }
}

/**
 * Reset all filters
 * Clears localStorage saved project and reloads all data
 */
function resetFilters() {
    document.getElementById('projectFilter').value = '';
    document.getElementById('typeFilter').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';

    // Clear saved project from localStorage
    localStorage.removeItem('selectedProjectId');

    activeFilters = {
        projectId: '',
        type: '',
        dateFrom: '',
        dateTo: ''
    };

    // Reload data from server (will load all projects since projectId is empty)
    const activePane = document.querySelector('.tab-pane.active');
    const activeTab = activePane ? '#' + activePane.id : '#active';

    if (activeTab === '#active') {
        loadActivePlacements();
    } else if (activeTab === '#scheduled') {
        loadScheduledPlacements();
    } else if (activeTab === '#history') {
        loadHistoryPlacements();
    }

    updateTabCounts();
}

/**
 * Update filter status display
 */
function updateFilterStatus(filteredCount, totalCount) {
    const statusEl = document.getElementById('filterStatus');
    const resetBtn = document.getElementById('resetFiltersBtn');

    const hasFilters = activeFilters.projectId || activeFilters.type ||
                       activeFilters.dateFrom || activeFilters.dateTo;

    // Show/hide reset button based on active filters
    if (resetBtn) {
        resetBtn.style.display = hasFilters ? 'inline-block' : 'none';
    }

    // Update status text
    if (statusEl) {
        if (hasFilters && filteredCount !== totalCount) {
            statusEl.textContent = `Показано ${filteredCount} из ${totalCount} размещений`;
            statusEl.className = 'text-muted ms-3 fw-bold';
        } else {
            statusEl.textContent = '';
        }
    }
}
