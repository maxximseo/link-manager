/**
 * Editor component - Quill editor wrapper and utilities
 */

window.EditorComponent = {
    
    // Quill editor instances
    editors: {},
    
    // Default Quill configuration
    defaultConfig: {
        theme: 'snow',
        placeholder: 'Write your content here...',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'script': 'sub'}, { 'script': 'super' }],
                [{ 'indent': '-1'}, { 'indent': '+1' }],
                [{ 'direction': 'rtl' }],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'align': [] }],
                ['link', 'image', 'video'],
                ['clean']
            ]
        }
    },
    
    // Initialize Quill editor
    initEditor(containerId, config = {}) {
        try {
            if (typeof Quill === 'undefined') {
                console.warn('Quill library not loaded, using textarea fallback');
                return this.createTextareaFallback(containerId);
            }
            
            const editorConfig = { ...this.defaultConfig, ...config };
            const editor = new Quill(`#${containerId}`, editorConfig);
            
            this.editors[containerId] = editor;
            
            // Add custom event handlers
            editor.on('text-change', () => {
                this.onContentChange(containerId, editor);
            });
            
            console.log(`✅ Quill editor initialized: ${containerId}`);
            return editor;
            
        } catch (error) {
            console.error(`Editor initialization error for ${containerId}:`, error);
            return this.createTextareaFallback(containerId);
        }
    },
    
    // Fallback textarea when Quill unavailable
    createTextareaFallback(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return null;
        
        const textarea = document.createElement('textarea');
        textarea.className = 'form-control';
        textarea.rows = 10;
        textarea.placeholder = 'Write your content here...';
        
        container.innerHTML = '';
        container.appendChild(textarea);
        
        console.log(`✅ Textarea fallback created: ${containerId}`);
        return {
            getContents: () => ({ ops: [{ insert: textarea.value }] }),
            setContents: (content) => { textarea.value = content; },
            root: textarea
        };
    },
    
    // Get editor content
    getEditorContent(containerId) {
        const editor = this.editors[containerId];
        if (!editor) {
            console.warn(`Editor ${containerId} not found`);
            return '';
        }
        
        return editor.root.innerHTML || '';
    },
    
    // Set editor content
    setEditorContent(containerId, content) {
        const editor = this.editors[containerId];
        if (!editor) {
            console.warn(`Editor ${containerId} not found`);
            return;
        }
        
        try {
            if (typeof content === 'string') {
                editor.root.innerHTML = content;
            } else {
                editor.setContents(content);
            }
        } catch (error) {
            console.error(`Error setting content for ${containerId}:`, error);
        }
    },
    
    // Clear editor content
    clearEditor(containerId) {
        const editor = this.editors[containerId];
        if (editor) {
            editor.setContents([]);
        }
    },
    
    // Content change handler
    onContentChange(containerId, editor) {
        const content = editor.getContents();
        const length = editor.getLength();
        
        // Trigger custom event for modules to listen
        window.dispatchEvent(new CustomEvent('editorContentChange', {
            detail: { containerId, content, length }
        }));
    },
    
    // Get plain text from editor
    getPlainText(containerId) {
        const editor = this.editors[containerId];
        if (!editor) return '';
        
        return editor.getText() || '';
    },
    
    // Get word count
    getWordCount(containerId) {
        const text = this.getPlainText(containerId);
        return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
    },
    
    // Enable/disable editor
    setEditorEnabled(containerId, enabled) {
        const editor = this.editors[containerId];
        if (editor) {
            editor.enable(enabled);
        }
    },
    
    // Destroy editor instance
    destroyEditor(containerId) {
        const editor = this.editors[containerId];
        if (editor) {
            delete this.editors[containerId];
            console.log(`Editor ${containerId} destroyed`);
        }
    },
    
    // Initialize all editors on page
    initAllEditors() {
        const editorContainers = document.querySelectorAll('.quill-editor');
        editorContainers.forEach(container => {
            const id = container.id;
            if (id && !this.editors[id]) {
                this.initEditor(id);
            }
        });
    }
    
};

// Global exports for compatibility
window.initEditor = (containerId, config) => window.EditorComponent.initEditor(containerId, config);
window.getEditorContent = (containerId) => window.EditorComponent.getEditorContent(containerId);
window.setEditorContent = (containerId, content) => window.EditorComponent.setEditorContent(containerId, content);
window.clearEditor = (containerId) => window.EditorComponent.clearEditor(containerId);
window.getWordCount = (containerId) => window.EditorComponent.getWordCount(containerId);

// Auto-initialize editors when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.EditorComponent.initAllEditors();
});

console.log('✅ Editor component loaded successfully');