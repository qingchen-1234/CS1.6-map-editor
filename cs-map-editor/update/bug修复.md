
---

### 修复方案（仅修改相关逻辑，不触碰任何其他代码）

请在 `client/src/engine/SceneManager.js` 中进行以下两处精准修改：

#### 1. 新增：视口句柄精准过滤器
在 `SceneManager` 类中，找到 `updateGizmoVisibility` 方法的**上方**，插入这个新的工具函数：

```javascript
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
```

#### 2. 修改 `pointerdown` 里的点击拦截
找到 `viewportEl.addEventListener('pointerdown', ...)` 里的“拦截拉伸柄点击”区域（大概在第 240 行），修改为**使用新过滤器**：

```javascript
      // ★ 拦截拉伸柄点击 (修改版)
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
```

#### 3. 修改 `pointermove` 里的悬停高亮检测
找到 `window.addEventListener('pointermove', ...)` 里的“悬停颜色变化”区域（大概在第 350 行），同样修改为**使用新过滤器**：

```javascript
      // ★ 悬停颜色变化 (修改版)
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
            this.resizeHandles.children.forEach(h => {
              h.material.color.set(h === hits[0].object ? '#ff0000' : '#ffffff')
            })
            if (this.transformControls) this.transformControls.visible = false
            return
          }
        }
```

---
