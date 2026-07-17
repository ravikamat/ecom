<template>
  <div class="pipeline-container">
    <div class="pipeline-header">
      <h2>Research Pipeline</h2>
      <StatusBadge :status="overallStatus" />
    </div>

    <div class="phases">
      <div v-for="phase in phases" :key="phase.id" 
           :class="['phase-card', phase.status]"
           @click="expandPhase(phase)">
        <div class="phase-header">
          <span class="phase-number">{{ phase.order }}</span>
          <h3>{{ phaseNames[phase.name] || phase.name }}</h3>
          <StatusBadge :status="phase.status" />
        </div>

        <div v-if="phase.status === 'running'" class="phase-progress">
          <ProgressBar :percent="phase.progress" />
          <div class="live-log">
            <div v-for="(log, i) in phase.logs" :key="i" class="log-line">
              <span class="timestamp">{{ formatTime(log.time) }}</span>
              <span class="message">{{ log.message }}</span>
            </div>
          </div>
        </div>

        <div v-if="phase.result && phase.status === 'completed'" class="phase-result">
          <JsonViewer :data="phase.result" :collapsed="!phase.expanded" />
        </div>
      </div>
    </div>

    <div v-if="finalResult" class="final-result">
      <h3>Overall Score: {{ finalResult.overallScore }}/100</h3>
      <p class="recommendation">{{ finalResult.recommendation }}</p>
      <button @click="saveToLibrary" class="btn-primary">Save to Library</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted, watch } from 'vue';
import { useEventSource } from '@vueuse/core';
import StatusBadge from './StatusBadge.vue';
import ProgressBar from './ProgressBar.vue';
import JsonViewer from './JsonViewer.vue';

const props = defineProps({
  researchId: { type: String, required: true },
});

const emit = defineEmits(['completed', 'saved']);

const phases = ref([]);
const finalResult = ref(null);
const overallStatus = ref('pending');

const phaseNames = {
  'signal-detection': 'Signal Detection',
  'market-validation': 'Market Validation',
  'supplier-archaeology': 'Supplier Archaeology',
  'financial-modeling': 'Financial Modeling',
  'execution-planning': 'Execution Planning',
};

const { data, error, close } = useEventSource(
  () => `/api/v1/research/${props.researchId}/stream`
);

watch(data, (event) => {
  if (!event) return;
  const update = JSON.parse(event);

  if (update.phase) {
    const existing = phases.value.find(p => p.name === update.phase);
    if (existing) {
      Object.assign(existing, update);
    } else {
      phases.value.push({
        name: update.phase,
        status: update.status,
        progress: update.progress || 0,
        order: phases.value.length + 1,
        logs: [],
        expanded: false,
      });
    }
  }

  if (update.status === 'completed' && update.result) {
    finalResult.value = update.result;
    overallStatus.value = 'completed';
    emit('completed', update.result);
  }
});

watch(error, (err) => {
  if (err) {
    overallStatus.value = 'error';
    console.error('SSE error:', err);
  }
});

function expandPhase(phase) {
  phase.expanded = !phase.expanded;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

async function saveToLibrary() {
  const response = await fetch('/api/v1/saved', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(finalResult.value),
  });

  if (response.ok) {
    emit('saved');
  }
}

onUnmounted(() => {
  close();
});
</script>

<style scoped>
.pipeline-container {
  padding: 20px;
  background: var(--bg-secondary);
  border-radius: 12px;
}

.phase-card {
  margin: 12px 0;
  padding: 16px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  border-left: 4px solid var(--color-pending);
  transition: all 0.3s ease;
}

.phase-card.running { border-left-color: var(--color-running); }
.phase-card.completed { border-left-color: var(--color-success); }
.phase-card.failed { border-left-color: var(--color-error); }

.phase-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.phase-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.live-log {
  margin-top: 12px;
  padding: 8px;
  background: rgba(0,0,0,0.3);
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
}

.log-line {
  padding: 2px 0;
}

.timestamp {
  color: var(--color-muted);
  margin-right: 8px;
}

.final-result {
  margin-top: 24px;
  padding: 20px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  border-radius: 12px;
  text-align: center;
}

.recommendation {
  font-size: 18px;
  margin: 12px 0;
}
</style>
