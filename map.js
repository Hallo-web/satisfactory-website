class SatisfactoryMap {
    constructor() {
        this.mapContainer = document.getElementById('mapContainer');
        this.measurementCanvas = document.getElementById('measurementCanvas');
        this.ctx = this.measurementCanvas.getContext('2d');
        this.infoPanel = document.getElementById('infoPanel');
        this.modal = document.getElementById('markerModal');

        this.markers = new Map();
        this.layers = {
            resources: true,
            powerslugs: true,
            players: true,
            structures: true
        };

        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.isMeasuring = false;
        this.measurePoints = [];

        this.pendingMarker = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadExistingMarkers();
        this.setupCanvas();
    }

    setupEventListeners() {
        // Layer toggles
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleLayer(e.target.dataset.layer));
        });

        // Tool buttons
        document.getElementById('addMarkerBtn').addEventListener('click', () => this.enableMarkerMode());
        document.getElementById('measureBtn').addEventListener('click', () => this.toggleMeasureMode());
        document.getElementById('uploadMapBtn').addEventListener('click', () => document.getElementById('mapUpload').click());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearCustomMarkers());

        // Map interactions
        this.mapContainer.addEventListener('click', (e) => this.handleMapClick(e));
        this.mapContainer.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.mapContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.mapContainer.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.mapContainer.addEventListener('wheel', (e) => this.handleWheel(e));

        // Zoom controls
        document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomOut());
        document.getElementById('resetZoomBtn').addEventListener('click', () => this.resetView());

        // Modal controls
        document.getElementById('closeModalBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('saveMarkerBtn').addEventListener('click', () => this.saveMarker());
        document.getElementById('closePanelBtn').addEventListener('click', () => this.closeInfoPanel());

        // File upload
        document.getElementById('mapUpload').addEventListener('change', (e) => this.handleMapUpload(e));

        // Marker type change
        document.getElementById('markerType').addEventListener('change', (e) => this.handleMarkerTypeChange(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Prevent context menu on map
        this.mapContainer.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setupCanvas() {
        const resizeCanvas = () => {
            const rect = this.mapContainer.getBoundingClientRect();
            this.measurementCanvas.width = rect.width;
            this.measurementCanvas.height = rect.height;
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    loadExistingMarkers() {
        // Load markers from existing DOM elements
        document.querySelectorAll('.marker').forEach(marker => {
            const id = marker.dataset.id || `marker-${Date.now()}-${Math.random()}`;
            const type = marker.dataset.type;
            const title = marker.getAttribute('title') || 'Unnamed Marker';

            this.markers.set(id, {
                id,
                type,
                title,
                element: marker,
                x: parseFloat(marker.style.left),
                y: parseFloat(marker.style.top)
            });

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showMarkerInfo(id);
            });
        });
    }

    toggleLayer(layerName) {
        if (!layerName) return;

        this.layers[layerName] = !this.layers[layerName];
        const button = document.querySelector(`[data-layer="${layerName}"]`);
        button.classList.toggle('active', this.layers[layerName]);

        // Update marker visibility
        this.updateMarkerVisibility();
    }

    updateMarkerVisibility() {
        this.markers.forEach(marker => {
            const shouldShow = this.layers[marker.type] ||
                (marker.type === 'iron' && this.layers.resources) ||
                (marker.type === 'copper' && this.layers.resources) ||
                (marker.type === 'coal' && this.layers.resources) ||
                (marker.type === 'oil' && this.layers.resources) ||
                (marker.type === 'limestone' && this.layers.resources) ||
                (marker.type === 'caterium' && this.layers.resources) ||
                (marker.type === 'sulfur' && this.layers.resources) ||
                (marker.type === 'uranium' && this.layers.resources) ||
                (marker.type === 'powerslug' && this.layers.powerslugs) ||
                (marker.type === 'player' && this.layers.players) ||
                (marker.type === 'structure' && this.layers.structures);

            marker.element.style.display = shouldShow ? 'flex' : 'none';
        });
    }

    enableMarkerMode() {
        this.mapContainer.style.cursor = 'crosshair';
        this.pendingMarker = { x: 0, y: 0 };
    }

    toggleMeasureMode() {
        this.isMeasuring = !this.isMeasuring;
        const button = document.getElementById('measureBtn');
        button.classList.toggle('active', this.isMeasuring);

        if (!this.isMeasuring) {
            this.measurePoints = [];
            this.clearCanvas();
        }

        this.mapContainer.style.cursor = this.isMeasuring ? 'crosshair' : 'default';
    }

    handleMapClick(e) {
        if (e.target.classList.contains('marker')) return;

        const rect = this.mapContainer.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (this.isMeasuring) {
            this.addMeasurePoint(e.clientX - rect.left, e.clientY - rect.top);
        } else if (this.pendingMarker) {
            this.pendingMarker.x = x;
            this.pendingMarker.y = y;
            this.showMarkerModal();
        }
    }

    handleMouseMove(e) {
        const rect = this.mapContainer.getBoundingClientRect();
        const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
        const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);

        document.getElementById('mouseCoords').textContent = `X: ${x}, Y: ${y}`;

        if (this.isDragging) {
            const deltaX = e.clientX - this.dragStart.x;
            const deltaY = e.clientY - this.dragStart.y;

            this.panX += deltaX;
            this.panY += deltaY;

            this.updateMapTransform();

            this.dragStart.x = e.clientX;
            this.dragStart.y = e.clientY;
        }
    }

    handleMouseDown(e) {
        if (e.button === 1 || (e.button === 0 && e.ctrlKey)) { // Middle mouse or Ctrl+click
            this.isDragging = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
            this.mapContainer.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }

    handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.mapContainer.style.cursor = this.isMeasuring ? 'crosshair' : 'default';
        }
    }

    handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(5, this.zoom * delta));

        if (newZoom !== this.zoom) {
            this.zoom = newZoom;
            this.updateMapTransform();
        }
    }

    updateMapTransform() {
        this.mapContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }

    zoomIn() {
        this.zoom = Math.min(5, this.zoom * 1.2);
        this.updateMapTransform();
    }

    zoomOut() {
        this.zoom = Math.max(0.1, this.zoom * 0.8);
        this.updateMapTransform();
    }

    resetView() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.updateMapTransform();
    }

    addMeasurePoint(x, y) {
        this.measurePoints.push({ x, y });

        if (this.measurePoints.length >= 2) {
            this.drawMeasurement();
        }
    }

    drawMeasurement() {
        this.clearCanvas();
        this.ctx.strokeStyle = '#ff6b35';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        this.ctx.moveTo(this.measurePoints[0].x, this.measurePoints[0].y);

        for (let i = 1; i < this.measurePoints.length; i++) {
            this.ctx.lineTo(this.measurePoints[i].x, this.measurePoints[i].y);
        }

        this.ctx.stroke();

        // Draw distance
        if (this.measurePoints.length === 2) {
            const distance = Math.sqrt(
                Math.pow(this.measurePoints[1].x - this.measurePoints[0].x, 2) +
                Math.pow(this.measurePoints[1].y - this.measurePoints[0].y, 2)
            );

            const midX = (this.measurePoints[0].x + this.measurePoints[1].x) / 2;
            const midY = (this.measurePoints[0].y + this.measurePoints[1].y) / 2;

            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '14px Inter';
            this.ctx.fillText(`${Math.round(distance)}px`, midX + 5, midY - 5);
        }
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.measurementCanvas.width, this.measurementCanvas.height);
    }

    showMarkerModal() {
        this.modal.classList.add('show');
        document.getElementById('markerTitle').focus();
    }

    closeModal() {
        this.modal.classList.remove('show');
        this.pendingMarker = null;
        this.mapContainer.style.cursor = 'default';

        // Reset form
        document.getElementById('markerTitle').value = '';
        document.getElementById('markerDescription').value = '';
        document.getElementById('markerType').selectedIndex = 0;
        document.getElementById('resourceGradeGroup').style.display = 'none';
    }

    handleMarkerTypeChange(e) {
        const type = e.target.value;
        const gradeGroup = document.getElementById('resourceGradeGroup');
        const resourceTypes = ['iron', 'copper', 'coal', 'oil', 'limestone', 'caterium', 'sulfur', 'uranium'];

        if (resourceTypes.includes(type)) {
            gradeGroup.style.display = 'block';
        } else {
            gradeGroup.style.display = 'none';
        }
    }

    saveMarker() {
        const type = document.getElementById('markerType').value;
        const title = document.getElementById('markerTitle').value.trim();
        const description = document.getElementById('markerDescription').value.trim();
        const grade = document.getElementById('resourceGrade').value;

        if (!title) {
            alert('Please enter a title for the marker');
            return;
        }

        const id = `marker-${Date.now()}-${Math.random()}`;
        const marker = this.createMarkerElement(id, type, title, description, grade);

        marker.style.left = this.pendingMarker.x + '%';
        marker.style.top = this.pendingMarker.y + '%';

        this.mapContainer.appendChild(marker);

        this.markers.set(id, {
            id,
            type,
            title,
            description,
            grade,
            element: marker,
            x: this.pendingMarker.x,
            y: this.pendingMarker.y
        });

        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showMarkerInfo(id);
        });

        this.closeModal();
        this.updateMarkerVisibility();
    }

    createMarkerElement(id, type, title, description, grade) {
        const marker = document.createElement('div');
        marker.className = `marker ${this.getMarkerClass(type)}`;
        marker.dataset.id = id;
        marker.dataset.type = type;
        marker.title = title;

        const icon = document.createElement('div');
        icon.className = 'marker-icon';
        icon.textContent = this.getMarkerIcon(type);

        marker.appendChild(icon);
        return marker;
    }

    getMarkerClass(type) {
        const resourceTypes = ['iron', 'copper', 'coal', 'oil', 'limestone', 'caterium', 'sulfur', 'uranium'];

        if (resourceTypes.includes(type)) {
            return `resource-marker ${type}`;
        } else if (type === 'powerslug') {
            return 'powerslug-marker';
        } else if (type === 'player') {
            return 'player-marker';
        } else if (type === 'structure') {
            return 'structure-marker';
        }

        return 'resource-marker';
    }

    getMarkerIcon(type) {
        const icons = {
            iron: 'Fe',
            copper: 'Cu',
            coal: 'C',
            oil: '🛢️',
            limestone: 'Ca',
            caterium: 'Au',
            sulfur: 'S',
            uranium: 'U',
            powerslug: '⚡',
            player: '🏠',
            structure: '🏢'
        };

        return icons[type] || '?';
    }

    showMarkerInfo(markerId) {
        const marker = this.markers.get(markerId);
        if (!marker) return;

        const content = document.getElementById('infoContent');
        const gradeText = marker.grade ? ` (${marker.grade})` : '';

        content.innerHTML = `
            <h4>${marker.title}${gradeText}</h4>
            <p><strong>Type:</strong> ${marker.type.replace('-', ' ').toUpperCase()}</p>
            <p><strong>Position:</strong> X: ${Math.round(marker.x * 10)}, Y: ${Math.round(marker.y * 10)}</p>
            ${marker.description ? `<p><strong>Description:</strong> ${marker.description}</p>` : ''}
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                <button class="btn secondary" onclick="satisfactoryMap.editMarker('${markerId}')">Edit</button>
                <button class="btn danger" onclick="satisfactoryMap.deleteMarker('${markerId}')">Delete</button>
            </div>
        `;

        this.infoPanel.classList.add('show');
    }

    closeInfoPanel() {
        this.infoPanel.classList.remove('show');
    }

    editMarker(markerId) {
        const marker = this.markers.get(markerId);
        if (!marker) return;

        // Pre-fill the modal with existing data
        document.getElementById('markerType').value = marker.type;
        document.getElementById('markerTitle').value = marker.title;
        document.getElementById('markerDescription').value = marker.description || '';

        if (marker.grade) {
            document.getElementById('resourceGrade').value = marker.grade;
            document.getElementById('resourceGradeGroup').style.display = 'block';
        }

        this.pendingMarker = { x: marker.x, y: marker.y, editId: markerId };
        this.showMarkerModal();
        this.closeInfoPanel();
    }

    deleteMarker(markerId) {
        if (!confirm('Are you sure you want to delete this marker?')) return;

        const marker = this.markers.get(markerId);
        if (marker) {
            marker.element.remove();
            this.markers.delete(markerId);
        }

        this.closeInfoPanel();
    }

    clearCustomMarkers() {
        if (!confirm('Are you sure you want to clear all custom markers?')) return;

        this.markers.forEach((marker, id) => {
            if (!marker.element.hasAttribute('data-default')) {
                marker.element.remove();
                this.markers.delete(id);
            }
        });

        this.closeInfoPanel();
    }

    handleMapUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.mapContainer.style.backgroundImage = `url(${event.target.result})`;
            this.mapContainer.style.backgroundSize = 'cover';
            this.mapContainer.style.backgroundPosition = 'center';
            this.mapContainer.style.backgroundRepeat = 'no-repeat';
        };
        reader.readAsDataURL(file);
    }

    handleKeyDown(e) {
        // Escape key
        if (e.key === 'Escape') {
            if (this.modal.classList.contains('show')) {
                this.closeModal();
            } else if (this.infoPanel.classList.contains('show')) {
                this.closeInfoPanel();
            } else if (this.isMeasuring) {
                this.toggleMeasureMode();
            }
        }

        // Space key for pan mode
        if (e.code === 'Space' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            this.mapContainer.style.cursor = 'grab';
        }
    }

    exportMarkers() {
        const markerData = Array.from(this.markers.values()).map(marker => ({
            id: marker.id,
            type: marker.type,
            title: marker.title,
            description: marker.description,
            grade: marker.grade,
            x: marker.x,
            y: marker.y
        }));

        const dataStr = JSON.stringify(markerData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'satisfactory-markers.json';
        link.click();
    }

    importMarkers(jsonData) {
        try {
            const markers = JSON.parse(jsonData);
            markers.forEach(markerData => {
                const marker = this.createMarkerElement(
                    markerData.id,
                    markerData.type,
                    markerData.title,
                    markerData.description,
                    markerData.grade
                );

                marker.style.left = markerData.x + '%';
                marker.style.top = markerData.y + '%';

                this.mapContainer.appendChild(marker);
                this.markers.set(markerData.id, {
                    ...markerData,
                    element: marker
                });

                marker.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showMarkerInfo(markerData.id);
                });
            });

            this.updateMarkerVisibility();
        } catch (error) {
            console.error('Error importing markers:', error);
            alert('Error importing markers. Please check the file format.');
        }
    }
}

// Initialize the map when the page loads
let satisfactoryMap;
document.addEventListener('DOMContentLoaded', () => {
    satisfactoryMap = new SatisfactoryMap();
});