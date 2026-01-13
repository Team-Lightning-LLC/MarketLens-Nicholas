// Research Generation and Progress Management - Multi-Job Support
class ResearchEngine {
  constructor() {
    this.currentJobs = [];
    this.STORAGE_KEY = 'deepresearch_active_jobs';
    this.restoreJobsFromStorage();
  }

  saveJobsState() {
    const jobsState = this.currentJobs.map(job => ({
      capability: job.data.capability,
      framework: job.data.framework,
      scope: job.data.modifiers.scope,
      overviewDetails: job.data.modifiers["Overview Details"],
      analyticalRigor: job.data.modifiers["Analytical Rigor"],
      perspective: job.data.modifiers.perspective,
      startTime: job.startTime,
      // FIX: Persist run IDs for status polling after page refresh
      runId: job.runId || null,
      workflowId: job.workflowId || null
    }));
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(jobsState));
    } catch (error) {
      console.error('Failed to save jobs state:', error);
    }
  }

  loadJobsState() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) return [];
      
      const jobsState = JSON.parse(saved);
      const now = Date.now();
      
      const validJobs = jobsState.filter(job => {
        const elapsed = (now - job.startTime) / 1000;
        return elapsed <= 1800;
      });
      
      return validJobs;
    } catch (error) {
      console.error('Failed to load jobs state:', error);
      this.clearJobsState();
      return [];
    }
  }

  clearJobsState() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear jobs state:', error);
    }
  }

  restoreJobsFromStorage() {
    const savedJobs = this.loadJobsState();
    if (savedJobs.length === 0) return;
    
    savedJobs.forEach(savedJob => {
      const elapsed = (Date.now() - savedJob.startTime) / 1000;
      
      // FIX: Skip jobs older than 30 minutes
      if (elapsed > 1800) {
        console.log('Skipping expired job (>30 min old)');
        return;
      }
      
      const job = {
        data: {
          capability: savedJob.capability,
          framework: savedJob.framework,
          modifiers: {
            scope: savedJob.scope,
            "Overview Details": savedJob.overviewDetails,
            "Analytical Rigor": savedJob.analyticalRigor,
            perspective: savedJob.perspective
          }
        },
        startTime: savedJob.startTime,
        // FIX: Restore run IDs for status polling
        runId: savedJob.runId || null,
        workflowId: savedJob.workflowId || null,
        timers: { 
          statusPoll: null
        }
      };
      
      this.currentJobs.push(job);
      
      // FIX: Resume status polling for all restored jobs
      console.log('Resuming polling for restored job:', {
        runId: job.runId,
        workflowId: job.workflowId,
        elapsed: Math.round(elapsed) + 's'
      });
      
      this.startStatusPolling(job);
    });
    
    this.updateBadge();
  }

  async startResearch(researchData) {
    try {
      const prompt = this.buildResearchPrompt(researchData);
      
      const jobResponse = await vertesiaAPI.executeAsync({
        Task: prompt
      });

      // Log to research history
      this.logResearchHistory(researchData);

      // FIX: Store runId and workflowId for status polling
      const newJob = {
        data: researchData,
        startTime: Date.now(),
        runId: jobResponse.runId || null,
        workflowId: jobResponse.workflowId || null,
        timers: { 
          statusPoll: null
        }
      };

      console.log('Research job started:', {
        runId: newJob.runId,
        workflowId: newJob.workflowId
      });

      this.currentJobs.push(newJob);
      this.saveJobsState();
      this.updateBadge();
      
      // FIX: Start polling run status immediately (every 15 seconds)
      // instead of waiting 5 minutes with a hardcoded timer
      this.startStatusPolling(newJob);

    } catch (error) {
      console.error('Failed to start research:', error);
      alert('Failed to start research generation. Please try again.');
    }
  }

  // FIX: New method to poll actual run status
  startStatusPolling(job) {
    // Poll every 15 seconds
    const POLL_INTERVAL = 15000;
    const MAX_POLL_TIME = 30 * 60 * 1000; // 30 minute max
    
    const startTime = Date.now();
    
    job.timers.statusPoll = setInterval(async () => {
      try {
        // Safety: stop polling after 30 minutes
        if (Date.now() - startTime > MAX_POLL_TIME) {
          console.log('Research job timed out after 30 minutes');
          this.completeJob(job);
          return;
        }

        // If we have workflowId/runId, check actual status
        if (job.workflowId && job.runId) {
          const status = await vertesiaAPI.getRunStatus(job.workflowId, job.runId);
          console.log('Run status:', status);
          
          if (status) {
            // Check for completion states
            const runStatus = status.status || status.state || '';
            const isComplete = ['completed', 'finished', 'done', 'success'].includes(runStatus.toLowerCase());
            const isFailed = ['failed', 'error', 'cancelled'].includes(runStatus.toLowerCase());
            
            if (isComplete || isFailed) {
              console.log(`Research job ${isComplete ? 'completed' : 'failed'}:`, runStatus);
              this.completeJob(job);
              
              // Refresh document library to show new doc
              if (isComplete && window.app) {
                await window.app.refreshDocuments();
              }
              return;
            }
          }
        }
        
        // Fallback: also check for new documents appearing
        await this.checkForNewDocuments();
        
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, POLL_INTERVAL);
  }

  // FIX: Clean job completion
  completeJob(job) {
    const jobIndex = this.currentJobs.indexOf(job);
    if (jobIndex === -1) return;
    
    // Clear timer
    if (job.timers.statusPoll) {
      clearInterval(job.timers.statusPoll);
    }
    
    // Remove job
    this.currentJobs.splice(jobIndex, 1);
    this.saveJobsState();
    this.updateBadge();
    
    console.log('Research job removed from queue');
  }

  // REMOVED: autoDecrementJob - replaced by completeJob

  buildResearchPrompt(data) {
    let prompt = '';
    
    // If this is a follow-up research, add parent document reference
    if (data.parent_document_id) {
      prompt = `FOLLOW-UP RESEARCH REQUEST

First, access and thoroughly analyze Document ID: ${data.parent_document_id} from the content object library. 
Read through this document to understand the key findings, data, themes, and context it provides.

The user wants to explore the following aspects from that document:
${data.context}

Use insights and context from the parent document to inform and enhance the quality of the research topic we are diving into. 
Reference relevant findings from the parent document where appropriate, but create a standalone document that can be read independently.
The singular document you generate MUST contain interactable hyperlinked sources. always include your sources. 
If there are no sources in the singular document, the document is useless. Include interactable, complete sources for the document you create.
Hyperlink the sources. You Must use hyperlinks for the sources of this singular document. Remember to only generate 1 document, not 2,3,4 or 5; just a singular complete document.

`;
    }
    
    // Add standard research structure (or simplified for follow-up)
    if (data.capability && data.framework) {
      prompt += `
Utilize Web Search to develop a singular document utilizing the following structure as the guide to provide users with a valuable research document: 
Analysis Type: ${data.capability}
Framework: ${data.framework}

Utilize this context to gain additional insight into your research topic:
${data.context}
`;
    } else {
      // Follow-up without explicit capability/framework
      prompt += `
Utilize Web Search to develop comprehensive research addressing the user's request above.
`;
    }
    
    prompt += `
The Research Parameters you must follow for this document are:
- Scope: ${data.modifiers.scope}
- Overview Detail: ${data.modifiers["Overview Details"]}
- Analytical Rigor: ${data.modifiers["Analytical Rigor"]}
- Perspective: ${data.modifiers.perspective}

Always capture the most recent and reliable data. The final output must be a document uploaded to the content object library. Please produce a singular document for this research.
    `;
    
    return prompt.trim();
  }

  updateBadge() {
    const badge = document.getElementById('activeJobsBadge');
    if (!badge) return;
    
    if (this.currentJobs.length > 0) {
      badge.innerHTML = `<span class="badge-spinner"></span> (${this.currentJobs.length}) Generating`;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // REMOVED: startJobPolling - replaced by startStatusPolling

  async checkForNewDocuments() {
    try {
      if (window.app) {
        const previousCount = window.app.documents.length;
        await window.app.refreshDocuments();
        const newCount = window.app.documents.length;
        
        if (newCount > previousCount) {
          const docsAdded = newCount - previousCount;
          this.handleNewDocuments(docsAdded);
        }
      }
    } catch (error) {
      console.error('Error checking for documents:', error);
    }
  }

  // FIX: Simplified - now just uses completeJob
  handleNewDocuments(count) {
    for (let i = 0; i < count && this.currentJobs.length > 0; i++) {
      const completedJob = this.currentJobs[0];
      this.completeJob(completedJob);
    }
  }

  logResearchHistory(researchData) {
    console.log('Logging research to history:', researchData);
    
    const historyEntry = {
      timestamp: new Date().toISOString(),
      capability: researchData.capability,
      framework: researchData.framework,
      context: researchData.context,
      modifiers: {
        scope: researchData.modifiers.scope,
        overviewDetails: researchData.modifiers["Overview Details"],
        analyticalRigor: researchData.modifiers["Analytical Rigor"],
        perspective: researchData.modifiers.perspective
      }
    };
    
    // Add parent document reference if this is a follow-up
    if (researchData.parent_document_id) {
      historyEntry.parent_document_id = researchData.parent_document_id;
      historyEntry.is_followup = true;
    }

    try {
      const history = JSON.parse(localStorage.getItem('research_history') || '[]');
      history.push(historyEntry);
      localStorage.setItem('research_history', JSON.stringify(history));
      console.log('Research logged successfully. Total entries:', history.length);
      console.log('Logged entry:', historyEntry);
    } catch (error) {
      console.error('Failed to log research history:', error);
    }
  }

  downloadHistory() {
    console.log('Download history button clicked');
    
    try {
      const history = JSON.parse(localStorage.getItem('research_history') || '[]');
      console.log('History entries found:', history.length);
      console.log('History data:', history);
      
      if (history.length === 0) {
        alert('No research history to download. Submit a research request first.');
        return;
      }

      // Convert to Markdown format
      let markdown = '# Research History\n\n';
      markdown += `Generated: ${new Date().toLocaleString()}\n\n`;
      markdown += '---\n\n';
      
      history.forEach((entry, index) => {
        const timestamp = new Date(entry.timestamp).toLocaleString();
        
        markdown += `## ${index + 1}. ${timestamp}\n\n`;
        markdown += `**Research Type:** ${entry.capability}\n`;
        markdown += `**Framework:** ${entry.framework}\n\n`;
        markdown += `**Context:**\n${entry.context}\n\n`;
        markdown += `**Research Parameters:**\n`;
        markdown += `- Scope: ${entry.modifiers.scope}\n`;
        markdown += `- Overview Details: ${entry.modifiers.overviewDetails}\n`;
        markdown += `- Analytical Rigor: ${entry.modifiers.analyticalRigor}\n`;
        markdown += `- Perspective: ${entry.modifiers.perspective}\n\n`;
        markdown += '---\n\n';
      });
      
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `research-history-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(`Downloaded ${history.length} research entries as Markdown`);
    } catch (error) {
      console.error('Failed to download history:', error);
      alert('Failed to download research history. Check console for details.');
    }
  }
}

const researchEngine = new ResearchEngine();

// History download button
document.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.getElementById('downloadHistory');
  if (downloadBtn) {
    console.log('History download button found, attaching listener');
    downloadBtn.addEventListener('click', () => {
      console.log('History download button clicked');
      researchEngine.downloadHistory();
    });
  } else {
    console.warn('History download button not found in DOM');
  }
});
