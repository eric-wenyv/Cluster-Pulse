<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<template>
  <div class="page-shell">
    <div class="error-panel">
      <strong>数据加载失败</strong>
      <p>{{ message }}</p>
      <p>请先运行 <code>npm run data</code> 或 <code>npm run data:sample</code> 生成 <code>public/data</code>。</p>
    </div>
  </div>
</template>
