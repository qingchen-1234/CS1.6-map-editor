// ============================================================
// ViewportManager v2 — 视图管理器
// 新增: 视图模式切换(单视图/四视图)、点击激活、WASD定向
// ============================================================

import * as THREE from 'three'

export const VIEW_MODES = [
  { key: 'quad',        name: '四视图',    icon: '⊞' },
  { key: 'perspective', name: '自由视角',  icon: '🔍' },
  { key: 'top',         name: '顶视图',    icon: '⬇' },
  { key: 'front',       name: '前视图',    icon: '⬆' },
  { key: 'side',        name: '侧视图',    icon: '◀▶' },
]

export class ViewportManager {
  constructor(sceneManager) {
    this.sm = sceneManager
    this.renderer = null

    this.viewMode = 'quad'
    this.activeQuadView = 'perspective'

    this.topCamera = null
    this.frontCamera = null
    this.sideCamera = null

    this.viewports = {}
    this.canvasWidth = 0
    this.canvasHeight = 0
  }

  init(width, height) {
    this.renderer = this.sm.renderer
    this.canvasWidth = width
    this.canvasHeight = height

    const size = 1000
    // ★ 把 20000 改为 60000
    this.topCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 60000)
    this.topCamera.position.set(0, 30000, 0) // 高度也拉高
    this.topCamera.lookAt(0, 0, 0)

    this.frontCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 60000)
    this.frontCamera.position.set(0, 0, 30000)
    this.frontCamera.lookAt(0, 0, 0)

    this.sideCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 60000)
    this.sideCamera.position.set(30000, 0, 0)
    this.sideCamera.lookAt(0, 0, 0)

    this._updateViewports()
  }

  // ========== 全景聚焦 (瞬移并缩放相机以适应地图) ==========
  focusOnMap(centerX, centerY, centerZ, maxDim) {
    // 留出 20% 的边缘空白
    const viewSize = maxDim * 1.2

    // 1. 顶视图 (从上往下看)
    this.topCamera.position.set(centerX, centerY + maxDim + 1000, centerZ)
    this.topCamera.lookAt(centerX, centerY, centerZ)
    this.topCamera.left = -viewSize; this.topCamera.right = viewSize
    this.topCamera.top = viewSize; this.topCamera.bottom = -viewSize
    this.topCamera.updateProjectionMatrix()

    // 2. 前视图 (从前向后看, 沿着 Z 轴)
    this.frontCamera.position.set(centerX, centerY, centerZ + maxDim + 1000)
    this.frontCamera.lookAt(centerX, centerY, centerZ)
    this.frontCamera.left = -viewSize; this.frontCamera.right = viewSize
    this.frontCamera.top = viewSize; this.frontCamera.bottom = -viewSize
    this.frontCamera.updateProjectionMatrix()

    // 3. 侧视图 (从右向左看, 沿着 X 轴)
    this.sideCamera.position.set(centerX + maxDim + 1000, centerY, centerZ)
    this.sideCamera.lookAt(centerX, centerY, centerZ)
    this.sideCamera.left = -viewSize; this.sideCamera.right = viewSize
    this.sideCamera.top = viewSize; this.sideCamera.bottom = -viewSize
    this.sideCamera.updateProjectionMatrix()
  }

  // ========== 视图模式 ==========
  setViewMode(mode) {
    const valid = ['quad', 'perspective', 'top', 'front', 'side']
    if (valid.includes(mode)) {
      this.viewMode = mode
      this._updateViewports()
    }
  }

  // ========== 点击命中 ==========
  hitTest(canvasX, canvasY) {
    for (const [name, vp] of Object.entries(this.viewports)) {
      if (canvasX >= vp.x && canvasX <= vp.x + vp.w &&
          canvasY >= vp.y && canvasY <= vp.y + vp.h) {
        return name
      }
    }
    return null
  }

  activateView(viewName) {
    if (this.viewMode === 'quad' && this.viewports[viewName]) {
      this.activeQuadView = viewName
    }
  }

  cycleActiveQuad() {
    if (this.viewMode !== 'quad') return this.viewMode
    const order = ['perspective', 'front', 'side', 'top']
    const idx = order.indexOf(this.activeQuadView)
    this.activeQuadView = order[(idx + 1) % order.length]
    return this.activeQuadView
  }

  // ========== 当前活动相机 ==========
  getActiveCamera() {
    if (this.viewMode === 'quad') {
      switch (this.activeQuadView) {
        case 'top': return this.topCamera
        case 'front': return this.frontCamera
        case 'side': return this.sideCamera
        default: return this.sm.camera
      }
    }
    switch (this.viewMode) {
      case 'top': return this.topCamera
      case 'front': return this.frontCamera
      case 'side': return this.sideCamera
      default: return this.sm.camera
    }
  }

  /** 根据视口名称获取对应相机 */
  getCameraForView(viewName) {
    switch (viewName) {
      case 'top': return this.topCamera
      case 'front': return this.frontCamera
      case 'side': return this.sideCamera
      case 'perspective':
      default: return this.sm.camera
    }
  }

  // ========== 射线拾取: 局部视口 NDC 坐标转换 ==========
  getRaycasterData(canvasX, canvasY) {
    const viewName = this.hitTest(canvasX, canvasY)
    if (!viewName) return null

    const vp = this.viewports[viewName]
    const camera = this.getCameraForView(viewName)

    const localX = canvasX - vp.x
    const localY = canvasY - vp.y

    return {
      mouseCoords: new THREE.Vector2(
        (localX / vp.w) * 2 - 1,
        -(localY / vp.h) * 2 + 1
      ),
      camera: camera,
      viewName: viewName
    }
  }

  // ========== 视口布局 ==========
  _updateViewports() {
    const w = this.canvasWidth
    const h = this.canvasHeight
    // Canvas 已由 CSS Flex 紧贴房间面板右侧, 视口从 (0,0) 开始填充全部区域
    const mainW = Math.max(w, 320)

    if (this.viewMode === 'quad') {
      // 2×2 正方形网格布局
      const halfW = Math.floor(mainW / 2)
      const halfH = Math.floor(h / 2)

      this.viewports = {
        perspective: { x: 0,           y: 0,       w: halfW, h: halfH },
        top:         { x: halfW,       y: 0,       w: halfW, h: halfH },
        front:       { x: 0,           y: halfH,   w: halfW, h: halfH },
        side:        { x: halfW,       y: halfH,   w: halfW, h: halfH },
      }
    } else {
      this.viewports = {
        [this.viewMode]: { x: 0, y: 0, w: mainW, h: h }
      }
      this.activeQuadView = this.viewMode
    }
  }

  // ========== 渲染 (含智能网格与线框切换) ==========
  render(time) {
    if (!this.renderer) return
    const canvas = this.renderer.domElement
    this.canvasWidth = canvas.clientWidth
    this.canvasHeight = canvas.clientHeight
    this._updateViewports()

    const r = this.renderer
    const scene = this.sm.scene
    const origBg = scene.background

    r.setScissorTest(true)
    const vpEntries = Object.entries(this.viewports)

    for (const [name, vp] of vpEntries) {
      const glY = this.canvasHeight - vp.y - vp.h
      r.setScissor(vp.x, glY, vp.w, vp.h)
      r.setViewport(vp.x, glY, vp.w, vp.h)

      const isPerspective = (name === 'perspective')
      const camera = isPerspective ? this.sm.camera
        : name === 'top' ? this.topCamera
        : name === 'front' ? this.frontCamera
        : this.sideCamera

      // 1. 设置背景色
      scene.background = isPerspective
        ? new THREE.Color('#1a1a2e')  // 3D 视图背景
        : new THREE.Color('#0a0a14')  // 2D 视图背景 (更深，突出线框)

      // 2. ★ 核心：渲染模式切换
      this.sm.setRenderMode(isPerspective ? 'solid' : 'wireframe')

      // 3. ★ 核心：智能网格调度
      if (this.sm.gridXZ_minor) {
        // 先隐藏所有网格
        for (const g of this.sm.gridHelpers) g.visible = false

        if (!isPerspective) {
          // 根据当前正交相机的视野宽度(缩放程度)决定显示哪些网格
          const viewWidth = camera.right - camera.left
          const showMinor = viewWidth < 6000  // 放大时显示密网格
          const showMajor = viewWidth < 30000 // 缩小时只显示粗网格

          if (name === 'top') {
            if (showMinor) this.sm.gridXZ_minor.visible = true
            if (showMajor) this.sm.gridXZ_major.visible = true
          } else if (name === 'front') {
            if (showMinor) this.sm.gridXY_minor.visible = true
            if (showMajor) this.sm.gridXY_major.visible = true
          } else if (name === 'side') {
            if (showMinor) this.sm.gridYZ_minor.visible = true
            if (showMajor) this.sm.gridYZ_major.visible = true
          }
        }
      }
      // ==========================================
      // ★ 4. 新增：智能隐藏无用的 2D 拖拽柄并动态缩放
      // ==========================================
      if (this.sm.updateGizmoVisibility) {
        this.sm.updateGizmoVisibility(name, camera)
      }

      // 5. 防止视图形变
      const aspect = vp.w / vp.h
      if (camera.isOrthographicCamera) {
        const halfH = (camera.top - camera.bottom) / 2
        const halfW = halfH * aspect
        if (camera.right !== halfW) {
          camera.left = -halfW; camera.right = halfW; camera.updateProjectionMatrix()
        }
      } else if (camera.isPerspectiveCamera) {
        if (camera.aspect !== aspect) {
          camera.aspect = aspect; camera.updateProjectionMatrix()
        }
      }

      // 5. 变换控件显示逻辑
      const tc = this.sm.transformControls
      const isActive = (this.viewMode === 'quad' && this.activeQuadView === name) ||
                       (this.viewMode !== 'quad' && this.viewMode === name) ||
                       (this.viewMode !== 'quad' && name === this.viewMode)
      if (tc) tc.visible = isActive && (tc.object != null)

      r.render(scene, camera)
    }

    // 恢复现场
    scene.background = origBg
    r.setScissorTest(false)
  }

// ========== 缩放正交相机 (支持向鼠标指针位置吸附) ==========
  zoomOrthoCamera(camera, delta, ndcX = 0, ndcY = 0) {
    // 强制每次缩放幅度为 10%，避免用户手速过快导致画面翻转崩溃
    const factor = Math.pow(1.1, Math.sign(delta))

    // 记录原尺寸
    const wOld = camera.right - camera.left
    const hOld = camera.top - camera.bottom

    // 实施倍率缩放
    camera.left *= factor
    camera.right *= factor
    camera.top *= factor
    camera.bottom *= factor
    camera.updateProjectionMatrix()

    // 计算缩放后丢失的物理宽度和高度
    const wNew = camera.right - camera.left
    const hNew = camera.top - camera.bottom
    const deltaW = wOld - wNew
    const deltaH = hOld - hNew

    // ★ 视觉魔术：根据鼠标当前距离中心的比例，反向移动摄像机！
    // 这样在屏幕上看，被鼠标指着的那一个像素点永远不会发生偏移。
    camera.translateX(ndcX * deltaW / 2)
    camera.translateY(ndcY * deltaH / 2)
  }
}
