import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js'
import GUI from 'lil-gui'
import particlesVertexShader from './shaders/particles/vertex.glsl'
import particlesFragmentShader from './shaders/particles/fragment.glsl'
import gpgpuParticlesShader from './shaders/gpgpu/particles.glsl'

// Scene setup

const canvas = document.querySelector<HTMLDivElement>('#canvas')

const gui = new GUI({ width: 340 })
const debugObject = {
  clearColor: '#29191f',
}

const scene = new THREE.Scene()

// Loaders
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio, 2)
}

const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100)
camera.position.set(4.5, 4, 15)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

const renderer = new THREE.WebGLRenderer({
  canvas: canvas!,
  antialias: true,
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(sizes.pixelRatio)
renderer.setClearColor(debugObject.clearColor)

const shipModel = await gltfLoader.loadAsync('./models/ship.glb')

const shipModelGeometry = shipModel.scene.children[0].geometry
const baseGeometry = {
  instance: shipModelGeometry,
  count: shipModelGeometry.attributes.position.count
}

// GPU
const gpgpuSize = Math.ceil(Math.sqrt(baseGeometry.count))
const gpgpu: {
  size: number
  computation: GPUComputationRenderer
  particlesVariable?: Variable
  debug?: THREE.Mesh
} = {
  size: gpgpuSize,
  computation: new GPUComputationRenderer(gpgpuSize, gpgpuSize, renderer),
}

const baseParticlesTexture = gpgpu.computation.createTexture()

for (let i = 0; i < baseGeometry.count; i++) {
  const i3 = i * 3
  const i4 = i * 4

  baseParticlesTexture.image.data![i4 + 0] = baseGeometry.instance.attributes.position.array[i3 + 0]
  baseParticlesTexture.image.data![i4 + 1] = baseGeometry.instance.attributes.position.array[i3 + 1]
  baseParticlesTexture.image.data![i4 + 2] = baseGeometry.instance.attributes.position.array[i3 + 2]
  baseParticlesTexture.image.data![i4 + 3] = Math.random()
}

// Particles variable
gpgpu.particlesVariable = gpgpu.computation.addVariable('uParticles', gpgpuParticlesShader, baseParticlesTexture)
gpgpu.computation.setVariableDependencies(gpgpu.particlesVariable, [ gpgpu.particlesVariable ])

// Uniforms
gpgpu.particlesVariable!.material.uniforms.uTime = new THREE.Uniform(0)
gpgpu.particlesVariable!.material.uniforms.uDeltaTime = new THREE.Uniform(0)
gpgpu.particlesVariable!.material.uniforms.uBase = new THREE.Uniform(baseParticlesTexture)
gpgpu.particlesVariable!.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(0.5)
gpgpu.particlesVariable!.material.uniforms.uFlowFieldStrength = new THREE.Uniform(2)
gpgpu.particlesVariable!.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(0.5)

// Init
gpgpu.computation.init()

// Debug
gpgpu.debug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({ map: gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture })
)
gpgpu.debug.position.x = 3
gpgpu.debug.visible = false
scene.add(gpgpu.debug)

// Geometry
const particlesUvArray = new Float32Array(baseGeometry.count * 2)
const sizesArray = new Float32Array(baseGeometry.count)

for (let y = 0; y < gpgpu.size; y++) {
  for (let x = 0; x < gpgpu.size; x++) {
    const i = (y * gpgpu.size + x);
    const i2 = i * 2

    // UV
    const uvX = (x + 0.5) / gpgpu.size;
    const uvY = (y + 0.5) / gpgpu.size;

    particlesUvArray[i2 + 0] = uvX;
    particlesUvArray[i2 + 1] = uvY;

    // Size
    sizesArray[i] = Math.random()
  }
}

const particles: {
  geometry?: THREE.BufferGeometry
  material?: THREE.ShaderMaterial
  points?: THREE.Points
} = {}

particles.geometry = new THREE.BufferGeometry()
particles.geometry.setDrawRange(0, baseGeometry.count)
particles.geometry.setAttribute('aParticlesUv', new THREE.BufferAttribute(particlesUvArray, 2))
particles.geometry.setAttribute('aColor', baseGeometry.instance.attributes.color)
particles.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizesArray, 1))

// Material
particles.material = new THREE.ShaderMaterial({
  vertexShader: particlesVertexShader,
  fragmentShader: particlesFragmentShader,
  uniforms: {
    uSize: new THREE.Uniform(0.07),
    uResolution: new THREE.Uniform(new THREE.Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)),
    uParticlesTexture: new THREE.Uniform(),
  }
})

// Points
particles.points = new THREE.Points(particles.geometry, particles.material)
scene.add(particles.points)

gui.addColor(debugObject, 'clearColor').onChange(() => { renderer.setClearColor(debugObject.clearColor) })
gui.add(particles.material.uniforms.uSize, 'value').min(0).max(1).step(0.001).name('uSize')
gui.add(gpgpu.particlesVariable!.material.uniforms.uFlowFieldInfluence, 'value').min(0).max(1).step(0.001).name('uFlowfieldInfluence')
gui.add(gpgpu.particlesVariable!.material.uniforms.uFlowFieldStrength, 'value').min(0).max(10).step(0.001).name('uFlowfieldStrength')
gui.add(gpgpu.particlesVariable!.material.uniforms.uFlowFieldFrequency, 'value').min(0).max(1).step(0.001).name('uFlowfieldFrequency')

// Animation
const clock = new THREE.Clock()
let previousTime = 0

const tick = () => {
  const elapsedTime = clock.getElapsedTime()
  const deltaTime = elapsedTime - previousTime
  previousTime = elapsedTime
  
  controls.update()

  // GPGPU Update
  gpgpu.particlesVariable!.material.uniforms.uTime.value = elapsedTime
  gpgpu.particlesVariable!.material.uniforms.uDeltaTime.value = deltaTime
  gpgpu.computation.compute()
  particles.material!.uniforms.uParticlesTexture.value = gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable!).texture

  renderer.render(scene, camera)

  window.requestAnimationFrame(tick)
}

tick()

// Utils
window.addEventListener('resize', () => {
  // Update sizes
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight
  sizes.pixelRatio = Math.min(window.devicePixelRatio, 2)

  // Materials
  particles.material!.uniforms.uResolution.value.set(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)

  // Update camera
  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  // Update renderer
  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(sizes.pixelRatio)
})
