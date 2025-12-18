// Collections System v3 - Vertesia API Integration
// Now syncs with server instead of localStorage

class CollectionsManager {
  constructor(app) {
    this.app = app;
    this.collections = [];
    this.collectionMembers = {}; // Cache: collectionId -> [docIds]
    this.selectedCollections = new Set();
    this.sortMode = 'most';
    
    this.init();
  }

  async init() {
    await this.loadCollections();
    this.renderCollections();
    this.setupEventListeners();
    console.log('Collections v3 (API) initialized');
  }

  // ===== API METHODS =====

  async apiCall(endpoint, options = {}) {
    const url = `${CONFIG.VERTESIA_API_BASE}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CONFIG.VERTESIA_API_KEY}`,
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
  }

  // Load all collections from Vertesia
  async loadCollections() {
    try {
      console.log('Loading collections from API...');
      
      // Search for all static collections
      const collections = await this.apiCall('/collections/search', {
        method: 'POST',
        body: JSON.stringify({
          dynamic: false,
          status: 'active',
          limit: 100
        })
      });

      this.collections = (collections || []).map(c => ({
        id: c.id,
        name: c.name,
        description: c.description || '',
        created_at: c.created_at
      }));

      console.log(`Loaded ${this.collections.length} collections`);

      // Load members for each collection
      await this.loadAllCollectionMembers();

    } catch (error) {
      console.error('Failed to load collections:', error);
      this.collections = [];
    }
  }

  // Load members for all collections
  async loadAllCollectionMembers() {
    this.collectionMembers = {};
    
    for (const collection of this.collections) {
      try {
        const members = await this.apiCall(`/collections/${collection.id}/members?limit=1000`);
        this.collectionMembers[collection.id] = (members || []).map(m => m.id);
      } catch (error) {
        console.error(`Failed to load members for collection ${collection.id}:`, error);
        this.collectionMembers[collection.id] = [];
      }
    }
  }

  // Get document count for a collection
  getDocumentCount(collectionId) {
    return (this.collectionMembers[collectionId] || []).length;
  }

  // Check if document is in collection
  isDocumentInCollection(docId, collectionId) {
    return (this.collectionMembers[collectionId] || []).includes(docId);
  }

  // ===== EVENT LISTENERS =====

  setupEventListeners() {
    // Sort buttons
    const sortButtons = document.querySelectorAll('.sort-btn');
    sortButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.sort;
        this.setSortMode(mode);
      });
    });

    // Collection list (event delegation)
    const list = document.getElementById('collectionsList');
    list?.addEventListener('click', (e) => {
      const item = e.target.closest('.collection-item');
      if (!item) return;

      const deleteBtn = e.target.closest('.btn-delete-collection');
      const collectionId = item.dataset.collectionId;

      if (deleteBtn && collectionId !== '__create__') {
        e.stopPropagation();
        this.deleteCollection(collectionId);
      } else if (collectionId === '__create__') {
        this.createCollection();
      } else {
        this.toggleSelection(collectionId);
      }
    });
  }

  // ===== SORTING =====

  setSortMode(mode) {
    this.sortMode = mode;
    
    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sort === mode);
    });
    
    this.renderCollections();
  }

  getSortedCollections() {
    const sorted = [...this.collections];
    
    switch (this.sortMode) {
      case 'most':
        return sorted.sort((a, b) => this.getDocumentCount(b.id) - this.getDocumentCount(a.id));
      case 'least':
        return sorted.sort((a, b) => this.getDocumentCount(a.id) - this.getDocumentCount(b.id));
      case 'alphabetical':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return sorted;
    }
  }

  // ===== RENDERING =====

  renderCollections() {
    const list = document.getElementById('collectionsList');
    if (!list) return;

    // "Create New Collection" - always first
    const createHtml = `
      <div class="collection-item collection-item-create" data-collection-id="__create__">
        <div class="create-icon">+</div>
        <div class="collection-info">
          <div class="collection-name">Create New Collection</div>
        </div>
      </div>
    `;

    // Sorted user collections
    const sortedCollections = this.getSortedCollections();
    const userHtml = sortedCollections.map(c => {
      const selected = this.selectedCollections.has(c.id);
      const count = this.getDocumentCount(c.id);
      return `
        <div class="collection-item ${selected ? 'selected' : ''}" data-collection-id="${c.id}">
          <div class="collection-checkbox">
            <input type="checkbox" ${selected ? 'checked' : ''} readonly>
          </div>
          <div class="collection-info">
            <div class="collection-name">${c.name}</div>
            <div class="collection-count">${count}</div>
          </div>
          <button class="btn-delete-collection" title="Delete">×</button>
        </div>
      `;
    }).join('');

    list.innerHTML = createHtml + userHtml;
  }

  // ===== SELECTION =====

  toggleSelection(collectionId) {
    if (this.selectedCollections.has(collectionId)) {
      this.selectedCollections.delete(collectionId);
    } else {
      this.selectedCollections.add(collectionId);
    }

    this.renderCollections();
    this.app.filterAndRenderDocuments();
  }

  // Check if document should be shown based on selected collections
  shouldShowDocument(docId) {
    if (this.selectedCollections.size === 0) {
      return true;
    }

    for (const collectionId of this.selectedCollections) {
      if (this.isDocumentInCollection(docId, collectionId)) {
        return true;
      }
    }

    return false;
  }

  // ===== CRUD OPERATIONS =====

  async createCollection() {
    const name = prompt('Collection name:');
    if (!name || !name.trim()) return;

    try {
      console.log('Creating collection:', name);
      
      const newCollection = await this.apiCall('/collections', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          dynamic: false,
          description: `Created from MarketLens on ${new Date().toLocaleDateString()}`
        })
      });

      console.log('Collection created:', newCollection);

      // Add to local list
      this.collections.push({
        id: newCollection.id,
        name: newCollection.name,
        description: newCollection.description || '',
        created_at: newCollection.created_at
      });
      this.collectionMembers[newCollection.id] = [];

      this.renderCollections();

    } catch (error) {
      console.error('Failed to create collection:', error);
      alert('Failed to create collection. Please try again.');
    }
  }

  async deleteCollection(collectionId) {
    if (!confirm('Delete this collection? Documents will not be deleted.')) return;

    try {
      console.log('Deleting collection:', collectionId);
      
      await this.apiCall(`/collections/${collectionId}`, {
        method: 'DELETE'
      });

      // Remove from local list
      this.collections = this.collections.filter(c => c.id !== collectionId);
      delete this.collectionMembers[collectionId];
      this.selectedCollections.delete(collectionId);

      this.renderCollections();
      this.app.filterAndRenderDocuments();

    } catch (error) {
      console.error('Failed to delete collection:', error);
      alert('Failed to delete collection. Please try again.');
    }
  }

  // Add document to collection
  async addDocumentToCollection(docId, collectionId) {
    try {
      console.log(`Adding document ${docId} to collection ${collectionId}`);
      
      await this.apiCall(`/collections/${collectionId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          members: [docId]
        })
      });

      // Update local cache
      if (!this.collectionMembers[collectionId]) {
        this.collectionMembers[collectionId] = [];
      }
      if (!this.collectionMembers[collectionId].includes(docId)) {
        this.collectionMembers[collectionId].push(docId);
      }

      return true;
    } catch (error) {
      console.error('Failed to add document to collection:', error);
      return false;
    }
  }

  // Remove document from collection
  async removeDocumentFromCollection(docId, collectionId) {
    try {
      console.log(`Removing document ${docId} from collection ${collectionId}`);
      
      await this.apiCall(`/collections/${collectionId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'delete',
          members: [docId]
        })
      });

      // Update local cache
      if (this.collectionMembers[collectionId]) {
        this.collectionMembers[collectionId] = this.collectionMembers[collectionId].filter(id => id !== docId);
      }

      return true;
    } catch (error) {
      console.error('Failed to remove document from collection:', error);
      return false;
    }
  }

  // Modal for adding documents to collections
  showAddToCollectionModal(documentId) {
    if (this.collections.length === 0) {
      alert('Create a collection first!');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'collection-modal show';
    modal.innerHTML = `
      <div class="collection-modal-content">
        <div class="collection-modal-header">Add to Collections</div>
        <div class="collection-modal-list">
          ${this.collections.map(c => {
            const checked = this.isDocumentInCollection(documentId, c.id);
            return `
              <label class="collection-checkbox-item">
                <input type="checkbox" value="${c.id}" ${checked ? 'checked' : ''} data-was-checked="${checked}">
                <span>${c.name}</span>
              </label>
            `;
          }).join('')}
        </div>
        <div class="collection-modal-footer">
          <button class="btn-modal-cancel">Cancel</button>
          <button class="btn-modal-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    
    modal.querySelector('.btn-modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    modal.querySelector('.btn-modal-save').addEventListener('click', async () => {
      const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
      const saveBtn = modal.querySelector('.btn-modal-save');
      
      // Disable button during save
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      
      for (const cb of checkboxes) {
        const collectionId = cb.value;
        const wasChecked = cb.dataset.wasChecked === 'true';
        const isChecked = cb.checked;
        
        // Only make API calls for changes
        if (isChecked && !wasChecked) {
          await this.addDocumentToCollection(documentId, collectionId);
        } else if (!isChecked && wasChecked) {
          await this.removeDocumentFromCollection(documentId, collectionId);
        }
      }

      this.renderCollections();
      this.app.filterAndRenderDocuments();
      close();
    });
  }

  // Get selected collection names for header
  getSelectedNames() {
    if (this.selectedCollections.size === 0) {
      return 'All Documents';
    }

    const names = Array.from(this.selectedCollections).map(id => {
      const c = this.collections.find(col => col.id === id);
      return c ? c.name : '';
    }).filter(Boolean);

    return names.join(' + ');
  }

  // Get collections a document belongs to (for display)
  getDocumentCollections(docId) {
    return this.collections.filter(c => 
      this.isDocumentInCollection(docId, c.id)
    );
  }
}

window.CollectionsManager = CollectionsManager;
