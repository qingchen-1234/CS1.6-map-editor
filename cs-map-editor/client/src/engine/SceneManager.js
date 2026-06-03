// ============================================================
// SceneManager — Three.js 场景管理器 (专业 2D 包围盒无损缩放版)
// ============================================================

import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'

const GRID_SIZE = 16

export class SceneManager {
  constructor() {
    this.scene = null
    this.camera = null
    this.renderer = null
    this.transformControls = null
    this.transformControlsDummy = null
    this.gridHelpers = []
    this.onSelectBlock = null
    this.onBlockMoved = null
    this.blockMeshes = new Map()
    this.cursors = new Map()
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
    this.keys = {}

    this.moveSpeed = 1500
    this.lookSensitivity = 0.003

    this.isRightDragging = false
    this.isLeftDragging = false
    this.isMiddleDragging = false
    this.prevMouse = { x: 0, y: 0 }

    this.currentGridSize = GRID_SIZE
    this.isSnapEnabled = true
    this._getActiveCamera = null
    this._viewportManager = null
    this._activeDragView = null

    // ★ 缩放控制系统核心变量
    this.selectedBlockId = null
    this.resizeGizmo = null
    this.resizeHandles = null
    this.resizeBoxHelper = null
    this.isResizing = false
    this.activeResizeHandle = null
    this.dragPlane = new THREE.Plane()

    // 锁定视口，防止跨视图跳跃
    this.activeDragViewportName = null
    this.activeDragCamera = null

    this.dragStartWorld = new THREE.Vector3()
    this.resizeStartScale = new THREE.Vector3()
    this.resizeStartPos = new THREE.Vector3()
  }

  setActiveCameraFn(fn) { this._getActiveCamera = fn }
  setViewportManager(vm) { this._viewportManager = vm }

  setSnapEnabled(enabled) {
    this.isSnapEnabled = enabled
    if (this.transformControls) this.transformControls.setTranslationSnap(enabled ? this.currentGridSize : null)
  }

  updateGridSize(newSize) {
    this.currentGridSize = Math.max(1, Math.min(256, newSize))
    if (this.transformControls && this.isSnapEnabled) this.transformControls.setTranslationSnap(this.currentGridSize)
    this._rebuildGrids()
  }

  _rebuildGrids() {
    for (const g of this.gridHelpers) { this.scene.remove(g); g.geometry.dispose(); g.material.dispose() }
    this.gridHelpers = []

    const range = 16384
    const buildGridLayer = (size, color, isMajor) => {
      const divisions = Math.floor(range / size)
      const grid = new THREE.GridHelper(range, divisions, color, color)
      grid.material.transparent = true; grid.material.opacity = isMajor ? 0.5 : 0.2
      grid.material.depthWrite = false; grid.renderOrder = -1
      return grid
    }

    this.gridXZ_minor = buildGridLayer(this.currentGridSize, '#333344', false)
    this.gridXZ_major = buildGridLayer(Math.max(256, this.currentGridSize * 4), '#555566', true)
    this.gridXY_minor = buildGridLayer(this.currentGridSize, '#333344', false); this.gridXY_minor.rotation.x = -Math.PI / 2
    this.gridXY_major = buildGridLayer(Math.max(256, this.currentGridSize * 4), '#555566', true); this.gridXY_major.rotation.x = -Math.PI / 2
    this.gridYZ_minor = buildGridLayer(this.currentGridSize, '#333344', false); this.gridYZ_minor.rotation.z = Math.PI / 2
    this.gridYZ_major = buildGridLayer(Math.max(256, this.currentGridSize * 4), '#555566', true); this.gridYZ_major.rotation.z = Math.PI / 2

    this.scene.add(this.gridXZ_minor, this.gridXZ_major, this.gridXY_minor, this.gridXY_major, this.gridYZ_minor, this.gridYZ_major)
    this.gridHelpers.push(this.gridXZ_minor, this.gridXZ_major, this.gridXY_minor, this.gridXY_major, this.gridYZ_minor, this.gridYZ_major)
  }

  clearAllBlocks() {
    for (const [id, mesh] of this.blockMeshes) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose() }
    this.blockMeshes.clear(); this.transformControls.detach(); this.selectedBlockId = null; this._updateResizeGizmo(null)
  }

  focusOnMap(blocks) {
    if (!blocks || blocks.length === 0) return
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    for (const b of blocks) {
      const hx = (b.scale.x || 64) / 2; const hy = (b.scale.y || 64) / 2; const hz = (b.scale.z || 64) / 2
      if (b.position.x - hx < minX) minX = b.position.x - hx; if (b.position.x + hx > maxX) maxX = b.position.x + hx
      if (b.position.z - hz < minZ) minZ = b.position.z - hz; if (b.position.z + hz > maxZ) maxZ = b.position.z + hz
      if (b.position.y - hy < minY) minY = b.position.y - hy; if (b.position.y + hy > maxY) maxY = b.position.y + hy
    }

    const cx = (minX + maxX)/2, cy = (minY + maxY)/2, cz = (minZ + maxZ)/2
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1000)

    if (this.camera) { this.camera.position.set(cx + maxDim*0.8, cy + maxDim*0.8, cz + maxDim*0.8); this.camera.lookAt(cx, cy, cz) }
    if (this._viewportManager) this._viewportManager.focusOnMap(cx, cy, cz, maxDim)
    if (this.transformControls) { const obj = this.transformControls.object; this.transformControls.detach(); if (obj) this.transformControls.attach(obj) }
  }

  init(canvas, viewportEl) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); this.renderer.setPixelRatio(window.devicePixelRatio); this.renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight); this.renderer.shadowMap.enabled = true
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(70, viewportEl.clientWidth / viewportEl.clientHeight, 1, 60000)

    this._setupLights(); this._setupGrid(); this._createResizeGizmo()

    this.transformControlsDummy = {
      addEventListener: function(type, listener) { if (!this.listeners[type]) this.listeners[type] = []; this.listeners[type].push(listener) },
      removeEventListener: function(type, listener) { if (!this.listeners[type]) return; this.listeners[type] = this.listeners[type].filter(l => l !== listener) },
      getBoundingClientRect: () => viewportEl.getBoundingClientRect(), style: viewportEl.style, listeners: {}, ownerDocument: this, setPointerCapture: () => {}, releasePointerCapture: () => {}
    }
    this.transformControlsDummy.ownerDocument = this.transformControlsDummy

    this.transformControls = new TransformControls(this.camera, this.transformControlsDummy)
    this.transformControls.setSize(0.8); this.transformControls.setTranslationSnap(GRID_SIZE)

    this.transformControls.addEventListener('dragging-changed', (e) => {
      if (!e.value) {
        const obj = this.transformControls.object
        if (obj && obj.userData.blockId && this.onBlockMoved) {
          const data = this.syncBlockFromMesh(obj.userData.blockId)
          if (data) this.onBlockMoved(obj.userData.blockId, data)
        }
        this._updateResizeGizmo(this.selectedBlockId)
      } else {
        this._updateResizeGizmo(null)
      }
    })
    this.scene.add(this.transformControls)

    this._bindEvents(viewportEl); this._animate()
  }

  _createResizeGizmo() {
    this.resizeGizmo = new THREE.Group(); this.resizeGizmo.visible = false; this.scene.add(this.resizeGizmo)
    this.resizeHandles = new THREE.Group(); this.resizeGizmo.add(this.resizeHandles)

    const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
    this.resizeBoxHelper = new THREE.LineSegments(boxGeo, new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 4, gapSize: 4, depthTest: false }))
    this.resizeBoxHelper.computeLineDistances()
    this.resizeBoxHelper.renderOrder = 1001
    this.resizeGizmo.add(this.resizeBoxHelper)

    const handleGeo = new THREE.BoxGeometry(12, 12, 12)
    const createHandle = (name) => {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false })
      const mesh = new THREE.Mesh(handleGeo, mat); mesh.name = name; mesh.renderOrder = 1002
      this.resizeHandles.add(mesh); return mesh
    }

    createHandle('px'); createHandle('nx')
    createHandle('py'); createHandle('ny')
    createHandle('pz'); createHandle('nz')

    createHandle('px_pz'); createHandle('nx_pz'); createHandle('px_nz'); createHandle('nx_nz')
    createHandle('px_py'); createHandle('nx_py'); createHandle('px_ny'); createHandle('nx_ny')
    createHandle('py_pz'); createHandle('ny_pz'); createHandle('py_nz'); createHandle('ny_nz')
  }

  // ★ 核心修复 1：修正 Y (Height) 轴和 Z (Depth) 轴的高度与深度乘反逻辑
  _updateResizeGizmo(blockId) {
    if (!blockId || !this.blockMeshes.has(blockId)) { this.resizeGizmo.visible = false; return }
    const mesh = this.blockMeshes.get(blockId)
    this.resizeGizmo.visible = true
    this.resizeGizmo.position.copy(mesh.position); this.resizeGizmo.quaternion.copy(mesh.quaternion)

    const w = mesh.userData.baseScale.x * mesh.scale.x // Width (Three X)
    const h = mesh.userData.baseScale.z * mesh.scale.y // Height (Three Y -> baseScale.z)
    const d = mesh.userData.baseScale.y * mesh.scale.z // Depth (Three Z -> baseScale.y)

    this.resizeBoxHelper.scale.set(w, h, d); this.resizeBoxHelper.computeLineDistances()

    const hw = w/2, hh = h/2, hd = d/2
    const hArr = this.resizeHandles.children

    hArr.find(c=>c.name==='px').position.set(hw, 0, 0); hArr.find(c=>c.name==='nx').position.set(-hw, 0, 0)
    hArr.find(c=>c.name==='py').position.set(0, hh, 0); hArr.find(c=>c.name==='ny').position.set(0, -hh, 0)
    hArr.find(c=>c.name==='pz').position.set(0, 0, hd); hArr.find(c=>c.name==='nz').position.set(0, 0, -hd)

    hArr.find(c=>c.name==='px_pz').position.set(hw, 0, hd); hArr.find(c=>c.name==='nx_pz').position.set(-hw, 0, hd)
    hArr.find(c=>c.name==='px_nz').position.set(hw, 0, -hd); hArr.find(c=>c.name==='nx_nz').position.set(-hw, 0, -hd)

    hArr.find(c=>c.name==='px_py').position.set(hw, hh, 0); hArr.find(c=>c.name==='nx_py').position.set(-hw, hh, 0)
    hArr.find(c=>c.name==='px_ny').position.set(hw, -hh, 0); hArr.find(c=>c.name==='nx_ny').position.set(-hw, -hh, 0)

    hArr.find(c=>c.name==='py_pz').position.set(0, hh, hd); hArr.find(c=>c.name==='ny_pz').position.set(0, -hh, hd)
    hArr.find(c=>c.name==='py_nz').position.set(0, hh, -hd); hArr.find(c=>c.name==='ny_nz').position.set(0, -hh, -hd)
  }

  // ==========================================================
  // ★ 核心新增：获取当前视图专用的 8 个活动拉伸柄 (解决时序冲突)
  // ==========================================================
  getVisibleHandlesForView(viewName) {
    const names = {
      top: ['px', 'nx', 'pz', 'nz', 'px_pz', 'nx_pz', 'px_nz', 'nx_nz'],
      front: ['px', 'nx', 'py', 'ny', 'px_py', 'nx_py', 'px_ny', 'nx_ny'],
      side: ['py', 'ny', 'pz', 'nz', 'py_pz', 'ny_pz', 'py_nz', 'ny_nz'],
      perspective: []
    }
    const activeNames = names[viewName] || []
    return this.resizeHandles.children.filter(h => activeNames.includes(h.name))
  }

  updateGizmoVisibility(viewName, camera) {
    if (!this.resizeGizmo || !this.resizeGizmo.visible) return

    for (const h of this.resizeHandles.children) h.visible = false
    this.resizeBoxHelper.visible = false

    if (viewName === 'perspective') return

    this.resizeBoxHelper.visible = true
    const show = (names) => { for (const n of names) this.resizeHandles.children.find(c=>c.name===n).visible = true }

    if (viewName === 'top') show(['px','nx','pz','nz','px_pz','nx_pz','px_nz','nx_nz'])
    if (viewName === 'front') show(['px','nx','py','ny','px_py','nx_py','px_ny','nx_ny'])
    if (viewName === 'side') show(['py','ny','pz','nz','py_pz','ny_pz','py_nz','ny_nz'])

    const scaleFactor = Math.max(0.4, Math.min((camera.right - camera.left) / 1000, 3))
    for (const h of this.resizeHandles.children) h.scale.setScalar(scaleFactor)
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight('#ffffff', 0.6); this.scene.add(ambient)
    const dirLight = new THREE.DirectionalLight('#ffffff', 0.8); dirLight.position.set(200, 400, 300); dirLight.castShadow = true; this.scene.add(dirLight)
  }

  _setupGrid() {
    this._rebuildGrids()
    const axisLen = 8192
    const xAxis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-axisLen, 0, 0), new THREE.Vector3(axisLen, 0, 0)]), new THREE.LineBasicMaterial({ color: '#ff4444', opacity: 0.4, transparent: true, depthWrite: false }))
    const yAxis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -axisLen, 0), new THREE.Vector3(0, axisLen, 0)]), new THREE.LineBasicMaterial({ color: '#44ff44', opacity: 0.4, transparent: true, depthWrite: false }))
    const zAxis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -axisLen), new THREE.Vector3(0, 0, axisLen)]), new THREE.LineBasicMaterial({ color: '#44ff44', opacity: 0.4, transparent: true, depthWrite: false }))
    this.scene.add(xAxis, yAxis, zAxis)
  }

  _dispatchToTransformControls(type, event, viewportEl) {
    if (!this.transformControls || !this._viewportManager) return

    const rect = viewportEl.getBoundingClientRect()
    const canvasX = event.clientX - rect.left; const canvasY = event.clientY - rect.top

    let viewName = null
    if (this.transformControls.dragging && this._activeDragView) viewName = this._activeDragView
    else viewName = this._viewportManager.hitTest(canvasX, canvasY)
    if (!viewName) return

    if (type === 'pointerdown') this._activeDragView = viewName
    if (type === 'pointerup') this._activeDragView = null

    const vp = this._viewportManager.viewports[viewName]
    const camera = this._viewportManager.getCameraForView(viewName)

    if (!this.transformControls.dragging) {
      this.transformControls.camera = camera
      this._viewportManager.activateView(viewName)
    }

    const localX = canvasX - vp.x; const localY = canvasY - vp.y
    const ndcX = (localX / vp.w) * 2 - 1; const ndcY = -(localY / vp.h) * 2 + 1
    const fakeClientX = ((ndcX + 1) / 2) * rect.width + rect.left
    const fakeClientY = ((-ndcY + 1) / 2) * rect.height + rect.top

    const fakeEvent = {
      type: type, clientX: fakeClientX, clientY: fakeClientY, button: event.button !== undefined ? event.button : 0,
      pointerId: event.pointerId || 1, pointerType: event.pointerType || 'mouse',
      preventDefault: () => {}, stopPropagation: () => {}
    }

    const listeners = this.transformControlsDummy.listeners[type]
    if (listeners) { const listenersCopy = [...listeners]; for (const listener of listenersCopy) listener(fakeEvent) }
  }

  _bindEvents(viewportEl) {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      this.keys[e.key.toLowerCase()] = true
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (this.selectedBlockId) { e.preventDefault(); this._nudgeSelectedBlock(e.key) }
      }
    })
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false })

    viewportEl.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.isLeftDragging = true; if (e.button === 1) this.isMiddleDragging = true; if (e.button === 2) this.isRightDragging = true
      this.prevMouse.x = e.clientX; this.prevMouse.y = e.clientY

      if (e.button === 0 && this.resizeGizmo.visible) {
        const rect = viewportEl.getBoundingClientRect()
        const rayData = this._viewportManager.getRaycasterData(e.clientX - rect.left, e.clientY - rect.top)

        if (rayData && rayData.viewName !== 'perspective') {
          this.raycaster.params.Line.threshold = 10
          this.raycaster.setFromCamera(rayData.mouseCoords, rayData.camera)

          // ❌ 修改前：const visibleHandles = this.resizeHandles.children.filter(h => h.visible)
          // ✅ 修改后：使用精准的视口过滤器
          const visibleHandles = this.getVisibleHandlesForView(rayData.viewName)
          const hits = this.raycaster.intersectObjects(visibleHandles, false)

          if (hits.length > 0) {
            this.isResizing = true
            this.activeResizeHandle = hits[0].object.name

            // ★ 核心修复 2：在 pointerdown 锁死起拖视图和相机，解决跨视口拉飞
            this.activeDragViewportName = rayData.viewName
            this.activeDragCamera = rayData.camera

            const targetMesh = this.blockMeshes.get(this.selectedBlockId)

            this.resizeStartScale.copy(targetMesh.scale)
            this.resizeStartPos.copy(targetMesh.position)

            const planeNormal = new THREE.Vector3().copy(rayData.camera.position).sub(targetMesh.position).normalize()
            this.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, targetMesh.position)

            const intersect = new THREE.Vector3()
            this.raycaster.ray.intersectPlane(this.dragPlane, intersect)
            this.dragStartWorld.copy(intersect)

            this.transformControls.detach()
            return
          }
        }
      }

      this._dispatchToTransformControls('pointerdown', e, viewportEl)
    })

    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.isLeftDragging = false; if (e.button === 1) this.isMiddleDragging = false; if (e.button === 2) this.isRightDragging = false

      if (this.isResizing) {
        this.isResizing = false
        const targetMesh = this.blockMeshes.get(this.selectedBlockId)
        if (targetMesh) {
          this.transformControls.attach(targetMesh)
          if (this.onBlockMoved) {
            const data = this.syncBlockFromMesh(this.selectedBlockId)
            if (data) this.onBlockMoved(this.selectedBlockId, data)
          }
        }
        return
      }

      this._dispatchToTransformControls('pointerup', e, viewportEl)
    })

    window.addEventListener('pointermove', (e) => {
      // ★ 核心修复 3：使用起拖视图的相机进行锁定计算，绝对不会瞬移和报错
      if (this.isResizing && this.selectedBlockId) {
        const rect = viewportEl.getBoundingClientRect()
        const canvasX = e.clientX - rect.left
        const canvasY = e.clientY - rect.top

        const vp = this._viewportManager.viewports[this.activeDragViewportName]
        const localX = canvasX - vp.x
        const localY = canvasY - vp.y
        const ndcX = (localX / vp.w) * 2 - 1
        const ndcY = -(localY / vp.h) * 2 + 1

        this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.activeDragCamera)
        const intersect = new THREE.Vector3()

        if (this.raycaster.ray.intersectPlane(this.dragPlane, intersect)) {
          const targetMesh = this.blockMeshes.get(this.selectedBlockId)
          const worldDelta = intersect.clone().sub(this.dragStartWorld)
          const localDelta = worldDelta.clone().applyQuaternion(targetMesh.quaternion.clone().invert())

          let dw = 0, dh = 0, dd = 0
          let sx = 0, sy = 0, sz = 0

          const n = this.activeResizeHandle
          if (n.includes('px')) { dw = localDelta.x; sx = localDelta.x / 2 }
          if (n.includes('nx')) { dw = -localDelta.x; sx = localDelta.x / 2 }

          // ★ 核心修复 4：修正拖拽时，高度(py)与深度(pz)的 Delta 错位映射
          if (n.includes('py')) { dh = localDelta.y; sy = localDelta.y / 2 }
          if (n.includes('ny')) { dh = -localDelta.y; sy = localDelta.y / 2 }
          if (n.includes('pz')) { dd = localDelta.z; sz = localDelta.z / 2 }
          if (n.includes('nz')) { dd = -localDelta.z; sz = localDelta.z / 2 }

          if (this.isSnapEnabled) {
            dw = Math.round(dw / this.currentGridSize) * this.currentGridSize
            dh = Math.round(dh / this.currentGridSize) * this.currentGridSize
            dd = Math.round(dd / this.currentGridSize) * this.currentGridSize
            sx = Math.round(sx / this.currentGridSize) * this.currentGridSize
            sy = Math.round(sy / this.currentGridSize) * this.currentGridSize
            sz = Math.round(sz / this.currentGridSize) * this.currentGridSize
          }

          // ★ 核心修复 5：读取包围盒比例时的轴向基准对齐
          const baseW = targetMesh.userData.baseScale.x * this.resizeStartScale.x // Width (X)
          const baseH = targetMesh.userData.baseScale.z * this.resizeStartScale.y // Height (Three Y -> baseScale.z)
          const baseD = targetMesh.userData.baseScale.y * this.resizeStartScale.z // Depth (Three Z -> baseScale.y)

          const newW = baseW + dw
          const newH = baseH + dh
          const newD = baseD + dd

          if (newW >= 1 && newH >= 1 && newD >= 1) {
            // ★ 核心修复 6：scale.set 高度和深度对齐
            targetMesh.scale.set(
              newW / targetMesh.userData.baseScale.x,
              newH / targetMesh.userData.baseScale.z, // Height -> Y
              newD / targetMesh.userData.baseScale.y  // Depth -> Z
            )
            const worldShift = new THREE.Vector3(sx, sy, sz).applyQuaternion(targetMesh.quaternion)
            targetMesh.position.copy(this.resizeStartPos).add(worldShift)
            this._updateResizeGizmo(this.selectedBlockId)
          }
        }
        return
      }

      this._dispatchToTransformControls('pointermove', e, viewportEl)

      // ★ 悬停颜色变化
      if (!this.isLeftDragging && !this.isMiddleDragging && !this.isRightDragging && this.resizeGizmo.visible) {
        const rect = viewportEl.getBoundingClientRect()
        const rayData = this._viewportManager.getRaycasterData(e.clientX - rect.left, e.clientY - rect.top)

        let isHoveringHandle = false
        if (rayData && rayData.viewName !== 'perspective') {
          this.raycaster.setFromCamera(rayData.mouseCoords, rayData.camera)

          // ❌ 修改前：const visibleHandles = this.resizeHandles.children.filter(h => h.visible)
          // ✅ 修改后：使用精准的视口过滤器
          const visibleHandles = this.getVisibleHandlesForView(rayData.viewName)
          const hits = this.raycaster.intersectObjects(visibleHandles, false)

          if (hits.length > 0) {
            isHoveringHandle = true
            viewportEl.style.cursor = 'crosshair'
            this.resizeHandles.children.forEach(h => h.material.color.set(h === hits[0].object ? '#ff0000' : '#ffffff'))
            if (this.transformControls) this.transformControls.visible = false
            return
          }
        }

        if (!isHoveringHandle) {
          this.resizeHandles.children.forEach(h => h.material.color.set('#ffffff'))
          viewportEl.style.cursor = 'default'
          if (this.transformControls && this.selectedBlockId) this.transformControls.visible = true
        }
      }

      const isDraggingTransform = this.transformControls && this.transformControls.dragging
      const shouldOrbit = this.isRightDragging || (this.isLeftDragging && this.isMiddleDragging) || this.isMiddleDragging
      if (shouldOrbit && !isDraggingTransform) {
        this._orbitCamera(e.clientX - this.prevMouse.x, e.clientY - this.prevMouse.y)
        this.prevMouse.x = e.clientX; this.prevMouse.y = e.clientY
      }
    })

    viewportEl.addEventListener('wheel', (e) => {
      e.preventDefault()
      const rect = viewportEl.getBoundingClientRect()
      const rayData = this._viewportManager.getRaycasterData(e.clientX - rect.left, e.clientY - rect.top)

      let targetCamera = this.camera; let ndcX = 0, ndcY = 0
      if (rayData) { targetCamera = rayData.camera; ndcX = rayData.mouseCoords.x; ndcY = rayData.mouseCoords.y; this._viewportManager.activateView(rayData.viewName) }

      if (targetCamera && targetCamera.isOrthographicCamera) {
        this._viewportManager.zoomOrthoCamera(targetCamera, e.deltaY, ndcX, ndcY)
      } else if (targetCamera) {
        const forward = new THREE.Vector3(); targetCamera.getWorldDirection(forward)
        targetCamera.position.addScaledVector(forward, -e.deltaY * 50 * 0.01)
      }
    }, { passive: false })

    let clickStart = { x: 0, y: 0 }
    viewportEl.addEventListener('mousedown', (e) => { if (e.button === 0) clickStart = { x: e.clientX, y: e.clientY } })
    viewportEl.addEventListener('click', (e) => {
      if (e.button !== 0) return
      if (Math.abs(e.clientX - clickStart.x) > 5 || Math.abs(e.clientY - clickStart.y) > 5) return
      this._pickBlock(e, viewportEl)
    })
    window.addEventListener('resize', () => {
      if (!this.renderer || !this.camera) return
      this.camera.aspect = viewportEl.clientWidth / viewportEl.clientHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight)
    })
    viewportEl.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  _pickBlock(event, viewportEl) {
    const rect = viewportEl.getBoundingClientRect()
    const canvasX = event.clientX - rect.left; const canvasY = event.clientY - rect.top

    let camera = this.camera
    this.mouse.x = (canvasX / rect.width) * 2 - 1; this.mouse.y = -(canvasY / rect.height) * 2 + 1

    if (this._viewportManager) {
      const rayData = this._viewportManager.getRaycasterData(canvasX, canvasY)
      if (rayData) { camera = rayData.camera; this.mouse.copy(rayData.mouseCoords) }
    }

    this.raycaster.setFromCamera(this.mouse, camera)
    let intersects = []

    if (camera.isOrthographicCamera) {
      this.raycaster.params.Line.threshold = (camera.right - camera.left) / 100
      const pickables = []
      for (const mesh of this.blockMeshes.values()) {
        if (mesh.userData.edges) pickables.push(mesh.userData.edges)
        if (mesh.userData.centerMarker) pickables.push(mesh.userData.centerMarker)
      }
      intersects = this.raycaster.intersectObjects(pickables, false)
    } else {
      const meshes = Array.from(this.blockMeshes.values())
      intersects = this.raycaster.intersectObjects(meshes, false)
    }

    if (intersects.length > 0) {
      let obj = intersects[0].object
      if (obj.parent && obj.parent.userData && obj.parent.userData.blockId) obj = obj.parent

      this.selectedBlockId = obj.userData.blockId
      this._highlightBlock(this.selectedBlockId)

      this.transformControls.camera = camera
      this.transformControls.attach(obj)
      if (this.onSelectBlock) this.onSelectBlock(this.selectedBlockId)
    } else {
      this.selectedBlockId = null
      this._highlightBlock(null)
      this.transformControls.detach()
      if (this.onSelectBlock) this.onSelectBlock(null)
    }
  }

  setRenderMode(mode) {
    const isWireframe = (mode === 'wireframe')
    for (const [id, mesh] of this.blockMeshes) {
      mesh.material.visible = !isWireframe
      if (mesh.userData.edges) mesh.userData.edges.visible = isWireframe
      if (mesh.userData.centerMarker) mesh.userData.centerMarker.visible = isWireframe
      if (!isWireframe) {
        const isLocked = mesh.material.opacity === 0.5
        mesh.material.color.set(isLocked ? '#555555' : (mesh.userData.originalColor || '#888888'))
      }
    }
  }

  _highlightBlock(blockId) {
    for (const [id, mesh] of this.blockMeshes) {
      if (id === blockId) {
        mesh.material.emissive?.set('#333333')
        if (mesh.userData.edges) { mesh.userData.edges.material.color.set('#ffffff'); mesh.userData.edges.renderOrder = 1000 }
        if (mesh.userData.centerMarker) { mesh.userData.centerMarker.material.color.set('#ffffff'); mesh.userData.centerMarker.renderOrder = 1000 }
      } else {
        mesh.material.emissive?.set('#000000')
        if (mesh.userData.edges) { mesh.userData.edges.material.color.set('#4a9eff'); mesh.userData.edges.renderOrder = 998 }
        if (mesh.userData.centerMarker) { mesh.userData.centerMarker.material.color.set('#00ffff'); mesh.userData.centerMarker.renderOrder = 998 }
      }
    }
    this._updateResizeGizmo(blockId)
  }

  _createGeometry(block) {
    const { type, scale, vertices } = block
    const width = scale.x; const depth = scale.y; const height = scale.z
    const hx = width / 2; const hy = height / 2; const hz = depth / 2

    if (type === 'custom' && vertices && vertices.length >= 4) {
      try { return new ConvexGeometry(vertices.map(v => new THREE.Vector3(v.x, v.y, v.z))) }
      catch (err) { console.warn(`降级: ${block.id}`) }
    }
    switch (type) {
      case 'ramp': { const s = new THREE.Shape(); s.moveTo(-hx, -hy); s.lineTo( hx, -hy); s.lineTo( hx,  hy); s.lineTo(-hx, -hy); const g = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false }); g.translate(0, 0, -hz); return g }
      case 'wedge': { const s = new THREE.Shape(); s.moveTo(-hx, -hy); s.lineTo( hx, -hy); s.lineTo( 0,   hy); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false }); g.translate(0, 0, -hz); return g }
      default: return new THREE.BoxGeometry(width, height, depth)
    }
  }

  renderBlock(block) {
    const geometry = this._createGeometry(block)
    const originalColor = block.color || '#888888'
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: originalColor, roughness: 0.7, metalness: 0.1, transparent: true, opacity: 0.9 }))
    mesh.position.set(block.position.x, block.position.z, block.position.y); mesh.castShadow = true; mesh.receiveShadow = true

    mesh.userData.blockId = block.id; mesh.userData.originalColor = originalColor; mesh.userData.blockType = block.type || 'cube'
    mesh.userData.texture = block.texture || 'AAATRIGGER'; mesh.userData.vertices = block.vertices || null
    mesh.userData.baseScale = { x: block.scale.x, y: block.scale.y, z: block.scale.z }
    if (block.rotation) mesh.rotation.set(THREE.MathUtils.degToRad(block.rotation.x || 0), THREE.MathUtils.degToRad(block.rotation.z || 0), THREE.MathUtils.degToRad(block.rotation.y || 0))

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 15), new THREE.LineBasicMaterial({ color: '#4a9eff', depthTest: false }))
    edges.renderOrder = 998; edges.visible = false; mesh.add(edges); mesh.userData.edges = edges

    const crossMarker = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-16, 0, 0), new THREE.Vector3(16, 0, 0), new THREE.Vector3(0, -16, 0), new THREE.Vector3(0, 16, 0), new THREE.Vector3(0, 0, -16), new THREE.Vector3(0, 0, 16)]), new THREE.LineBasicMaterial({ color: '#00ffff', depthTest: false }))
    crossMarker.renderOrder = 999; crossMarker.visible = false; mesh.add(crossMarker); mesh.userData.centerMarker = crossMarker

    this.scene.add(mesh); this.blockMeshes.set(block.id, mesh)
  }

  updateBlockMesh(id, position, scale, rotation) {
    const mesh = this.blockMeshes.get(id)
    if (!mesh) return
    if (position) mesh.position.set(position.x, position.z, position.y)

    if (scale) {
      mesh.geometry.dispose()
      mesh.geometry = this._createGeometry({ type: mesh.userData.blockType || 'cube', scale, vertices: mesh.userData.vertices })
      if (mesh.userData.edges) { mesh.userData.edges.geometry.dispose(); mesh.userData.edges.geometry = new THREE.EdgesGeometry(mesh.geometry, 15) }
      mesh.userData.baseScale = { x: scale.x, y: scale.y, z: scale.z }; mesh.scale.set(1, 1, 1)
    }

    if (rotation) mesh.rotation.set(THREE.MathUtils.degToRad(rotation.x || 0), THREE.MathUtils.degToRad(rotation.z || 0), THREE.MathUtils.degToRad(rotation.y || 0))
    if (this.selectedBlockId === id) this._updateResizeGizmo(id)
  }

  // ★ 核心修复 7：修正数据逆向同步服务器时的轴向反推混淆
  syncBlockFromMesh(blockId) {
    const mesh = this.blockMeshes.get(blockId)
    if (!mesh) return null
    let newVerts = mesh.userData.vertices
    if (newVerts && (mesh.scale.x !== 1 || mesh.scale.y !== 1 || mesh.scale.z !== 1)) {
      newVerts = newVerts.map(v => ({
        x: v.x * mesh.scale.x,
        y: v.y * mesh.scale.z, // ★ Depth (Y) -> scale.z
        z: v.z * mesh.scale.y  // ★ Height (Z) -> scale.y
      }));
      mesh.userData.vertices = newVerts
    }
    return {
      id: blockId, type: mesh.userData.blockType, color: mesh.userData.originalColor, texture: mesh.userData.texture, vertices: newVerts,
      position: { x: mesh.position.x, y: mesh.position.z, z: mesh.position.y },
      rotation: { x: THREE.MathUtils.radToDeg(mesh.rotation.x), y: THREE.MathUtils.radToDeg(mesh.rotation.z), z: THREE.MathUtils.radToDeg(mesh.rotation.y) },
      scale: {
        x: Math.round(mesh.userData.baseScale.x * mesh.scale.x),
        y: Math.round(mesh.userData.baseScale.y * mesh.scale.z), // ★ depth -> scale.z
        z: Math.round(mesh.userData.baseScale.z * mesh.scale.y)  // ★ height -> scale.y
      }
    }
  }

  removeBlockMesh(id) {
    const mesh = this.blockMeshes.get(id); if (!mesh) return
    this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); this.blockMeshes.delete(id); this.transformControls.detach()
    if (this.selectedBlockId === id) { this.selectedBlockId = null; this._updateResizeGizmo(null) }
  }

  setBlockLocked(blockId, locked) {
    const mesh = this.blockMeshes.get(blockId); if (!mesh) return
    if (locked) { mesh.material.color.set('#555555'); mesh.material.opacity = 0.5 }
    else { mesh.material.color.set(mesh.userData.originalColor || '#888888'); mesh.material.opacity = 0.9 }
  }

  updateCursor(userId, userName, position) {
    let cursor = this.cursors.get(userId)
    if (!cursor) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff4444' }))
      sphere.position.set(position.x, position.z, position.y); this.scene.add(sphere); this.cursors.set(userId, sphere)
    } else cursor.position.set(position.x, position.z, position.y)
  }

  removeCursor(userId) { const cursor = this.cursors.get(userId); if (cursor) { this.scene.remove(cursor); this.cursors.delete(userId) } }
  _animate() { requestAnimationFrame(() => this._animate()); this._updateCamera(); if (this._onRender) this._onRender(); else this.renderer.render(this.scene, this.camera) }
  setRenderCallback(callback) { this._onRender = callback }

  _orbitCamera(dx, dy) {
    const camera = this.camera; if (!camera || !camera.isPerspectiveCamera) return
    const euler = new THREE.Euler(0, 0, 0, 'YXZ'); euler.setFromQuaternion(camera.quaternion)
    euler.y -= dx * this.lookSensitivity; euler.x -= dy * this.lookSensitivity
    euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, euler.x)); camera.quaternion.setFromEuler(euler)
  }

  _updateCamera() {
    const camera = this._getActiveCamera ? this._getActiveCamera() : this.camera; if (!camera) return
    const speed = this.moveSpeed * 0.016
    if (camera.isPerspectiveCamera) {
      const dir = new THREE.Vector3(); const forward = new THREE.Vector3()
      camera.getWorldDirection(forward); forward.y = 0; forward.normalize()
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
      if (this.keys['w']) dir.add(forward); if (this.keys['s']) dir.add(forward.clone().negate())
      if (this.keys['a']) dir.add(right.clone().negate()); if (this.keys['d']) dir.add(right)
      if (this.keys['q']) dir.y -= 1; if (this.keys['e']) dir.y += 1
      if (dir.length() > 0) camera.position.add(dir.normalize().multiplyScalar(speed))
    } else if (camera.isOrthographicCamera) {
      let dx = 0, dy = 0
      if (this.keys['w']) dy += 1; if (this.keys['s']) dy -= 1; if (this.keys['a']) dx -= 1; if (this.keys['d']) dx += 1
      if (dx !== 0 || dy !== 0) {
        const panSpeed = ((camera.right - camera.left) / 1000) * (speed * 1.5)
        camera.translateX(dx * panSpeed); camera.translateY(dy * panSpeed)
      }
    }
  }

  _nudgeSelectedBlock(key) {
    const obj = this.transformControls.object; if (!obj || !obj.userData.blockId) return
    const step = this.isSnapEnabled ? this.currentGridSize : 1
    let dx = 0, dy = 0, dz = 0
    let view = 'top'; if (this._viewportManager) view = this._viewportManager.viewMode === 'quad' ? this._viewportManager.activeQuadView : this._viewportManager.viewMode

    if (view === 'top' || view === 'perspective') {
      if (key === 'ArrowUp') dz = -step; if (key === 'ArrowDown') dz = step; if (key === 'ArrowLeft') dx = -step; if (key === 'ArrowRight') dx = step
    } else if (view === 'front') {
      if (key === 'ArrowUp') dy = step; if (key === 'ArrowDown') dy = -step; if (key === 'ArrowLeft') dx = -step; if (key === 'ArrowRight') dx = step
    } else if (view === 'side') {
      if (key === 'ArrowUp') dy = step; if (key === 'ArrowDown') dy = -step; if (key === 'ArrowLeft') dz = step; if (key === 'ArrowRight') dz = -step
    }
    obj.position.x += dx; obj.position.y += dy; obj.position.z += dz
    if (this.onBlockMoved) {
      const data = this.syncBlockFromMesh(obj.userData.blockId)
      if (data) this.onBlockMoved(obj.userData.blockId, data)
    }
    this._updateResizeGizmo(obj.userData.blockId)
  }
}