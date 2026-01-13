// Vertesia API Wrapper Functions
// Updated: JWT Token Authentication
class VertesiaAPI {
  constructor() {
    this.baseURL = CONFIG.VERTESIA_API_BASE;
    this.apiKey = CONFIG.VERTESIA_API_KEY;
    this.jwtToken = null;
    this.tokenExpiry = null;
  }

  // ===== TOKEN MANAGEMENT =====

  // Fetch JWT token from auth endpoint
  async authenticate() {
    try {
      console.log('Fetching Vertesia JWT token...');
      const response = await fetch(
        `https://api.vertesia.io/auth/token?token=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Auth failed: ${response.status}`);
      }

      const data = await response.json();
      this.jwtToken = data.token;
      // Set expiry 5 minutes before actual expiry (3600s) for safety buffer
      this.tokenExpiry = Date.now() + (3600 - 300) * 1000;
      console.log('JWT token acquired, expires in ~55 minutes');
      return this.jwtToken;
    } catch (error) {
      console.error('Failed to get JWT token:', error);
      throw error;
    }
  }

  // Get valid token (fetch if needed or expired)
  async getToken() {
    if (!this.jwtToken || Date.now() > this.tokenExpiry) {
      await this.authenticate();
    }
    return this.jwtToken;
  }

  // ===== API CALLS =====

  // Generic API call wrapper - NOW USES JWT
  async call(endpoint, options = {}) {
    try {
      const token = await this.getToken();
      const url = `${this.baseURL}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
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

  // Get workflow run status (for polling research generation)
  async getRunStatus(workflowId, runId) {
    try {
      const response = await this.call(`/workflows/runs/${workflowId}/${runId}`);
      return response;
    } catch (error) {
      console.error('Failed to get run status:', error);
      return null;
    }
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
        type: 'conversation',
        interaction: 'DocumentChat',
        data: {
          task: task
        },
        config: {
          environment: CONFIG.ENVIRONMENT_ID,
          model: CONFIG.MODEL
        },
        interactive: true,
        max_iterations: 100
      })
    });
    
    console.log('Chat response:', response);
    console.log('runId:', response.runId);
    console.log('workflowId:', response.workflowId);
    
    return response;
  }

  // Extract clean answer from structured agent response
  extractAnswer(fullMessage) {
    if (!fullMessage) return '';
    
    // Try to extract just the "Agent Answer" section
    const match = fullMessage.match(/\*\*3\.\s*Agent Answer:\*\*\s*([\s\S]*?)(?=\*\*\d+\.|$)/i);
    if (match) {
      return match[1].trim();
    }
    
    // Fallback: try alternative formats
    const altMatch = fullMessage.match(/Agent Answer[:\s]*([\s\S]*?)(?=User Query|Resources Search|$)/i);
    if (altMatch) {
      return altMatch[1].trim();
    }
    
    // If no structured format found, return the full message
    return fullMessage;
  }

  // Stream messages from workflow with abort support - NOW USES JWT
  async streamWorkflowMessages(workflowId, runId, abortSignal, onMessage, onComplete, onError) {
    try {
      const token = await this.getToken();
      const since = Date.now();
      const url = `${this.baseURL}/workflows/runs/${workflowId}/${runId}/stream?since=${since}&access_token=${token}`;
      
      console.log('Opening stream with JWT token');
      
      const response = await fetch(url, {
        signal: abortSignal
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
        buffer = lines.pop();
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data:')) {
            try {
              const jsonStr = line.substring(5).trim();
              const data = JSON.parse(jsonStr);
              
              console.log('Stream message:', data);
              
              if (onMessage) onMessage(data);
              
              // Check for stream end signals
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
        }
      }
      
    } catch (error) {
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
