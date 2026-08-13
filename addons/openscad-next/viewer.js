// The 3MF preview: an orbitable, zoomable WebGL view of what the sidecar just rendered, with a
// bounding-box dimensions readout beside it.
//
// IT REPLACES A SERVER-SIDE RASTERIZE, AND THAT IS A REMOVAL OF WORK RATHER THAN A MOVE OF IT. The
// retired Tools::OpenscadController#preview rendered the 3MF and then shelled out to
// Maker::Previews::ThreeMf -> the `stl-thumbnailer` binary to turn it into a PNG. Measured on the
// live chunk container through that exact path: render 0.31 s, rasterize 0.60 s — the picture cost
// roughly twice the model, and held a Puma thread for the whole of it. Doing it here costs the
// server nothing and gives the user the same interactive view the Files page already offers a saved
// 3MF. (The saved file's LIBRARY thumbnail is unaffected either way: Maker::Addons::LibraryOutput
// enqueues Maker::Previews::Enqueue for every file it writes, whatever produced the bytes.)
//
// THIS BUNDLE SHIPS NO THREE.JS BYTES. `three`, `three/addons/controls/OrbitControls.js` and
// `three/addons/loaders/3MFLoader.js` are HOST importmap pins (the tinkerex repo's
// config/importmap.rb), and `merged_importmap` draws every host pin before an addon's own — the
// same mechanism that makes "@maker/addon-sdk" importable with nothing in a manifest. So these are
// Propshaft-served host assets on digest URLs, shared with the Files page's own 3D viewer and
// browser-cached across visits.
//
// DYNAMIC import(), NOT A STATIC ONE, for the reason modelviewer_controller.js uses one: the whole
// 3MF viewer set is ~449 KB gzipped (three.module 129 + three.core 283 + fflate 22 + 3MFLoader 8 +
// OrbitControls 8), and the gallery — where most visits end — needs none of it. The first Preview
// click is what pays.

// WHICH WAY IS UP. Three's world is Y-up and ThreeMFLoader does NOT rotate what it parses — its own
// docblock tells the caller to (`object.rotation.set(-Math.PI/2, 0, 0) // z-up conversion`). A 3MF
// is Z-UP: the format declares nothing, but every producer and consumer in 3D printing treats +Z as
// up and the 3MF core spec puts the build plate in the XY plane. Get this wrong and every model
// renders lying on its side, consistently enough to read as a house style.
//
// THE CAMERA IS MOVED, THE MODEL IS NOT, and that is the half most likely to be "simplified" into
// the docblock's suggestion. Rotating the object is equivalent on screen and WRONG for the
// dimensions line: the bounding box is read after parse, so a rotated 10x20x30 model reports
// "10 x 30 x 20 mm" — a measurement that contradicts the user's own slicer. Leaving the mesh in its
// file's axes and telling the camera which way is up keeps the numbers honest. (tinkerex CLAUDE.md
// §14h records both halves; this file is the third place that rule has had to be written down.)
const UP = [ 0, 0, 1 ]
// Camera offset as (right, back, up) multiples of the model's largest dimension — an iso-ish 3/4
// view, the same framing modelviewer_controller.js uses, so a model looks the same here and on its
// file page.
const VIEW_OFFSET = { right: 1.4, back: 1.6, up: 1.0 }

// root:  the element carrying the host's `.model-viewer` classes; gets `--ready` once a render
//        lands, which is what reveals the stage (the host's CSS keeps it display:none until then).
// stage: the element the <canvas> is appended to.
// dims:  an element for the "X x Y x Z mm" readout (optional).
//
// -> { show(arrayBuffer), destroy() }. `show` is safe to call repeatedly; a superseded call drops
// its own result rather than racing the newer one.
export function mountViewer({ root, stage, dims }) {
  let modules = null
  let scene = null
  let camera = null
  let renderer = null
  let controls = null
  let resizeObserver = null
  let frame = null
  let current = null // the Object3D currently in the scene, so the next show() can dispose it
  let generation = 0
  let disposed = false

  // Loaded ONCE and held: the three imports are the expensive part of a preview and a user clicks
  // Preview repeatedly while tuning a parameter. `import()` is itself memoized per URL by the
  // module system, so this only saves the three awaits — but it also makes the "already booted"
  // test below a plain truthiness check rather than a promise race.
  async function load() {
    if (modules) return modules
    const [ THREE, orbit, loader ] = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
      import("three/addons/loaders/3MFLoader.js"),
    ])
    modules = { THREE, OrbitControls: orbit.OrbitControls, ThreeMFLoader: loader.ThreeMFLoader }
    return modules
  }

  // ONE renderer, scene and camera for the life of this editor — NOT one per preview. A browser
  // caps live WebGL contexts (~16 in Chrome) and silently drops the oldest when the cap is passed,
  // so building a fresh renderer per click would start blanking earlier previews after a dozen
  // parameter tweaks. Swapping the object inside a scene that already exists has no such ceiling.
  function boot(THREE, OrbitControls) {
    if (renderer) return

    // BEFORE MEASURING, not after: the host's `.model-viewer-stage` is display:none until `--ready`
    // is set, and a display:none element reports clientWidth 0 — so a viewer that revealed itself
    // last would size its canvas from the fallback numbers and stay that size until something
    // resized the window. (modelviewer_controller.js adds the class last and is rescued by its
    // ResizeObserver's initial callback; doing it in this order means the first frame is right.)
    root.classList.add("model-viewer--ready")
    const width = stage.clientWidth || 640
    const height = stage.clientHeight || 420

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf7f8fa)

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    // BEFORE OrbitControls IS CONSTRUCTED. The controls build their spherical frame from
    // `camera.up`, so a viewer set up Y-up and corrected afterwards orbits about the wrong pole and
    // tumbles under the mouse. Near/far are re-derived per model in `frameCamera`.
    camera.up.set(...UP)

    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    stage.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0))
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(1, 1, 1)
    scene.add(key)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)
    controls.update()

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(stage)
    animate()
  }

  function frameCamera(size) {
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const { right, back, up } = VIEW_OFFSET
    camera.near = maxDim / 100
    camera.far = maxDim * 100
    // (right, back, up) in a Z-up frame: x to the right, y away, z up. The order differs from the
    // Y-up spelling and is not interchangeable with it.
    camera.position.set(maxDim * right, maxDim * back, maxDim * up)
    camera.updateProjectionMatrix()
    controls.target.set(0, 0, 0)
    controls.update()
  }

  // 3MF carries its own unit and ThreeMFLoader applies it, so this is millimetres for anything the
  // openscad sidecar produces (its output declares unit="millimeter"). Rounded to 0.1 to read like
  // a measurement rather than a float.
  function showDims(size) {
    if (!dims) return
    const mm = (n) => (Math.round(n * 10) / 10).toLocaleString()
    dims.textContent = `${mm(size.x)} × ${mm(size.y)} × ${mm(size.z)} mm`
  }

  function disposeObject(object) {
    object.traverse((o) => {
      o.geometry?.dispose?.()
      if (o.material) [].concat(o.material).forEach((m) => m.dispose?.())
    })
  }

  function resize() {
    if (!renderer || disposed) return
    const width = stage.clientWidth || 640
    const height = stage.clientHeight || 420
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }

  function animate() {
    if (disposed || !renderer) return
    frame = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }

  return {
    async show(bytes) {
      // STAMPED, so a slow earlier parse cannot overwrite a newer model. The sidecar call that
      // produced these bytes is aborted on supersede by its own caller (editor.js), but the parse
      // and the module load happen after that call has already resolved, and neither takes a
      // signal.
      const mine = ++generation
      const { THREE, OrbitControls, ThreeMFLoader } = await load()
      if (disposed || mine !== generation) return

      const object = new ThreeMFLoader().parse(bytes)
      if (disposed || mine !== generation) return

      boot(THREE, OrbitControls)

      if (current) {
        scene.remove(current)
        disposeObject(current)
      }
      current = object

      // Read the size BEFORE recentring — `position.sub(center)` moves the object, and a Box3 taken
      // afterwards would describe the same box in different coordinates. Recentring is what puts the
      // model under the orbit target; it does not rotate anything, so the numbers stay the file's.
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      object.position.sub(center)
      scene.add(object)

      showDims(size)
      frameCamera(size)
      resize()
    },

    destroy() {
      disposed = true
      generation++
      if (frame) cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      controls?.dispose()
      if (current) disposeObject(current)
      if (renderer) {
        renderer.dispose()
        // dispose() frees three's own GPU objects but leaves the CONTEXT alive; the count that gets
        // capped is contexts. An editor opened and closed a dozen times in one page's life is an
        // ordinary session here, so give it back explicitly.
        renderer.forceContextLoss?.()
        renderer.domElement?.remove()
      }
      scene = camera = renderer = controls = current = null
      root.classList.remove("model-viewer--ready")
    },
  }
}
