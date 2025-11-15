/**
 * Filter functions for Placements Manager
 */

/**
 * Load projects and sites for filter dropdowns
 */
async function loadFilterDropdowns() {
    try {
        console.log('Loading filter dropdowns...');

        // Load projects
        const projectsResponse = await fetch('/api/projects', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        console.log('Projects response status:', projectsResponse.status);

        if (projectsResponse.ok) {
            const projectsResult = await projectsResponse.json();
            projects = projectsResult.data || [];

            console.log('Loaded projects:', projects.length, projects);

            const projectFilter = document.getElementById('projectFilter');
            projectFilter.innerHTML = '<option value="">Все проекты</option>';

            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                projectFilter.appendChild(option);
            });

            console.log('Project dropdown populated with', projects.length, 'projects');
        } else {
            console.error('Failed to load projects:', projectsResponse.status, projectsResponse.statusText);
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
        filtered = filtered.filter(p => p.placement_type === activeFilters.type);
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
 */
function applyFilters() {
    // Read filter values
    activeFilters.projectId = document.getElementById('projectFilter').value;
    activeFilters.type = document.getElementById('typeFilter').value;
    activeFilters.dateFrom = document.getElementById('dateFrom').value;
    activeFilters.dateTo = document.getElementById('dateTo').value;

    // Re-render current tab with filters
    const activeTab = document.querySelector('.nav-link.active').getAttribute('data-bs-target');

    if (activeTab === '#active') {
        const filtered = applyPlacementFilters(allActivePlacements);
        renderActivePlacements(filtered);
    } else if (activeTab === '#scheduled') {
        const filtered = applyPlacementFilters(allScheduledPlacements);
        renderScheduledPlacements(filtered);
    } else if (activeTab === '#history') {
        loadHistoryPlacements(); // History has its own filters
    }
}

/**
 * Reset all filters
 */
function resetFilters() {
    document.getElementById('projectFilter').value = '';
    document.getElementById('typeFilter').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';

    activeFilters = {
        projectId: '',
        type: '',
        dateFrom: '',
        dateTo: ''
    };

    applyFilters();
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
