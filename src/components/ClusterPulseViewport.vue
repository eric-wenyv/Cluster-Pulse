<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ClusterPulseApp, type AppData } from '../core/cluster-pulse-app';

const props = defineProps<{
  data: AppData;
}>();

const mountNode = ref<HTMLDivElement | null>(null);
let app: ClusterPulseApp | null = null;

onMounted(async () => {
  if (!mountNode.value) {
    return;
  }
  app = new ClusterPulseApp(mountNode.value, props.data);
  await app.init();
});

onBeforeUnmount(() => {
  app?.destroy();
  app = null;
});
</script>

<template>
  <div ref="mountNode"></div>
</template>
