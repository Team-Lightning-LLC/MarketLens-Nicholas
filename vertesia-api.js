// Vertesia API Wrapper Functions
class VertesiaAPI {
  constructor() {
    this.baseURL = CONFIG.VERTESIA_API_BASE;
    this.apiKey = CONFIG.VERTESIA_API_KEY;
  }

  // Generic API call wrapper
  async call(endpoint, options = {}) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Vertesia API call failed for ${endpoint}:`, error);
      throw error;
    }
  }

  // Load all objects with optional filtering
  async loadAllObjects(limit = 1000) {
    const response = await this.call(`/objects?limit=${limit}&offset=0`);
    return response;
  }

  // Get single object by ID
  async getObject(objectId) {
    return await this.call(`/objects/${objectId}`);
  }

  // Create new object record
  async createObject(objectData) {
    return await this.call('/objects', {
      method: 'POST',
      body: JSON.stringify(objectData)
    });
  }

  // Delete object
  async deleteObject(objectId) {
    await this.call(`/objects/${objectId}`, {
      method: 'DELETE'
    });
  }

  // Execute async interaction (research generation)
  async executeAsync(interactionData) {
    return await this.call('/execute/async', {
      method: 'POST',
      body: JSON.stringify({
        type: 'conversation',
        interaction: CONFIG.INTERACTION_NAME,
        data: interactionData,
        config: {
          environment: CONFIG.ENVIRONMENT_ID,
          model: CONFIG.MODEL
        }
      })
    });
  }

  // Get job status (for polling)
  async getJobStatus(jobId) {
    return await this.call(`/jobs/${jobId}`);
  }

  // Get download URL for file
  async getDownloadUrl(fileSource) {
    return await this.call('/objects/download-url', {
      method: 'POST',
      body: JSON.stringify({ 
        file: fileSource,
        format: 'original'
      })
    });
  }

  // Get file content as text
  async getFileContent(fileSource) {
    try {
      const downloadData = await this.getDownloadUrl(fileSource);
      const response = await fetch(downloadData.url);
      
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      
      return await response.text();
    } catch (error) {
      console.error('Failed to get file content:', error);
      throw error;
    }
  }

  // Store markdown content as object
  async storeMarkdownDocument(title, content, metadata = {}) {
    const objectData = {
      name: title,
      description: `Research document: ${title}`,
      content: {
        source: content,
        type: 'text/markdown',
        name: title
      },
      properties: {
        document_type: 'research',
        generated_at: new Date().toISOString(),
        ...metadata
      }
    };

    return await this.createObject(objectData);
  }

  // Chat with document - Conversation type (agent with state)
  async chatWithDocument(data) {
    console.log('Starting document chat with:', data);
    
    // Format as task string (DocumentChat interaction expects this)
    let task = `Document ID: ${data.document_id}\n\n`;
    
    // Include conversation history if provided
    if (data.conversation_history && data.conversation_history.trim()) {
      task += `Previous conversation:\n${data.conversation_history}\n\n`;
    }
    
    task += `Current question: ${data.question}`;
    
    console.log('Formatted task:', task);
    
    const response = await this.call('/execute/async', {
      method: 'POST',
      body: JSON.stringify({
        type: 'conversation',  // Agent with conversation state
        interaction: 'DocumentChat',
        data: {
          task: task  // DocumentChat expects 'task' property
        },
        config: {
          environment: CONFIG.ENVIRONMENT_ID,
          model: CONFIG.MODEL
        }
      })
    });
    
    console.log('Chat response:', response);
    console.log('runId:', response.runId);
    console.log('workflowId:', response.workflowId);
    
    return response;
  }

  // Stream messages from workflow with abort support
  async streamWorkflowMessages(workflowId, runId, abortSignal, onMessage, onComplete, onError) {
    try {
      const since = Date.now();
      const url = `${this.baseURL}/workflows/runs/${workflowId}/${runId}/stream?since=${since}&access_token=${this.apiKey}`;
      
      console.log('Opening stream:', url);
      
      const response = await fetch(url, {
        signal: abortSignal  // Support for abort controller
      });
      
      if (!response.ok) {
        throw new Error(`Stream failed: ${response.status} ${response.statusText}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream ended naturally');
          if (onComplete) onComplete();
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          // Server-Sent Events format: lines start with "data:", "event:", "id:", etc.
          if (line.startsWith('data:')) {
            try {
              // Strip "data:" prefix and parse JSON
              const jsonStr = line.substring(5).trim();
              const data = JSON.parse(jsonStr);
              
              console.log('Stream message:', data);
              
              // Pass message to handler
              if (onMessage) onMessage(data);
              
              // Check for stream end signals (but NOT type: "complete" - that contains the answer!)
              if (data.type === 'finish' || 
                  data.message === 'stream_end' ||
                  data.finish_reason === 'stop') {
                console.log('Stream end signal received');
                if (onComplete) onComplete();
                return;
              }
              
            } catch (e) {
              console.warn('Failed to parse SSE data line:', line, e);
            }
          }
          // Ignore other SSE fields (event:, id:, retry:, etc.)
        }
      }
      
    } catch (error) {
      // AbortError is expected when user closes viewer
      if (error.name === 'AbortError') {
        console.log('Stream aborted intentionally');
        return;
      }
      
      console.error('Streaming error:', error);
      if (onError) onError(error);
    }
  }
}

// Create global instance
const vertesiaAPI = new VertesiaAPI();
