/**
 * Redis Queue Management Module
 * Handles batch processing for placements with progress monitoring
 */
window.QueueModule = {

    // Job monitoring variables
    currentJobId: null,
    progressInterval: null,

    // Initialize queue module
    init() {
        console.log('Queue module initialized');
    },

    // Toggle between single and batch mode
    toggleBatchMode() {
        try {
            const batchModeElement = document.getElementById('batchModeToggle');
            const singleSection = document.getElementById('singleSiteSection');
            const batchSection = document.getElementById('batchSiteSection');
            const modalTitle = document.getElementById('placementModalTitle');
            const createBtn = document.getElementById('createPlacementBtn');
            
            // Validate all elements exist
            if (!batchModeElement || !singleSection || !batchSection || !modalTitle || !createBtn) {
                console.warn('toggleBatchMode: Some modal elements not found, skipping');
                return;
            }
            
            const batchMode = batchModeElement.checked;
            
            if (batchMode) {
                singleSection.style.display = 'none';
                batchSection.style.display = 'block';
                modalTitle.textContent = 'Create Batch Link Placement';
                createBtn.textContent = 'Create Batch Placement';
                this.updateSelectedSiteCount();
            } else {
                singleSection.style.display = 'block';
                batchSection.style.display = 'none';
                modalTitle.textContent = 'Create New Link Placement';
                createBtn.textContent = 'Create Placement';
            }
        } catch (error) {
            console.error('Error in toggleBatchMode:', error);
            if (window.AppUtils && window.AppUtils.updateDebugInfo) {
                window.AppUtils.updateDebugInfo(`Error in toggleBatchMode: ${error.message}`);
            }
        }
    },

    // Update selected site count in batch mode
    updateSelectedSiteCount() {
        try {
            const checkboxes = document.querySelectorAll('input[name="batchSites"]:checked');
            const count = checkboxes.length;
            const countSpan = document.getElementById('selectedSiteCount');
            const warning = document.getElementById('batchWarning');
            
            if (countSpan) {
                countSpan.textContent = `${count} sites selected`;
                countSpan.style.color = count >= 5 ? '#059669' : '#dc2626';
            }
            
            if (warning) {
                if (count > 0 && count < 5) {
                    warning.style.display = 'block';
                } else {
                    warning.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error in updateSelectedSiteCount:', error);
        }
    },

    // Select all sites in batch mode
    selectAllSites() {
        const checkboxes = document.querySelectorAll('input[name="batchSites"]');
        checkboxes.forEach(cb => cb.checked = true);
        this.updateSelectedSiteCount();
    },

    // Deselect all sites in batch mode
    deselectAllSites() {
        const checkboxes = document.querySelectorAll('input[name="batchSites"]');
        checkboxes.forEach(cb => cb.checked = false);
        this.updateSelectedSiteCount();
    },

    // Create batch placement with queue processing
    async createBatchPlacement(projectId, siteIds, selectedLinks, selectedArticles) {
        // Show progress UI
        const progressElement = document.getElementById('batchProgress');
        const createBtn = document.getElementById('createPlacementBtn');
        const statusElement = document.getElementById('batchStatus');
        
        if (progressElement) {
            progressElement.style.display = 'block';
        }
        
        if (createBtn) {
            createBtn.disabled = true;
        }
        
        if (statusElement) {
            statusElement.textContent = 'Sending batch request...';
        }
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${window.API_URL || ''}/api/placements/batch/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    projectId: parseInt(projectId),
                    siteIds: siteIds.map(id => parseInt(id)),
                    selectedLinks: selectedLinks || [],
                    selectedArticles: selectedArticles || []
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Batch job started successfully
                const { jobId, queueName, priority, details } = data;
                this.currentJobId = jobId;
                
                if (statusElement) {
                    statusElement.textContent = `Batch job started (ID: ${jobId}) - Processing ${details.siteCount} sites...`;
                }
                
                // Start monitoring the job
                await this.monitorBatchJob(queueName, jobId);
                
                return data;
            } else {
                throw new Error(data.error || 'Batch placement failed');
            }
        } catch (error) {
            console.error('Batch placement error:', error);
            
            if (statusElement) {
                statusElement.textContent = `Error: ${error.message}`;
            }
            
            if (createBtn) {
                createBtn.disabled = false;
            }
            
            throw error;
        }
    },

    // Monitor batch job progress
    async monitorBatchJob(queueName, jobId) {
        this.progressInterval = setInterval(async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${window.API_URL || ''}/api/queue/jobs/${queueName}/${jobId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const jobData = await response.json();
                
                if (response.ok) {
                    const { status, progress, data: jobResults } = jobData;
                    
                    // Update progress bar
                    const progressPercent = progress || 0;
                    const progressFill = document.getElementById('batchProgressFill');
                    if (progressFill) {
                        progressFill.style.width = `${progressPercent}%`;
                    }
                    
                    // Update status
                    let statusText = `Status: ${status}`;
                    if (progressPercent > 0) {
                        statusText += ` (${progressPercent}% complete)`;
                    }
                    
                    const statusElement = document.getElementById('batchStatus');
                    if (statusElement) {
                        statusElement.textContent = statusText;
                    }
                    
                    // Check if job is complete
                    if (status === 'completed') {
                        clearInterval(this.progressInterval);
                        this.progressInterval = null;
                        
                        // Show results
                        const results = jobResults || {};
                        if (statusElement) {
                            statusElement.innerHTML = `
                                ✅ <strong>Batch placement completed!</strong><br>
                                Sites processed: ${results.processed || 0}<br>
                                Successful: ${results.successful || 0}<br>
                                Failed: ${results.failed || 0}
                            `;
                        }
                        
                        // Auto-close modal and refresh
                        setTimeout(() => {
                            if (window.PlacementsModule && window.PlacementsModule.closePlacementModal) {
                                window.PlacementsModule.closePlacementModal();
                            }
                            
                            if (window.ProjectsModule && window.ProjectsModule.load) {
                                window.ProjectsModule.load(); // Refresh projects list
                            }
                        }, 3000);
                        
                    } else if (status === 'failed') {
                        clearInterval(this.progressInterval);
                        this.progressInterval = null;
                        
                        if (statusElement) {
                            statusElement.textContent = `❌ Job failed: ${jobResults?.error || 'Unknown error'}`;
                        }
                        
                        const createBtn = document.getElementById('createPlacementBtn');
                        if (createBtn) {
                            createBtn.disabled = false;
                        }
                    }
                }
            } catch (error) {
                console.error('Error monitoring job:', error);
                this.stopMonitoring();
                
                const statusElement = document.getElementById('batchStatus');
                if (statusElement) {
                    statusElement.textContent = `Error monitoring job: ${error.message}`;
                }
                
                const createBtn = document.getElementById('createPlacementBtn');
                if (createBtn) {
                    createBtn.disabled = false;
                }
            }
        }, 2000); // Check every 2 seconds
    },

    // Cancel batch job
    async cancelBatchJob() {
        if (!this.currentJobId || !this.progressInterval) return;
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${window.API_URL || ''}/api/queue/jobs/placement/${this.currentJobId}/cancel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                this.stopMonitoring();
                
                const statusElement = document.getElementById('batchStatus');
                if (statusElement) {
                    statusElement.textContent = 'Job cancelled';
                }
                
                const createBtn = document.getElementById('createPlacementBtn');
                if (createBtn) {
                    createBtn.disabled = false;
                }
                
                if (window.NotificationsComponent) {
                    window.NotificationsComponent.warning('Batch job cancelled');
                }
            }
        } catch (error) {
            console.error('Error cancelling job:', error);
            
            if (window.NotificationsComponent) {
                window.NotificationsComponent.error(`Error cancelling job: ${error.message}`);
            }
        }
    },

    // Stop monitoring (cleanup)
    stopMonitoring() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        this.currentJobId = null;
    },

    // Get job status
    async getJobStatus(queueName, jobId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${window.API_URL || ''}/api/queue/jobs/${queueName}/${jobId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                return await response.json();
            }
            
            throw new Error(`Failed to get job status: ${response.statusText}`);
        } catch (error) {
            console.error('Error getting job status:', error);
            throw error;
        }
    },

    // List queue jobs
    async listJobs(queueName = 'placement') {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${window.API_URL || ''}/api/queue/jobs/${queueName}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                return await response.json();
            }
            
            throw new Error(`Failed to list jobs: ${response.statusText}`);
        } catch (error) {
            console.error('Error listing jobs:', error);
            throw error;
        }
    },

    // Check if batch mode is active
    isBatchMode() {
        const batchModeElement = document.getElementById('batchModeToggle');
        return batchModeElement ? batchModeElement.checked : false;
    },

    // Get selected sites in batch mode
    getSelectedSites() {
        const checkboxes = document.querySelectorAll('input[name="batchSites"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    },

    // Validate batch selection
    validateBatchSelection() {
        const selectedSites = this.getSelectedSites();
        
        if (selectedSites.length < 5) {
            if (window.NotificationsComponent) {
                window.NotificationsComponent.warning('Batch mode requires at least 5 sites selected');
            }
            return false;
        }
        
        return true;
    },

    // Reset batch UI
    resetBatchUI() {
        this.stopMonitoring();
        
        const progressElement = document.getElementById('batchProgress');
        if (progressElement) {
            progressElement.style.display = 'none';
        }
        
        const progressFill = document.getElementById('batchProgressFill');
        if (progressFill) {
            progressFill.style.width = '0%';
        }
        
        const statusElement = document.getElementById('batchStatus');
        if (statusElement) {
            statusElement.textContent = 'Initializing...';
        }
        
        const createBtn = document.getElementById('createPlacementBtn');
        if (createBtn) {
            createBtn.disabled = false;
        }
    },

    // Show queue statistics (for monitoring dashboard)
    async showQueueStats() {
        try {
            const jobs = await this.listJobs();
            const stats = {
                total: jobs.length,
                active: jobs.filter(j => j.status === 'active').length,
                completed: jobs.filter(j => j.status === 'completed').length,
                failed: jobs.filter(j => j.status === 'failed').length,
                waiting: jobs.filter(j => j.status === 'waiting').length
            };
            
            console.log('Queue Statistics:', stats);
            return stats;
        } catch (error) {
            console.error('Error getting queue stats:', error);
            return null;
        }
    }
};

// Global functions for backward compatibility
window.toggleBatchMode = () => {
    return window.QueueModule.toggleBatchMode();
};

window.updateSelectedSiteCount = () => {
    return window.QueueModule.updateSelectedSiteCount();
};

window.selectAllSites = () => {
    return window.QueueModule.selectAllSites();
};

window.deselectAllSites = () => {
    return window.QueueModule.deselectAllSites();
};

window.monitorBatchJob = (queueName, jobId) => {
    return window.QueueModule.monitorBatchJob(queueName, jobId);
};

window.cancelBatchJob = () => {
    return window.QueueModule.cancelBatchJob();
};

// Initialize queue module when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.QueueModule.init();
});