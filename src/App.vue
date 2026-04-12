<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppStatus from './components/AppStatus.vue';
import ClusterPulseViewport from './components/ClusterPulseViewport.vue';
import { loadInitialData, type AppData } from './core/cluster-pulse-app';

const data = ref<AppData | null>(null);
const loading = ref(true);
const errorMessage = ref('');

const statusBody = computed(() =>
  errorMessage.value || '正在读取聚合后的数据文件，并初始化交互式可视化。'
);

onMounted(async () => {
  try {
    data.value = await loadInitialData();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unknown bootstrap error';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <ClusterPulseViewport v-if="data" :data="data" />
  <AppStatus
    v-else
    :title="errorMessage ? '数据加载失败' : '正在加载数据'"
    :body="statusBody"
    :show-hint="Boolean(errorMessage)"
  />
</template>
