import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* -------------------- CORE HELPERS -------------------- */

function makeRenderer(stage) {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    stage.appendChild(renderer.domElement);
    return renderer;
}

function handleResize(stage, renderer, camera) {
    function resize() {
        const rect = stage.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);

        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    window.addEventListener("resize", resize);
    resize(); // initial call
}

function createBasicScene(stage, fov, zPos) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
    const renderer = makeRenderer(stage);

    camera.position.set(0, 0, zPos);

    handleResize(stage, renderer, camera);

    return { scene, camera, renderer };
}

function animateLoop(callback) {
    if (prefersReducedMotion) return;

    function loop(time) {
        callback(time * 0.001);
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}

/* -------------------- INDUSTRIAL BG -------------------- */

function createIndustrialBackground() {
    const stage = document.getElementById("industrial-3d-bg");
    if (!stage) return;

    const { scene, camera, renderer } = createBasicScene(stage, 50, 13);
    camera.position.y = 2.4;

    const root = new THREE.Group();
    scene.add(root);

    const metal = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.6, metalness: 0.9 });
    const darkRed = new THREE.MeshStandardMaterial({ color: 0x240000, emissive: 0x160000, emissiveIntensity: 0.7 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.8 });

    // pipes
    for (let i = 0; i < 9; i++) {
        const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05 + (i % 3) * 0.02, 0.05 + (i % 3) * 0.02, 16, 16),
            i % 4 === 0 ? darkRed : metal
        );
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(-4.8 + i * 1.25, -2.3 + (i % 4) * 0.75, -4.5);
        root.add(pipe);
    }

    // panels
    for (let i = 0; i < 18; i++) {
        const panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.04, 0.45),
            i % 5 === 0 ? darkRed : metal
        );
        panel.position.set((i % 6 - 2.5) * 1.8, 2.9 - Math.floor(i / 6) * 1.25, -6.5);
        panel.rotation.x = -0.2;
        root.add(panel);
    }

    // bolts
    for (let i = 0; i < 24; i++) {
        const bolt = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 12, 8),
            i % 6 === 0 ? glow : metal
        );
        bolt.position.set((i % 8 - 3.5) * 1.24, -3.25 + Math.floor(i / 8) * 2.4, -3.5);
        root.add(bolt);
    }

    const grid = new THREE.GridHelper(18, 32, 0x660000, 0x250000);
    grid.position.set(0, -3.35, -1.8);
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    root.add(grid);

    // lighting
    scene.add(new THREE.AmbientLight(0x550000, 1.6));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x220000, 0.3));

    const light = new THREE.PointLight(0xff0000, 2.5, 18);
    light.position.set(0, 3, 4);
    scene.add(light);

    animateLoop((t) => {
        root.rotation.y = Math.sin(t * 0.1) * 0.04;
        light.intensity = 2.2 + Math.sin(t * 1.4) * 0.3;
        renderer.render(scene, camera);
    });
}

/* -------------------- SKULL LOGO -------------------- */

function createSkullLogo() {
    const stage = document.getElementById("skull-3d-stage");
    if (!stage) return;

    const { scene, camera, renderer } = createBasicScene(stage, 42, 4.4);

    const loader = new THREE.TextureLoader();
    const texture = loader.load("./spiked_skull_logo.png");

    const group = new THREE.Group();
    scene.add(group);

    const skull = new THREE.Mesh(
        new THREE.PlaneGeometry(3.1, 3.1),
        new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            emissive: 0x7a0000,
            emissiveIntensity: 0.8
        })
    );
    group.add(skull);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.07, 12, 72),
        new THREE.MeshStandardMaterial({ color: 0x880000, emissive: 0x330000 })
    );
    group.add(ring);

    scene.add(new THREE.AmbientLight(0x771111, 1.4));

    const light = new THREE.PointLight(0xff0000, 2.2, 10);
    light.position.set(0.6, 1.5, 4);
    scene.add(light);

    animateLoop((t) => {
        group.rotation.y = Math.sin(t * 0.7) * 0.4;
        ring.rotation.z += 0.01;
        renderer.render(scene, camera);
    });
}

/* -------------------- VINYL -------------------- */

function createMediaObject() {
    const stage = document.getElementById("media-3d-stage");
    if (!stage) return;

    const { scene, camera, renderer } = createBasicScene(stage, 45, 5.4);
    camera.position.y = 1.2;

    const group = new THREE.Group();
    group.scale.set(1.3, 1.3, 1.3);
    scene.add(group);

    const vinyl = new THREE.Mesh(
        new THREE.CylinderGeometry(1.45, 1.45, 0.16, 96),
        new THREE.MeshStandardMaterial({ color: 0x050505 })
    );
    vinyl.rotation.x = Math.PI / 2;
    group.add(vinyl);

    const label = new THREE.Mesh(
        new THREE.CylinderGeometry(0.43, 0.43, 0.18, 64),
        new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0x3a0000 })
    );
    label.rotation.x = Math.PI / 2;
    group.add(label);

    scene.add(new THREE.AmbientLight(0x551111, 1.5));

    const light = new THREE.PointLight(0xff0000, 2.5, 12);
    light.position.set(0, 2, 4);
    scene.add(light);

    animateLoop((t) => {
        vinyl.rotation.z = t;
        label.rotation.z = t;
        group.rotation.y = Math.sin(t * 0.3) * 0.08;
        renderer.render(scene, camera);
    });
}

/* -------------------- INIT -------------------- */

createIndustrialBackground();
createSkullLogo();
createMediaObject();