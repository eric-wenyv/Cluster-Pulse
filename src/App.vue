<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppStatus from './components/AppStatus.vue';
import ClusterPulseViewport from './components/ClusterPulseViewport.vue';
import { loadInitialData, type AppData } from './core/cluster-pulse-app';

const data = ref<AppData | null>(null);
const errorMessage = ref('');

onMounted(async () => {
  try {
    data.value = await loadInitialData();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unknown bootstrap error';
  }
});
</script>

<template>
  <ClusterPulseViewport v-if="data" :data="data" />
  <AppStatus v-else-if="errorMessage" :message="errorMessage" />
</template>
