<script setup lang="ts">
defineProps<{
  title: string;
  body: string;
  showHint?: boolean;
}>();
</script>

<template>
  <div class="page-shell">
    <div class="error-panel">
      <strong>{{ title }}</strong>
      <p>{{ body }}</p>
      <p v-if="showHint">请先运行 <code>npm run data</code> 或 <code>npm run data:sample</code> 生成 <code>public/data</code>。</p>
    </div>
  </div>
</template>
