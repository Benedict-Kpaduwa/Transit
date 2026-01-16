import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";

export interface VehiclePositionData {
  id: string;
  lng: number;
  lat: number;
  bearing: number;
  vehicleType: "CTrain" | "Bus";
  routeShortName?: string;
  routeLongName?: string;
  headsign?: string;
  color?: string;
  timestamp?: number | string;
  tripId?: string;
  vehicleId?: string;
}

interface VehicleLayerProps {
  map: mapboxgl.Map | null;
  vehicles: VehiclePositionData[];
  onVehicleClick?: (vehicle: VehiclePositionData) => void;
  onViewRoute?: (vehicle: VehiclePositionData) => void;
  trackedVehicleId?: string | null; // ID of the tracked vehicle to show 3D model
}

// Animation duration - match polling interval for smooth continuous movement
const ANIMATION_DURATION = 9500;

// Linear easing for constant speed
function linear(t: number): number {
  return t;
}

// Interpolate between two values
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

// Interpolate bearing (handle 360 degree wraparound)
function lerpBearing(start: number, end: number, t: number): number {
  let diff = end - start;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return start + diff * t;
}

interface AnimationState {
  startLng: number;
  startLat: number;
  startBearing: number;
  targetLng: number;
  targetLat: number;
  targetBearing: number;
  startTime: number;
  animationId: number | null;
}

// Format timestamp to human-readable time
function formatLastUpdate(timestamp: number | string | undefined): string {
  if (!timestamp) return "Unknown";
  const ts = typeof timestamp === "string" ? parseInt(timestamp) : timestamp;
  if (isNaN(ts)) return "Unknown";
  
  const date = new Date(ts * 1000);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  return date.toLocaleTimeString();
}

// Create simple icon-based marker
function createVehicleMarkerElement(
  vehicleType: "CTrain" | "Bus",
  color: string,
  routeShortName?: string,
  bearing?: number
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "vehicle-marker";

  // Icon based on vehicle type
  const icon = vehicleType === "CTrain" ? "🚊" : "🚌";
  
  // Direction arrow rotation
  const arrowRotation = bearing ? bearing - 90 : 0; // Adjust for CSS

  el.innerHTML = `
    <div class="vehicle-marker-container" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      transform: translateX(-50%) translateY(-50%);
    ">
      <!-- Vehicle icon with colored background -->
      <div style="
        position: relative;
        width: 40px;
        height: 40px;
        background: ${color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,255,255,0.9);
        border: 2px solid white;
        animation: vehicle-pulse 2s ease-in-out infinite;
      ">
        ${icon}
        ${bearing !== undefined ? `
          <div style="
            position: absolute;
            top: -6px;
            left: 50%;
            transform: translateX(-50%) rotate(${arrowRotation}deg);
            font-size: 12px;
            line-height: 1;
          ">➤</div>
        ` : ""}
      </div>
      
      <!-- Route label -->
      ${routeShortName ? `
        <div style="
          margin-top: 2px;
          padding: 2px 6px;
          background: ${color};
          color: white;
          font-size: 10px;
          font-weight: 700;
          border-radius: 4px;
          white-space: nowrap;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        ">
          ${routeShortName}
        </div>
      ` : ""}
    </div>
  `;

  return el;
}

// ============================================
// Singleton 3D Renderer - Uses single WebGL context to prevent context exhaustion
// ============================================

interface Model3DInstance {
  canvasId: string;
  vehicleType: "CTrain" | "Bus";
  bearing: number; // Vehicle heading direction in degrees (0 = north, clockwise)
}

// Singleton state for 3D rendering
let sharedRenderer: {
  initialized: boolean;
  animationId: number | null;
  offscreenCanvas: HTMLCanvasElement | null;
  renderer: any; // THREE.WebGLRenderer
  scene: any; // THREE.Scene
  camera: any; // THREE.PerspectiveCamera
  trainModel: any; // THREE.Group
  busModel: any; // THREE.Group
  activeCanvases: Map<string, Model3DInstance>;
} = {
  initialized: false,
  animationId: null,
  offscreenCanvas: null,
  renderer: null,
  scene: null,
  camera: null,
  trainModel: null,
  busModel: null,
  activeCanvases: new Map(),
};

// Initialize the shared 3D renderer (called once)
async function initShared3DRenderer() {
  if (sharedRenderer.initialized) return;
  sharedRenderer.initialized = true;

  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

  // Create offscreen canvas for rendering (larger for better visibility)
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = 200; // Larger canvas for more detail
  offscreenCanvas.height = 200;
  sharedRenderer.offscreenCanvas = offscreenCanvas;

  // Create scene
  const scene = new THREE.Scene();
  scene.background = null;
  sharedRenderer.scene = scene;

  // Create camera - top-down angled view (like Uber's birds-eye perspective)
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  // Position camera above and slightly behind for a 3D top-down view
  camera.position.set(0, 3, 1.5);
  camera.lookAt(0, 0, 0);
  sharedRenderer.camera = camera;

  // Create renderer with offscreen canvas
  const renderer = new THREE.WebGLRenderer({
    canvas: offscreenCanvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power', // Prefer integrated GPU to save resources
  });
  renderer.setSize(200, 200);
  renderer.setPixelRatio(1);
  sharedRenderer.renderer = renderer;

  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  // Load both models
  const loader = new GLTFLoader();

  // Load train model
  loader.load('/models/train.glb', (gltf) => {
    const model = gltf.scene;
    centerAndScaleModel(THREE, model);
    model.visible = false; // Initially hidden
    scene.add(model);
    sharedRenderer.trainModel = model;
    console.log('Train model loaded for singleton renderer');
  }, undefined, (error) => {
    console.error('Error loading train model:', error);
  });

  // Load bus model
  loader.load('/models/bus.glb', (gltf) => {
    const model = gltf.scene;
    centerAndScaleModel(THREE, model);
    model.visible = false; // Initially hidden
    scene.add(model);
    sharedRenderer.busModel = model;
    console.log('Bus model loaded for singleton renderer');
  }, undefined, (error) => {
    console.error('Error loading bus model:', error);
  });

  // Start animation loop
  startSharedAnimationLoop();
}

// Center and scale a model to fit in the viewport (larger scale for visibility)
function centerAndScaleModel(THREE: any, model: any) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 2.2 / maxDim; // Increased from 1.5 to 2.2 for better visibility

  model.scale.setScalar(scale);
  model.position.sub(center.multiplyScalar(scale));
}

// Shared animation loop - renders to offscreen canvas then copies to all active marker canvases
function startSharedAnimationLoop() {
  const animate = () => {
    sharedRenderer.animationId = requestAnimationFrame(animate);

    if (!sharedRenderer.renderer || !sharedRenderer.scene || !sharedRenderer.camera) return;

    // For each active canvas, render the appropriate model and copy
    sharedRenderer.activeCanvases.forEach((instance, canvasId) => {
      const targetCanvas = document.getElementById(canvasId) as HTMLCanvasElement;
      if (!targetCanvas) {
        // Canvas no longer exists, remove from active list
        sharedRenderer.activeCanvases.delete(canvasId);
        return;
      }

      const model = instance.vehicleType === 'CTrain' 
        ? sharedRenderer.trainModel 
        : sharedRenderer.busModel;

      if (!model) return;

      // Show only this model
      if (sharedRenderer.trainModel) sharedRenderer.trainModel.visible = false;
      if (sharedRenderer.busModel) sharedRenderer.busModel.visible = false;
      model.visible = true;

      // Orient model based on vehicle bearing (like Uber car alignment)
      // Bearing: 0° = North, 90° = East, 180° = South, 270° = West
      // Three.js Y rotation: 0 = facing +Z, counter-clockwise positive
      // Convert bearing to Three.js rotation: negate and offset by 180°
      const bearingRad = ((180 - instance.bearing) * Math.PI) / 180;
      model.rotation.y = bearingRad;

      // Render to offscreen canvas
      sharedRenderer.renderer!.render(sharedRenderer.scene!, sharedRenderer.camera!);

      // Copy to target canvas
      const ctx = targetCanvas.getContext('2d');
      if (ctx && sharedRenderer.offscreenCanvas) {
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.drawImage(sharedRenderer.offscreenCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
      }
    });

    // If no active canvases, hide all models but keep loop running
    if (sharedRenderer.activeCanvases.size === 0) {
      if (sharedRenderer.trainModel) sharedRenderer.trainModel.visible = false;
      if (sharedRenderer.busModel) sharedRenderer.busModel.visible = false;
    }
  };

  animate();
}

// Register a canvas to receive 3D model renders
function register3DModelCanvas(canvasId: string, vehicleType: "CTrain" | "Bus", bearing: number = 0) {
  sharedRenderer.activeCanvases.set(canvasId, { canvasId, vehicleType, bearing });
  
  // Initialize renderer if not already done
  initShared3DRenderer();
}

// Update the bearing for a registered canvas (called when vehicle moves)
function update3DModelBearing(canvasId: string, bearing: number) {
  const instance = sharedRenderer.activeCanvases.get(canvasId);
  if (instance) {
    instance.bearing = bearing;
  }
}

// Unregister a canvas (cleanup)
function unregister3DModelCanvas(canvasId: string) {
  sharedRenderer.activeCanvases.delete(canvasId);
}

// Create 3D model-based marker for tracked vehicles using singleton renderer
function create3DModelMarkerElement(
  vehicleType: "CTrain" | "Bus",
  color: string,
  routeShortName?: string,
  bearing: number = 0
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "vehicle-marker vehicle-marker-3d";

  const canvasId = `model-canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Store canvasId on element for later bearing updates
  el.setAttribute('data-canvas-id', canvasId);

  el.innerHTML = `
    <div class="vehicle-marker-container" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      transform: translateX(-50%) translateY(-50%);
    ">
      <!-- Route label with "TRACKING" badge - NOW ON TOP -->
      <div style="
        margin-bottom: 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      ">
        <div style="
          padding: 3px 10px;
          background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%);
          color: white;
          font-size: 12px;
          font-weight: 700;
          border-radius: 6px;
          white-space: nowrap;
          box-shadow: 0 3px 10px rgba(0,0,0,0.4);
          letter-spacing: 0.3px;
        ">
          ${routeShortName || (vehicleType === "CTrain" ? "CTrain" : "Bus")}
        </div>
        <div style="
          padding: 2px 8px;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(22, 163, 74, 0.95) 100%);
          color: white;
          font-size: 9px;
          font-weight: 600;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 2px 6px rgba(34, 197, 94, 0.4);
          animation: tracking-blink 1s ease-in-out infinite;
          display: flex;
          align-items: center;
          gap: 3px;
        ">
          <span style="font-size: 10px;">📍</span> Tracking
        </div>
      </div>
      
      <!-- 3D Model Container -->
      <div style="
        position: relative;
        width: 80px;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <!-- Outer pulse ring -->
        <div style="
          position: absolute;
          width: 75px;
          height: 75px;
          border-radius: 50%;
          background: radial-gradient(circle, ${color}50 0%, ${color}20 50%, transparent 70%);
          animation: tracked-pulse 1.5s ease-in-out infinite;
        "></div>
        
        <!-- 3D Model Canvas -->
        <canvas 
          id="${canvasId}" 
          data-vehicle-type="${vehicleType}"
          width="200" 
          height="200" 
          style="
            width: 60px;
            height: 60px;
            background: transparent;
            border-radius: 50%;
            box-shadow: 0 0 20px ${color}60, 0 0 40px ${color}30;
          "
        ></canvas>
      </div>
    </div>
  `;

  // Register canvas with singleton renderer after element is added to DOM
  setTimeout(() => {
    register3DModelCanvas(canvasId, vehicleType, bearing);
  }, 50);

  return el;
}

// Create popup HTML content
function createPopupHTML(vehicle: VehiclePositionData): string {
  const lastUpdate = formatLastUpdate(vehicle.timestamp);
  const typeLabel = vehicle.vehicleType === "CTrain" ? "CTrain" : "Bus";
  const typeColor = vehicle.color || "#22c55e";
  
  return `
    <div style="
      font-family: system-ui, -apple-system, sans-serif;
      min-width: 220px;
      background: linear-gradient(180deg, #18181b 0%, #09090b 100%);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    ">
      <!-- Header -->
      <div style="
        background: linear-gradient(135deg, ${typeColor} 0%, ${typeColor}dd 100%);
        padding: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
      ">
        <div style="
          background: rgba(255,255,255,0.2);
          padding: 8px;
          border-radius: 10px;
          font-size: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${vehicle.vehicleType === "CTrain" ? "🚊" : "🚌"}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            <span style="
              font-size: 18px;
              font-weight: 800;
              color: white;
            ">${vehicle.routeShortName || "N/A"}</span>
            <span style="
              background: rgba(255,255,255,0.25);
              padding: 2px 8px;
              border-radius: 4px;
              font-size: 10px;
              color: white;
              font-weight: 600;
            ">${typeLabel}</span>
          </div>
          <div style="
            font-size: 12px;
            color: rgba(255,255,255,0.9);
            margin-top: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          ">${vehicle.headsign || "Unknown destination"}</div>
        </div>
      </div>
      
      <!-- Content -->
      <div style="padding: 12px 14px;">
        <!-- Vehicle ID -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #27272a;
        ">
          <span style="color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Vehicle ID</span>
          <span style="color: #fafafa; font-weight: 600; font-size: 12px;">${vehicle.vehicleId || vehicle.id || "Unknown"}</span>
        </div>
        
        <!-- Last Update -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #27272a;
        ">
          <span style="color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Last Update</span>
          <span style="
            color: #22c55e;
            font-weight: 600;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span style="
              width: 6px;
              height: 6px;
              background: #22c55e;
              border-radius: 50%;
              animation: blink 1s ease-in-out infinite;
            "></span>
            ${lastUpdate}
          </span>
        </div>
        
        <!-- View Route Button -->
        <button
          id="view-route-btn-${vehicle.id}"
          style="
            width: 100%;
            margin-top: 12px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            border: none;
            border-radius: 10px;
            padding: 10px;
            color: white;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.2s;
          "
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M3 12l6-6M3 12l6 6"/>
          </svg>
          View Route Path
        </button>
      </div>
    </div>
    <style>
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>
  `;
}

export default function VehicleLayer({
  map,
  vehicles,
  onVehicleClick,
  onViewRoute,
  trackedVehicleId,
}: VehicleLayerProps) {
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const animationsRef = useRef<Map<string, AnimationState>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const styleAddedRef = useRef(false);

  // Animate a marker smoothly from current to target position
  const animateMarker = useCallback(
    (
      marker: mapboxgl.Marker,
      vehicleId: string,
      targetLng: number,
      targetLat: number,
      targetBearing: number
    ) => {
      const currentPos = marker.getLngLat();
      const currentRotation = marker.getRotation();

      // Cancel any existing animation
      const existingAnimation = animationsRef.current.get(vehicleId);
      if (existingAnimation?.animationId) {
        cancelAnimationFrame(existingAnimation.animationId);
      }

      // Check if position changed significantly
      const distance = Math.sqrt(
        Math.pow(targetLng - currentPos.lng, 2) +
          Math.pow(targetLat - currentPos.lat, 2)
      );

      if (distance < 0.00001) {
        return;
      }

      const animState: AnimationState = {
        startLng: currentPos.lng,
        startLat: currentPos.lat,
        startBearing: currentRotation,
        targetLng,
        targetLat,
        targetBearing,
        startTime: performance.now(),
        animationId: null,
      };

      const animate = (currentTime: number) => {
        const elapsed = currentTime - animState.startTime;
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
        const easedProgress = linear(progress);

        const lng = lerp(animState.startLng, animState.targetLng, easedProgress);
        const lat = lerp(animState.startLat, animState.targetLat, easedProgress);
        const bearing = lerpBearing(
          animState.startBearing,
          animState.targetBearing,
          easedProgress
        );

        marker.setLngLat([lng, lat]);
        marker.setRotation(bearing);

        if (progress < 1) {
          animState.animationId = requestAnimationFrame(animate);
          animationsRef.current.set(vehicleId, animState);
        } else {
          animationsRef.current.delete(vehicleId);
        }
      };

      animState.animationId = requestAnimationFrame(animate);
      animationsRef.current.set(vehicleId, animState);
    },
    []
  );

  // Add CSS styles
  const addStyles = useCallback(() => {
    if (styleAddedRef.current) return;

    const existingStyle = document.getElementById("vehicle-marker-styles");
    if (existingStyle) {
      styleAddedRef.current = true;
      return;
    }

    const style = document.createElement("style");
    style.id = "vehicle-marker-styles";
    style.textContent = `
      .vehicle-marker {
        will-change: transform;
        z-index: 10;
      }
      
      .vehicle-marker-3d {
        z-index: 100;
      }
      
      .vehicle-marker:hover {
        z-index: 100;
      }
      
      .vehicle-marker:hover .vehicle-marker-container > div:first-child {
        transform: scale(1.15);
      }
      
      @keyframes vehicle-pulse {
        0%, 100% {
          box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,255,255,0.9);
        }
        50% {
          box-shadow: 0 2px 12px rgba(0,0,0,0.4), 0 0 0 5px rgba(255,255,255,0.7);
        }
      }
      
      @keyframes tracked-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 0.6;
        }
        50% {
          transform: scale(1.15);
          opacity: 0.9;
        }
      }
      
      @keyframes tracking-blink {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.6;
        }
      }
      
      @keyframes tracked-inner-pulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 0 20px currentColor, 0 0 40px currentColor;
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 0 30px currentColor, 0 0 60px currentColor;
        }
      }
      
      .mapboxgl-popup-content {
        padding: 0 !important;
        border-radius: 16px !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      
      .mapboxgl-popup-tip {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
    styleAddedRef.current = true;
  }, []);

  // Show popup for a vehicle
  const showPopup = useCallback((vehicle: VehiclePositionData) => {
    if (!map) return;
    
    // Close existing popup
    if (popupRef.current) {
      popupRef.current.remove();
    }
    
    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "none",
      className: "vehicle-popup",
      anchor: "left",
      offset: [40, 0],
    })
      .setLngLat([vehicle.lng, vehicle.lat])
      .setHTML(createPopupHTML(vehicle))
      .addTo(map);
    
    popupRef.current = popup;
    
    // Add click handler for View Route button after popup is added
    setTimeout(() => {
      const btn = document.getElementById(`view-route-btn-${vehicle.id}`);
      if (btn && onViewRoute) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onViewRoute(vehicle);
          popup.remove();
        });
      }
    }, 50);
  }, [map, onViewRoute]);

  // Manage vehicle markers
  useEffect(() => {
    if (!map) return;

    addStyles();

    // Filter valid vehicles
    const validVehicles = vehicles.filter(
      (v) =>
        v.id &&
        typeof v.lng === "number" &&
        typeof v.lat === "number" &&
        !isNaN(v.lng) &&
        !isNaN(v.lat)
    );

    const currentIds = new Set(validVehicles.map((v) => v.id));
    const existingIds = new Set(markersRef.current.keys());

    // Remove markers no longer in data
    existingIds.forEach((id) => {
      if (!currentIds.has(id)) {
        const animation = animationsRef.current.get(id);
        if (animation?.animationId) {
          cancelAnimationFrame(animation.animationId);
        }
        animationsRef.current.delete(id);

        const marker = markersRef.current.get(id);
        marker?.remove();
        markersRef.current.delete(id);
      }
    });

    // Add or update markers
    validVehicles.forEach((vehicle) => {
      let marker = markersRef.current.get(vehicle.id);

      const color = vehicle.color || (vehicle.vehicleType === "CTrain" 
        ? (vehicle.routeShortName === "201" ? "#DC2626" : "#2563EB")
        : "#22c55e");

      // Check if this vehicle is being tracked
      const isTracked = trackedVehicleId && (
        vehicle.id === trackedVehicleId ||
        vehicle.tripId === trackedVehicleId ||
        vehicle.vehicleId === trackedVehicleId
      );

      if (!marker) {
        // Create new marker - use 3D model for tracked vehicles, 2D icon for regular
        const el = isTracked
          ? create3DModelMarkerElement(
              vehicle.vehicleType,
              color,
              vehicle.routeShortName,
              vehicle.bearing || 0
            )
          : createVehicleMarkerElement(
              vehicle.vehicleType,
              color,
              vehicle.routeShortName,
              vehicle.bearing
            );

        // Add click handler
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          showPopup(vehicle);
          if (onVehicleClick) {
            onVehicleClick(vehicle);
          }
        });

        marker = new mapboxgl.Marker({
          element: el,
          anchor: "center",
        })
          .setLngLat([vehicle.lng, vehicle.lat])
          .addTo(map);

        markersRef.current.set(vehicle.id, marker);
      } else {
        // If tracking status changed, we need to recreate the marker
        const existingEl = marker.getElement();
        const currentlyIsTracked = existingEl.classList.contains("vehicle-marker-3d");
        
        if (isTracked !== currentlyIsTracked) {
          // Remove old marker and create new one with correct element type
          marker.remove();
          
          const el = isTracked
            ? create3DModelMarkerElement(
                vehicle.vehicleType,
                color,
                vehicle.routeShortName,
                vehicle.bearing || 0
              )
            : createVehicleMarkerElement(
                vehicle.vehicleType,
                color,
                vehicle.routeShortName,
                vehicle.bearing
              );

          el.addEventListener("click", (e) => {
            e.stopPropagation();
            showPopup(vehicle);
            if (onVehicleClick) {
              onVehicleClick(vehicle);
            }
          });

          marker = new mapboxgl.Marker({
            element: el,
            anchor: "center",
          })
            .setLngLat([vehicle.lng, vehicle.lat])
            .addTo(map);

          markersRef.current.set(vehicle.id, marker);
        } else {
          // Standard update - animate to new position
          animateMarker(
            marker,
            vehicle.id,
            vehicle.lng,
            vehicle.lat,
            vehicle.bearing || 0
          );
          
          // Update 3D model bearing if this is a tracked vehicle
          if (isTracked) {
            const canvasId = existingEl.getAttribute('data-canvas-id');
            if (canvasId) {
              update3DModelBearing(canvasId, vehicle.bearing || 0);
            }
          }
        }
      }
    });

    return () => {
      // Cancel all animations on unmount
      animationsRef.current.forEach((animation) => {
        if (animation.animationId) {
          cancelAnimationFrame(animation.animationId);
        }
      });
      animationsRef.current.clear();

      // Remove popup
      if (popupRef.current) {
        popupRef.current.remove();
      }

      // Remove all markers
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
    };
  }, [map, vehicles, onVehicleClick, addStyles, animateMarker, showPopup, trackedVehicleId]);

  return null;
}
