import * as THREE from "https://cdn.skypack.dev/three@0.129.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color("rgb(240, 240, 240)");

// Camera
const originalFov = 80;
const targetFov = 50;
const camera = new THREE.PerspectiveCamera(originalFov, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-0.75, 0, 1.2);
camera.lookAt(-0.175, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById("container3D").appendChild(renderer.domElement);

// Lights
const lightLeft = new THREE.DirectionalLight(0xffffff, 1);
lightLeft.position.set(-3, 2, 3);
scene.add(lightLeft);

const lightRight = new THREE.DirectionalLight(0xffffff, 0.5);
lightRight.position.set(3, 2, 3);
scene.add(lightRight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
hemiLight.position.set(0, 1, 0);
scene.add(hemiLight);

// Pivot for idle rotation
const pivot = new THREE.Group();
scene.add(pivot);

// Loader
let mixer;
const clock = new THREE.Clock();
let object;

const loader = new GLTFLoader();
const modelPath = "./3DModels/Logo.glb";

function screenYToWorldY(screenY, camera, distance) {
  // distance: Z distance from camera to object
  const vFOV = camera.fov * (Math.PI / 180); // vertical FOV in radians
  const viewportHeight = 2 * Math.tan(vFOV / 2) * distance; // height at Z distance
  const normalizedY = 1 - screenY / window.innerHeight; // 0 = bottom, 1 = top
  return (normalizedY - 0.5) * viewportHeight; // convert to world units
}

function updateModelLayout() {
  if (!object) return;

  if (!modelBaseSize) {
    object.position.y = 0;
    return;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const scaleFactor = 1;
  let responsiveScale = (Math.min(vw, vh) / 800) * (2 / modelBaseSize) * scaleFactor;

  if (vw < 600) {
    responsiveScale *= 1.25;
  } else if (vw < 900) {
    responsiveScale *= 0.95;
  }

  object.scale.setScalar(responsiveScale);

  const buttonContainer = document.querySelector(".button-container");

  if (buttonContainer) {
    const buttonRect = buttonContainer.getBoundingClientRect();
    const topOfButtons = buttonRect.top;

    const targetScreenY = topOfButtons / 2;

    // ✅ NEW: Calculate distance to object
    const modelWorldPos = new THREE.Vector3();
    object.getWorldPosition(modelWorldPos);
    const distance = camera.position.distanceTo(modelWorldPos);

    object.position.y = screenYToWorldY(targetScreenY, camera, distance);
  }
}




let modelBaseSize = null; // store the original model size for scaling

loader.load(
  modelPath,
  (gltf) => {
    object = gltf.scene;
    pivot.add(object);

    // Center model
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);

    // Store base size ONCE
modelBaseSize = box.getSize(new THREE.Vector3()).length();

// Apply initial scaling
updateModelLayout();

    // Responsive adjustment
    updateModelLayout();
    let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    updateModelLayout();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }, 150);
});


    // Apply materials
    object.traverse((child) => {
      if (child.isMesh) {
        child.geometry.computeVertexNormals();
        child.material = new THREE.MeshStandardMaterial({
          color: child.material?.color || 0xffffff,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Lights target pivot
    lightLeft.target = pivot;
    lightRight.target = pivot;

    // Play intro → idle
    if (gltf.animations.length >= 2) {
      mixer = new THREE.AnimationMixer(object);
      const actionIntro = mixer.clipAction(gltf.animations[0]);
      const actionIdle = mixer.clipAction(gltf.animations[1]);

      actionIntro.setLoop(THREE.LoopOnce);
      actionIntro.clampWhenFinished = true;
      actionIntro.reset().play();

      actionIdle.loop = THREE.LoopRepeat;
      actionIdle.clampWhenFinished = false;

      mixer.addEventListener("finished", () => {
  actionIdle.reset().play();
  actionIdle.crossFadeFrom(actionIntro, 1, false);

  // Show buttons
  const buttonContainer = document.querySelector(".button-container");
  const buttons = document.querySelectorAll(".rounded-button");
  if (buttonContainer) buttonContainer.classList.add("visible");
  buttons.forEach((btn) => btn.classList.add("visible"));

  // Wait 1 frame to allow layout to update
  requestAnimationFrame(() => {
    updateModelLayout(); // reposition now that buttons are visible
  });
});

    }
  },
  (xhr) => {
    const pct = xhr.total ? (xhr.loaded / xhr.total) * 100 : 100;
    console.log(`📦 ${pct.toFixed(2)}% loaded`);
  },
  (error) => console.error("❌ Error loading model:", error)
);

// Reset button visibility on DOM load
document.addEventListener("DOMContentLoaded", () => {
  const buttonContainer = document.querySelector(".button-container");
  const buttons = document.querySelectorAll(".rounded-button");
  if (buttonContainer) buttonContainer.classList.remove("visible");
  buttons.forEach((btn) => btn.classList.remove("visible"));
});

// Mouse rotation
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mouseOnModel = false;
let previousMouse = { x: null, y: null };
let currentRotation = { x: 0, y: 0 };
let rotationVelocity = { x: 0, y: 0 };
const maxRotation = 0.5;
const rotationDamping = 0.1;

document.addEventListener("mousemove", (event) => {
  if (!object) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(object, true);
  mouseOnModel = intersects.length > 0;

  if (mouseOnModel && previousMouse.x !== null && previousMouse.y !== null) {
    const deltaX = event.clientX - previousMouse.x;
    const deltaY = event.clientY - previousMouse.y;
    rotationVelocity.y += deltaX * 0.00005;
    rotationVelocity.x += deltaY * 0.00005;
    rotationVelocity.x = THREE.MathUtils.clamp(rotationVelocity.x, -maxRotation, maxRotation);
    rotationVelocity.y = THREE.MathUtils.clamp(rotationVelocity.y, -maxRotation, maxRotation);
  }

  previousMouse.x = event.clientX;
  previousMouse.y = event.clientY;
});

document.getElementById("container3D").addEventListener("mouseleave", () => {
  mouseOnModel = false;
  previousMouse.x = null;
  previousMouse.y = null;
});

// Camera smooth move on hover
const originalCameraPos = camera.position.clone();
const originalCameraLookAt = new THREE.Vector3(-0.175, 0, 0);
const targetCameraPos = new THREE.Vector3(0, 0, 2.75);
const targetCameraLookAt = new THREE.Vector3(0, 0, 0);

let cameraMoveProgress = 0;
let cameraMovingToFront = false;
let cameraMovingBack = false;

document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".rounded-button");
  buttons.forEach((button) => {
    button.addEventListener("mouseenter", () => {
      cameraMovingToFront = true;
      cameraMovingBack = false;
    });
    button.addEventListener("mouseleave", () => {
      cameraMovingBack = true;
      cameraMovingToFront = false;
    });
  });
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function lerpVector(v1, v2, alpha) {
  return new THREE.Vector3(
    THREE.MathUtils.lerp(v1.x, v2.x, alpha),
    THREE.MathUtils.lerp(v1.y, v2.y, alpha),
    THREE.MathUtils.lerp(v1.z, v2.z, alpha)
  );
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Main loop
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  // Camera ease
  const moveSpeed = 0.015;
  if (cameraMovingToFront) {
    cameraMoveProgress = Math.min(1, cameraMoveProgress + moveSpeed);
  } else if (cameraMovingBack) {
    cameraMoveProgress = Math.max(0, cameraMoveProgress - moveSpeed);
  }
  const easedProgress = easeInOutQuad(cameraMoveProgress);

  camera.fov = THREE.MathUtils.lerp(originalFov, targetFov, easedProgress);
  camera.updateProjectionMatrix();
  camera.position.copy(lerpVector(originalCameraPos, targetCameraPos, easedProgress));
  camera.lookAt(lerpVector(originalCameraLookAt, targetCameraLookAt, easedProgress));

  // Mouse-driven idle rotation
  if (object) {
    if (!mouseOnModel) {
      rotationVelocity.x *= 0.85;
      rotationVelocity.y *= 0.85;
    }

    currentRotation.x += rotationVelocity.x;
    currentRotation.y += rotationVelocity.y;

    currentRotation.x = THREE.MathUtils.clamp(currentRotation.x, -maxRotation, maxRotation);
    currentRotation.y = THREE.MathUtils.clamp(currentRotation.y, -maxRotation, maxRotation);

    currentRotation.x += (0 - currentRotation.x) * rotationDamping;
    currentRotation.y += (0 - currentRotation.y) * rotationDamping;

    pivot.rotation.x = currentRotation.x;
    pivot.rotation.y = currentRotation.y;
  }

  renderer.render(scene, camera);
}

document.querySelectorAll(".rounded-button").forEach(button => {
  button.addEventListener("click", e => {
    const link = button.getAttribute("data-link");
    const main = document.querySelector("main");

    // Add exit animation class
    main.classList.add("page-exit");

    // Wait for animation to finish, then navigate
    setTimeout(() => {
      window.location.href = link;
    }, 2000); // match CSS transition duration
  });
});

animate();
