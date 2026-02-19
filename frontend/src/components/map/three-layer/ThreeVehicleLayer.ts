import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export interface VehiclePosition {
    id: string;
    lng: number;
    lat: number;
    bearing: number;
    vehicleType: "CTrain" | "Bus";
    line?: "red" | "blue";
}

interface LoadedModel {
    scene: THREE.Group;
    normalizedScale: number;
}

export class ThreeVehicleLayer implements mapboxgl.CustomLayerInterface {
    id: string;
    type: "custom" = "custom";
    renderingMode: "3d" = "3d";

    private map: mapboxgl.Map | null = null;
    private camera: THREE.Camera;
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer | null = null;

    private trainModel: LoadedModel | null = null;
    private busModel: LoadedModel | null = null;
    private modelsLoading: boolean = false;

    private vehicles: Map<string, THREE.Group> = new Map();
    private targetPositions: Map<string, VehiclePosition> = new Map();

    constructor(id: string) {
        this.id = id;
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();

        // Lighting - optimized for outdoor visibility
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(20, 100, 50); // Sun-like angle
        this.scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
        fillLight.position.set(-20, 20, -50);
        this.scene.add(fillLight);
    }

    onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
        this.map = map;
        this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true,
            alpha: true,
        });
        this.renderer.autoClear = false;

        this.loadModels();
    }

    private async loadModels() {
        if (this.modelsLoading) return;
        this.modelsLoading = true;

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        try {
            const [trainGltf, busGltf] = await Promise.all([
                loader.loadAsync("/models/train.glb").catch(e => { console.error("Train load failed", e); return null; }),
                loader.loadAsync("/models/bus.glb").catch(e => { console.error("Bus load failed", e); return null; })
            ]);

            if (trainGltf) {
                this.trainModel = this.normalizeModel(trainGltf.scene.clone());
            }
            if (busGltf) {
                this.busModel = this.normalizeModel(busGltf.scene.clone());
            }
        } catch (e) {
            console.error("Model loading error", e);
        }

        this.modelsLoading = false;
        this.updateVehicles();
        if (this.map) this.map.triggerRepaint();
    }

    private normalizeModel(scene: THREE.Group): LoadedModel {
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Scale so max dimension is 1 meter
        const maxDim = Math.max(size.x, size.y, size.z);
        const normalizedScale = 1 / maxDim;
        scene.scale.setScalar(normalizedScale);

        // Re-center alignment
        // We want CENTER of X/Z to be at 0,0
        // BUT we want BOTTOM of Y (min.y) to be at 0 (Ground level)

        const offsetX = -center.x * normalizedScale;
        const offsetZ = -center.z * normalizedScale;
        const offsetY = -box.min.y * normalizedScale; // Bring bottom to 0

        scene.position.set(offsetX, offsetY, offsetZ);

        return { scene, normalizedScale };
    }

    updateData(vehicles: VehiclePosition[]) {
        try {
            const activeIds = new Set(vehicles.map(v => v.id));

            // Cleanup old
            for (const [id, group] of this.vehicles) {
                if (!activeIds.has(id)) {
                    this.scene.remove(group);
                    this.vehicles.delete(id);
                }
            }

            // Update targets
            vehicles.forEach(v => this.targetPositions.set(v.id, v));

            this.updateVehicles();
            if (this.map) this.map.triggerRepaint();
        } catch (e) {
            console.error("Error updating 3D vehicle data:", e);
        }
    }

    private updateVehicles() {
        if (!this.map) return;

        try {
            this.targetPositions.forEach((data, id) => {
                let group = this.vehicles.get(id);

                if (!group) {
                    // Instantiate model
                    let template = data.vehicleType === "CTrain" ? this.trainModel : this.busModel;
                    if (!template) return;

                    group = template.scene.clone();

                    // Apply colors
                    const color = this.getVehicleColor(data);
                    group.traverse((child: any) => {
                        if (child.isMesh) {
                            child.material = new THREE.MeshStandardMaterial({
                                color: color,
                                roughness: 0.5,
                                metalness: 0.5
                            });
                        }
                    });

                    this.scene.add(group);
                    this.vehicles.set(id, group);
                }

                const mercator = mapboxgl.MercatorCoordinate.fromLngLat(
                    { lng: data.lng, lat: data.lat },
                    0
                );

                const unitsPerMeter = mercator.meterInMercatorCoordinateUnits();
                const length = data.vehicleType === "CTrain" ? 30 : 12;
                const scale = unitsPerMeter * length;

                group.position.set(mercator.x, mercator.y, mercator.z);
                group.scale.set(scale, scale, scale);
                group.rotation.set(0, 0, 0);
                group.rotateX(Math.PI / 2);
                group.rotateZ(-(data.bearing * Math.PI / 180));
            });
        } catch (e) {
            console.error("Error updating 3D vehicle models:", e);
        }
    }

    private getVehicleColor(data: VehiclePosition): number {
        if (data.vehicleType === "CTrain") {
            return data.line === "red" ? 0xdc2626 : 0x2563eb;
        }
        return 0x22c55e;
    }

    render(gl: WebGLRenderingContext, matrix: number[]) {
        if (!this.renderer || !this.map) return;
        try {
            const m = new THREE.Matrix4().fromArray(matrix);
            this.camera.projectionMatrix = m;
            this.renderer.resetState();
            this.renderer.render(this.scene, this.camera);
            this.map.triggerRepaint();
        } catch (e) {
            console.error("Error rendering 3D vehicles:", e);
        }
    }

    onRemove() {
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        this.map = null;
        this.vehicles.clear();
        this.targetPositions.clear();
    }
}
